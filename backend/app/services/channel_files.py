"""Read a marketplace's order or settlement export into rows ZISUN understands.

Amazon, Myntra, Meesho and AJIO give a seller of ZISUN's size no API. What
they give is a file: the seller portal exports orders and payouts as CSV,
tab-separated text, or Excel. This module turns any of those into a list of
plain dicts with ZISUN's own field names, and says exactly which columns it
recognised and which it did not - because the preview of that matching is
what the founder sees before anything is written.

Honesty about the formats: Amazon's order report columns are documented and
stable (`amazon-order-id`, `sku`, `quantity`, `item-price`...). The Myntra,
Meesho and AJIO headers below are the best-known spellings and marketplaces
rename them without notice. That is why detection is by *alias*, why she can
override any column by name, and why an import never runs without a preview.

Pure Python, no application imports, so it is testable without a database.
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional
from xml.etree import ElementTree as ET

# ── The fields ZISUN needs, and what each marketplace calls them ─────────────

#: Field -> header aliases, per channel. Headers and aliases are compared
#: after `_norm`: lowercase, letters and digits only, so "Ship-State",
#: "ship_state" and "Ship State" are one thing.
FORMATS: dict[str, dict[str, list[str]]] = {
    "amazon": {
        "order_id": ["amazonorderid", "orderid"],
        "sku": ["sku", "sellersku", "merchantsku"],
        "quantity": ["quantity", "quantitypurchased", "qty"],
        "line_total": ["itemprice"],
        "unit_price": ["unitprice"],
        "order_date": ["purchasedate", "orderdate"],
        "status": ["orderstatus", "itemstatus"],
        "state": ["shipstate"],
        "pincode": ["shippostalcode", "postalcode"],
        "city": ["shipcity"],
        "name": ["buyername", "recipientname"],
        "line1": ["shipaddress1"],
        "line2": ["shipaddress2"],
        "payment": ["paymentmethoddetails", "paymentmethod"],
        "invoice": ["invoicenumber"],
    },
    "myntra": {
        "order_id": ["orderreleaseid", "orderid", "orderno", "packetid"],
        "sku": ["sellerskucode", "sellersku", "skucode", "sku", "styleid", "vendorsku"],
        "quantity": ["quantity", "qty"],
        "unit_price": ["finalamount", "customerpaidamt", "sellingprice", "unitprice", "price"],
        "order_date": ["orderdate", "createdon", "orderplacedon"],
        "status": ["orderstatus", "status", "releasestatus"],
        "state": ["customerstate", "state", "shippingstate"],
        "pincode": ["pincode", "customerpincode", "zipcode"],
        "city": ["city", "customercity"],
        "name": ["customername", "buyername"],
        "payment": ["paymentmethod", "paymentmode", "paymenttype"],
        "invoice": ["invoicenumber", "invoiceno"],
    },
    "meesho": {
        "order_id": ["suborderno", "suborderid", "orderno", "orderid"],
        "sku": ["sku", "skuid", "productsku"],
        "quantity": ["quantity", "qty"],
        "unit_price": ["supplierdiscountedpriceinclgstandcommision", "supplierdiscountedpriceinclgstandcommission",
                       "supplierlistedpriceinclgstcommission", "finalsaleamountinclshippingandgst", "price"],
        "order_date": ["orderdate", "createdon"],
        "status": ["reasonforcreditentry", "orderstatus", "status", "suborderstatus"],
        "state": ["customerstate", "state"],
        "pincode": ["pincode", "customerpincode"],
        "city": ["city", "customercity"],
        "name": ["customername"],
        "payment": ["paymentmode", "paymentmethod"],
        "invoice": ["invoiceno", "invoicenumber"],
    },
    "ajio": {
        "order_id": ["orderno", "orderid", "ordernumber"],
        "sku": ["sellersku", "skucode", "sku", "vendorsku"],
        "quantity": ["qty", "quantity"],
        "unit_price": ["sellingprice", "ordervalue", "unitprice", "price", "mrp"],
        "order_date": ["orderdate", "createddate"],
        "status": ["status", "orderstatus"],
        "state": ["state", "shippingstate", "customerstate"],
        "pincode": ["pincode", "postalcode"],
        "city": ["city"],
        "name": ["customername"],
        "payment": ["paymentmode", "paymentmethod"],
        "invoice": ["invoiceno", "invoicenumber"],
    },
}

#: Fallback for a channel not listed above: the union of every alias.
GENERIC: dict[str, list[str]] = {}
for _f in FORMATS.values():
    for _k, _v in _f.items():
        GENERIC.setdefault(_k, [])
        for _a in _v:
            if _a not in GENERIC[_k]:
                GENERIC[_k].append(_a)

#: Settlement (payout) files: what was paid, for which order, when.
SETTLEMENT: dict[str, list[str]] = {
    "order_id": ["amazonorderid", "orderid", "orderreleaseid", "suborderno", "suborderid", "orderno", "ordernumber"],
    "amount": ["total", "netamount", "amount", "settlementamount", "payoutamount", "finalsettlementamount",
               "netpayable", "totalamount", "amountpaid"],
    "settled_on": ["depositdate", "settlementenddate", "settlementdate", "paymentdate", "postedon", "posteddate",
                   "payoutdate", "transactiondate", "date"],
}

REQUIRED_ORDER_FIELDS = ("order_id", "sku", "quantity")
REQUIRED_SETTLEMENT_FIELDS = ("order_id", "amount")


def _norm(header: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (header or "").lower())


# ── Reading the file ─────────────────────────────────────────────────────────

def _read_xlsx(data: bytes) -> tuple[list[str], list[list[str]]]:
    """The first sheet of an .xlsx, without openpyxl.

    An .xlsx is a zip of XML. Shared strings live in one file, cell values in
    the sheet; that is all a marketplace export uses. Dates come out as
    Excel serial numbers and are converted where a date is expected.
    """
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            ns = {"m": root.tag.split("}")[0].strip("{")}
            for si in root.findall("m:si", ns):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")))
        sheet = next((n for n in names if n.startswith("xl/worksheets/sheet")), None)
        if not sheet:
            return [], []
        root = ET.fromstring(z.read(sheet))
        ns = {"m": root.tag.split("}")[0].strip("{")}
        rows: list[list[str]] = []
        for row in root.iter(f"{{{ns['m']}}}row"):
            cells: dict[int, str] = {}
            for c in row.findall("m:c", ns):
                ref = c.get("r") or ""
                col = 0
                for ch in re.sub(r"\d", "", ref):
                    col = col * 26 + (ord(ch.upper()) - 64)
                t = c.get("t")
                v = c.find("m:v", ns)
                if t == "s" and v is not None and v.text is not None:
                    val = shared[int(v.text)] if int(v.text) < len(shared) else ""
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(f"{{{ns['m']}}}t"))
                else:
                    val = (v.text or "") if v is not None else ""
                cells[col - 1 if col else len(cells)] = val
            width = (max(cells) + 1) if cells else 0
            rows.append([cells.get(i, "") for i in range(width)])
    rows = [r for r in rows if any(x.strip() for x in r)]
    if not rows:
        return [], []
    return [h.strip() for h in rows[0]], [r + [""] * (len(rows[0]) - len(r)) for r in rows[1:]]


def _read_text(data: bytes) -> tuple[list[str], list[list[str]]]:
    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    # Amazon's order reports are tab-separated .txt files; everything else
    # is a comma CSV. Count rather than sniff: Sniffer guesses wrong on
    # a header row that happens to contain a comma inside quotes.
    delim = "\t" if sample.count("\t") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    rows = [r for r in reader if any(x.strip() for x in r)]
    if not rows:
        return [], []
    header = [h.strip() for h in rows[0]]
    return header, [r + [""] * (len(header) - len(r)) for r in rows[1:]]


def read_table(data: bytes, filename: str) -> tuple[list[str], list[list[str]]]:
    """(headers, rows) from a CSV, TSV or .xlsx export."""
    if filename.lower().endswith((".xlsx", ".xlsm")) or data[:2] == b"PK":
        return _read_xlsx(data)
    return _read_text(data)


# ── Matching columns ─────────────────────────────────────────────────────────

@dataclass
class Mapping:
    """Which header answers each field, and which fields nobody answered."""
    columns: dict[str, str] = field(default_factory=dict)     # field -> header as in the file
    missing: list[str] = field(default_factory=list)          # required fields with no column
    unused: list[str] = field(default_factory=list)           # headers nothing asked for

    @property
    def ok(self) -> bool:
        return not self.missing


def detect_columns(headers: list[str], channel: str, *, kind: str = "orders",
                   overrides: Optional[dict[str, str]] = None) -> Mapping:
    """Match the file's headers to ZISUN's fields.

    `overrides` is {field: header} typed by the founder when a marketplace
    has renamed something; it wins over every alias.
    """
    aliases = SETTLEMENT if kind == "settlements" else FORMATS.get(channel, GENERIC)
    required = REQUIRED_SETTLEMENT_FIELDS if kind == "settlements" else REQUIRED_ORDER_FIELDS
    by_norm = {_norm(h): h for h in headers if h}
    m = Mapping()
    for fld, names in aliases.items():
        chosen = None
        if overrides and overrides.get(fld):
            ov = overrides[fld]
            chosen = by_norm.get(_norm(ov)) or (ov if ov in headers else None)
        if chosen is None:
            for a in names:
                if a in by_norm:
                    chosen = by_norm[a]
                    break
        if chosen is not None:
            m.columns[fld] = chosen
    # A line total is as good as a unit price - we divide by quantity.
    if kind == "orders" and "unit_price" not in m.columns and "line_total" not in m.columns:
        m.missing.append("unit_price")
    m.missing += [f for f in required if f not in m.columns]
    used = set(m.columns.values())
    m.unused = [h for h in headers if h and h not in used]
    return m


# ── Values ───────────────────────────────────────────────────────────────────

def parse_paise(raw: str) -> Optional[int]:
    """'₹1,124.00', '1124', 'INR 1,124' -> 112400. None when there is no number."""
    s = re.sub(r"[^\d.\-]", "", str(raw or ""))
    if s in ("", "-", ".", "-."):
        return None
    try:
        return int(round(float(s) * 100))
    except ValueError:
        return None


def parse_int(raw: str) -> Optional[int]:
    s = re.sub(r"[^\d\-]", "", str(raw or ""))
    try:
        return int(s) if s not in ("", "-") else None
    except ValueError:
        return None


_DATE_FORMATS = (
    "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d", "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
    "%d/%m/%Y", "%d %b %Y %H:%M:%S", "%d %b %Y", "%d-%b-%Y", "%b %d, %Y", "%m/%d/%Y", "%Y/%m/%d",
)


def parse_date(raw: str) -> Optional[datetime]:
    """Most spellings a marketplace uses, plus an Excel serial. Naive times are IST."""
    s = str(raw or "").strip()
    if not s:
        return None
    if re.fullmatch(r"\d{4,6}(\.\d+)?", s):                      # Excel serial day
        d = datetime(1899, 12, 30) + timedelta(days=float(s))
        return d.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
    for fmt in _DATE_FORMATS:
        try:
            d = datetime.strptime(s, fmt)
        except ValueError:
            continue
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
        return d
    return None


def map_status(raw: str) -> str:
    """A marketplace's status word -> ZISUN's OrderStatus value.

    Order of the checks matters, and it is the lesson `step_for` in
    services/shiprocket.py already paid for: "undelivered" contains
    "delivered", "RTO delivered" is a return, "cancel" beats everything. The
    failure words are tested first so a returned parcel is never counted as
    a sale.
    """
    s = (raw or "").strip().lower()
    if not s:
        return "PAID"
    if "rto" in s or "return" in s or "refund" in s:
        return "RETURNED"
    if "cancel" in s or "reject" in s:
        return "CANCELLED"
    # Still on the road: "out for delivery" and "delivery attempted" both
    # contain "deliver" and neither is delivered.
    if ("undeliver" in s or "failed deliver" in s or "not deliver" in s
            or "out for" in s or "attempt" in s):
        return "SHIPPED"
    if "deliver" in s or "complete" in s:
        return "DELIVERED"
    # Not yet on the road: "ready to ship" contains "ship" and is not shipped.
    if "ready" in s or "rts" in s or "pack" in s or "manifest" in s or "unshipped" in s:
        return "PACKED" if "unshipped" not in s else "PAID"
    if ("ship" in s or "dispatch" in s or "transit" in s or "handed" in s or "picked" in s
            or "in flight" in s):
        return "SHIPPED"
    # pending, new, confirmed, processing, approved...
    return "PAID"


def map_payment(raw: str) -> str:
    s = (raw or "").lower()
    return "COD" if ("cod" in s or "cash" in s) else "PREPAID"


# ── Rows -> orders ───────────────────────────────────────────────────────────

@dataclass
class Line:
    sku: str
    quantity: int
    unit_price_paise: int


@dataclass
class ExternalOrder:
    external_id: str
    lines: list[Line] = field(default_factory=list)
    status: str = "PAID"
    ordered_at: Optional[datetime] = None
    name: Optional[str] = None
    line1: Optional[str] = None
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    payment: str = "PREPAID"
    invoice: Optional[str] = None
    #: False when the marketplace shipped it from its own warehouse (Amazon
    #: FBA): those units left ZISUN's shelf when they were sent in, so the
    #: sale must not take them off the count a second time.
    holds_our_stock: bool = True

    @property
    def total_paise(self) -> int:
        return sum(l.unit_price_paise * l.quantity for l in self.lines)


@dataclass
class Parsed:
    orders: list[ExternalOrder]
    problems: list[str]
    rows_total: int


def orders_from_rows(headers: list[str], rows: Iterable[list[str]], mapping: Mapping) -> Parsed:
    """Group a file's lines into orders. A problem row is named, never guessed."""
    idx = {f: headers.index(h) for f, h in mapping.columns.items() if h in headers}
    get = lambda row, f: (row[idx[f]].strip() if f in idx and idx[f] < len(row) else "")  # noqa: E731
    orders: dict[str, ExternalOrder] = {}
    problems: list[str] = []
    n = 0
    for i, row in enumerate(rows, start=2):        # 1 is the header
        n += 1
        oid = get(row, "order_id")
        sku = get(row, "sku")
        qty = parse_int(get(row, "quantity"))
        if not oid or not sku:
            problems.append(f"Row {i}: no order id or SKU - skipped")
            continue
        if not qty or qty <= 0:
            problems.append(f"Row {i} ({oid}): quantity '{get(row, 'quantity')}' is not a number - skipped")
            continue
        unit = parse_paise(get(row, "unit_price")) if "unit_price" in idx else None
        if unit is None and "line_total" in idx:
            total = parse_paise(get(row, "line_total"))
            unit = int(round(total / qty)) if total is not None else None
        if unit is None:
            problems.append(f"Row {i} ({oid}): no price found - skipped")
            continue
        o = orders.get(oid)
        if o is None:
            o = ExternalOrder(
                external_id=oid,
                status=map_status(get(row, "status")),
                ordered_at=parse_date(get(row, "order_date")),
                name=get(row, "name") or None,
                line1=get(row, "line1") or None,
                line2=get(row, "line2") or None,
                city=get(row, "city") or None,
                state=get(row, "state") or None,
                pincode=re.sub(r"\D", "", get(row, "pincode"))[:6] or None,
                payment=map_payment(get(row, "payment")),
                invoice=get(row, "invoice") or None,
            )
            orders[oid] = o
        o.lines.append(Line(sku=sku, quantity=qty, unit_price_paise=unit))
    return Parsed(orders=list(orders.values()), problems=problems, rows_total=n)


@dataclass
class Settlement:
    external_id: str
    amount_paise: int
    settled_on: Optional[datetime]


def settlements_from_rows(headers: list[str], rows: Iterable[list[str]], mapping: Mapping) -> tuple[list[Settlement], list[str], int]:
    """One settlement per order: a file often lists several lines per order
    (item, shipping, commission, tax), and they are summed."""
    idx = {f: headers.index(h) for f, h in mapping.columns.items() if h in headers}
    get = lambda row, f: (row[idx[f]].strip() if f in idx and idx[f] < len(row) else "")  # noqa: E731
    rows = list(rows)
    # Amazon's settlement file carries the deposit date once, on a summary
    # line at the top, and leaves it blank on every order line below. A date
    # given once for the file is the date for its lines: it is when the
    # money reached the bank, which is what "settled" means.
    file_when: Optional[datetime] = None
    for row in rows:
        file_when = parse_date(get(row, "settled_on"))
        if file_when:
            break
    by_id: dict[str, Settlement] = {}
    problems: list[str] = []
    n = 0
    for i, row in enumerate(rows, start=2):
        n += 1
        oid = get(row, "order_id")
        amt = parse_paise(get(row, "amount"))
        if not oid:
            continue                                 # subtotal and blank lines are normal here
        if amt is None:
            problems.append(f"Row {i} ({oid}): amount '{get(row, 'amount')}' is not a number - skipped")
            continue
        when = parse_date(get(row, "settled_on")) or file_when
        s = by_id.get(oid)
        if s is None:
            by_id[oid] = Settlement(external_id=oid, amount_paise=amt, settled_on=when)
        else:
            s.amount_paise += amt
            s.settled_on = s.settled_on or when
    return list(by_id.values()), problems, n


def today_ist() -> date:
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()

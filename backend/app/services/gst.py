"""GST, computed out of a tax-inclusive price.

ZISUN is registered (GSTIN 29BAYPT2026A1ZH - "29" is Karnataka), so every
sale needs a tax invoice showing the taxable value, the tax split and the
place of supply. Nothing in the system computed any of that: an order stored
one `total_amount` and the site said "inclusive of all taxes" without ever
working out what was inside it.

Two things decide the numbers:

**The rate is per piece, not per order.** Ready-made garments are taxed at
one rate at or below a price threshold per piece and a higher one above it.
Two garments in the same parcel either side of that line carry different
rates, so the rate is resolved per line from that line's unit price. The
threshold and both rates are configuration - they moved on 22 September 2025
from ₹1,000/5%/12% to ₹2,500/5%/18%, and this file shipped with the old
numbers until the founder caught it.

**The split follows the place of supply.** Karnataka to Karnataka is CGST +
SGST, each half the tax. Karnataka to anywhere else is IGST, the whole of
it. The customer pays the same either way; only the invoice differs.

Prices here are tax-INCLUSIVE, which is how apparel is sold in India and
what the Legal Metrology declaration on the product page already says. So
tax is extracted from the price rather than added to it:

    taxable = round(inclusive * 100 / (100 + rate))
    tax     = inclusive - taxable

Doing it in that order, in paise, is deliberate: the customer's total is the
fixed quantity and the parts must add back to it exactly. Computing the tax
first and subtracting would leave the line totals a paise off the amount
actually charged, which is the classic way an invoice fails to reconcile.

Everything is integer paise. No floats touch money.

NOT TAX ADVICE: the rate table and the HSN default below are the ordinary
treatment for ready-made garments and should be confirmed with the
business's accountant; both are data, not logic, so a change is one edit.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

#: The state ZISUN supplies from. "29" is Karnataka; it is the first two
#: digits of the GSTIN and is what makes a sale intra- or inter-state.
HOME_STATE_CODE = "29"

#: Ready-made garments: one rate at or below a price per piece, another
#: above it. All three numbers are notification-driven - they moved on
#: 22 September 2025 from ₹1,000/5%/12% to ₹2,500/5%/18% - so they live in
#: configuration and a change is a variable round trip, not a deploy.
#: The defaults, also used when settings cannot be imported - this module is
#: deliberately importable and testable without the app.
SLAB_THRESHOLD_PAISE = 250000   # ₹2,500.00 per piece
RATE_AT_OR_BELOW_PCT = 5
RATE_ABOVE_PCT = 18


def _slabs() -> tuple[tuple[int, int], ...]:
    threshold, low, high = SLAB_THRESHOLD_PAISE, RATE_AT_OR_BELOW_PCT, RATE_ABOVE_PCT
    try:
        from app.core.config import settings  # noqa: PLC0415

        threshold = settings.GST_SLAB_THRESHOLD_PAISE
        low = settings.GST_RATE_AT_OR_BELOW_PCT
        high = settings.GST_RATE_ABOVE_PCT
    except Exception:  # noqa: BLE001
        pass
    return ((threshold, low), (10**12, high))

#: Women's kurtas, co-ord sets and similar. Confirm per product with a CA;
#: `products.hsn_code` overrides this when set.
DEFAULT_HSN = "6204"

#: GST state codes, for turning a delivery address into a place of supply.
STATE_CODES: dict[str, str] = {
    "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03",
    "chandigarh": "04", "uttarakhand": "05", "haryana": "06", "delhi": "07",
    "rajasthan": "08", "uttar pradesh": "09", "bihar": "10", "sikkim": "11",
    "arunachal pradesh": "12", "nagaland": "13", "manipur": "14",
    "mizoram": "15", "tripura": "16", "meghalaya": "17", "assam": "18",
    "west bengal": "19", "jharkhand": "20", "odisha": "21", "orissa": "21",
    "chhattisgarh": "22", "madhya pradesh": "23", "gujarat": "24",
    "dadra and nagar haveli and daman and diu": "26", "maharashtra": "27",
    "karnataka": "29", "goa": "30", "lakshadweep": "31", "kerala": "32",
    "tamil nadu": "33", "puducherry": "34", "andaman and nicobar islands": "35",
    "telangana": "36", "andhra pradesh": "37", "ladakh": "38",
}


def state_code(state: Optional[str]) -> Optional[str]:
    """GST code for a state name as a customer typed it."""
    return STATE_CODES.get((state or "").strip().lower()) if state else None


def rate_for(unit_price_paise: int) -> int:
    """The garment rate for one piece at this price, as a whole percent."""
    slabs = _slabs()
    for ceiling, rate in slabs:
        if unit_price_paise <= ceiling:
            return rate
    return slabs[-1][1]


def split_inclusive(inclusive_paise: int, rate_pct: int) -> tuple[int, int]:
    """(taxable, tax) in paise, extracted from a tax-inclusive amount.

    The two always add back to `inclusive_paise` exactly, because the tax is
    the remainder rather than a second rounded calculation.
    """
    if inclusive_paise <= 0 or rate_pct <= 0:
        return max(0, inclusive_paise), 0
    taxable = round(inclusive_paise * 100 / (100 + rate_pct))
    return taxable, inclusive_paise - taxable


def add_tax(exclusive_paise: int, rate_pct: int) -> int:
    """The tax-inclusive selling price for a price entered WITHOUT tax.

    The customer-facing price in India is always tax-inclusive - Legal
    Metrology requires the MRP to be inclusive of all taxes, and the
    declaration on every product page says exactly that. So an exclusive
    price is not something to display; it is something to convert. The
    founder may think in either, and the shop shows one.

    Note the rate is chosen from the *inclusive* price, because the slab
    threshold is a retail price per piece. An exclusive ₹2,400 at 5% becomes
    ₹2,520 inclusive, which is above the threshold - so the rate is resolved
    on the result and the conversion repeated once. It converges: a second
    pass cannot cross back, because a higher rate only raises the total.
    """
    if exclusive_paise <= 0:
        return max(0, exclusive_paise)
    inclusive = round(exclusive_paise * (100 + rate_pct) / 100)
    settled = rate_for(inclusive)
    if settled != rate_pct:
        inclusive = round(exclusive_paise * (100 + settled) / 100)
    return inclusive


def selling_price(entered_paise: int, *, includes_tax: bool) -> int:
    """What the customer is charged, whichever way the price was entered."""
    if includes_tax:
        return entered_paise
    return add_tax(entered_paise, rate_for(entered_paise))


def halve(tax_paise: int) -> tuple[int, int]:
    """CGST and SGST. The odd paise goes to CGST so the two still sum exactly."""
    half = tax_paise // 2
    return tax_paise - half, half


@dataclass
class TaxLine:
    description: str
    hsn: str
    quantity: int
    unit_price_paise: int      # tax-inclusive, as charged
    inclusive_paise: int       # unit_price * quantity
    rate_pct: int
    taxable_paise: int
    tax_paise: int


@dataclass
class TaxInvoice:
    place_of_supply: Optional[str]          # state code, e.g. "29"
    place_of_supply_name: Optional[str]
    intra_state: bool
    lines: list[TaxLine] = field(default_factory=list)
    taxable_paise: int = 0
    cgst_paise: int = 0
    sgst_paise: int = 0
    igst_paise: int = 0
    total_paise: int = 0                    # what the customer pays

    @property
    def tax_paise(self) -> int:
        return self.cgst_paise + self.sgst_paise + self.igst_paise


def compute(
    items: Iterable[dict],
    *,
    shipping_paise: int = 0,
    state: Optional[str] = None,
) -> TaxInvoice:
    """Build the tax breakdown for an order.

    `items`: {description, quantity, unit_price_paise, hsn?}. Prices are
    tax-inclusive, as charged.

    Shipping (the COD collection fee) rides on the order as part of the same
    supply, so it takes the highest rate present among the garments rather
    than a rate of its own - an incidental charge follows the principal
    supply it is incidental to.
    """
    code = state_code(state)
    intra = code == HOME_STATE_CODE
    inv = TaxInvoice(
        place_of_supply=code,
        place_of_supply_name=(state or "").strip() or None,
        intra_state=intra,
    )

    for it in items:
        qty = max(1, int(it.get("quantity") or 1))
        unit = int(it.get("unit_price_paise") or 0)
        gross = unit * qty
        rate = rate_for(unit)
        taxable, tax = split_inclusive(gross, rate)
        inv.lines.append(TaxLine(
            description=str(it.get("description") or "Garment"),
            hsn=str(it.get("hsn") or DEFAULT_HSN),
            quantity=qty,
            unit_price_paise=unit,
            inclusive_paise=gross,
            rate_pct=rate,
            taxable_paise=taxable,
            tax_paise=tax,
        ))

    if shipping_paise > 0:
        rate = max((l.rate_pct for l in inv.lines), default=_slabs()[-1][1])
        taxable, tax = split_inclusive(shipping_paise, rate)
        inv.lines.append(TaxLine(
            description="Delivery",
            hsn="996812",           # courier services
            quantity=1,
            unit_price_paise=shipping_paise,
            inclusive_paise=shipping_paise,
            rate_pct=rate,
            taxable_paise=taxable,
            tax_paise=tax,
        ))

    inv.taxable_paise = sum(l.taxable_paise for l in inv.lines)
    inv.total_paise = sum(l.inclusive_paise for l in inv.lines)
    total_tax = sum(l.tax_paise for l in inv.lines)

    if intra:
        inv.cgst_paise, inv.sgst_paise = halve(total_tax)
    else:
        # Unknown state is treated as inter-state: IGST is the safer default,
        # because wrongly charging CGST+SGST on an out-of-state supply is the
        # error that cannot be corrected by the customer's own filing.
        inv.igst_paise = total_tax

    return inv


def as_dict(inv: TaxInvoice) -> dict:
    return {
        "place_of_supply": inv.place_of_supply,
        "place_of_supply_name": inv.place_of_supply_name,
        "intra_state": inv.intra_state,
        "taxable_paise": inv.taxable_paise,
        "cgst_paise": inv.cgst_paise,
        "sgst_paise": inv.sgst_paise,
        "igst_paise": inv.igst_paise,
        "tax_paise": inv.tax_paise,
        "total_paise": inv.total_paise,
        "lines": [
            {
                "description": l.description, "hsn": l.hsn, "quantity": l.quantity,
                "unit_price_paise": l.unit_price_paise, "inclusive_paise": l.inclusive_paise,
                "rate_pct": l.rate_pct, "taxable_paise": l.taxable_paise, "tax_paise": l.tax_paise,
            }
            for l in inv.lines
        ],
    }

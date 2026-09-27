"""Marketplace exports -> ZISUN orders, without a database.

The fixtures are the column names the marketplaces actually use. Amazon's
are documented; the rest are the spellings seen in seller portals, which
is exactly why detection is by alias and every import is previewed.
"""
import importlib.util
import io
import zipfile
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "channel_files", Path(__file__).resolve().parents[2] / "app/services/channel_files.py")
cf = importlib.util.module_from_spec(_spec)
import sys
sys.modules["channel_files"] = cf          # @dataclass resolves annotations through it
_spec.loader.exec_module(cf)


AMAZON = (
    "amazon-order-id\tpurchase-date\torder-status\tsku\tquantity\titem-price\tship-city\tship-state\tship-postal-code\tpayment-method-details\n"
    "403-1234567-0000001\t2026-09-20T10:15:00+00:00\tShipped\tZS-WIN-M\t1\t1124.00\tBengaluru\tKARNATAKA\t560038\tStandard\n"
    "403-1234567-0000001\t2026-09-20T10:15:00+00:00\tShipped\tZS-WIN-L\t2\t2248.00\tBengaluru\tKARNATAKA\t560038\tStandard\n"
    "403-9999999-0000002\t2026-09-21T08:00:00+00:00\tCancelled\tZS-PUR-S\t1\t999.00\tPune\tMAHARASHTRA\t411001\tCOD\n"
)


def test_amazon_report_is_read_and_grouped():
    headers, rows = cf.read_table(AMAZON.encode(), "orders.txt")
    m = cf.detect_columns(headers, "amazon")
    assert m.ok and m.columns["order_id"] == "amazon-order-id" and m.columns["line_total"] == "item-price"
    p = cf.orders_from_rows(headers, rows, m)
    assert p.rows_total == 3 and not p.problems
    a, b = p.orders
    assert a.external_id == "403-1234567-0000001" and len(a.lines) == 2
    # item-price is the line total; the unit price is what is stored.
    assert [l.unit_price_paise for l in a.lines] == [112400, 112400]
    assert a.total_paise == 3 * 112400
    assert a.status == "SHIPPED" and a.state == "KARNATAKA" and a.pincode == "560038"
    assert b.status == "CANCELLED" and b.payment == "COD"
    assert a.ordered_at.year == 2026


def test_meesho_style_csv_with_rupee_signs():
    csv = ("Sub Order No,Order Date,Customer State,SKU,Quantity,Supplier Discounted Price (Incl GST and Commision),Reason for Credit Entry\n"
           "12345_1,21-09-2026,Karnataka,zs-win-m,1,\"₹1,124.00\",DELIVERED\n"
           "12346_1,22-09-2026,Kerala,ZS-PUR-S,1,\"₹999\",RTO_COMPLETE\n")
    headers, rows = cf.read_table(csv.encode("utf-8"), "orders.csv")
    m = cf.detect_columns(headers, "meesho")
    assert m.ok, m.missing
    p = cf.orders_from_rows(headers, rows, m)
    assert [o.status for o in p.orders] == ["DELIVERED", "RETURNED"]
    assert p.orders[0].lines[0].unit_price_paise == 112400
    assert p.orders[0].ordered_at.day == 21


def test_a_renamed_column_is_reported_and_can_be_overridden():
    csv = "Order No,Article Code,Qty,Selling Price,Status\nA1,ZS-WIN-M,1,1124,Shipped\n"
    headers, rows = cf.read_table(csv.encode(), "ajio.csv")
    m = cf.detect_columns(headers, "ajio")
    assert m.missing == ["sku"] and not m.ok
    m2 = cf.detect_columns(headers, "ajio", overrides={"sku": "Article Code"})
    assert m2.ok and m2.columns["sku"] == "Article Code"


def test_status_words_in_the_right_order():
    assert cf.map_status("Undelivered") == "SHIPPED"
    assert cf.map_status("RTO Delivered") == "RETURNED"
    assert cf.map_status("Delivered") == "DELIVERED"
    assert cf.map_status("Cancelled by customer") == "CANCELLED"
    assert cf.map_status("Pending") == "PAID"
    assert cf.map_status("Unshipped") == "PAID"
    assert cf.map_status("Ready to Ship") == "PACKED"
    assert cf.map_status("Out for delivery") == "SHIPPED"
    assert cf.map_status("Delivery attempted") == "SHIPPED"
    assert cf.map_status("Picked up") == "SHIPPED"


def test_bad_rows_are_named_not_guessed():
    csv = "Order No,Seller SKU,Qty,Selling Price\nA1,ZS-WIN-M,one,1124\n,ZS-WIN-M,1,1124\nA3,ZS-WIN-M,1,\n"
    headers, rows = cf.read_table(csv.encode(), "x.csv")
    p = cf.orders_from_rows(headers, rows, cf.detect_columns(headers, "ajio"))
    assert p.orders == [] and len(p.problems) == 3
    assert "Row 2" in p.problems[0] and "quantity" in p.problems[0]


def _xlsx(header, rows):
    """A minimal .xlsx: shared strings for text, inline numbers."""
    strings, cells = [], []
    def cell(ref, v):
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"><v>{v}</v></c>'
        if v not in strings:
            strings.append(v)
        return f'<c r="{ref}" t="s"><v>{strings.index(v)}</v></c>'
    def row(n, values):
        return f'<row r="{n}">' + "".join(cell(f"{chr(65+i)}{n}", v) for i, v in enumerate(values)) + "</row>"
    sheet_rows = [row(1, header)] + [row(i + 2, r) for i, r in enumerate(rows)]
    sheet = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             + "".join(sheet_rows) + "</sheetData></worksheet>")
    sst = ('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
           + "".join(f"<si><t>{s}</t></si>" for s in strings) + "</sst>")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", sheet)
        z.writestr("xl/sharedStrings.xml", sst)
    return buf.getvalue()


def test_an_excel_export_reads_the_same_as_csv():
    data = _xlsx(["Order Release Id", "Seller SKU Code", "Quantity", "Final Amount", "Order Status", "Order Date"],
                 [["MYN1", "ZS-WIN-M", 1, 1124, "Shipped", 46285]])      # 46285 = an Excel serial date
    headers, rows = cf.read_table(data, "myntra.xlsx")
    m = cf.detect_columns(headers, "myntra")
    assert m.ok, m.missing
    p = cf.orders_from_rows(headers, rows, m)
    assert p.orders[0].lines[0].unit_price_paise == 112400
    assert p.orders[0].ordered_at is not None and p.orders[0].ordered_at.year == 2026


def test_settlement_lines_sum_per_order():
    csv = ("Order Id,Amount,Settlement Date\nA1,1000.00,2026-09-25\nA1,-60.00,2026-09-25\nA2,abc,2026-09-25\n,999,\n")
    headers, rows = cf.read_table(csv.encode(), "payout.csv")
    m = cf.detect_columns(headers, "amazon", kind="settlements")
    assert m.ok
    sett, problems, n = cf.settlements_from_rows(headers, rows, m)
    assert n == 4 and len(sett) == 1 and sett[0].amount_paise == 94000
    assert len(problems) == 1 and "A2" in problems[0]

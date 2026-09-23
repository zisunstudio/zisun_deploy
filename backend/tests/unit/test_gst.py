"""The parts must always add back to what the customer actually paid."""
import pytest

from app.services import gst


def test_the_rate_is_per_piece_not_per_order():
    assert gst.rate_for(99900) == 5       # Rs 999
    assert gst.rate_for(100000) == 5      # Rs 1000 exactly, still 5
    assert gst.rate_for(100100) == 12     # Rs 1001
    # Both live ZISUN pieces sit just above the threshold.
    assert gst.rate_for(103900) == 12
    assert gst.rate_for(112400) == 12


def test_tax_is_extracted_from_an_inclusive_price_and_adds_back():
    taxable, tax = gst.split_inclusive(103900, 12)
    assert taxable + tax == 103900        # the customer's total is fixed
    assert taxable == 92768               # 1039 / 1.12
    assert tax == 11132


def test_cgst_and_sgst_always_sum_to_the_tax_even_when_odd():
    for tax in range(0, 200):
        c, s = gst.halve(tax)
        assert c + s == tax
        assert abs(c - s) <= 1


def test_karnataka_is_cgst_sgst_and_everywhere_else_is_igst():
    items = [{"description": "Purple Rose", "quantity": 1, "unit_price_paise": 103900}]
    home = gst.compute(items, state="Karnataka")
    assert home.intra_state and home.igst_paise == 0
    assert home.cgst_paise + home.sgst_paise == 11132
    away = gst.compute(items, state="Maharashtra")
    assert not away.intra_state and away.cgst_paise == 0
    assert away.igst_paise == 11132
    # Same money either way; only the invoice differs.
    assert home.total_paise == away.total_paise == 103900


def test_an_unknown_state_is_treated_as_inter_state():
    """Charging CGST+SGST on an out-of-state supply is the error the customer
    cannot fix in their own filing, so IGST is the safe default."""
    inv = gst.compute([{"quantity": 1, "unit_price_paise": 103900}], state="Atlantis")
    assert inv.igst_paise > 0 and inv.cgst_paise == 0


def test_two_pieces_either_side_of_the_threshold_carry_different_rates():
    inv = gst.compute([
        {"description": "under", "quantity": 1, "unit_price_paise": 99900},
        {"description": "over", "quantity": 1, "unit_price_paise": 112400},
    ], state="Karnataka")
    assert [l.rate_pct for l in inv.lines] == [5, 12]
    assert inv.total_paise == 99900 + 112400


def test_the_cod_fee_follows_the_principal_supply():
    inv = gst.compute(
        [{"quantity": 1, "unit_price_paise": 112400}],
        shipping_paise=9900, state="Karnataka",
    )
    delivery = inv.lines[-1]
    assert delivery.description == "Delivery" and delivery.rate_pct == 12
    assert inv.total_paise == 112400 + 9900


def test_quantities_multiply_but_the_rate_still_reads_the_unit_price():
    """Three Rs 999 kurtas are three 5% pieces, not one Rs 2,997 piece at 12%."""
    inv = gst.compute([{"quantity": 3, "unit_price_paise": 99900}], state="Karnataka")
    assert inv.lines[0].rate_pct == 5
    assert inv.total_paise == 299700


@pytest.mark.parametrize("total", [1, 99, 100, 99900, 103900, 112400, 500000])
@pytest.mark.parametrize("state", ["Karnataka", "Kerala"])
def test_the_breakdown_never_loses_or_invents_a_paise(total, state):
    inv = gst.compute([{"quantity": 1, "unit_price_paise": total}], state=state)
    assert inv.taxable_paise + inv.tax_paise == inv.total_paise == total


def test_an_empty_order_is_zero_not_a_crash():
    inv = gst.compute([], state="Karnataka")
    assert inv.total_paise == 0 and inv.tax_paise == 0

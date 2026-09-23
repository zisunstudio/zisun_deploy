"""The parts must always add back to what the customer actually paid."""
import pytest

from app.services import gst


def test_the_rate_is_per_piece_not_per_order():
    assert gst.rate_for(249900) == 5      # Rs 2,499
    assert gst.rate_for(250000) == 5      # Rs 2,500 exactly, still the lower slab
    assert gst.rate_for(250100) == 18     # Rs 2,501
    # Both live ZISUN pieces sit under the threshold.
    assert gst.rate_for(103900) == 5
    assert gst.rate_for(112400) == 5


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
    _, expected_tax = gst.split_inclusive(103900, gst.rate_for(103900))
    home = gst.compute(items, state="Karnataka")
    assert home.intra_state and home.igst_paise == 0
    assert home.cgst_paise + home.sgst_paise == expected_tax
    away = gst.compute(items, state="Maharashtra")
    assert not away.intra_state and away.cgst_paise == 0
    assert away.igst_paise == expected_tax
    # Same money either way; only the invoice differs.
    assert home.total_paise == away.total_paise == 103900


def test_an_unknown_state_is_treated_as_inter_state():
    """Charging CGST+SGST on an out-of-state supply is the error the customer
    cannot fix in their own filing, so IGST is the safe default."""
    inv = gst.compute([{"quantity": 1, "unit_price_paise": 103900}], state="Atlantis")
    assert inv.igst_paise > 0 and inv.cgst_paise == 0


def test_two_pieces_either_side_of_the_threshold_carry_different_rates():
    inv = gst.compute([
        {"description": "under", "quantity": 1, "unit_price_paise": 249900},
        {"description": "over", "quantity": 1, "unit_price_paise": 260000},
    ], state="Karnataka")
    assert [l.rate_pct for l in inv.lines] == [5, 18]
    assert inv.total_paise == 249900 + 260000


def test_the_cod_fee_follows_the_principal_supply():
    inv = gst.compute(
        [{"quantity": 1, "unit_price_paise": 112400}],
        shipping_paise=9900, state="Karnataka",
    )
    delivery = inv.lines[-1]
    # It rides on the garment's rate, whatever the slab currently is.
    assert delivery.description == "Delivery"
    assert delivery.rate_pct == gst.rate_for(112400)
    assert inv.total_paise == 112400 + 9900


def test_quantities_multiply_but_the_rate_still_reads_the_unit_price():
    """Three Rs 999 kurtas are three pieces under the threshold, not one
    Rs 2,997 piece over it."""
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


# ── The slab is configuration, and it moved ─────────────────────────────────

def test_the_current_slab_puts_both_live_pieces_at_five_percent():
    """It shipped with the old Rs 1,000 / 12% regime and was wrong for every
    ZISUN piece. Both sit under Rs 2,500, so both are 5%."""
    assert gst.rate_for(103900) == 5
    assert gst.rate_for(112400) == 5
    assert gst.rate_for(250000) == 5      # Rs 2,500 exactly is still the lower slab
    assert gst.rate_for(250100) == 18     # a rupee over


# ── Prices entered without tax ──────────────────────────────────────────────

def test_an_inclusive_price_is_charged_exactly_as_typed():
    assert gst.selling_price(103900, includes_tax=True) == 103900


def test_an_exclusive_price_has_tax_added_to_reach_the_selling_price():
    assert gst.selling_price(100000, includes_tax=False) == 105000     # 1000 + 5%
    taxable, tax = gst.split_inclusive(105000, 5)
    assert taxable + tax == 105000


def test_an_exclusive_price_that_crosses_the_slab_settles_on_the_higher_rate():
    """Rs 2,400 ex-tax is Rs 2,520 at 5%, which is above the threshold - so it
    is 18%, and the conversion has to notice."""
    price = gst.selling_price(240000, includes_tax=False)
    assert gst.rate_for(price) == 18
    assert price == 283200


def test_converting_then_splitting_still_never_loses_a_paise():
    for entered in (1, 99, 100000, 123456, 240000, 250000, 999999):
        price = gst.selling_price(entered, includes_tax=False)
        taxable, tax = gst.split_inclusive(price, gst.rate_for(price))
        assert taxable + tax == price

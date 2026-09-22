"""The fit engine decides the size; these pin down every rule it uses."""
from app.services.fit import feet_inches, parse_height_cm, recommend

SIZES = ["M", "L", "XL", "2XL", "3XL"]


def test_usual_size_when_nothing_else_is_said():
    a = recommend(available_sizes=SIZES, usual_size="M", height_cm=160)
    assert a.size == "M" and a.headline == "Take M."


def test_relaxed_goes_one_up_unless_the_cut_is_already_relaxed():
    assert recommend(available_sizes=SIZES, usual_size="M", height_cm=160, preference="relaxed").size == "L"
    assert recommend(available_sizes=SIZES, usual_size="M", height_cm=160, preference="relaxed", fit="Relaxed").size == "M"


def test_fitted_never_sizes_down():
    assert recommend(available_sizes=SIZES, usual_size="L", height_cm=160, preference="fitted").size == "L"


def test_a_missing_size_falls_to_the_nearest_and_says_so():
    a = recommend(available_sizes=SIZES, usual_size="S", height_cm=160)
    assert a.size == "M"
    assert a.confidence == "low"
    assert any("not in stock" in r for r in a.reasons)


def test_length_is_compared_with_the_founder_when_she_wears_it():
    a = recommend(available_sizes=SIZES, usual_size="M", height_cm=165, worn_by_founder=True, garment_length="Calf length")
    assert a.height_delta_cm == 12
    assert any("12 cm taller than Sushmita" in r and "noticeably higher" in r for r in a.reasons)


def test_close_heights_say_it_falls_as_in_the_photos():
    a = recommend(available_sizes=SIZES, usual_size="M", height_cm=155, worn_by_founder=True)
    assert any("much as it does in the photographs" in r for r in a.reasons)


def test_no_reference_body_means_no_length_claim():
    a = recommend(available_sizes=SIZES, usual_size="M", height_cm=170)
    assert a.height_delta_cm is None
    assert not any("taller" in r or "shorter" in r for r in a.reasons)


def test_a_named_model_height_is_used_when_it_is_not_the_founder():
    a = recommend(available_sizes=SIZES, usual_size="M", height_cm=160, model_height="5'7\"")
    assert a.height_delta_cm == 160 - 170


def test_height_parsing():
    assert parse_height_cm("153 cm") == 153
    assert parse_height_cm("5'4\"") == 163
    assert parse_height_cm("5 ft 0 in") == 152
    assert parse_height_cm("tall") is None
    assert feet_inches(153) == "5'0\""


def test_no_stock_is_an_error_not_a_guess():
    import pytest
    with pytest.raises(ValueError):
        recommend(available_sizes=[], usual_size="M", height_cm=160)

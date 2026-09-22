"""A brand claim exists only if the pieces record it."""
from app.services.truth import compute

SILK = {"fabric_composition": "Vartican silk", "craft": None, "origin": None, "will_rerun": None, "batch_size": None}
DABU = {"fabric_composition": "Dhabu cotton", "craft": "Hand block print (dabu)", "origin": "Bagru, Rajasthan", "will_rerun": False, "batch_size": 12}
MANGALGIRI = {"fabric_composition": "100% handloom cotton", "craft": "Handloom", "origin": "Mangalgiri, Andhra Pradesh", "will_rerun": False, "batch_size": 8}


def keys(t):
    return {c.key: c.text for c in t.claims}


def test_the_live_catalogue_earns_almost_nothing():
    t = compute([SILK, DABU])
    k = keys(t)
    assert "craft" not in k                      # nobody recorded handloom
    assert k.get("fabric") == "Cotton and silk"  # honest, not "handloom cotton"
    assert "batch" not in k                      # one piece has no re-run decision
    assert k.get("origin", "").startswith("Some pieces from Bagru")
    assert "a re-run decision (yes/no) on every piece" in t.missing


def test_a_fully_recorded_handloom_catalogue_earns_the_full_claim():
    t = compute([MANGALGIRI, {**MANGALGIRI, "origin": "Ilkal, Karnataka"}])
    k = keys(t)
    assert k["fabric"] == "Handloom cotton"
    assert k["craft"] == "Woven by hand"
    assert k["origin"] == "Ilkal · Mangalgiri"
    assert "never more than 8" in k["batch"] and "never re-run" in k["batch"]
    assert t.missing == []


def test_one_silk_piece_removes_the_cotton_claim():
    assert keys(compute([MANGALGIRI, SILK])).get("fabric") == "Cotton and silk"


def test_a_single_undecided_rerun_removes_the_never_rerun_claim():
    assert "batch" not in keys(compute([MANGALGIRI, {**MANGALGIRI, "will_rerun": None}]))


def test_an_empty_catalogue_claims_nothing():
    t = compute([])
    assert t.claims == [] and t.pieces == 0


def test_inactive_pieces_do_not_count():
    assert keys(compute([{**SILK, "is_active": False}, MANGALGIRI])).get("fabric") == "Handloom cotton"


def test_typed_text_is_audited_against_the_same_facts():
    from app.services.truth import audit_text
    t = compute([SILK, DABU])
    hits = audit_text("Category", "Breathable handloom cotton for the working week.", t)
    assert [h["says"] for h in hits] == ["handloom"]
    assert audit_text("Category", "Kurti and palazzo in one weave.", t) == []


def test_a_recorded_fact_clears_the_phrase():
    from app.services.truth import audit_text
    t = compute([MANGALGIRI])
    assert audit_text("x", "Handloom cotton from Mangalgiri", t) == []
    assert [h["says"] for h in audit_text("x", "Kasavu weaves", t)] == ["Kasavu"]

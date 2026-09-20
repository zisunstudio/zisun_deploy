"""The brief's sentences, without a database."""
from datetime import datetime

from app.api.admin.endpoints import dashboard as d


def _facts(**over):
    f = {
        "today": {"orders": 0, "revenue_paise": 0},
        "week": {"orders": 0, "revenue_paise": 0, "sessions": 141, "sessions_previous_week": 2, "top_products": []},
        "orders": {"waiting_to_ship_over_2_days": 0, "cod_unconfirmed": 0},
        "whatsapp": {"enquiries_week": 0, "enquiries_previous_week": 0, "ordered_week": 0, "unanswered": 0},
        "catalogue": {"live_products": 1, "sold_out_variants": 0, "low_stock": [], "without_photos": [], "coupons_live": 1},
        "system": {"launch_mode": "browse", "checkout_enabled": False, "ai": False},
    }
    for k, v in over.items():
        f[k].update(v)
    return f


def test_no_percentage_on_a_tiny_base():
    b = d._rule_brief(_facts())
    assert "%" not in " ".join(b["bullets"])
    assert "141 visits this week, 2 the week before." in b["bullets"]


def test_percentage_when_the_base_is_real():
    b = d._rule_brief(_facts(week={"sessions": 150, "sessions_previous_week": 100}))
    assert "150 visits this week, +50% on last week." in b["bullets"]


def test_unanswered_enquiries_are_critical():
    b = d._rule_brief(_facts(whatsapp={"unanswered": 3, "enquiries_week": 5}))
    assert b["headline"] == "Something needs you today."
    assert any("waited over a day" in c for c in b["critical"])


def test_browse_mode_never_says_quiet_day():
    b = d._rule_brief(_facts())
    assert "Quiet day" not in b["headline"]
    assert b["headline"] in ("Early morning - here is the week so far.", "A steady week so far.")


def test_growth_headline_needs_a_real_base():
    b = d._rule_brief(_facts(week={"sessions": 300, "sessions_previous_week": 100}))
    assert b["headline"] == "Traffic is growing this week."

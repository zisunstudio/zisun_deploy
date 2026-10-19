"""Which ad or post sent the visit: visits, people and orders per campaign."""
from datetime import datetime, timedelta, timezone

from app.api.admin.endpoints import dashboard as d
from app.models.order import OrderStatus, PaymentMethod

NOW = datetime(2026, 10, 19, 12, tzinfo=timezone.utc)


def test_visits_people_and_orders_are_grouped_by_campaign_and_creative():
    sessions = [
        ("s1", "instagram", "diwali-reel", "wine-set", "v1"),
        ("s2", "instagram", "diwali-reel", "wine-set", "v1"),   # same person, second visit
        ("s3", "instagram", "diwali-reel", "teal-set", "v2"),
        ("s4", "fb", "diwali-reel", "wine-set", "v3"),
    ]
    orders = [
        ("instagram", "diwali-reel", "wine-set", OrderStatus.PAID, PaymentMethod.RAZORPAY, 112400, NOW - timedelta(hours=2), None, None),
        ("instagram", "diwali-reel", "wine-set", OrderStatus.CANCELLED, PaymentMethod.COD, 112400, NOW - timedelta(hours=2), None, None),
        ("instagram", "diwali-reel", "teal-set", OrderStatus.PAYMENT_PENDING, PaymentMethod.COD, 129900, NOW - timedelta(hours=1), None, None),
    ]
    rows = d.campaign_rows(sessions, orders, NOW)
    wine = next(r for r in rows if r["content"] == "wine-set" and r["source"] == "instagram")
    assert wine["sessions"] == 2 and wine["visitors"] == 1
    assert wine["orders"] == 1 and wine["collected_paise"] == 112400   # the cancelled one is not an order
    teal = next(r for r in rows if r["content"] == "teal-set")
    assert teal["orders"] == 1 and teal["committed_paise"] == 129900 and teal["collected_paise"] == 0
    assert rows[0] is wine  # most orders first
    assert any(r["source"] == "fb" for r in rows)


def test_an_order_with_a_campaign_but_no_visit_still_shows():
    rows = d.campaign_rows([], [("instagram", "story", "", OrderStatus.PAID, PaymentMethod.RAZORPAY, 34900, NOW, None, None)], NOW)
    assert rows == [{"source": "instagram", "campaign": "story", "content": "", "sessions": 0, "visitors": 0, "orders": 1, "collected_paise": 34900, "committed_paise": 0}]


def test_category_rows_add_up_each_piece_under_its_category():
    rows = d.category_rows([
        {"category_id": "c1", "impressions": 100, "views": 10, "add_to_cart": 1, "orders": 1},
        {"category_id": "c1", "impressions": 50, "views": 5, "add_to_cart": 0, "orders": 0},
        {"category_id": None, "impressions": 20, "views": 2, "add_to_cart": 0, "orders": 0},
    ], {"c1": "Co-ord Sets"})
    assert rows[0] == {"category": "Co-ord Sets", "pieces": 2, "impressions": 150, "views": 15, "add_to_cart": 1, "orders": 1}
    assert rows[1]["category"] == "No category" and rows[1]["pieces"] == 1


def test_visitor_kinds_counts_returning_by_the_flag():
    assert d.visitor_kinds([("s1", "true"), ("s2", "false"), ("s3", None), ("s4", "True")]) == {"sessions_new": 2, "sessions_returning": 2}

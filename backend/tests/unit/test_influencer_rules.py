"""The rules that decide who an order belongs to and what she earns."""
import uuid
from datetime import datetime, timedelta, timezone

from app.services import influencer as svc

NOW = datetime(2026, 11, 1, 12, tzinfo=timezone.utc)
A, B = uuid.uuid4(), uuid.uuid4()


def test_her_code_beats_any_link():
    assert svc.decide(A, B, NOW - timedelta(minutes=1), NOW, 30) == (A, "code")


def test_last_link_inside_the_window():
    assert svc.decide(None, B, NOW - timedelta(days=29, hours=23), NOW, 30) == (B, "link")
    assert svc.decide(None, B, NOW - timedelta(days=30, seconds=1), NOW, 30) is None


def test_a_click_from_the_future_is_not_proof():
    assert svc.decide(None, B, NOW + timedelta(hours=1), NOW, 30) is None


def test_no_link_no_code_no_one():
    assert svc.decide(None, None, None, NOW, 30) is None
    assert svc.decide(None, B, None, NOW, 30) is None


def test_commission():
    assert svc.commission_for("percent", 10, 121410) == 12141
    assert svc.commission_for("fixed", 10000, 34900) == 10000
    assert svc.commission_for("fixed", 50000, 34900) == 34900   # never more than the goods
    assert svc.commission_for("percent", 10, 0) == 0
    assert svc.commission_for("percent", 0, 99900) == 0


def test_codes_are_normalised_or_refused():
    assert svc.normalise_code(" Riya Sharma ") == "riya-sharma"
    assert svc.normalise_code("x") is None
    assert svc.normalise_code("") is None
    assert svc.normalise_code("<script>") == "script"


def test_her_own_phone_in_any_format():
    assert svc.same_phone("+91 98765 43210", "9876543210")
    assert not svc.same_phone(None, "9876543210")
    assert not svc.same_phone("12345", "12345")


def test_status_buckets():
    assert svc.bucket("PAYMENT_PENDING", "COD") == "cod_pending"
    assert svc.bucket("SHIPPED", "COD") == "cod_pending"
    assert svc.bucket("PAID", "RAZORPAY") == "confirmed"
    assert svc.bucket("PAYMENT_PENDING", "RAZORPAY") == "unpaid"
    assert svc.bucket("DELIVERED", "COD") == "delivered"
    assert svc.bucket("RETURNED", "RAZORPAY") == "returned"
    assert svc.bucket("FAILED_PAYMENT", "RAZORPAY") == "cancelled"


def test_a_link_only_opens_shop_pages():
    pid = "774f350f-4fcc-4535-b9ec-c1ffe7d277ab"
    for ok in ("/", "/shop", f"/product/{pid}", "/category/co-ord-sets", "/collections/riya-diwali"):
        assert svc.safe_landing(ok) == ok
    for bad in ("https://evil.example", "//evil.example", "/admin", "/product/x", "/category/../admin", "/?inf=x", "/collections/a b", None, ""):
        assert svc.safe_landing(bad) is None

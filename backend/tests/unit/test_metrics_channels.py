"""A marketplace order is committed until the marketplace pays, then what it
paid - after fees - is what counts. Never the list price, never both."""
from app.services import metrics


def _row(status, method, amount, **kw):
    return {"status": status, "payment_method": method, "total_amount": amount, **kw}


def test_marketplace_order_is_owed_until_settled():
    assert metrics.classify("PAID", "MARKETPLACE") == "marketplace_owed"
    assert metrics.classify("DELIVERED", "MARKETPLACE") == "marketplace_owed"
    assert metrics.classify("DELIVERED", "MARKETPLACE", settled=True) == "marketplace_settled"
    assert metrics.classify("CANCELLED", "MARKETPLACE", settled=True) == "cancelled"
    assert metrics.classify("RETURNED", "MARKETPLACE") == "returned"


def test_settled_amount_not_list_price_is_collected():
    m = metrics.summarise([
        _row("DELIVERED", "MARKETPLACE", 112400, channel="amazon", settled=True, settlement_amount=98000),
        _row("SHIPPED", "MARKETPLACE", 99900, channel="amazon"),
        _row("PAID", "RAZORPAY", 50000, channel="web"),
        _row("PAYMENT_PENDING", "COD", 70000, channel="web"),
    ])
    assert m.collected_paise == 98000 + 50000
    assert m.committed_paise == 99900 + 70000
    assert m.orders == 4
    assert m.by_channel["amazon"] == {"orders": 2, "collected_paise": 98000, "committed_paise": 99900,
                                      "lost_paise": 0, "refunded_paise": 0}
    assert m.by_channel["web"]["collected_paise"] == 50000
    assert m.by_channel["web"]["committed_paise"] == 70000


def test_marketplace_never_counts_as_a_gateway_attempt():
    h = metrics.payment_health([_row("PAID", "MARKETPLACE", 1000), _row("PAID", "RAZORPAY", 1000)])
    assert h.attempted == 1


def test_a_website_order_with_no_channel_is_web():
    m = metrics.summarise([_row("PAID", "RAZORPAY", 100)])
    assert list(m.by_channel) == ["web"]

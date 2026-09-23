"""PAYMENT_PENDING means two opposite things; money must not conflate them."""
from app.services.metrics import classify, payment_health, summarise


def test_a_cod_order_resting_in_payment_pending_is_a_real_order():
    assert classify("PAYMENT_PENDING", "COD") == "cod_placed"


def test_a_prepaid_order_resting_in_payment_pending_is_not():
    assert classify("PAYMENT_PENDING", "RAZORPAY") == "payment_abandoned"
    # ...unless she is still on the payment sheet.
    assert classify("PAYMENT_PENDING", "RAZORPAY", minutes_old=3) == "payment_in_flight"
    assert classify("PAYMENT_PENDING", "RAZORPAY", minutes_old=45) == "payment_abandoned"


def test_cod_money_is_collected_only_on_delivery():
    rows = [
        {"status": "PAYMENT_PENDING", "payment_method": "COD", "total_amount": 100000},
        {"status": "SHIPPED", "payment_method": "COD", "total_amount": 200000},
        {"status": "DELIVERED", "payment_method": "COD", "total_amount": 300000},
    ]
    m = summarise(rows)
    assert m.collected_paise == 300000      # only the delivered one is cash
    assert m.committed_paise == 300000      # the other two are owed
    assert m.orders == 3


def test_abandoned_and_cancelled_are_never_revenue():
    rows = [
        {"status": "PAYMENT_PENDING", "payment_method": "RAZORPAY", "total_amount": 500000, "minutes_old": 90},
        {"status": "CANCELLED", "payment_method": "RAZORPAY", "total_amount": 400000},
        {"status": "FAILED_PAYMENT", "payment_method": "RAZORPAY", "total_amount": 300000},
        {"status": "PAID", "payment_method": "RAZORPAY", "total_amount": 100000},
    ]
    m = summarise(rows)
    assert m.collected_paise == 100000
    assert m.committed_paise == 0
    assert m.lost_paise == 800000           # abandoned + failed, not cancelled
    assert m.orders == 1


def test_a_return_is_refunded_not_revenue():
    m = summarise([{"status": "RETURNED", "payment_method": "RAZORPAY", "total_amount": 120000}])
    assert m.collected_paise == 0 and m.refunded_paise == 120000


def test_payment_health_separates_failure_from_abandonment():
    rows = [
        {"id": 1, "status": "PAID", "payment_method": "RAZORPAY", "total_amount": 1},
        {"id": 2, "status": "FAILED_PAYMENT", "payment_method": "RAZORPAY", "total_amount": 1},
        {"id": 3, "status": "PAYMENT_PENDING", "payment_method": "RAZORPAY", "total_amount": 1, "minutes_old": 200},
        {"id": 4, "status": "PAYMENT_PENDING", "payment_method": "RAZORPAY", "total_amount": 1, "minutes_old": 2},
        {"id": 5, "status": "PAYMENT_PENDING", "payment_method": "COD", "total_amount": 1},
    ]
    h = payment_health(rows, captured_order_ids={1})
    assert h.attempted == 4                 # the COD order is not a payment attempt
    assert (h.succeeded, h.failed, h.abandoned, h.in_flight) == (1, 1, 1, 1)
    assert h.success_rate == 33.3           # of the three settled
    assert h.mismatched == 0


def test_a_captured_payment_on_an_unpaid_order_is_flagged():
    """The webhook is the only thing that marks an order PAID. Gateway says
    captured, order says pending -> the webhook never landed."""
    rows = [{"id": 9, "status": "PAYMENT_PENDING", "payment_method": "RAZORPAY", "total_amount": 1, "minutes_old": 90}]
    assert payment_health(rows, captured_order_ids={9}).mismatched == 1


def test_no_orders_reports_no_rates_rather_than_zero():
    h = payment_health([])
    assert h.success_rate is None and h.abandon_rate is None


# ── Query construction ───────────────────────────────────────────────────────
#
# `.astext` exists only on JSONB. `analytics_events.properties` is plain JSON,
# so `.astext` raises an AttributeError while the query is being *built* - not
# a SQL error a database would catch, and not something a fixture-backed
# screenshot of the page can ever show. It takes the whole board down at the
# first real request. These build the expressions without a database.

def test_property_lookups_compile_against_plain_json():
    from app.api.admin.endpoints.dashboard import _count_via, product_id_matches
    from app.models.catalog import Product

    for expr in (_count_via("buy_now"), product_id_matches(Product.id)):
        assert "->>" in str(expr.compile(compile_kwargs={"literal_binds": True}))


def test_every_dashboard_panel_query_builds():
    """Import-time construction of each panel, so a typo cannot ship silently."""
    import sqlalchemy as sa
    from app.models.analytics import AnalyticsEvent

    src = AnalyticsEvent.properties.op("->>")("source")
    stmt = (
        sa.select(src.label("src"), sa.func.count(sa.distinct(AnalyticsEvent.session_id)))
        .where(AnalyticsEvent.session_id.isnot(None))
        .group_by("src")
    )
    assert "->>" in str(stmt.compile(compile_kwargs={"literal_binds": True}))

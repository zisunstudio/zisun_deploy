"""Impressions by calendar period: the boundaries and the query, compiled."""
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.api.admin.endpoints import dashboard as d
from app.models.catalog import Product


def test_period_starts_are_ist_calendar_boundaries():
    # Thursday 2026-10-01 02:00 UTC is 07:30 IST on the same Thursday.
    s = d.period_starts(datetime(2026, 10, 1, 2, 0, tzinfo=timezone.utc))
    assert s["day"].isoformat() == "2026-10-01T00:00:00+05:30"
    assert s["week"].isoformat() == "2026-09-28T00:00:00+05:30"      # Monday
    assert s["month"].isoformat() == "2026-10-01T00:00:00+05:30"
    assert s["year"].isoformat() == "2026-01-01T00:00:00+05:30"


def test_just_after_ist_midnight_is_already_the_new_day():
    # 18:45 UTC on 30 Sep is 00:15 IST on 1 Oct: today, this month have rolled over.
    s = d.period_starts(datetime(2026, 9, 30, 18, 45, tzinfo=timezone.utc))
    assert s["day"].date().isoformat() == "2026-10-01"
    assert s["month"].date().isoformat() == "2026-10-01"


def test_the_periods_query_compiles_and_buckets_by_timestamp():
    live = sa.and_(Product.deleted_at.is_(None), Product.is_active.is_(True))
    stmt, starts = d.product_periods_query(datetime(2026, 10, 1, 2, 0, tzinfo=timezone.utc), live)
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    for p in d.PERIODS:
        assert f"impressions_{p}" in sql and f"opens_{p}" in sql
    assert sql.count("analytics_events.created_at >=") >= 9, "each bucket filters by its own start"
    assert "->>" in sql, "product id read with ->>, which works on json (not .astext)"


def test_rows_become_per_period_numbers():
    class Row:
        def __init__(self, **kw):
            self._mapping = kw
    rows = d.product_periods_rows([Row(id="p1", name="Purple Rose", impressions_day=32, opens_day=4,
                                       impressions_week=141, opens_week=20, impressions_month=486,
                                       opens_month=60, impressions_year=2341, opens_year=300)])
    assert rows[0]["periods"]["day"] == {"impressions": 32, "opens": 4}
    assert rows[0]["periods"]["year"]["impressions"] == 2341


def test_the_series_has_one_row_per_day_for_both_windows():
    from datetime import date, datetime, timezone
    first = date(2026, 9, 21)
    now = datetime(2026, 9, 27, 12, tzinfo=timezone.utc)
    ev = [(date(2026, 9, 27), 40, 12, 3, 90), (date(2026, 9, 20), 10, 2, 0, 20), (date(2026, 8, 1), 999, 9, 9, 9)]
    enq = [(date(2026, 9, 25), 4)]
    ist_noon = lambda d: datetime(2026, 9, d, 6, 30, tzinfo=timezone.utc)   # 12:00 IST
    orders = [
        ("PAID", "RAZORPAY", 112400, ist_noon(26), None, None),
        ("PAYMENT_PENDING", "COD", 99900, ist_noon(26), None, None),
        ("DELIVERED", "MARKETPLACE", 112400, ist_noon(24), ist_noon(26), 90000),
        ("CANCELLED", "RAZORPAY", 50000, ist_noon(26), None, None),
    ]
    s = d.build_series(first, 7, ev, orders, enq, now)
    assert [len(s["current"]), len(s["previous"])] == [7, 7]
    assert s["current"][0]["date"] == "2026-09-21" and s["current"][-1]["date"] == "2026-09-27"
    assert s["previous"][-1]["date"] == "2026-09-20" and s["previous"][-1]["sessions"] == 10
    today = s["current"][-1]
    assert (today["sessions"], today["opens"], today["bag_adds"], today["impressions"]) == (40, 12, 3, 90)
    assert s["current"][4]["enquiries"] == 4
    day26 = s["current"][5]
    assert day26["orders"] == 2, "the cancelled one is not an order"
    assert (day26["collected_paise"], day26["committed_paise"]) == (112400, 99900), "never added together"
    assert s["current"][3]["collected_paise"] == 90000, "a marketplace order counts what it paid, not its list price"
    assert all(r["sessions"] != 999 for r in s["current"] + s["previous"]), "older rows fall outside"


def test_the_series_queries_compile_with_ist_dates():
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql
    from app.models.analytics import AnalyticsEvent
    sql = str(sa.select(d.ist_day(AnalyticsEvent.created_at)).compile(dialect=postgresql.dialect()))
    assert "timezone(" in sql and "date(" in sql


def test_open_rate_counts_card_opens_under_the_new_key_and_the_old_one():
    """`opened_from` since 2026-09-27; `source == "card"` before 23 Sep. In
    between, attribution overwrote `source`, which is why open rate read 0."""
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql
    compiled = sa.select(d._views_from_cards()).compile(dialect=postgresql.dialect())
    values = set(compiled.params.values())
    assert {"opened_from", "source", "card", "product_viewed"} <= values


def test_only_an_attributed_event_supplies_a_traffic_source():
    """Old product-page events stored where she tapped (card, hero, bag) as
    `source`; the sources panel listed them as channels."""
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql
    sql = str(sa.select(d.traffic_source()).compile(dialect=postgresql.dialect()))
    assert "CAST(analytics_events.properties AS JSONB) ?" in sql, "keyed on the attribution fields being present"


def test_frontend_never_reuses_an_attribution_key():
    """Attribution is spread last in trackEvent and owns these names."""
    import re
    from pathlib import Path
    root = Path(__file__).resolve().parents[3] / "frontend/src"
    owned = ("source", "medium", "campaign", "content", "referrer_domain")
    offenders = []
    for f in root.rglob("*.ts*"):
        for m in re.finditer(r"trackEvent\(\s*\"[a-z_]+\"\s*,\s*\{([^}]*)\}", f.read_text()):
            keys = re.findall(r"(\w+)\s*:", m.group(1))
            offenders += [f"{f.name}: {k}" for k in keys if k in owned]
    assert not offenders, f"these would be overwritten by attribution: {offenders}"

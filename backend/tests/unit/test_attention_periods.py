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

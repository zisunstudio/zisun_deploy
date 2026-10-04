"""The board on one connection.

On 2026-10-04 the console told the founder she had no products. The board
sent fifty-four queries at once to a pool of two connections; the ones still
queueing after thirty seconds gave up, and an empty panel reads as an empty
shop. These hold the fix in place without a database: one session for the
whole board, one query at a time, the plain counts as one statement, a
failure named and survived, and a board with holes never replacing a whole
one.
"""
import asyncio
import re
from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.future import select

from app.api.admin.endpoints import dashboard as d


def q(value: str):
    return select(sa.literal_column(value))


class _Result:
    def __init__(self, values):
        self.values = values

    def scalar_one(self):
        return self.values[0]

    def one(self):
        return tuple(self.values)

    def all(self):
        return [tuple(self.values)]


class _Session:
    opened = 0
    statements: list[str] = []
    running = 0
    most_at_once = 0
    rollbacks = 0
    refuse_combined = False

    async def __aenter__(self):
        _Session.opened += 1
        return self

    async def __aexit__(self, *exc):
        return False

    async def connection(self):
        return object()

    async def rollback(self):
        _Session.rollbacks += 1

    async def execute(self, stmt):
        text = re.sub(r"\s+", " ", str(stmt))
        _Session.statements.append(text)
        _Session.running += 1
        _Session.most_at_once = max(_Session.most_at_once, _Session.running)
        try:
            await asyncio.sleep(0)
            if "boom" in text or (_Session.refuse_combined and "AS c0" in text):
                raise RuntimeError("the database said no")
            return _Result([int(n) for n in re.findall(r"SELECT (\d+)", text)])
        finally:
            _Session.running -= 1


@pytest.fixture(autouse=True)
def fake_database(monkeypatch):
    for k, v in dict(opened=0, statements=[], running=0, most_at_once=0, rollbacks=0, refuse_combined=False).items():
        setattr(_Session, k, v)
    monkeypatch.setattr(d, "AsyncSessionLocal", _Session)
    d._CACHE.clear()
    d._INFLIGHT.clear()


async def test_the_whole_board_uses_one_session_one_query_at_a_time():
    r, errors = await d._panels(a=d._scalar(q("1")), b=d._scalar(q("2")), rows=d._all(q("3")), row=d._one(q("4")))
    assert errors == []
    assert r == {"a": 1, "b": 2, "rows": [(3,)], "row": (4,)}
    assert _Session.opened == 1
    assert _Session.most_at_once == 1


async def test_plain_counts_travel_as_one_statement():
    await d._panels(a=d._scalar(q("1")), b=d._scalar(q("2")), c=d._scalar(q("3")), rows=d._all(q("4")))
    assert len(_Session.statements) == 2
    assert "AS c0" in _Session.statements[0] and "AS c2" in _Session.statements[0]


async def test_a_failing_panel_is_named_and_the_rest_arrive():
    r, errors = await d._panels(good=d._all(q("1")), bad=d._all(q("boom")), after=d._all(q("2")))
    assert errors == ["bad: RuntimeError"]
    assert r["bad"] is None and r["good"] == [(1,)] and r["after"] == [(2,)]
    assert _Session.rollbacks == 1  # or every later panel fails for the first one's reason


async def test_when_the_combined_counts_fail_the_broken_one_is_the_one_named():
    r, errors = await d._panels(a=d._scalar(q("1")), bad=d._scalar(q("boom")), c=d._scalar(q("3")))
    assert errors == ["bad: RuntimeError"]
    assert r["a"] == 1 and r["c"] == 3 and r["bad"] is None


async def test_a_refused_combined_statement_falls_back_to_one_at_a_time():
    _Session.refuse_combined = True
    r, errors = await d._panels(a=d._scalar(q("1")), b=d._scalar(q("2")))
    assert errors == [] and r == {"a": 1, "b": 2}


async def test_a_count_still_works_outside_a_board():
    assert await d._scalar(q("7")) == 7
    assert _Session.opened == 1


def test_the_combined_statement_is_valid_postgres():
    stmts = [select(sa.func.count(d.Order.id)).where(d.Order.created_at >= datetime(2026, 1, 1)),
             select(sa.func.coalesce(sa.func.sum(d.WhatsAppEnquiry.order_amount_paise), 0)),
             select(sa.func.count(sa.distinct(d.AnalyticsEvent.session_id))).where(d.AnalyticsEvent.session_id.isnot(None))]
    sql = str(d.scalars_statement(stmts).compile(dialect=postgresql.dialect()))
    assert sql.count("(SELECT") == 3 and "AS c0" in sql and "AS c2" in sql


def test_a_board_with_holes_does_not_replace_a_whole_one():
    whole = {"meta": {"errors": []}, "n": 1}
    d._store("dashboard:7", whole)
    d._store("dashboard:7", {"meta": {"errors": ["products: TimeoutError"]}, "n": 2})
    assert d._CACHE["dashboard:7"][1] is whole
    better = {"meta": {"errors": []}, "n": 3}
    d._store("dashboard:7", better)
    assert d._CACHE["dashboard:7"][1] is better


def test_holes_are_kept_when_there_is_nothing_better_or_it_is_too_old():
    holed = {"meta": {"errors": ["products: TimeoutError"]}}
    d._store("dashboard:7", holed)
    assert d._CACHE["dashboard:7"][1] is holed
    d._CACHE["dashboard:30"] = (datetime.now(timezone.utc) - timedelta(seconds=d.STALE_SECONDS + 1), {"meta": {"errors": []}})
    d._store("dashboard:30", holed)
    assert d._CACHE["dashboard:30"][1] is holed


async def test_two_requests_for_a_cold_board_share_one_computation():
    runs = 0

    async def compute():
        nonlocal runs
        runs += 1
        await asyncio.sleep(0.01)
        return {"meta": {"errors": []}}

    a, b = await asyncio.gather(d._cached("dashboard:7", 60, 3600, compute), d._cached("dashboard:7", 60, 3600, compute))
    assert runs == 1 and a is b

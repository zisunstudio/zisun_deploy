"""The storefront's read cache: one database read per burst, never a stored error.

Imported by path so it runs without the application's dependencies - it is
pure asyncio and should be provable on its own.
"""
import asyncio
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "memo", Path(__file__).resolve().parents[2] / "app/core/memo.py")
memo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(memo)


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_a_burst_of_visitors_costs_one_read():
    memo.clear()
    calls = 0

    async def produce():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)          # the ocean crossing
        return "piece"

    async def burst():
        return await asyncio.gather(*[memo.cached(("p", 1), 30, produce) for _ in range(20)])

    assert run(burst()) == ["piece"] * 20
    assert calls == 1


def test_an_error_is_shared_by_the_flight_but_never_kept():
    memo.clear()
    calls = 0

    async def produce():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        raise LookupError("404")

    async def burst():
        return await asyncio.gather(*[memo.cached(("p", 2), 30, produce) for _ in range(5)],
                                    return_exceptions=True)

    assert all(isinstance(r, LookupError) for r in run(burst()))
    assert calls == 1
    try:
        run(memo.cached(("p", 2), 30, produce))
    except LookupError:
        pass
    assert calls == 2, "a failure must not be answered from memory next time"


def test_entries_expire():
    memo.clear()
    calls = 0

    async def produce():
        nonlocal calls
        calls += 1
        return calls

    run(memo.cached(("p", 3), 0.01, produce))
    run(asyncio.sleep(0.02))
    assert run(memo.cached(("p", 3), 0.01, produce)) == 2


def test_a_read_that_straddles_a_write_is_not_kept():
    """Cleared mid-flight means the read may predate the edit that cleared it."""
    memo.clear()
    calls = 0

    async def produce():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return f"v{calls}"

    async def race():
        t = asyncio.ensure_future(memo.cached(("p", 4), 30, produce))
        await asyncio.sleep(0.005)
        memo.clear()                        # the founder saved an edit
        return await t

    assert run(race()) == "v1"               # the caller still gets an answer
    assert run(memo.cached(("p", 4), 30, produce)) == "v2"   # but it was not kept

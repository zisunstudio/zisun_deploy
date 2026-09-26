"""An in-process cache for the storefront's public reads.

The numbers that made this necessary, measured 2026-09-26: the database is in
Sydney and the api in Singapore, so a trivial query costs ~900 ms, and the
api holds **four connections in total** (DB_POOL_SIZE=1, DB_MAX_OVERFLOW=1,
two uvicorn workers). The pool cannot simply grow: Supabase's session pooler
caps the whole project at fifteen clients and the worker and beat need
theirs. So a product read cost 2-3.5 s, and a page that fired four reads at
once queued them behind each other - one /shop render hung for the full
60 s.

Most of those reads are the same few rows asked for again and again: the
catalogue has two pieces. Answering them from memory costs nothing and holds
no connection, which leaves the four for the requests that must reach the
database - checkout, sign-in, the console.

Two rules keep it honest:

* **Short lifetimes, and never money.** Nothing on the path that charges a
  customer reads from here; checkout and stock locks still query the
  database, so a stale entry can at worst show a size for a few seconds
  longer than it exists, and the order is refused. Offers stay live too:
  `offer.active` is a computed field, resolved when the response is
  serialised, so an expired timer switches off on the next request whether
  the product came from here or not.
* **Single flight.** Twenty visitors arriving on a cold entry share *one*
  database read rather than queueing twenty behind four connections - the
  queue is exactly the failure being fixed.

Deliberately not Redis: Upstash meters every command, the free tier has
already been spent once and stopped background processing for eight days,
and a cache in front of every page view is precisely the traffic that would
spend it again. Per-process means each uvicorn worker warms its own copy,
which at two workers is two reads per expiry.

Admin writes clear it (see `main.py`), so the founder sees her own edit on
her next load rather than a lifetime later.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable, Hashable

_store: dict[Hashable, tuple[float, Any]] = {}
_inflight: dict[Hashable, asyncio.Future] = {}
_generation = 0


async def cached(key: Hashable, ttl: float, produce: Callable[[], Awaitable[Any]]) -> Any:
    """Return the value for `key`, producing it at most once per `ttl` seconds.

    Exceptions are never stored: a 404 or a database error is raised to every
    caller waiting on that flight and the next request tries again.
    """
    hit = _store.get(key)
    now = time.monotonic()
    if hit is not None and hit[0] > now:
        return hit[1]

    pending = _inflight.get(key)
    if pending is not None:
        return await asyncio.shield(pending)

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    _inflight[key] = fut
    started_in = _generation
    try:
        value = await produce()
    except BaseException as exc:
        if not fut.done():
            fut.set_exception(exc)
            fut.exception()            # consumed, so an unawaited flight logs nothing
        raise
    finally:
        _inflight.pop(key, None)
    # A clear() while this read was in the air means it may predate the
    # write that triggered the clear; hand it to the callers who asked, but
    # do not keep it.
    if started_in == _generation:
        _store[key] = (time.monotonic() + ttl, value)
    if not fut.done():
        fut.set_result(value)
    return value


def clear() -> None:
    """Forget everything in this process. Called after any admin write."""
    global _generation
    _generation += 1
    _store.clear()


def size() -> int:
    return len(_store)

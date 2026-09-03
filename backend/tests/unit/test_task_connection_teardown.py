"""`run_async` must not orphan pooled connections.

This is the bug that broke five deploys. The Celery tasks each run on a fresh
event loop, and asyncpg connections belong to the loop that opened them. If the
loop closes while the engine's pool still holds them, nothing ever sends a
close: Postgres keeps the backend open, mid-transaction, and Supavisor's 15
client cap is spent in under a minute — after which every task fails with
EMAXCONNSESSION, leaks another connection on the way out, and the api service's
`alembic upgrade head` can no longer get a connection to deploy with.

The guarantee under test is narrow and mechanical: dispose is called, on the
task's own loop, whether the task succeeded or raised.
"""

import asyncio

import pytest

from app.tasks import commerce


class _RecordingEngine:
    """Stands in for the module-level async engine."""

    def __init__(self):
        self.dispose_calls = 0
        self.dispose_loops = []
        self.raise_on_dispose = False

    async def dispose(self):
        self.dispose_calls += 1
        self.dispose_loops.append(asyncio.get_running_loop())
        if self.raise_on_dispose:
            raise RuntimeError("pool already gone")


@pytest.fixture
def engine(monkeypatch):
    e = _RecordingEngine()
    monkeypatch.setattr(commerce, "async_engine", e)
    return e


class TestDisposeAlwaysRuns:
    def test_disposes_after_a_successful_task(self, engine):
        async def work():
            return "done"

        assert commerce.run_async(work()) == "done"
        assert engine.dispose_calls == 1, "connections stay pooled on a dead loop"

    def test_disposes_after_a_failing_task(self, engine):
        """
        The failing path is the one that was leaking: a task that raised left
        its connection open, so the next task had one fewer to work with.
        """

        async def work():
            raise ValueError("task blew up")

        with pytest.raises(ValueError, match="task blew up"):
            commerce.run_async(work())
        assert engine.dispose_calls == 1

    def test_a_dispose_failure_does_not_mask_the_task_error(self, engine):
        """Teardown trouble must not rewrite the reason the task failed."""
        engine.raise_on_dispose = True

        async def work():
            raise ValueError("the real problem")

        with pytest.raises(ValueError, match="the real problem"):
            commerce.run_async(work())

    def test_a_dispose_failure_does_not_break_a_good_task(self, engine):
        engine.raise_on_dispose = True

        async def work():
            return 42

        assert commerce.run_async(work()) == 42


class TestDisposeRunsOnTheRightLoop:
    def test_dispose_shares_the_loop_that_opened_the_connections(self, engine):
        """
        Disposing on a *different* loop would not close them either — the point
        is that teardown happens before the loop that owns them is closed.
        """
        seen = {}

        async def work():
            seen["task"] = asyncio.get_running_loop()

        commerce.run_async(work())
        assert engine.dispose_loops == [seen["task"]]

    def test_the_loop_is_closed_afterwards(self, engine):
        seen = {}

        async def work():
            seen["loop"] = asyncio.get_running_loop()

        commerce.run_async(work())
        assert seen["loop"].is_closed(), "loop left open — one leak swapped for another"

    def test_each_call_gets_its_own_loop_and_its_own_dispose(self, engine):
        loops = []

        async def work():
            loops.append(asyncio.get_running_loop())

        for _ in range(3):
            commerce.run_async(work())

        assert engine.dispose_calls == 3
        assert len(set(id(l) for l in loops)) == 3, "loop was reused across tasks"

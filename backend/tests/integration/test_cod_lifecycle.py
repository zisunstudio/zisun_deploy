"""The COD order lifecycle, and the three ways it quietly broke.

A COD order rests in PAYMENT_PENDING while the customer is asked to confirm.
Every task that sweeps PAYMENT_PENDING therefore has to know the difference
between an abandoned payment and a cash order waiting on a phone call.

These tests assert on the *query*, not on rows a mock handed back. The
existing zombie tests pass a MagicMock order straight to the loop, so the
WHERE clause is invisible to them — which is exactly how a sweep that
cancelled every COD order ever placed shipped green.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.order import LockStatus, OrderStatus, PaymentMethod


def _session(mock_db):
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=mock_db)
    ctx.__aexit__ = AsyncMock(return_value=False)
    holder = MagicMock()
    holder.return_value = ctx
    return holder


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": False}))


class TestZombieSweepSparesCOD:
    async def test_query_excludes_cod_orders(self, mock_db):
        """The sweep must filter on payment_method, not just status+age.

        Without this the sweep and sweep_cod_confirmations contradict each
        other: one gives the customer 24 hours to confirm, the other cancels
        the order at 30 minutes.
        """
        from app.tasks.commerce import _cleanup_zombie_orders

        seen = []

        async def capture(stmt, *a, **kw):
            seen.append(stmt)
            result = MagicMock()
            result.scalars.return_value.all.return_value = []
            return result

        mock_db.execute = AsyncMock(side_effect=capture)
        mock_db.commit = AsyncMock()

        with patch("app.tasks.commerce.AsyncSessionLocal", _session(mock_db)):
            await _cleanup_zombie_orders()

        assert seen, "the sweep issued no query"
        sql = _sql(seen[0])
        assert "payment_method" in sql, (
            "the zombie sweep does not filter on payment_method, so it will "
            "cancel COD orders that are legitimately awaiting confirmation"
        )

    async def test_cod_window_is_shared_not_copied(self):
        """The lock and the give-up deadline must be the same number."""
        from app.services.checkout import COD_GIVE_UP_AFTER_HOURS as from_checkout
        from app.tasks.commerce import COD_GIVE_UP_AFTER_HOURS as from_tasks

        assert from_checkout is from_tasks


class TestCODGiveUpRestoresStock:
    async def test_release_locks_puts_the_stock_back(self, mock_db):
        """Marking a lock RELEASED without restoring stock leaks the unit.

        Both sibling release paths increment variant.stock; this one did not.
        It was masked while the lock expired after 30 minutes and the expiry
        sweep got there first, and became live the moment COD locks were
        sized to the COD window.
        """
        from app.tasks.commerce import _release_locks

        lock = MagicMock()
        lock.product_variant_id = uuid.uuid4()
        lock.reserved_qty = 2
        lock.status = LockStatus.ACTIVE

        variant = MagicMock()
        variant.stock = 5

        locks_result = MagicMock()
        locks_result.scalars.return_value.all.return_value = [lock]
        variant_result = MagicMock()
        variant_result.scalar_one_or_none.return_value = variant

        mock_db.execute = AsyncMock(side_effect=[locks_result, variant_result])

        await _release_locks(mock_db, uuid.uuid4())

        assert variant.stock == 7, "the reserved units never came back on sale"
        assert lock.status == LockStatus.RELEASED


class TestLockOutlivesThePaymentWindow:
    """A COD lock must last as long as the confirmation call is allowed.

    Releasing it at 30 minutes puts the stock back on sale while the order
    is still live and still promised — an oversell on a shelf that holds one
    unit per size.
    """

    def test_cod_lock_is_longer_than_the_gateway_lock(self):
        from app.services.checkout import (
            COD_GIVE_UP_AFTER_HOURS,
            GATEWAY_LOCK_MINUTES,
        )

        assert timedelta(hours=COD_GIVE_UP_AFTER_HOURS) > timedelta(
            minutes=GATEWAY_LOCK_MINUTES
        )

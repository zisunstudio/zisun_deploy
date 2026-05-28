"""Integration test — zombie order cleanup task."""
import pytest
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

from app.models.order import OrderStatus, LockStatus


class TestZombieCleanup:
    async def test_payment_pending_order_cancelled_after_30min(self, mock_db):
        """PAYMENT_PENDING order older than 30min should be cancelled."""
        from app.tasks.commerce import _cleanup_zombie_orders

        old_order = MagicMock()
        old_order.id = uuid.uuid4()
        old_order.status = OrderStatus.PAYMENT_PENDING
        old_order.created_at = datetime.now(timezone.utc) - timedelta(minutes=35)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [old_order]
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        with patch("app.tasks.commerce.AsyncSessionLocal") as mock_session_cls:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_session_cls.return_value = mock_ctx

            await _cleanup_zombie_orders()

        # Order should have been transitioned to CANCELLED
        assert old_order.status == OrderStatus.CANCELLED

    async def test_recent_order_not_cancelled(self, mock_db):
        """PAYMENT_PENDING order < 30min old should NOT be cancelled."""
        # Recent order should not be returned by the query
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []  # No zombie orders
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()

        with patch("app.tasks.commerce.AsyncSessionLocal") as mock_session_cls:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_session_cls.return_value = mock_ctx

            from app.tasks.commerce import _cleanup_zombie_orders
            await _cleanup_zombie_orders()

        # commit called with no order changes
        mock_db.commit.assert_called_once()

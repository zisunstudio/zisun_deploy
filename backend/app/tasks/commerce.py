import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.catalog import ProductVariant
from app.models.order import (
    InventoryLock,
    LockStatus,
    Order,
    OrderStatus,
    OutboxEvent,
)
from app.services.order_state_machine import OrderStateMachine

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run an async coroutine in a new event loop (for Celery workers)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─────────────────────────────────────────────────────────────────────────────
# Task: cleanup_zombie_orders
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.commerce.cleanup_zombie_orders")
def cleanup_zombie_orders():
    run_async(_cleanup_zombie_orders())


async def _cleanup_zombie_orders():
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    async with AsyncSessionLocal() as db:
        stmt = (
            select(Order)
            .where(
                Order.status == OrderStatus.PAYMENT_PENDING,
                Order.created_at < cutoff,
            )
            .with_for_update(skip_locked=True)
        )
        result = await db.execute(stmt)
        orders = result.scalars().all()

        for order in orders:
            try:
                OrderStateMachine.transition(order, OrderStatus.CANCELLED)

                # Release active inventory locks for this order
                lock_stmt = select(InventoryLock).where(
                    InventoryLock.order_id == order.id,
                    InventoryLock.status == LockStatus.ACTIVE,
                )
                locks = (await db.execute(lock_stmt)).scalars().all()
                for lock in locks:
                    variant_result = await db.execute(
                        select(ProductVariant)
                        .where(ProductVariant.id == lock.product_variant_id)
                        .with_for_update()
                    )
                    variant = variant_result.scalar_one_or_none()
                    if variant:
                        variant.stock += lock.reserved_qty
                    lock.status = LockStatus.RELEASED

                db.add(
                    OutboxEvent(
                        aggregate_type="Order",
                        aggregate_id=str(order.id),
                        event_type="ORDER_CANCELLED",
                        payload={
                            "order_id": str(order.id),
                            "reason": "zombie_timeout",
                        },
                    )
                )
            except Exception as exc:
                logger.error("Failed to cancel zombie order %s: %s", order.id, exc)

        await db.commit()
        logger.info("Zombie cleanup: cancelled %d orders", len(orders))


# ─────────────────────────────────────────────────────────────────────────────
# Helper: _release_locks_for_order (used by admin status endpoint)
# ─────────────────────────────────────────────────────────────────────────────

async def _release_locks_for_order(db, order_id: uuid.UUID) -> None:
    """Release all ACTIVE inventory locks for an order and restore stock."""
    locks = (
        await db.execute(
            select(InventoryLock).where(
                InventoryLock.order_id == order_id,
                InventoryLock.status == LockStatus.ACTIVE,
            )
        )
    ).scalars().all()
    for lock in locks:
        variant = (
            await db.execute(
                select(ProductVariant)
                .where(ProductVariant.id == lock.product_variant_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if variant:
            variant.stock += lock.reserved_qty
        lock.status = LockStatus.RELEASED


# ─────────────────────────────────────────────────────────────────────────────
# Task: release_expired_locks
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.commerce.release_expired_locks")
def release_expired_locks():
    run_async(_release_expired_locks())


async def _release_expired_locks():
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        stmt = (
            select(InventoryLock)
            .where(
                InventoryLock.status == LockStatus.ACTIVE,
                InventoryLock.expires_at < now,
            )
            .with_for_update(skip_locked=True)
        )
        locks = (await db.execute(stmt)).scalars().all()

        for lock in locks:
            variant_result = await db.execute(
                select(ProductVariant)
                .where(ProductVariant.id == lock.product_variant_id)
                .with_for_update()
            )
            variant = variant_result.scalar_one_or_none()
            if variant:
                variant.stock += lock.reserved_qty
            lock.status = LockStatus.EXPIRED

        await db.commit()
        logger.info("Released %d expired locks", len(locks))


# ─────────────────────────────────────────────────────────────────────────────
# Task: process_outbox
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.commerce.process_outbox")
def process_outbox():
    run_async(_process_outbox())


async def _process_outbox():
    from app.services.whatsapp import send_order_confirmation  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        stmt = (
            select(OutboxEvent)
            .where(OutboxEvent.published_at.is_(None))
            .order_by(OutboxEvent.created_at)
            .limit(50)
        )
        events = (await db.execute(stmt)).scalars().all()

        for event in events:
            try:
                if event.event_type == "ORDER_PAID":
                    payload = event.payload
                    await send_order_confirmation(
                        phone=payload.get("phone", ""),
                        order_id=payload.get("order_id", ""),
                        amount_paise=payload.get("amount", 0),
                        items_summary=payload.get("items_summary", "your items"),
                    )
                event.published_at = datetime.now(timezone.utc)
            except Exception as exc:
                logger.error("Outbox event %s failed: %s", event.id, exc)

        await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Task: razorpay_daily_reconciliation
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="tasks.razorpay_daily_reconciliation")
def razorpay_daily_reconciliation():
    """Daily: compare Razorpay settlements with internal payments table. Log discrepancies."""
    run_async(_razorpay_daily_reconciliation())


async def _razorpay_daily_reconciliation():
    try:
        import razorpay
        from app.core.config import settings as _settings

        if not _settings.RAZORPAY_KEY_ID or not _settings.RAZORPAY_KEY_SECRET:
            logger.info("Razorpay keys not set — skipping reconciliation")
            return

        rz = razorpay.Client(
            auth=(_settings.RAZORPAY_KEY_ID, _settings.RAZORPAY_KEY_SECRET)
        )

        # Fetch last 24h settlements
        import time

        from_ts = int(time.time()) - 86400
        settlements = rz.settlement.all({"from": from_ts})

        async with AsyncSessionLocal() as db:
            from datetime import timedelta

            from sqlalchemy.future import select as futureselect

            from app.models.order import Payment, PaymentStatus

            since = datetime.now(timezone.utc) - timedelta(days=1)
            result = await db.execute(
                futureselect(Payment).where(
                    Payment.status == PaymentStatus.CAPTURED,
                    Payment.processed_at >= since,
                )
            )
            db_payments = result.scalars().all()

            rz_count = len(settlements.get("items", [])) if settlements else 0
            db_count = len(db_payments)

            if rz_count != db_count:
                logger.warning(
                    "Razorpay reconciliation mismatch",
                    extra={
                        "rz_settlements_24h": rz_count,
                        "db_payments_24h": db_count,
                    },
                )
            else:
                logger.info(
                    "Razorpay reconciliation OK",
                    extra={"payments_24h": db_count},
                )
    except Exception as e:
        logger.error(
            "Razorpay reconciliation failed", extra={"error": str(e)}
        )

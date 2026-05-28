import asyncio
import logging
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

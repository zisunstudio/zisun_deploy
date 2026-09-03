import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.celery_app import celery_app
from app.core.database import AsyncSessionLocal, async_engine
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
    """Run an async coroutine in a new event loop (for Celery workers).

    The dispose() is the whole point of this function, not tidiness.

    `async_engine` is created once at import with a connection pool. Every task
    here runs on a *fresh* event loop, and asyncpg connections are bound to the
    loop that opened them. Close the loop while the pool still holds them and
    they are orphaned: the pool's reference dies with the loop, no close is ever
    sent, and Postgres keeps the backend open — mid-transaction, because
    SQLAlchemy has already issued BEGIN. The server sees `idle in transaction`
    forever.

    Supavisor caps this project at 15 clients, so a worker firing a task every
    few seconds exhausts the entire project budget in under a minute. Then every
    task fails with EMAXCONNSESSION and leaks another connection on the way out,
    which is a feedback loop, and the api service's next `alembic upgrade head`
    cannot get a connection either — a background job quietly breaking deploys.

    Disposing inside the loop that created the connections closes them properly.
    It costs one connect per task, which is the right trade for jobs that run
    every couple of minutes.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        # Must run even when the task raised — a failed task is exactly the case
        # that was leaking, and it must not mask the original exception either.
        try:
            loop.run_until_complete(async_engine.dispose())
        except Exception:  # pragma: no cover - best effort teardown
            logger.warning("engine dispose failed during task teardown", exc_info=True)
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
                if event.event_type == "COD_CONFIRMATION_REQUESTED":
                    await _send_cod_ask(db, event.payload)
                elif event.event_type == "ORDER_PAID":
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


async def _send_cod_ask(db, payload: dict) -> None:
    """Send one COD confirmation and record that we asked."""
    from app.models.order import Order
    from app.models.user import User
    from app.services.cod_confirmation import mark_sent
    from app.services.whatsapp import send_cod_confirmation

    order_id = payload.get("order_id")
    order = (
        await db.execute(select(Order).where(Order.id == order_id))
    ).scalar_one_or_none()
    if not order:
        logger.warning("COD ask for unknown order %s", order_id)
        return

    phone = (
        await db.execute(select(User.phone).where(User.id == order.user_id))
    ).scalar_one_or_none()
    if not phone:
        logger.error("COD ask for order %s has no phone on the user", order_id)
        return

    await send_cod_confirmation(
        phone=phone,
        order_id=str(order.id),
        amount_paise=order.total_amount,
        items_summary=payload.get("items_summary", "your order"),
    )
    # Recorded whether or not the send succeeded. A failed send that is not
    # counted would be retried forever by the sweep; the sweep's own attempt
    # cap is what bounds it.
    mark_sent(order)


# ─────────────────────────────────────────────────────────────────────────────
# Task: sweep_cod_confirmations
# ─────────────────────────────────────────────────────────────────────────────

# One nudge, then give up. Reply rates fall off quickly, and a third message
# about the same order reads as harassment rather than service.
COD_NUDGE_AFTER_MINUTES = 30
COD_GIVE_UP_AFTER_HOURS = 24


@celery_app.task(name="app.tasks.commerce.sweep_cod_confirmations")
def sweep_cod_confirmations():
    """Nudge COD orders that have gone quiet, and release the ones that stay quiet."""
    run_async(_sweep_cod_confirmations())


async def _sweep_cod_confirmations():
    from datetime import timedelta

    from app.models.order import CODConfirmation, Order, OrderStatus
    from app.models.user import User
    from app.services.cod_confirmation import mark_sent
    from app.services.whatsapp import send_cod_confirmation

    now = datetime.now(timezone.utc)
    nudge_before = now - timedelta(minutes=COD_NUDGE_AFTER_MINUTES)
    expire_before = now - timedelta(hours=COD_GIVE_UP_AFTER_HOURS)

    async with AsyncSessionLocal() as db:
        pending = (
            await db.execute(
                select(Order).where(
                    Order.cod_confirmation == CODConfirmation.PENDING,
                    Order.status.notin_([OrderStatus.CANCELLED, OrderStatus.RETURNED]),
                    Order.cod_confirmation_sent_at.isnot(None),
                )
            )
        ).scalars().all()

        nudged = expired = 0
        for order in pending:
            sent_at = order.cod_confirmation_sent_at
            if sent_at and sent_at.tzinfo is None:
                sent_at = sent_at.replace(tzinfo=timezone.utc)

            if sent_at and sent_at < expire_before:
                # Out of time. Marked UNREACHABLE rather than CANCELLED so the
                # distinction survives: this customer never answered, which is
                # different from one who declined, and the two should not be
                # read as the same signal later.
                order.cod_confirmation = CODConfirmation.UNREACHABLE
                await _release_locks(db, order.id)
                expired += 1
                continue

            if (
                sent_at
                and sent_at < nudge_before
                and (order.cod_confirmation_attempts or 0) < 2
            ):
                phone = (
                    await db.execute(select(User.phone).where(User.id == order.user_id))
                ).scalar_one_or_none()
                if phone:
                    await send_cod_confirmation(
                        phone=phone,
                        order_id=str(order.id),
                        amount_paise=order.total_amount,
                        items_summary="your order",
                    )
                    mark_sent(order)
                    nudged += 1

        await db.commit()

    if nudged or expired:
        logger.info("COD sweep: %s nudged, %s expired", nudged, expired)


async def _release_locks(db, order_id) -> None:
    """Give the stock back when a COD order will never be confirmed."""
    from app.models.order import InventoryLock, LockStatus

    locks = (
        await db.execute(
            select(InventoryLock).where(
                InventoryLock.order_id == order_id,
                InventoryLock.status == LockStatus.ACTIVE,
            )
        )
    ).scalars().all()
    for lock in locks:
        lock.status = LockStatus.RELEASED


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
            # Silently skipping means settlement discrepancies go unnoticed
            # indefinitely — in production this must page, not log at INFO.
            _settings.dev_fallback("Razorpay daily reconciliation")
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

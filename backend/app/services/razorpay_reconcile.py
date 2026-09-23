"""Ask Razorpay what was actually paid, and repair orders that disagree.

A customer paid, and the order vanished from the console.

What happened: the webhook is the only thing that marks an order PAID, and
it was rejected at signature verification ("Invalid Razorpay webhook
signature" in the logs). So the order stayed PAYMENT_PENDING, and thirty
minutes later the zombie sweep did exactly what it was built to do -
cancelled it and returned the stock - because an unpaid gateway order is
indistinguishable from an abandoned one *if you only ever look at your own
database*.

That assumption is the bug. Razorpay knows. Nothing ever asked it.

So this module does two things:

1. **Before** a prepaid order is cancelled, the gateway is asked whether it
   was paid. Used by the zombie sweep, it makes this failure impossible
   rather than merely rarer - a webhook that never lands now costs a
   half-hour delay instead of a lost order.
2. **After** the fact, an order already cancelled can be re-examined and
   restored, which is how the orders lost to this are recovered.

The gateway is the authority on money. The webhook is only a notification,
and a notification that can be dropped, blocked, mis-signed or replayed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import (
    Order,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
)

logger = logging.getLogger(__name__)

#: Razorpay payment states that mean the money is ours.
PAID_STATES = {"captured", "authorized"}


def _client():
    from app.services.checkout import _razorpay_client  # noqa: PLC0415

    return _razorpay_client()


async def gateway_payment(razorpay_order_id: str) -> Optional[dict]:
    """The paid payment on this gateway order, or None.

    Returns the first captured (or authorised) payment. `None` means either
    "not paid" or "could not ask" - the caller must treat those the same and
    do nothing destructive, which is the whole point.
    """
    if not razorpay_order_id:
        return None
    client = _client()
    if client is None:
        logger.warning("Razorpay unavailable - cannot verify %s", razorpay_order_id)
        return None
    try:
        import anyio  # noqa: PLC0415

        # The SDK is synchronous; keep it off the event loop.
        payments = await anyio.to_thread.run_sync(
            lambda: client.order.payments(razorpay_order_id)
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not fetch payments for %s: %s", razorpay_order_id, exc)
        return None

    for p in (payments or {}).get("items", []):
        if p.get("status") in PAID_STATES:
            return p
    return None


async def is_paid_at_gateway(razorpay_order_id: str) -> bool:
    """True only when Razorpay says so. False also means 'could not ask'."""
    return await gateway_payment(razorpay_order_id) is not None


async def settle_from_gateway(db: AsyncSession, order: Order) -> bool:
    """Mark one order PAID from gateway evidence. True if it changed.

    Writes the Payment row the webhook would have written, so the money is
    recorded where reconciliation and the dashboard already look for it.
    """
    payment = await gateway_payment(order.razorpay_order_id or "")
    if payment is None:
        return False

    if order.status in (OrderStatus.CANCELLED, OrderStatus.FAILED_PAYMENT):
        # Restoring a cancelled order is deliberate and narrow: it was
        # cancelled by us, not by anyone who knew the money had arrived.
        logger.warning(
            "Order %s was cancelled but Razorpay shows payment %s - restoring",
            order.id, payment.get("id"),
        )
        order.status = OrderStatus.PAID
    elif order.status == OrderStatus.PAYMENT_PENDING:
        order.status = OrderStatus.PAID
    else:
        return False

    existing = (await db.execute(
        select(Payment).where(Payment.order_id == order.id)
    )).scalar_one_or_none()
    if existing:
        existing.status = PaymentStatus.CAPTURED
        existing.payment_gateway_id = existing.payment_gateway_id or payment.get("id")
        existing.processed_at = existing.processed_at or datetime.now(timezone.utc)
    else:
        db.add(Payment(
            order_id=order.id,
            gateway="razorpay",
            payment_gateway_id=payment.get("id"),
            status=PaymentStatus.CAPTURED,
            amount=int(payment.get("amount") or order.total_amount),
            processed_at=datetime.now(timezone.utc),
        ))

    from app.services.invoicing import issue_if_due  # noqa: PLC0415

    await issue_if_due(db, order)
    return True


async def sweep(db: AsyncSession, *, days: int = 14) -> dict:
    """Re-examine every recent prepaid order the gateway may disagree with.

    Safe to run repeatedly: it only ever moves an order towards PAID, and
    only on the gateway's word. It never cancels anything.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    orders = (await db.execute(
        select(Order).where(
            Order.payment_method == PaymentMethod.RAZORPAY,
            Order.razorpay_order_id.isnot(None),
            Order.created_at >= since,
            Order.status.in_([
                OrderStatus.PAYMENT_PENDING,
                OrderStatus.CANCELLED,
                OrderStatus.FAILED_PAYMENT,
            ]),
        )
    )).scalars().all()

    recovered, checked = [], 0
    for order in orders:
        checked += 1
        try:
            if await settle_from_gateway(db, order):
                recovered.append({
                    "order_id": str(order.id),
                    "razorpay_order_id": order.razorpay_order_id,
                    "amount_paise": order.total_amount,
                    "was": "cancelled",
                })
        except Exception:  # noqa: BLE001
            logger.exception("Reconciliation failed for order %s", order.id)

    if recovered:
        await db.commit()
    return {"checked": checked, "recovered": recovered, "days": days}

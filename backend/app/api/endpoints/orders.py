import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_async_db
from app.core.security import get_current_user
from app.models.order import (
    InventoryLock,
    LockStatus,
    Order,
    OrderStatus,
    OutboxEvent,
    Payment,
    PaymentStatus,
)
from app.models.catalog import ProductVariant
from app.schemas.order import OrderResponse
from app.services.order_state_machine import OrderStateMachine
from app.services.shiprocket import track_awb

logger = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def verify_razorpay_signature(payload_body: bytes, signature: str) -> bool:
    """Return True if the webhook signature is valid.

    With no secret configured this returns True so dev can post fake webhooks;
    in production an unset secret raises instead — an unauthenticated webhook
    endpoint marks arbitrary orders PAID.
    """
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        settings.dev_fallback("Razorpay webhook signature verification")
        return True
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _release_order_locks(db: AsyncSession, order_id: uuid.UUID) -> None:
    """Release all active inventory locks for an order (restores stock)."""
    lock_stmt = select(InventoryLock).where(
        InventoryLock.order_id == order_id,
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


def _items_summary(order: Order) -> str:
    """Generate a human-readable summary of order items."""
    count = len(order.items) if order.items else 0
    return f"{count} item{'s' if count != 1 else ''}"


# ─────────────────────────────────────────────────────────────────────────────
# GET /orders  — paginated list
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[OrderResponse])
async def get_user_orders(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    offset = (page - 1) * limit
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.payment),
            selectinload(Order.fulfillment),
            selectinload(Order.address),
        )
        .where(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# ─────────────────────────────────────────────────────────────────────────────
# GET /orders/{order_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{order_id}", response_model=OrderResponse)
async def get_order_detail(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.payment),
            selectinload(Order.fulfillment),
            selectinload(Order.address),
        )
        .where(Order.id == order_id, Order.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


# ─────────────────────────────────────────────────────────────────────────────
# POST /webhooks/razorpay
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_async_db),
):
    """Idempotent Razorpay webhook handler with HMAC verification."""
    # Read body ONCE — must happen before calling request.json()
    raw_body: bytes = await request.body()

    signature = request.headers.get("X-Razorpay-Signature", "")

    # HMAC verification
    if not verify_razorpay_signature(raw_body, signature):
        logger.warning("Invalid Razorpay webhook signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        import json as _json
        payload = _json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON payload")

    event_type: str = payload.get("event", "")
    logger.info("Razorpay webhook event: %s", event_type)

    # ── payment.captured ──────────────────────────────────────────────────
    if event_type == "payment.captured":
        return await _handle_payment_captured(db, payload)

    # ── payment.failed ────────────────────────────────────────────────────
    if event_type == "payment.failed":
        return await _handle_payment_failed(db, payload)

    return {"status": "ignored", "event": event_type}


async def _handle_payment_captured(db: AsyncSession, payload: dict) -> dict:
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    razorpay_payment_id: str = payment_entity.get("id", "")
    razorpay_order_id: str = payment_entity.get("order_id", "")
    amount: int = payment_entity.get("amount", 0)

    if not razorpay_payment_id or not razorpay_order_id:
        raise HTTPException(status_code=422, detail="Malformed webhook payload")

    # Idempotency — UNIQUE constraint on payment_gateway_id prevents duplicate rows
    existing_result = await db.execute(
        select(Payment).where(Payment.payment_gateway_id == razorpay_payment_id)
    )
    if existing_result.scalar_one_or_none():
        return {"status": "ok", "message": "already processed"}

    # Find order by razorpay_order_id
    order_result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.razorpay_order_id == razorpay_order_id)
        .with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if not order:
        logger.warning("Webhook: no order found for razorpay_order_id=%s", razorpay_order_id)
        return {"status": "ignored", "reason": "order not found"}

    if order.status != OrderStatus.PAYMENT_PENDING:
        logger.info(
            "Webhook: order %s already in status %s — skipping capture",
            order.id,
            order.status,
        )
        return {"status": "ok", "message": "order already processed"}

    # Handle partial capture
    if amount < order.total_amount:
        logger.warning(
            "Partial capture: expected %d paise, got %d for order %s",
            order.total_amount,
            amount,
            order.id,
        )
        order.status = OrderStatus.FAILED_PAYMENT
        await _release_order_locks(db, order.id)
        db.add(
            OutboxEvent(
                aggregate_type="Order",
                aggregate_id=str(order.id),
                event_type="PAYMENT_MISMATCH",
                payload={
                    "order_id": str(order.id),
                    "expected": order.total_amount,
                    "received": amount,
                    "razorpay_payment_id": razorpay_payment_id,
                },
            )
        )
        await db.commit()
        return {"status": "mismatch", "reason": "partial capture"}

    # Transition to PAID
    OrderStateMachine.transition(order, OrderStatus.PAID)

    payment = Payment(
        order_id=order.id,
        gateway="razorpay",
        payment_gateway_id=razorpay_payment_id,
        status=PaymentStatus.CAPTURED,
        amount=amount,
        processed_at=datetime.now(timezone.utc),
    )
    db.add(payment)

    # Fetch user phone for notification
    from sqlalchemy import select as _select  # noqa
    from app.models.user import User

    user_result = await db.execute(_select(User).where(User.id == order.user_id))
    user = user_result.scalar_one_or_none()
    phone = user.phone if user else ""

    # Write OutboxEvent for async notification
    db.add(
        OutboxEvent(
            aggregate_type="Order",
            aggregate_id=str(order.id),
            event_type="ORDER_PAID",
            payload={
                "order_id": str(order.id),
                "phone": phone,
                "amount": amount,
                "items_summary": _items_summary(order),
                "razorpay_payment_id": razorpay_payment_id,
            },
        )
    )

    await db.commit()
    logger.info("Order %s marked PAID (payment: %s)", order.id, razorpay_payment_id)
    return {"status": "ok"}


async def _handle_payment_failed(db: AsyncSession, payload: dict) -> dict:
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    razorpay_payment_id: str = payment_entity.get("id", "")
    razorpay_order_id: str = payment_entity.get("order_id", "")
    error_description: str = payment_entity.get("error_description", "")

    if not razorpay_order_id:
        raise HTTPException(status_code=422, detail="Malformed webhook payload")

    order_result = await db.execute(
        select(Order)
        .where(Order.razorpay_order_id == razorpay_order_id)
        .with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if not order:
        return {"status": "ignored", "reason": "order not found"}

    if order.status != OrderStatus.PAYMENT_PENDING:
        return {"status": "ok", "message": "order already processed"}

    OrderStateMachine.transition(order, OrderStatus.FAILED_PAYMENT)

    # Release inventory locks so stock is restored
    await _release_order_locks(db, order.id)

    # Record failed payment attempt
    if razorpay_payment_id:
        # Only record if not already present (idempotency)
        existing_result = await db.execute(
            select(Payment).where(Payment.payment_gateway_id == razorpay_payment_id)
        )
        if not existing_result.scalar_one_or_none():
            db.add(
                Payment(
                    order_id=order.id,
                    gateway="razorpay",
                    payment_gateway_id=razorpay_payment_id,
                    status=PaymentStatus.FAILED,
                    amount=0,
                    processed_at=datetime.now(timezone.utc),
                )
            )

    db.add(
        OutboxEvent(
            aggregate_type="Order",
            aggregate_id=str(order.id),
            event_type="PAYMENT_FAILED",
            payload={
                "order_id": str(order.id),
                "razorpay_payment_id": razorpay_payment_id,
                "error": error_description,
            },
        )
    )

    await db.commit()
    logger.info("Order %s marked FAILED_PAYMENT (payment: %s)", order.id, razorpay_payment_id)
    return {"status": "ok"}


# ── GET /{order_id}/tracking — where is my order ─────────────────────────────


@router.get("/{order_id}/tracking", tags=["Orders"])
async def public_order_tracking(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    """Where this parcel is, for the person who bought it.

    Public by order id and nothing else. A v4 UUID is not guessable, and the
    alternative - making her sign in - would mean a guest who bought in one
    tap cannot find out where her parcel is, which is the whole point.

    It answers with what is known and never invents a step: before an AWB
    exists the honest answer is "being packed", and when the courier API is
    unreachable the answer is still the AWB and the step the order itself
    knows. **No personal detail is returned** - no name, phone or address -
    so the id leaking costs nothing more than the status of one parcel.
    """
    order = (await db.execute(
        select(Order).options(selectinload(Order.fulfillment), selectinload(Order.items))
        .where(Order.id == order_id)
    )).scalar_one_or_none()
    if not order:
        raise HTTPException(404, "No such order")

    f = order.fulfillment
    awb = f.awb_number if f else None

    # The order's own status is the floor: it is true even when the courier
    # has never heard of the parcel.
    own_step = {
        OrderStatus.PAYMENT_PENDING: "placed",
        OrderStatus.CREATED: "placed",
        OrderStatus.PAID: "confirmed",
        OrderStatus.PACKED: "packed",
        OrderStatus.SHIPPED: "in_transit",
        OrderStatus.DELIVERED: "delivered",
        OrderStatus.CANCELLED: "cancelled",
        OrderStatus.RETURNED: "returning",
        OrderStatus.FAILED_PAYMENT: "placed",
    }.get(order.status, "placed")

    live = None
    if awb:
        try:
            from app.core.redis import get_redis_client  # noqa: PLC0415

            redis = await get_redis_client()
        except Exception:  # noqa: BLE001
            redis = None
        live = await track_awb(awb, redis=redis)

    return {
        "order_id": str(order.id),
        "placed_at": order.created_at.isoformat() if order.created_at else None,
        "status": order.status.value,
        "payment_method": order.payment_method.value if order.payment_method else None,
        "cod_amount_due": order.cod_amount_due,
        "items": sum(int(i.quantity or 0) for i in (order.items or [])),
        "step": (live or {}).get("step") or own_step,
        "awb": awb,
        "courier": (live or {}).get("courier") or (f.carrier if f else None),
        "courier_status": (live or {}).get("status"),
        "expected_at": (live or {}).get("expected_at"),
        "delivered_at": (live or {}).get("delivered_at"),
        "checkpoints": (live or {}).get("checkpoints") or [],
        "track_url": (live or {}).get("track_url"),
        # True when the courier could not be reached, so the page can say so
        # instead of implying the parcel has not moved.
        "live_unavailable": bool(awb) and live is None,
    }

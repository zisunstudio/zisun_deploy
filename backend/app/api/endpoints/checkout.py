"""Checkout API endpoints — pincode check and payment verification."""
import hashlib
import hmac
import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_async_db
from app.core.security import get_current_user
from app.models.order import Order, OrderStatus, Payment, PaymentStatus, OutboxEvent
from app.services.order_state_machine import OrderStateMachine

logger = logging.getLogger(__name__)
router = APIRouter()

_PINCODE_RE = re.compile(r"^\d{6}$")


# ─────────────────────────────────────────────────────────────────────────────
# GET /checkout/pincode/{pincode}/check
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/payment-methods", tags=["Checkout"])
async def available_payment_methods():
    """Which payment methods checkout may offer.

    The storefront is fully client-rendered, so it cannot read server config at
    build time — it asks here instead. `initiate_checkout` enforces the same
    rule server-side; this endpoint only stops the UI offering an option that
    would be rejected.
    """
    if settings.PAYMENTS_COD_ONLY:
        return {"methods": ["COD"], "razorpay_key_id": None, "cod_only": True}
    return {
        "methods": ["RAZORPAY", "COD"],
        "razorpay_key_id": settings.RAZORPAY_KEY_ID or None,
        "cod_only": False,
    }


@router.get("/pincode/{pincode}/check", tags=["Checkout"])
async def check_pincode(pincode: str):
    """
    Check if a pincode is serviceable.
    Phase 2: any valid 6-digit pincode returns serviceable=true.
    Real Shiprocket integration in Phase 4.
    """
    if not _PINCODE_RE.match(pincode):
        raise HTTPException(status_code=400, detail="Pincode must be exactly 6 digits")
    return {"serviceable": True, "estimated_days": "3-7", "pincode": pincode}


# ─────────────────────────────────────────────────────────────────────────────
# POST /checkout/verify-payment
# ─────────────────────────────────────────────────────────────────────────────

class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


def _verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """
    Verify Razorpay payment signature.
    HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
    Skips verification in dev mode (no key_secret configured); raises in
    production rather than accepting an unverifiable payment.
    """
    if not settings.RAZORPAY_KEY_SECRET:
        settings.dev_fallback("Razorpay payment signature verification")
        return True
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)


@router.post("/verify-payment", tags=["Checkout"])
async def verify_payment(
    body: VerifyPaymentRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """
    Verify Razorpay payment signature after client-side payment completion.

    This is the server-side safety net that sits alongside the Razorpay webhook:
    - Validates HMAC-SHA256 signature to confirm the payment response is genuine
    - Transitions the order to PAID if not already (idempotent)
    - Returns the internal order_id for frontend redirect

    The webhook at /orders/webhooks/razorpay may fire before or after this call;
    both paths are idempotent — whichever arrives first marks the order PAID.
    """
    if not _verify_payment_signature(
        body.razorpay_order_id,
        body.razorpay_payment_id,
        body.razorpay_signature,
    ):
        logger.warning(
            "Invalid payment signature for razorpay_order_id=%s user=%s",
            body.razorpay_order_id,
            current_user.id,
        )
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # Find the order — must belong to current user
    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.razorpay_order_id == body.razorpay_order_id,
            Order.user_id == current_user.id,
        )
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Idempotent: already paid (webhook fired first) — return success immediately
    if order.status == OrderStatus.PAID:
        return {"success": True, "order_id": str(order.id)}

    # Only accept verification for PAYMENT_PENDING orders
    if order.status != OrderStatus.PAYMENT_PENDING:
        raise HTTPException(
            status_code=409,
            detail=f"Order is in status {order.status.value}, cannot verify payment",
        )

    # Check for duplicate payment record (webhook may have already created it)
    existing_payment_result = await db.execute(
        select(Payment).where(Payment.payment_gateway_id == body.razorpay_payment_id)
    )
    if not existing_payment_result.scalar_one_or_none():
        payment = Payment(
            order_id=order.id,
            gateway="razorpay",
            payment_gateway_id=body.razorpay_payment_id,
            status=PaymentStatus.CAPTURED,
            amount=order.total_amount,
        )
        db.add(payment)

    # Transition order to PAID
    OrderStateMachine.transition(order, OrderStatus.PAID)

    # Enqueue outbox event for WhatsApp notification
    outbox_event = OutboxEvent(
        aggregate_type="order",
        aggregate_id=str(order.id),
        event_type="ORDER_PAID",
        payload={
            "order_id": str(order.id),
            "user_id": str(order.user_id),
            "amount": order.total_amount,
            "razorpay_payment_id": body.razorpay_payment_id,
        },
    )
    db.add(outbox_event)

    await db.commit()

    logger.info(
        "Order %s marked PAID via client verification (payment: %s)",
        order.id,
        body.razorpay_payment_id,
    )

    return {"success": True, "order_id": str(order.id)}

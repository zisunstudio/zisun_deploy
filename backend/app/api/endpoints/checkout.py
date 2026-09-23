"""Checkout API endpoints — pincode check and payment verification."""
import hashlib
import hmac
import logging
import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_async_db
from app.core.redis import get_redis_client
from app.core.launch import require_checkout_enabled
from app.core.security import get_current_user
from app.models.cart import CartItem
from app.models.order import (
    Address,
    Order,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    OutboxEvent,
)
from app.models.user import User, UserRole
from app.schemas.address import AddressCreate
from app.services.checkout import CheckoutService
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
    # Answerable even when checkout is shut: this endpoint is how the UI learns
    # there is nothing to offer. 503-ing it would leave the storefront guessing.
    if settings.is_browse_only:
        return {
            "methods": [],
            "razorpay_key_id": None,
            "cod_only": False,
            "checkout_enabled": False,
        }
    if settings.PAYMENTS_COD_ONLY:
        return {
            "methods": ["COD"],
            "razorpay_key_id": None,
            "cod_only": True,
            "checkout_enabled": True,
        }
    return {
        "methods": ["RAZORPAY", "COD"],
        "razorpay_key_id": settings.RAZORPAY_KEY_ID or None,
        "cod_only": False,
        "checkout_enabled": True,
    }


@router.get("/pincode/{pincode}/check", tags=["Checkout"])
async def check_pincode(pincode: str, cod: bool = True):
    """Whether we deliver to this pincode, how fast, and whether COD is on.

    Backed by Shiprocket's courier/serviceability, cached in Redis with the COD
    flag on a shorter TTL than the coverage — couriers suspend COD to a pincode
    intraday when RTO spikes there.

    Fails open. If Shiprocket is unreachable the answer is "deliverable" with
    `source: "assumed"` and no estimate: refusing an order we could have
    fulfilled loses the sale outright, while accepting one we cannot is caught
    at COD confirmation before anything is dispatched. Callers must treat
    `source` as load-bearing and not render an estimate that was never given.
    """
    if not _PINCODE_RE.match(pincode):
        raise HTTPException(status_code=400, detail="Pincode must be exactly 6 digits")

    from app.services.shiprocket import check_serviceability

    try:
        redis = await get_redis_client()
    except Exception:
        redis = None

    result = await check_serviceability(pincode, cod=cod, redis=redis)
    return {
        "pincode": pincode,
        "serviceable": result.serviceable,
        "cod_available": result.cod_available,
        "estimated_days": result.estimated_days,
        "courier": result.courier,
        "source": result.source,
        # The fee the API will actually charge, so the page can never quote a
        # different number from the one on the invoice.
        "cod_fee_paise": settings.COD_SHIPPING_FEE_PAISE,
    }


# ── GET /policy — what the shop charges, from the shop ────────────────────────


@router.get("/policy", tags=["Checkout"])
async def checkout_policy():
    """The commercial terms, read from the running configuration.

    The storefront used to keep `codShippingRupees: 99` as a constant in
    `lib/legal.ts` "mirroring" the backend. Two numbers, one of them a copy:
    change COD_SHIPPING_FEE_PAISE on the server and every page would go on
    advertising 99 while the customer was charged something else. A price
    shown to a customer has to come from the thing that charges it.
    """
    from app.services.coupon import COD_MAX_ORDER_VALUE_PAISE  # noqa: PLC0415

    return {
        "cod_fee_paise": settings.COD_SHIPPING_FEE_PAISE,
        "cod_max_order_paise": COD_MAX_ORDER_VALUE_PAISE,
        "prepaid_shipping_paise": 0,
        "cod_only": bool(settings.PAYMENTS_COD_ONLY),
    }


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


@router.post(
    "/verify-payment",
    tags=["Checkout"],
    dependencies=[Depends(require_checkout_enabled)],
)
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
    # The order is real now, so it earns its serial. Taken here rather than at
    # creation so an abandoned checkout never burns a number.
    from app.services.invoicing import issue_if_due  # noqa: PLC0415

    await issue_if_due(db, order)

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


# ─────────────────────────────────────────────────────────────────────────────
# POST /checkout/guest
# ─────────────────────────────────────────────────────────────────────────────

class GuestItem(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=20)


class GuestCheckoutRequest(BaseModel):
    """Everything a first-time buyer can give us without an account."""
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., pattern=r"^\+91[6-9]\d{9}$", description="Indian mobile: +91XXXXXXXXXX")
    email: Optional[EmailStr] = None
    items: List[GuestItem] = Field(..., min_length=1, max_length=20)
    address: AddressCreate
    payment_method: PaymentMethod = PaymentMethod.COD
    coupon_code: Optional[str] = Field(default=None, max_length=50)
    idempotency_key: Optional[str] = Field(default=None, max_length=100)
    # Where she came from, as the storefront first saw it. Bounded and
    # optional: an order from someone who blocks analytics still saves, and
    # nothing here is trusted for anything but counting.
    source: Optional[str] = Field(default=None, max_length=60)
    medium: Optional[str] = Field(default=None, max_length=60)
    campaign: Optional[str] = Field(default=None, max_length=120)
    content: Optional[str] = Field(default=None, max_length=120)
    referrer_domain: Optional[str] = Field(default=None, max_length=200)


@router.post(
    "/guest",
    tags=["Checkout"],
    status_code=201,
    dependencies=[Depends(require_checkout_enabled)],
)
async def guest_checkout(
    body: GuestCheckoutRequest,
    db: AsyncSession = Depends(get_async_db),
):
    """Place an order without creating an account first.

    A login wall in front of a first purchase costs more orders than it
    prevents fraud, and it was never the thing preventing fraud here: an
    unconfirmed COD order cannot reach PACKED (`may_dispatch`), so the
    founder speaks to every COD customer before anything ships, and a
    prepaid order is proven by the payment itself.

    Deliberately issues NO session. A user row is found or created from the
    phone number so the order has an owner and shows up in that person's
    history the day they do sign in — but typing someone else's number here
    grants no access to their account, because nothing here returns a token.
    That is the whole reason this is a separate endpoint rather than a
    "sign in without OTP" shortcut.

    The cart is set to exactly what is being bought and then consumed by
    `initiate_checkout`, which is left completely untouched: the same
    server-side price recalculation, the same FOR UPDATE stock locks, the
    same coupon handling and the same Razorpay call as a signed-in order.
    A saved cart on a matching account is replaced, which is the intended
    reading of "this is my basket right now".
    """
    phone = body.phone.strip()

    # Find or create the buyer. Name and email fill blanks on an existing
    # account but never overwrite what the owner set themselves.
    user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    if user is None:
        user = User(phone=phone, name=body.name.strip(), email=body.email, role=UserRole.user)
        db.add(user)
        await db.flush()
    else:
        if not user.name:
            user.name = body.name.strip()
        if body.email and not user.email:
            user.email = body.email

    address = Address(
        user_id=user.id,
        line1=body.address.line1,
        line2=body.address.line2,
        city=body.address.city,
        state=body.address.state,
        pincode=body.address.pincode,
        is_default=True,
    )
    db.add(address)
    await db.flush()

    svc = CheckoutService(db)
    cart = await svc.get_or_create_cart(user.id)
    for existing in list(cart.items):
        await db.delete(existing)
    await db.flush()
    for item in body.items:
        db.add(CartItem(cart_id=cart.id, product_variant_id=item.variant_id, quantity=item.quantity))
    await db.flush()
    db.expire(cart, ["items"])

    order, razorpay_order_id = await svc.initiate_checkout(
        user_id=user.id,
        address_id=address.id,
        payment_method=body.payment_method,
        coupon_code=body.coupon_code,
        idempotency_key=body.idempotency_key,
    )
    # Attribution is written after the order exists so a malformed value can
    # never stop a sale: worst case the order is simply un-sourced.
    for field in ("source", "medium", "campaign", "content", "referrer_domain"):
        value = (getattr(body, field, None) or "").strip().lower() or None
        setattr(order, field, value)
    await db.commit()

    return {
        "order_id": str(order.id),
        "status": order.status.value,
        "total_amount": order.total_amount,
        "payment_method": order.payment_method.value,
        "razorpay_order_id": razorpay_order_id,
        # The publishable key. Safe to return: it identifies the merchant to
        # Razorpay's client SDK and cannot authorise anything on its own.
        "razorpay_key_id": settings.RAZORPAY_KEY_ID if razorpay_order_id else None,
        "cod_amount_due": order.cod_amount_due,
    }

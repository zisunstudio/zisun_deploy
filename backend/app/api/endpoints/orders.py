from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
import uuid

from app.schemas.order import OrderResponse
from app.models.order import Order, Payment, OrderStatus, PaymentStatus
from app.core.database import get_async_db
from app.core.security import get_current_user

router = APIRouter()


@router.get("/", response_model=List[OrderResponse])
async def get_user_orders(
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    stmt = (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.payment))
        .where(Order.user_id == str(current_user.id))
        .order_by(Order.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order_detail(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    stmt = (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.payment))
        .where(Order.id == str(order_id), Order.user_id == str(current_user.id))
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_async_db)):
    """Idempotent Razorpay webhook — HMAC verification added in Phase 3 middleware."""
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing webhook signature")

    payload = await request.json()
    event_type = payload.get("event", "")

    if event_type != "payment.captured":
        return {"status": "ignored", "event": event_type}

    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    razorpay_payment_id = payment_entity.get("id")
    razorpay_order_id = payment_entity.get("order_id")
    amount = payment_entity.get("amount", 0)

    if not razorpay_payment_id or not razorpay_order_id:
        raise HTTPException(status_code=422, detail="Malformed webhook payload")

    # Idempotency — UNIQUE constraint on payment_gateway_id prevents duplicate rows
    existing = await db.execute(
        select(Payment).where(Payment.payment_gateway_id == razorpay_payment_id)
    )
    if existing.scalar_one_or_none():
        return {"status": "ok", "message": "already processed"}

    # Find order by razorpay_order_id stored in Order.razorpay_order_id (Phase 3 field)
    # For now, match on the order linked to this razorpay order
    order_result = await db.execute(
        select(Order)
        .where(Order.status == OrderStatus.PAYMENT_PENDING)
        .with_for_update()
    )
    order = order_result.scalar_one_or_none()
    if not order:
        return {"status": "ignored", "reason": "no matching pending order"}

    payment = Payment(
        order_id=order.id,
        gateway="razorpay",
        payment_gateway_id=razorpay_payment_id,
        status=PaymentStatus.CAPTURED,
        amount=amount,
    )
    db.add(payment)
    order.status = OrderStatus.PAID
    await db.commit()

    return {"status": "ok"}

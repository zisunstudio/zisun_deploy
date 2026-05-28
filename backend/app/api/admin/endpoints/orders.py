"""Admin order endpoints — list, detail, status update, refund."""
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_db
from app.core.config import settings
from app.models.order import Order, OrderStatus, Payment, PaymentStatus, OutboxEvent
from app.models.user import User
from app.schemas.order import OrderResponse
from app.services.order_state_machine import OrderStateMachine
from app.tasks.commerce import _release_locks_for_order

router = APIRouter()


class StatusUpdateRequest(BaseModel):
    status: OrderStatus


class RefundRequest(BaseModel):
    amount: Optional[int] = None  # paise; None = full amount


@router.get("/", response_model=List[OrderResponse])
async def admin_list_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[OrderStatus] = Query(None),
    search: Optional[str] = Query(None, description="order_id prefix or phone"),
    db: AsyncSession = Depends(get_async_db),
):
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.payment),
            selectinload(Order.fulfillment),
        )
        .order_by(Order.created_at.desc())
    )
    if status:
        stmt = stmt.where(Order.status == status)
    if search:
        # Search by order_id prefix (cast to text) or user phone via join
        stmt = stmt.join(User, Order.user_id == User.id, isouter=True)
        stmt = stmt.where(
            or_(
                Order.id.cast(String).startswith(search.lower()),
                User.phone.contains(search),
            )
        )
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{order_id}", response_model=OrderResponse)
async def admin_get_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.payment),
            selectinload(Order.fulfillment),
            selectinload(Order.address),
            selectinload(Order.user),
        )
        .where(Order.id == order_id)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    return order


@router.post("/{order_id}/status", response_model=OrderResponse)
async def admin_update_order_status(
    order_id: uuid.UUID,
    body: StatusUpdateRequest,
    db: AsyncSession = Depends(get_async_db),
):
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.payment),
            selectinload(Order.fulfillment),
        )
        .where(Order.id == order_id)
        .with_for_update()
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")

    OrderStateMachine.transition(order, body.status)

    # Release locks on cancel/fail
    if body.status in (OrderStatus.CANCELLED, OrderStatus.FAILED_PAYMENT):
        await _release_locks_for_order(db, order_id)

    # Shiprocket AWB on PACKED
    if body.status == OrderStatus.PACKED:
        try:
            from app.services.shiprocket import create_shipment
            from app.models.order import Fulfillment

            awb = await create_shipment(db, order)
            if awb:
                fulfillment = order.fulfillment
                if fulfillment:
                    fulfillment.awb_number = awb
                    fulfillment.status = "PACKED"
                else:
                    f = Fulfillment(
                        order_id=order.id,
                        carrier="shiprocket",
                        awb_number=awb,
                        status="PACKED",
                    )
                    db.add(f)
        except Exception:
            pass  # Non-blocking — admin sees "Manual AWB Entry Required" in UI

    await db.commit()
    return await admin_get_order(order_id, db)


@router.post("/{order_id}/refund")
async def admin_refund_order(
    order_id: uuid.UUID,
    body: RefundRequest,
    db: AsyncSession = Depends(get_async_db),
):
    stmt = (
        select(Order)
        .options(selectinload(Order.payment), selectinload(Order.user))
        .where(Order.id == order_id)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    if not order.payment or order.payment.status != PaymentStatus.CAPTURED:
        raise HTTPException(400, "No captured payment to refund")

    refund_amount = body.amount or order.payment.amount

    # Call Razorpay refund API
    if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
        import razorpay

        client = razorpay.Client(
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        )
        client.payment.refund(
            order.payment.payment_gateway_id, {"amount": refund_amount}
        )

    order.payment.status = PaymentStatus.REFUNDED

    # Write OutboxEvent for WhatsApp notification
    db.add(
        OutboxEvent(
            aggregate_type="Order",
            aggregate_id=str(order_id),
            event_type="ORDER_REFUNDED",
            payload={
                "order_id": str(order_id),
                "phone": order.user.phone if order.user else "",
                "amount": refund_amount,
            },
        )
    )
    await db.commit()
    return {"refunded": True, "amount": refund_amount}

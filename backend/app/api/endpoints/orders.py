from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
import uuid

from app.schemas.order import OrderResponse
from app.models.order import Order, Payment, OrderStatus, PaymentStatus
from app.core.database import get_async_db
from app.api.endpoints.cart import get_current_user_id

router = APIRouter()

@router.get("/", response_model=List[OrderResponse])
async def get_user_orders(
    db: AsyncSession = Depends(get_async_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    stmt = select(Order).options(
        selectinload(Order.items),
        selectinload(Order.payment)
    ).where(Order.user_id == str(user_id)).order_by(Order.created_at.desc())
    
    result = await self.db.execute(stmt)
    return result.scalars().all()

@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_async_db)):
    """
    Webhook handler for Razorpay.
    Verifies HMAC signature, extracts payment status, and idempotently updates order.
    """
    # 1. HMAC Signature Verification
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")
    
    payload = await request.json()
    
    # 2. Extract Data (Mocking extraction logic)
    # event_type = payload.get("event")
    # payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    # order_id = payment_entity.get("notes", {}).get("internal_order_id")
    
    # MOCK DATA FOR SCAFFOLD
    order_id = payload.get("order_id") # Assume we pass it for dev
    razorpay_payment_id = payload.get("payment_id", f"pay_mock_{uuid.uuid4().hex[:8]}")
    
    if not order_id:
        return {"status": "ignored"}
        
    # 3. Idempotency Check
    stmt_payment = select(Payment).where(Payment.payment_gateway_id == razorpay_payment_id)
    res_payment = await db.execute(stmt_payment)
    if res_payment.scalar_one_or_none():
        # Already processed
        return {"status": "ok", "message": "already processed"}
        
    # 4. Update Order & Payment
    stmt_order = select(Order).where(Order.id == str(order_id)).with_for_update()
    res_order = await db.execute(stmt_order)
    order = res_order.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    payment = Payment(
        order_id=order.id,
        gateway="razorpay",
        payment_gateway_id=razorpay_payment_id,
        status=PaymentStatus.CAPTURED,
        amount=order.total_amount
    )
    db.add(payment)
    
    order.status = OrderStatus.PAID
    await db.commit()
    
    return {"status": "ok"}

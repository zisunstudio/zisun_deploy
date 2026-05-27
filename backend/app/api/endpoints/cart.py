from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.schemas.order import CartItemRequest, CheckoutInitiateRequest, CheckoutResponse
from app.services.checkout import CheckoutService
from app.core.database import get_async_db
from app.core.security import get_current_user

router = APIRouter()


@router.post("/items", status_code=200)
async def add_item_to_cart(
    body: CartItemRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    svc = CheckoutService(db)
    await svc.add_to_cart(current_user.id, body.variant_id, body.quantity)
    return {"success": True, "message": "Item added to cart"}


@router.delete("/items/{variant_id}", status_code=200)
async def remove_cart_item(
    variant_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    svc = CheckoutService(db)
    await svc.remove_from_cart(current_user.id, variant_id)
    return {"success": True, "message": "Item removed"}


@router.get("/", status_code=200)
async def get_cart(
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    svc = CheckoutService(db)
    cart = await svc.get_or_create_cart(current_user.id)
    return {"success": True, "data": cart}


@router.post("/checkout/initiate", response_model=CheckoutResponse)
async def initiate_checkout(
    body: CheckoutInitiateRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    svc = CheckoutService(db)
    order, razorpay_order_id = await svc.initiate_checkout(current_user.id, body.address_id)
    return CheckoutResponse(
        order_id=order.id,
        razorpay_order_id=razorpay_order_id,
        amount=order.total_amount,
    )

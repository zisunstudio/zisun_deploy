from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.schemas.order import CartItemRequest, CheckoutInitiateRequest, CheckoutResponse
from app.services.checkout import CheckoutService
from app.core.database import get_async_db

router = APIRouter()

def get_current_user_id(authorization: str = Header(...)):
    # Mocking JWT validation for scaffold completeness.
    # In reality, this depends on OAuth2PasswordBearer and `jose.jwt.decode`
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")
    try:
        # Mock payload logic. Just extracting a UUID if present for dev.
        # token = authorization.split(" ")[1]
        # payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        # return uuid.UUID(payload["sub"])
        
        # MOCK RETURN:
        return uuid.UUID("12345678-1234-5678-1234-567812345678")
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/items")
async def add_item_to_cart(
    request: CartItemRequest, 
    db: AsyncSession = Depends(get_async_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    checkout_service = CheckoutService(db)
    await checkout_service.add_to_cart(user_id, request.variant_id, request.quantity)
    return {"message": "Added to cart"}

@router.post("/checkout/initiate", response_model=CheckoutResponse)
async def initiate_checkout(
    request: CheckoutInitiateRequest,
    db: AsyncSession = Depends(get_async_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    checkout_service = CheckoutService(db)
    order = await checkout_service.initiate_checkout(user_id, request.address_id)
    
    # Mock Razorpay Order ID creation
    razorpay_order_id = f"order_mock_{uuid.uuid4().hex[:8]}"
    
    return CheckoutResponse(
        order_id=order.id,
        razorpay_order_id=razorpay_order_id,
        amount=order.total_amount
    )

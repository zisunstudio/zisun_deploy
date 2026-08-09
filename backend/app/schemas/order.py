from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from app.models.order import OrderStatus, PaymentStatus, PaymentMethod

# ── Cart request / response schemas ──────────────────────────────────────────

class CartItemRequest(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(..., gt=0)


class CartItemResponse(BaseModel):
    id: uuid.UUID
    product_variant_id: uuid.UUID
    quantity: int
    unit_price: int  # effective price (base + delta) in paise
    product_name: Optional[str] = None
    image_url: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    sku: Optional[str] = None

    class Config:
        from_attributes = True


class CartResponse(BaseModel):
    id: uuid.UUID
    items: List[CartItemResponse] = []
    cart_total: int = 0  # in paise

    class Config:
        from_attributes = True

class UpdateCartItemRequest(BaseModel):
    quantity: int = Field(..., ge=0)  # 0 = remove item


class CheckoutInitiateRequest(BaseModel):
    address_id: uuid.UUID
    payment_method: PaymentMethod = PaymentMethod.RAZORPAY
    coupon_code: Optional[str] = None


class CheckoutResponse(BaseModel):
    order_id: uuid.UUID
    razorpay_order_id: Optional[str] = None  # None for COD
    amount: int  # Final amount in paise (after discount)
    discount_amount: int = 0
    currency: str = "INR"
    payment_method: str = "RAZORPAY"
    is_cod: bool = False

# Addresses
class AddressBase(BaseModel):
    line1: str = Field(..., min_length=5)
    city: str
    state: str
    pincode: str = Field(..., pattern=r'^\d{6}$')
    is_default: bool = False

class AddressCreate(AddressBase):
    pass

class AddressResponse(AddressBase):
    id: uuid.UUID

    class Config:
        from_attributes = True

# Orders
class OrderItemResponse(BaseModel):
    id: uuid.UUID
    product_variant_id: uuid.UUID
    quantity: int
    unit_price: int

    class Config:
        from_attributes = True

class PaymentResponse(BaseModel):
    gateway: str
    status: PaymentStatus
    amount: int
    processed_at: Optional[datetime]

    class Config:
        from_attributes = True

class OrderResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: OrderStatus
    total_amount: int
    address_id: uuid.UUID
    created_at: datetime
    
    items: List[OrderItemResponse] = []
    payment: Optional[PaymentResponse] = None

    class Config:
        from_attributes = True

class OrderStatusUpdateRequest(BaseModel):
    status: OrderStatus

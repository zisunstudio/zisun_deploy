from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from app.models.order import CODConfirmation, OrderStatus, PaymentMethod, PaymentStatus

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
    # Included in total_amount; 0 on prepaid orders.
    shipping_amount: int = 0
    address_id: uuid.UUID
    created_at: datetime
    
    items: List[OrderItemResponse] = []
    payment: Optional[PaymentResponse] = None

    # The console could not tell a COD order from a prepaid one, which made a
    # stuck COD order invisible: it rests in PAYMENT_PENDING by design, and
    # the page offered no action for that status at all.
    payment_method: Optional[PaymentMethod] = None
    cod_confirmation: Optional[CODConfirmation] = None
    cod_amount_due: Optional[int] = None

    class Config:
        from_attributes = True

class OrderStatusUpdateRequest(BaseModel):
    status: OrderStatus


# ── What packing an order actually needs ─────────────────────────────────────


class AdminOrderItemDetail(BaseModel):
    """A line, in the words on the parcel.

    `OrderItemResponse` carried a product_variant_id and nothing else, so the
    console could show that an order existed but not what was in it. Nobody
    can pack from a UUID.
    """
    quantity: int
    unit_price: int
    product_id: Optional[uuid.UUID] = None
    product_name: Optional[str] = None
    sku: Optional[str] = None
    size: Optional[str] = None
    colour: Optional[str] = None
    image_url: Optional[str] = None


class AdminAddressDetail(BaseModel):
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str

    class Config:
        from_attributes = True


class AdminOrderDetail(OrderResponse):
    """Everything needed to pack and send one parcel, in one response.

    The list view can say an order exists; this is what says who it goes to
    and what goes in it. Deliberately a separate, authenticated endpoint -
    name, phone and address are the most sensitive rows in the database and
    do not belong in a list that is fetched fifty at a time.
    """
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    address: Optional[AdminAddressDetail] = None
    detailed_items: List[AdminOrderItemDetail] = []
    invoice_number: Optional[str] = None
    awb_number: Optional[str] = None
    carrier: Optional[str] = None

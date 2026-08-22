import uuid
import enum
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import BaseModel


class PaymentMethod(str, enum.Enum):
    RAZORPAY = "RAZORPAY"
    COD = "COD"


class OrderStatus(str, enum.Enum):
    CREATED = "CREATED"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    PAID = "PAID"
    FAILED_PAYMENT = "FAILED_PAYMENT"
    PACKED = "PACKED"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    RETURNED = "RETURNED"


class CODConfirmation(str, enum.Enum):
    """Where a COD order stands in the pre-dispatch confirmation call.

    COD orders return at roughly 26% against under 2% for prepaid, and a
    fashion RTO costs Rs 200-250 in two-way freight against nothing collected.
    Asking the customer to confirm before anything ships is the cheapest
    control available, and it only works if dispatch actually waits for it.
    """

    PENDING = "PENDING"        # asked, waiting for a reply
    CONFIRMED = "CONFIRMED"    # customer said yes; safe to dispatch
    DECLINED = "DECLINED"      # customer said no; cancel and release stock
    UNREACHABLE = "UNREACHABLE"  # no reply within the window


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    CAPTURED = "CAPTURED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class LockStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"


class Order(BaseModel):
    __tablename__ = "orders"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.CREATED, nullable=False, index=True)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    address_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("addresses.id"), nullable=False)
    razorpay_order_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(100))
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="paymentmethod"),
        default=PaymentMethod.RAZORPAY,
        nullable=False,
    )
    cod_amount_due: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # NULL on prepaid orders — the column only means something for COD.
    cod_confirmation: Mapped[Optional[CODConfirmation]] = mapped_column(
        Enum(CODConfirmation, name="codconfirmation"), nullable=True, index=True
    )
    cod_confirmation_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cod_confirmed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Counts outbound asks, so the follow-up nudge cannot become a loop.
    cod_confirmation_attempts: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    coupon_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("coupons.id"), nullable=True)
    discount_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="order")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="order", uselist=False)
    fulfillment: Mapped[Optional["Fulfillment"]] = relationship("Fulfillment", back_populates="order", uselist=False)
    address: Mapped[Optional["Address"]] = relationship("Address", foreign_keys=[address_id])


class OrderItem(BaseModel):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    product_variant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)  # Snapshot price in paise

    order: Mapped["Order"] = relationship("Order", back_populates="items")


class Payment(BaseModel):
    __tablename__ = "payments"

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), nullable=False)
    gateway: Mapped[str] = mapped_column(String(50), default="razorpay", nullable=False)
    payment_gateway_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    order: Mapped["Order"] = relationship("Order", back_populates="payment")


class InventoryLock(BaseModel):
    __tablename__ = "inventory_locks"

    product_variant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    reserved_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[LockStatus] = mapped_column(Enum(LockStatus), default=LockStatus.ACTIVE, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)


class Fulfillment(BaseModel):
    __tablename__ = "fulfillments"

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), nullable=False)
    carrier: Mapped[str] = mapped_column(String(100), default="shiprocket", nullable=False)
    awb_number: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(50))
    external_ref: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True)

    order: Mapped["Order"] = relationship("Order", back_populates="fulfillment")


class Address(BaseModel):
    __tablename__ = "addresses"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    line1: Mapped[str] = mapped_column(String(255), nullable=False)
    line2: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    pincode: Mapped[str] = mapped_column(String(20), nullable=False)
    is_default: Mapped[bool] = mapped_column(default=False, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="addresses")


class OutboxEvent(BaseModel):
    __tablename__ = "outbox_events"

    aggregate_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)

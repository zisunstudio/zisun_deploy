from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
import enum

from .base import BaseModel

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

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.CREATED, nullable=False, index=True)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    address_id: Mapped[str] = mapped_column(ForeignKey("addresses.id"), nullable=False)
    region: Mapped[Optional[str]] = mapped_column(String(100))

    user: Mapped["User"] = relationship("User", back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="order")
    payment: Mapped["Payment"] = relationship("Payment", back_populates="order", uselist=False)
    fulfillment: Mapped["Fulfillment"] = relationship("Fulfillment", back_populates="order", uselist=False)

class OrderItem(BaseModel):
    __tablename__ = "order_items"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    product_variant_id: Mapped[str] = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False) # Snapshot price

    order: Mapped["Order"] = relationship("Order", back_populates="items")

class Payment(BaseModel):
    __tablename__ = "payments"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), nullable=False)
    gateway: Mapped[str] = mapped_column(String(50), default="razorpay", nullable=False)
    payment_gateway_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True) # Unique ID for idempotency
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    order: Mapped["Order"] = relationship("Order", back_populates="payment")

class InventoryLock(BaseModel):
    __tablename__ = "inventory_locks"

    product_variant_id: Mapped[str] = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    reserved_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[LockStatus] = mapped_column(Enum(LockStatus), default=LockStatus.ACTIVE, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)

class Fulfillment(BaseModel):
    __tablename__ = "fulfillments"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), nullable=False)
    carrier: Mapped[str] = mapped_column(String(100), default="shiprocket", nullable=False)
    awb_number: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(50))
    external_ref: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True) # Maps to Shiprocket channel_order_id
    
    order: Mapped["Order"] = relationship("Order", back_populates="fulfillment")

class Address(BaseModel):
    __tablename__ = "addresses"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
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
    payload: Mapped[dict] = mapped_column(type_=String, nullable=False) # JSON string representation
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)

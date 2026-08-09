import uuid
import enum
from typing import Optional, List
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class CouponType(str, enum.Enum):
    FLAT = "FLAT"        # Fixed amount off in paise
    PERCENT = "PERCENT"  # Percentage off (value = integer %, e.g. 10 = 10%)


class Coupon(BaseModel):
    __tablename__ = "coupons"

    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    type: Mapped[CouponType] = mapped_column(Enum(CouponType, name="coupontype"), nullable=False)
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    min_order_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_discount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    usage_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    per_user_limit: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_referral: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    usages: Mapped[List["CouponUsage"]] = relationship("CouponUsage", back_populates="coupon")


class CouponUsage(BaseModel):
    __tablename__ = "coupon_usages"

    coupon_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("coupons.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)

    coupon: Mapped["Coupon"] = relationship("Coupon", back_populates="usages")

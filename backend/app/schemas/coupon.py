from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

from app.models.coupon import CouponType


class CouponCreate(BaseModel):
    code: str = Field(..., min_length=3, max_length=50, pattern=r"^[A-Z0-9_-]+$")
    type: CouponType
    value: int = Field(..., gt=0)
    min_order_value: int = Field(default=0, ge=0)
    max_discount: Optional[int] = Field(default=None, gt=0)
    usage_limit: Optional[int] = Field(default=None, gt=0)
    per_user_limit: int = Field(default=1, ge=1)
    expires_at: Optional[datetime] = None
    is_active: bool = True


class CouponUpdate(BaseModel):
    is_active: Optional[bool] = None
    usage_limit: Optional[int] = Field(default=None, gt=0)
    expires_at: Optional[datetime] = None


class CouponResponse(BaseModel):
    id: uuid.UUID
    code: str
    type: CouponType
    value: int
    min_order_value: int
    max_discount: Optional[int] = None
    usage_limit: Optional[int] = None
    per_user_limit: int
    expires_at: Optional[datetime] = None
    is_active: bool
    is_referral: bool
    created_at: datetime

    class Config:
        from_attributes = True


class CouponApplyRequest(BaseModel):
    code: str
    order_total: int = Field(..., gt=0)


class CouponApplyResponse(BaseModel):
    code: str
    discount_amount: int
    final_total: int
    message: str

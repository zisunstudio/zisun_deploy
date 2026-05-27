from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

from app.models.user import UserRole


class SendOTPRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+91[6-9]\d{9}$", description="Indian mobile: +91XXXXXXXXXX")


class VerifyOTPRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+91[6-9]\d{9}$")
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class UserResponse(BaseModel):
    id: uuid.UUID
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: UserRole
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional[UserResponse] = None


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

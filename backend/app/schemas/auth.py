from pydantic import BaseModel, Field, constr
from typing import Optional
from datetime import datetime
import uuid

from app.models.user import UserRole

class SendOTPRequest(BaseModel):
    # Enforces +91 followed by 10 digits
    phone: str = Field(..., pattern=r'^\+91[6-9]\d{9}$')

class VerifyOTPRequest(BaseModel):
    phone: str = Field(..., pattern=r'^\+91[6-9]\d{9}$')
    otp: str = Field(..., min_length=6, max_length=6, pattern=r'^\d{6}$')

class UserResponse(BaseModel):
    id: uuid.UUID
    phone: str
    name: Optional[str]
    email: Optional[str]
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional[UserResponse] = None

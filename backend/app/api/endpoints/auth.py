from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import SendOTPRequest, VerifyOTPRequest, TokenResponse, UserResponse
from app.services.auth import AuthService
from app.core.database import get_async_db
from app.core.security import create_access_token, create_refresh_token

router = APIRouter()

@router.post("/send-otp", status_code=200)
async def send_otp(request: SendOTPRequest, db: AsyncSession = Depends(get_async_db)):
    """
    Sends a 6-digit OTP to the provided Indian mobile number.
    """
    auth_service = AuthService(db)
    await auth_service.send_otp(request.phone)
    return {"message": "OTP sent successfully"}

@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(request: VerifyOTPRequest, response: Response, db: AsyncSession = Depends(get_async_db)):
    """
    Verifies the OTP and returns a JWT access token. Sets the refresh token as an HttpOnly cookie.
    """
    auth_service = AuthService(db)
    user = await auth_service.verify_otp(request.phone, request.otp)
    
    # Generate tokens
    access_token = create_access_token(subject=str(user.id), role=user.role.value)
    refresh_token = create_refresh_token(subject=str(user.id))
    
    # Set HttpOnly cookie for refresh token (FR-02)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True, 
        samesite="strict",
        max_age=30 * 24 * 60 * 60 # 30 days
    )
    
    return TokenResponse(
        access_token=access_token,
        user=user
    )

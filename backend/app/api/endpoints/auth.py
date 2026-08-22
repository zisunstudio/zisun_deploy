from fastapi import APIRouter, Depends, Response, Cookie, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.schemas.auth import SendOTPRequest, VerifyOTPRequest, TokenResponse, RefreshResponse
from app.services.auth import AuthService
from app.core.database import get_async_db
from app.core.redis import get_redis
from app.core.security import create_access_token

router = APIRouter()

_REFRESH_COOKIE = dict(
    key="refresh_token",
    httponly=True,
    secure=True,
    samesite="strict",
    max_age=30 * 24 * 60 * 60,
    path="/api/v1/auth",
)


def _svc(
    db: AsyncSession = Depends(get_async_db),
    redis=Depends(get_redis),
) -> AuthService:
    return AuthService(db=db, redis=redis)


@router.post("/send-otp", status_code=200)
async def send_otp(body: SendOTPRequest, svc: AuthService = Depends(_svc)):
    await svc.send_otp(body.phone)
    return {"success": True, "message": "OTP sent successfully"}


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: VerifyOTPRequest,
    response: Response,
    svc: AuthService = Depends(_svc),
):
    user = await svc.verify_otp(body.phone, body.otp)
    access_token = create_access_token(str(user.id), user.role.value)
    refresh_token = await svc.create_and_store_refresh_token(str(user.id))
    response.set_cookie(value=refresh_token, **_REFRESH_COOKIE)
    return TokenResponse(access_token=access_token, user=user)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
    svc: AuthService = Depends(_svc),
):
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token provided")

    new_access, new_refresh, user = await svc.rotate_refresh_token(refresh_token)
    response.set_cookie(value=new_refresh, **_REFRESH_COOKIE)
    return RefreshResponse(access_token=new_access, user=user)


@router.post("/logout", status_code=200)
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
    svc: AuthService = Depends(_svc),
):
    if refresh_token:
        await svc.revoke_refresh_token(refresh_token)
    response.delete_cookie("refresh_token", path="/api/v1/auth")
    return {"success": True, "message": "Logged out"}

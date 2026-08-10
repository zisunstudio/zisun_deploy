"""OTP authentication service — real Redis + Twilio implementation."""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.security import (
    generate_otp,
    hash_secret,
    mask_phone,
    verify_secret,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.auth import RefreshToken
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


def _otp_key(phone: str) -> str:      return f"otp:{phone}"
def _attempts_key(phone: str) -> str: return f"otp_attempts:{phone}"
def _lockout_key(phone: str) -> str:  return f"lockout:{phone}"
def _gen_rate_key(phone: str) -> str: return f"otp_gen:{phone}"


class AuthService:
    def __init__(self, db: AsyncSession, redis: Redis):
        self.db = db
        self.redis = redis

    # ── OTP flow ──────────────────────────────────────────────────────────────

    async def send_otp(self, phone: str) -> None:
        """Generate a 6-digit OTP, store its bcrypt hash in Redis, send via SMS."""

        if await self.redis.exists(_lockout_key(phone)):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account temporarily locked. Try again in 1 hour.",
            )

        gen_count = await self.redis.incr(_gen_rate_key(phone))
        if gen_count == 1:
            await self.redis.expire(_gen_rate_key(phone), 3600)
        if gen_count > settings.OTP_MAX_GENERATIONS_PER_HOUR:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many OTP requests. Try again in 1 hour.",
            )

        otp = generate_otp()
        otp_hash = hash_secret(otp)
        await self.redis.set(_otp_key(phone), otp_hash, ex=300)

        await self._send_sms(phone, otp)
        logger.info("OTP sent", extra={"phone": mask_phone(phone)})

    async def verify_otp(self, phone: str, otp: str) -> User:
        """Verify OTP; return User (created if first login)."""

        if await self.redis.exists(_lockout_key(phone)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account locked due to too many failed attempts. Try again in 1 hour.",
            )

        otp_hash: str | None = await self.redis.get(_otp_key(phone))
        if not otp_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="OTP expired or not found. Please request a new one.",
            )

        if not verify_secret(otp, otp_hash):
            attempts = await self.redis.incr(_attempts_key(phone))
            if attempts == 1:
                await self.redis.expire(_attempts_key(phone), 3600)

            remaining = settings.OTP_MAX_FAILED_ATTEMPTS - int(attempts)
            if remaining <= 0:
                await self.redis.set(
                    _lockout_key(phone), "1", ex=settings.OTP_LOCKOUT_SECONDS
                )
                await self.redis.delete(_otp_key(phone), _attempts_key(phone))
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Too many failed attempts. Account locked for 1 hour.",
                )

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid OTP. {remaining} attempt(s) remaining.",
            )

        await self.redis.delete(_otp_key(phone), _attempts_key(phone))

        result = await self.db.execute(select(User).where(User.phone == phone))
        user = result.scalar_one_or_none()

        if not user:
            user = User(phone=phone, role=UserRole.user)
            self.db.add(user)
            await self.db.commit()
            await self.db.refresh(user)
            logger.info("New user registered", extra={"phone": mask_phone(phone)})

        return user

    # ── Refresh token rotation ────────────────────────────────────────────────

    async def create_and_store_refresh_token(self, user_id: str) -> str:
        """Issue a new refresh token, persist its hash, return the raw token."""
        raw_token, jti = create_refresh_token(user_id)
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
        self.db.add(RefreshToken(
            user_id=user_id,
            jti=jti,
            token_hash=hash_secret(raw_token),
            expires_at=expires_at,
        ))
        await self.db.commit()
        return raw_token

    async def rotate_refresh_token(self, raw_token: str) -> tuple[str, str, User]:
        """Validate → revoke → reissue. Returns (new_access, new_refresh, user)."""
        payload = decode_token(raw_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

        jti: str = payload["jti"]
        user_id: str = payload["sub"]

        res = await self.db.execute(
            select(RefreshToken).where(RefreshToken.jti == jti, RefreshToken.revoked == False)  # noqa: E712
        )
        record = res.scalar_one_or_none()
        if record is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token already used or invalid")

        now = datetime.now(timezone.utc)
        if record.expires_at.replace(tzinfo=timezone.utc) < now:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

        record.revoked = True
        record.revoked_at = now

        res = await self.db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
        if user is None or user.deleted_at:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        new_access = create_access_token(str(user.id), user.role.value)
        new_refresh = await self.create_and_store_refresh_token(str(user.id))
        return new_access, new_refresh, user

    async def revoke_refresh_token(self, raw_token: str) -> None:
        """Best-effort revocation (logout)."""
        try:
            payload = decode_token(raw_token)
            jti = payload.get("jti")
            if jti:
                res = await self.db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
                record = res.scalar_one_or_none()
                if record:
                    record.revoked = True
                    record.revoked_at = datetime.now(timezone.utc)
                    await self.db.commit()
        except Exception:
            pass

    # ── SMS delivery ──────────────────────────────────────────────────────────

    async def _send_sms(self, phone: str, otp: str) -> None:
        if not settings.TWILIO_ACCOUNT_SID:
            # Dev mode — never log the raw OTP to a real logger
            print(
                f"\n{'='*44}\n"
                f"  DEV MODE — OTP for {mask_phone(phone)}: {otp}\n"
                f"{'='*44}\n"
            )
            return

        try:
            from app.core.twilio import get_twilio_client
            client = get_twilio_client()
            client.messages.create(
                body=f"Your ZISUN code: {otp}. Valid 5 min. Do not share.",
                from_=settings.TWILIO_FROM_NUMBER,
                to=phone,
            )
        except Exception as exc:
            logger.error("SMS delivery failed", extra={"phone": mask_phone(phone)})
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="SMS delivery failed. Please try again.",
            ) from exc

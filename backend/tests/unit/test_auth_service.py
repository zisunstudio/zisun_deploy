"""Unit tests for AuthService — OTP flow, rate limiting, lockout."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.services.auth import AuthService, _lockout_key, _attempts_key, _otp_key, _gen_rate_key
from app.core.config import settings


async def _make_svc(fake_redis, mock_db):
    return AuthService(db=mock_db, redis=fake_redis)


class TestSendOTP:
    async def test_send_otp_stores_hash_not_raw_otp(self, fake_redis, mock_db, mock_twilio):
        svc = await _make_svc(fake_redis, mock_db)
        await svc.send_otp("+919876543210")

        stored = await fake_redis.get(_otp_key("+919876543210"))
        assert stored is not None, "OTP hash should be stored in Redis"
        # The stored value must NOT equal any 6-digit plain text (it's a bcrypt hash)
        assert len(stored) > 10, "Stored value should be a bcrypt hash, not a raw OTP"
        assert stored.startswith("$2b$"), "Stored value should be a bcrypt hash"

    async def test_send_otp_respects_generation_rate_limit(self, fake_redis, mock_db, mock_twilio):
        svc = await _make_svc(fake_redis, mock_db)
        phone = "+919876543211"

        for _ in range(settings.OTP_MAX_GENERATIONS_PER_HOUR):
            await svc.send_otp(phone)

        with pytest.raises(HTTPException) as exc_info:
            await svc.send_otp(phone)
        assert exc_info.value.status_code == 429

    async def test_send_otp_blocked_when_locked(self, fake_redis, mock_db, mock_twilio):
        svc = await _make_svc(fake_redis, mock_db)
        phone = "+919876543212"
        await fake_redis.set(_lockout_key(phone), "1", ex=3600)

        with pytest.raises(HTTPException) as exc_info:
            await svc.send_otp(phone)
        assert exc_info.value.status_code == 429


class TestVerifyOTP:
    async def test_correct_otp_clears_redis_keys(self, fake_redis, mock_db, mock_twilio):
        svc = await _make_svc(fake_redis, mock_db)
        phone = "+919876543213"

        # Pre-store a known OTP hash
        from app.core.security import hash_secret
        otp = "123456"
        await fake_redis.set(_otp_key(phone), hash_secret(otp), ex=300)

        # Mock DB to return a user
        from app.models.user import User, UserRole
        mock_user = MagicMock(spec=User)
        mock_user.id = "test-uuid"
        mock_user.role = MagicMock(); mock_user.role.value = "user"
        mock_user.deleted_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        user = await svc.verify_otp(phone, otp)
        assert user is mock_user

        # OTP key should be deleted after success
        assert await fake_redis.get(_otp_key(phone)) is None

    async def test_five_wrong_otps_trigger_lockout(self, fake_redis, mock_db, mock_twilio):
        svc = await _make_svc(fake_redis, mock_db)
        phone = "+919876543214"

        from app.core.security import hash_secret
        await fake_redis.set(_otp_key(phone), hash_secret("999999"), ex=300)

        for i in range(settings.OTP_MAX_FAILED_ATTEMPTS - 1):
            with pytest.raises(HTTPException) as exc_info:
                await svc.verify_otp(phone, "000000")
            assert exc_info.value.status_code == 401  # not yet locked

        # 5th attempt should trigger lockout
        with pytest.raises(HTTPException) as exc_info:
            await svc.verify_otp(phone, "000000")
        assert exc_info.value.status_code == 403

        # Lockout key should now exist
        assert await fake_redis.exists(_lockout_key(phone))

    async def test_missing_otp_returns_401(self, fake_redis, mock_db, mock_twilio):
        svc = await _make_svc(fake_redis, mock_db)
        with pytest.raises(HTTPException) as exc_info:
            await svc.verify_otp("+919876543215", "123456")
        assert exc_info.value.status_code == 401

    async def test_locked_account_returns_403(self, fake_redis, mock_db, mock_twilio):
        svc = await _make_svc(fake_redis, mock_db)
        phone = "+919876543216"
        await fake_redis.set(_lockout_key(phone), "1", ex=3600)

        with pytest.raises(HTTPException) as exc_info:
            await svc.verify_otp(phone, "123456")
        assert exc_info.value.status_code == 403


class TestSecurity:
    def test_generate_otp_is_six_digits(self):
        from app.core.security import generate_otp
        for _ in range(100):
            otp = generate_otp()
            assert len(otp) == 6
            assert otp.isdigit()
            assert 100_000 <= int(otp) <= 999_999

    def test_mask_phone(self):
        from app.core.security import mask_phone
        assert mask_phone("+919876543210") == "+9198****3210"

    def test_rs256_token_roundtrip(self):
        from app.core.security import create_access_token, decode_token
        token = create_access_token("user-123", "user")
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
        assert payload["role"] == "user"
        assert payload["type"] == "access"
        assert "jti" in payload

    def test_refresh_token_has_correct_type(self):
        from app.core.security import create_refresh_token, decode_token
        raw, jti = create_refresh_token("user-456")
        payload = decode_token(raw)
        assert payload["type"] == "refresh"
        assert payload["jti"] == jti
        assert payload["sub"] == "user-456"

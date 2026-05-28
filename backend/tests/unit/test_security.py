"""Unit tests for JWT security — token creation, JTI revocation, role enforcement."""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


class TestAccessToken:
    def test_access_token_contains_jti(self):
        from app.core.security import create_access_token, decode_token
        token = create_access_token("test-user-id", "user")
        payload = decode_token(token)
        assert "jti" in payload
        assert len(payload["jti"]) == 36  # UUID format

    def test_access_token_contains_role(self):
        from app.core.security import create_access_token, decode_token
        token = create_access_token("test-user-id", "admin")
        payload = decode_token(token)
        assert payload["role"] == "admin"

    def test_access_token_subject_matches(self):
        from app.core.security import create_access_token, decode_token
        token = create_access_token("user-999", "user")
        payload = decode_token(token)
        assert payload["sub"] == "user-999"

    def test_access_token_type_is_access(self):
        from app.core.security import create_access_token, decode_token
        token = create_access_token("test-user-id", "user")
        payload = decode_token(token)
        assert payload["type"] == "access"

    def test_otp_never_in_access_token(self):
        """OTP raw value must never appear in any JWT payload."""
        from app.core.security import create_access_token, decode_token
        otp = "123456"
        token = create_access_token("test-user-id", "user")
        payload = decode_token(token)
        # OTP should NOT be stored in any field of the JWT payload
        token_str = str(payload)
        assert otp not in token_str

    async def test_revoke_token_jti_sets_redis_key(self):
        from app.core.security import revoke_token_jti
        fake_redis = AsyncMock()
        fake_redis.set = AsyncMock()
        jti = str(uuid.uuid4())
        await revoke_token_jti(fake_redis, jti, expires_in=900)
        fake_redis.set.assert_called_once_with(f"jti:{jti}", "1", ex=900)

    def test_two_tokens_have_unique_jtis(self):
        from app.core.security import create_access_token, decode_token
        token1 = create_access_token("user-1", "user")
        token2 = create_access_token("user-1", "user")
        payload1 = decode_token(token1)
        payload2 = decode_token(token2)
        assert payload1["jti"] != payload2["jti"]


class TestRefreshToken:
    def test_refresh_token_type_is_refresh(self):
        from app.core.security import create_refresh_token, decode_token
        raw, jti = create_refresh_token("user-abc")
        payload = decode_token(raw)
        assert payload["type"] == "refresh"

    def test_refresh_token_jti_matches_returned_jti(self):
        from app.core.security import create_refresh_token, decode_token
        raw, jti = create_refresh_token("user-abc")
        payload = decode_token(raw)
        assert payload["jti"] == jti

    def test_refresh_token_subject_matches(self):
        from app.core.security import create_refresh_token, decode_token
        raw, jti = create_refresh_token("user-xyz")
        payload = decode_token(raw)
        assert payload["sub"] == "user-xyz"


class TestMaskPhone:
    def test_mask_phone_masks_middle(self):
        from app.core.security import mask_phone
        assert mask_phone("+919876543210") == "+9198****3210"

    def test_mask_short_phone(self):
        from app.core.security import mask_phone
        assert mask_phone("123") == "****"

    def test_mask_phone_preserves_prefix_and_suffix(self):
        from app.core.security import mask_phone
        result = mask_phone("+919876543210")
        assert result.startswith("+9198")
        assert result.endswith("3210")
        assert "****" in result


class TestHashSecret:
    def test_hash_secret_returns_bcrypt_hash(self):
        from app.core.security import hash_secret
        hashed = hash_secret("mysecret")
        assert hashed.startswith("$2b$")

    def test_verify_secret_correct(self):
        from app.core.security import hash_secret, verify_secret
        plain = "correct-password"
        hashed = hash_secret(plain)
        assert verify_secret(plain, hashed) is True

    def test_verify_secret_wrong(self):
        from app.core.security import hash_secret, verify_secret
        hashed = hash_secret("correct-password")
        assert verify_secret("wrong-password", hashed) is False


class TestDecodeToken:
    def test_invalid_token_raises_401(self):
        from app.core.security import decode_token
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            decode_token("not.a.valid.token")
        assert exc.value.status_code == 401

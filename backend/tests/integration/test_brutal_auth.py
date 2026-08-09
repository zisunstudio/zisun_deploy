"""BRUTAL real-database auth tests — refresh-token rotation, replay protection,
OTP lockout, and new-user creation. These exercise the security-critical paths
that mocks can't (token persistence, revocation, replay).

Auto-skips if Postgres is unreachable.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import fakeredis.aioredis
from fastapi import HTTPException
from sqlalchemy import text, select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.core.security import (
    hash_secret, create_access_token, create_refresh_token, generate_otp,
)
from app.models.user import User, UserRole
from app.models.auth import RefreshToken
from app.services.auth import AuthService, _otp_key, _lockout_key, _attempts_key


_engine = create_async_engine(settings.async_database_uri, poolclass=NullPool)
_Session = async_sessionmaker(bind=_engine, expire_on_commit=False, class_=AsyncSession)


def _db_reachable_sync() -> bool:
    try:
        import psycopg2
        psycopg2.connect(
            host=settings.POSTGRES_SERVER, port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER, password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB, connect_timeout=2,
        ).close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_reachable_sync(), reason="Postgres not reachable")


@pytest.fixture
async def db():
    async with _Session() as s:
        await s.execute(text("TRUNCATE refresh_tokens, users RESTART IDENTITY CASCADE"))
        await s.commit()
        yield s


@pytest.fixture
def redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


PHONE = "+919876500123"


# ── verify_otp: user lifecycle ───────────────────────────────────────────────────

class TestVerifyOtpRealDB:
    async def test_first_login_creates_user(self, db, redis):
        await redis.set(_otp_key(PHONE), hash_secret("123456"), ex=300)
        svc = AuthService(db, redis)
        user = await svc.verify_otp(PHONE, "123456")
        assert user.phone == PHONE and user.role == UserRole.user
        # persisted
        found = (await db.execute(select(User).where(User.phone == PHONE))).scalar_one()
        assert found.id == user.id
        # otp consumed
        assert await redis.get(_otp_key(PHONE)) is None

    async def test_returning_user_not_duplicated(self, db, redis):
        existing = User(phone=PHONE, role=UserRole.user)
        db.add(existing)
        await db.commit()
        await redis.set(_otp_key(PHONE), hash_secret("654321"), ex=300)
        svc = AuthService(db, redis)
        user = await svc.verify_otp(PHONE, "654321")
        assert user.id == existing.id
        count = len((await db.execute(select(User).where(User.phone == PHONE))).scalars().all())
        assert count == 1

    async def test_wrong_otp_then_lockout_after_five(self, db, redis):
        await redis.set(_otp_key(PHONE), hash_secret("111111"), ex=300)
        svc = AuthService(db, redis)
        # 4 wrong → 401 with remaining
        for _ in range(settings.OTP_MAX_FAILED_ATTEMPTS - 1):
            with pytest.raises(HTTPException) as ei:
                await svc.verify_otp(PHONE, "000000")
            assert ei.value.status_code == 401
        # 5th wrong → 403 lockout
        with pytest.raises(HTTPException) as ei:
            await svc.verify_otp(PHONE, "000000")
        assert ei.value.status_code == 403
        assert await redis.exists(_lockout_key(PHONE))
        # Even the correct OTP is now blocked by lockout
        with pytest.raises(HTTPException) as ei:
            await svc.verify_otp(PHONE, "111111")
        assert ei.value.status_code == 403


# ── Refresh-token rotation & replay ──────────────────────────────────────────────

class TestRefreshRotationRealDB:
    async def _make_user(self, db):
        u = User(phone=PHONE, role=UserRole.user)
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u

    async def test_rotate_issues_new_and_revokes_old(self, db, redis):
        u = await self._make_user(db)
        svc = AuthService(db, redis)
        raw = await svc.create_and_store_refresh_token(str(u.id))

        new_access, new_refresh, user = await svc.rotate_refresh_token(raw)
        assert new_access and new_refresh and user.id == u.id
        assert new_refresh != raw

        # Old token is revoked in DB
        from app.core.security import decode_token
        old_jti = decode_token(raw)["jti"]
        rec = (await db.execute(select(RefreshToken).where(RefreshToken.jti == old_jti))).scalar_one()
        assert rec.revoked is True and rec.revoked_at is not None

    async def test_replay_old_token_rejected(self, db, redis):
        """Reusing a rotated (revoked) refresh token must 401 — replay protection."""
        u = await self._make_user(db)
        svc = AuthService(db, redis)
        raw = await svc.create_and_store_refresh_token(str(u.id))
        await svc.rotate_refresh_token(raw)  # first use, now revoked
        with pytest.raises(HTTPException) as ei:
            await svc.rotate_refresh_token(raw)  # replay
        assert ei.value.status_code == 401

    async def test_access_token_cannot_be_used_to_refresh(self, db, redis):
        u = await self._make_user(db)
        svc = AuthService(db, redis)
        access = create_access_token(str(u.id), u.role.value)
        with pytest.raises(HTTPException) as ei:
            await svc.rotate_refresh_token(access)
        assert ei.value.status_code == 401  # wrong token type

    async def test_expired_record_rejected(self, db, redis):
        u = await self._make_user(db)
        svc = AuthService(db, redis)
        raw = await svc.create_and_store_refresh_token(str(u.id))
        # Force the stored record to be expired (JWT still structurally valid)
        from app.core.security import decode_token
        jti = decode_token(raw)["jti"]
        rec = (await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))).scalar_one()
        rec.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db.commit()
        with pytest.raises(HTTPException) as ei:
            await svc.rotate_refresh_token(raw)
        assert ei.value.status_code == 401

    async def test_deleted_user_cannot_refresh(self, db, redis):
        u = await self._make_user(db)
        svc = AuthService(db, redis)
        raw = await svc.create_and_store_refresh_token(str(u.id))
        u.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        with pytest.raises(HTTPException) as ei:
            await svc.rotate_refresh_token(raw)
        assert ei.value.status_code == 401

    async def test_unknown_jti_rejected(self, db, redis):
        """A validly-signed refresh token whose jti isn't in the DB must 401."""
        u = await self._make_user(db)
        svc = AuthService(db, redis)
        raw, _jti = create_refresh_token(str(u.id))  # never stored
        with pytest.raises(HTTPException) as ei:
            await svc.rotate_refresh_token(raw)
        assert ei.value.status_code == 401

    async def test_revoke_then_rotate_fails(self, db, redis):
        u = await self._make_user(db)
        svc = AuthService(db, redis)
        raw = await svc.create_and_store_refresh_token(str(u.id))
        await svc.revoke_refresh_token(raw)  # logout
        with pytest.raises(HTTPException) as ei:
            await svc.rotate_refresh_token(raw)
        assert ei.value.status_code == 401

    async def test_revoke_garbage_token_is_silent(self, db, redis):
        """revoke is best-effort — a bad token must not raise."""
        svc = AuthService(db, redis)
        await svc.revoke_refresh_token("not-a-real-token")  # should not raise

"""Shared test fixtures — async DB session, FakeRedis, test user, HTTP client."""
import uuid
import pytest
import fakeredis.aioredis
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession


def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: mark test as async")


@pytest.fixture
def fake_redis():
    """In-memory Redis that behaves identically to the real client."""
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.fixture
def mock_db():
    """Minimal async DB session mock for unit tests."""
    session = AsyncMock(spec=AsyncSession)
    return session


@pytest.fixture
def mock_twilio(monkeypatch):
    """Prevent any real SMS from being sent during tests."""
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "")  # triggers dev-mode print path
    monkeypatch.setenv("TWILIO_AUTH_TOKEN",  "")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "")


@pytest.fixture
def mock_user():
    """A fake authenticated user suitable for dependency override."""
    from app.models.user import User, UserRole
    user = MagicMock(spec=User)
    user.id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    user.phone = "+919876543210"
    user.name = "Test User"
    user.email = "test@example.com"
    user.role = UserRole.user
    user.deleted_at = None
    return user


@pytest.fixture
def mock_admin_user():
    """A fake admin user for admin-role endpoint tests."""
    from app.models.user import User, UserRole
    user = MagicMock(spec=User)
    user.id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    user.phone = "+919999999999"
    user.name = "Admin User"
    user.role = UserRole.admin
    user.deleted_at = None
    return user


@pytest.fixture
async def app_client(fake_redis, mock_db, mock_user):
    """AsyncClient with mocked DB, Redis, and auth dependencies."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.database import get_async_db
    from app.core.redis import get_redis
    from app.core.security import get_current_user

    async def _override_db():
        yield mock_db

    async def _get_redis_for_lifespan():
        return fake_redis

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: mock_user

    with patch("app.main.get_redis_client", new=_get_redis_for_lifespan), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c

    app.dependency_overrides.clear()

"""Shared test fixtures — async DB session, FakeRedis, test user."""
import pytest
import fakeredis.aioredis
from unittest.mock import AsyncMock, MagicMock
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

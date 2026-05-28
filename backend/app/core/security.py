"""RS256 JWT handling and password utilities."""
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

ALGORITHM = "RS256"

# ── RSA key management ────────────────────────────────────────────────────────

_private_key_pem: str | None = None
_public_key_pem: str | None = None


def _load_keys() -> tuple[str, str]:
    """Load RS256 key pair from env vars, or auto-generate for development."""
    global _private_key_pem, _public_key_pem

    if _private_key_pem and _public_key_pem:
        return _private_key_pem, _public_key_pem

    if settings.JWT_PRIVATE_KEY and settings.JWT_PUBLIC_KEY:
        # Env vars store \n as literal backslash-n — expand them
        _private_key_pem = settings.JWT_PRIVATE_KEY.replace("\\n", "\n")
        _public_key_pem = settings.JWT_PUBLIC_KEY.replace("\\n", "\n")
        logger.info("JWT: loaded RS256 key pair from environment")
    else:
        if settings.is_production:
            raise RuntimeError(
                "JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production. "
                "Run scripts/generate_keys.py to create a key pair."
            )
        logger.warning(
            "JWT_PRIVATE_KEY not set — generating ephemeral RSA-2048 key pair "
            "for development. Do NOT use this in production."
        )
        private_key = rsa.generate_private_key(
            public_exponent=65537, key_size=2048, backend=default_backend()
        )
        _private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
        _public_key_pem = (
            private_key.public_key()
            .public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode()
        )

    return _private_key_pem, _public_key_pem


# ── Token creation ────────────────────────────────────────────────────────────


def create_access_token(subject: str, role: str) -> str:
    private_key, _ = _load_keys()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": subject,
        "role": role,
        "jti": str(uuid.uuid4()),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, private_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> tuple[str, str]:
    """Return (raw_token, jti). Store hash(raw_token) in DB, give raw_token to client."""
    private_key, _ = _load_keys()
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": subject,
        "jti": jti,
        "exp": expire,
        "type": "refresh",
    }
    raw_token = jwt.encode(payload, private_key, algorithm=ALGORITHM)
    return raw_token, jti


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT. Raises HTTPException on failure."""
    _, public_key = _load_keys()
    try:
        return jwt.decode(token, public_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ── Password / OTP helpers ────────────────────────────────────────────────────


def hash_secret(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_secret(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def generate_otp() -> str:
    """Generate a cryptographically random 6-digit OTP."""
    return str(secrets.randbelow(900_000) + 100_000)


def mask_phone(phone: str) -> str:
    """Mask phone for safe logging: +919876543210 → +9198****3210"""
    if len(phone) < 6:
        return "****"
    return phone[:5] + "****" + phone[-4:]


# ── FastAPI auth dependencies ─────────────────────────────────────────────────


def _db_dependency():
    from app.core.database import get_async_db  # deferred to avoid circular import at module load
    return Depends(get_async_db)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = _db_dependency(),
) -> Any:
    """Extract and validate the Bearer JWT; return the User ORM object."""
    from app.models.user import User  # local import to break circular dep

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id: str = payload.get("sub", "")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


def require_role(*roles: str):
    """Dependency factory: raise 403 if the current user's role isn't in `roles`."""

    async def _check(current_user: Any = Depends(get_current_user)) -> Any:
        if current_user.role.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _check


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = _db_dependency(),
) -> Any:
    """Like get_current_user but returns None instead of raising 401."""
    if credentials is None:
        return None
    try:
        from app.models.user import User  # local import to break circular dep

        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            return None
        user_id: str = payload.get("sub", "")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or user.deleted_at is not None:
            return None
        return user
    except HTTPException:
        return None

import logging

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import List

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────────
    PROJECT_NAME: str = "ZISUN Platform"
    API_V1_STR: str = "/api/v1"
    ADMIN_V1_STR: str = "/api/admin/v1"
    ENVIRONMENT: str = "development"  # development | staging | production

    # ── Security (RS256) ─────────────────────────────────────────────────────
    # PEM strings with literal \n in the .env file.
    # Left empty → ephemeral keys auto-generated at startup (dev only).
    JWT_PRIVATE_KEY: str = ""
    JWT_PUBLIC_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── CORS ─────────────────────────────────────────────────────────────────
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # ── Database ─────────────────────────────────────────────────────────────
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "zisun_db"
    POSTGRES_PORT: str = "5432"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Twilio ────────────────────────────────────────────────────────────────
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # ── WhatsApp Business API ─────────────────────────────────────────────────
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = ""
    # Alias used by webhook handler (falls back to WHATSAPP_WEBHOOK_VERIFY_TOKEN if not set)
    WHATSAPP_VERIFY_TOKEN: str = ""
    # HMAC secret for inbound webhook signature verification
    WHATSAPP_APP_SECRET: str = ""

    # ── Razorpay ─────────────────────────────────────────────────────────────
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # ── Cloudflare R2 ────────────────────────────────────────────────────────
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY: str = ""
    R2_SECRET_KEY: str = ""
    R2_BUCKET_NAME: str = "zisun-media"
    CLOUDFLARE_CDN_BASE_URL: str = ""

    # ── Shiprocket ────────────────────────────────────────────────────────────
    SHIPROCKET_EMAIL: str = ""
    SHIPROCKET_PASSWORD: str = ""

    # ── Sentry ────────────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_GLOBAL_PER_MINUTE: int = 100
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10
    OTP_MAX_GENERATIONS_PER_HOUR: int = 5
    OTP_MAX_FAILED_ATTEMPTS: int = 5
    OTP_LOCKOUT_SECONDS: int = 3600  # 1 hour

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            required = {
                "JWT_PRIVATE_KEY": self.JWT_PRIVATE_KEY,
                "JWT_PUBLIC_KEY": self.JWT_PUBLIC_KEY,
                "RAZORPAY_KEY_ID": self.RAZORPAY_KEY_ID,
                "RAZORPAY_KEY_SECRET": self.RAZORPAY_KEY_SECRET,
                "RAZORPAY_WEBHOOK_SECRET": self.RAZORPAY_WEBHOOK_SECRET,
                "TWILIO_ACCOUNT_SID": self.TWILIO_ACCOUNT_SID,
                "TWILIO_AUTH_TOKEN": self.TWILIO_AUTH_TOKEN,
                "TWILIO_FROM_NUMBER": self.TWILIO_FROM_NUMBER,
                "SENTRY_DSN": self.SENTRY_DSN,
                "POSTGRES_PASSWORD": self.POSTGRES_PASSWORD,
                "REDIS_URL": self.REDIS_URL,
                # Without these, storage.py hands out localhost:9000 upload URLs
                # and /media/... CDN paths that no product image ever reaches.
                "R2_ENDPOINT_URL": self.R2_ENDPOINT_URL,
                "R2_ACCESS_KEY": self.R2_ACCESS_KEY,
                "R2_SECRET_KEY": self.R2_SECRET_KEY,
                "R2_BUCKET_NAME": self.R2_BUCKET_NAME,
                "CLOUDFLARE_CDN_BASE_URL": self.CLOUDFLARE_CDN_BASE_URL,
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                raise ValueError(
                    f"Missing required production environment variables: {', '.join(missing)}"
                )
        return self

    def dev_fallback(self, feature: str) -> None:
        """Gate a code path that degrades to a no-op when a credential is absent.

        Development keeps its convenient stubs; production refuses them. The
        boot validator above should already have caught the missing value —
        this is the second line of defence for whatever slips past it (a secret
        unset after boot, a new credential nobody added to `required`). Failing
        here costs one 500; not failing here ships goods against an unverified
        payment signature.
        """
        if self.is_production:
            raise RuntimeError(
                f"{feature} is not configured, but ENVIRONMENT=production. "
                "Refusing to fall back to development behaviour — set the "
                "missing variable (see DEPLOYMENT.md) and redeploy."
            )
        logger.warning("DEV MODE — %s is not configured", feature)

    @property
    def sync_database_uri(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def async_database_uri(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()

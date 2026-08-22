import logging
from urllib.parse import quote_plus

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
    # "" (normal) | "browse". Browse-only is the pre-launch storefront: the
    # catalogue is fully public, and every path that would create an order is
    # closed server-side. It exists so a storefront can go live before the
    # payment gateway's KYC clears, instead of the whole site waiting on it.
    #
    # It relaxes exactly the boot requirements whose features it disables —
    # RAZORPAY_* (no checkout) and TWILIO_* (no OTP login to send). R2_*,
    # CLOUDFLARE_CDN_BASE_URL, JWT_* and the datastore credentials stay
    # required: browsing needs all of them, and a browse-only launch with
    # broken product images is not a launch.
    #
    # Removing this one variable restores the full fail-closed behaviour. No
    # Razorpay or Twilio code is deleted or bypassed — the paths are refused,
    # not stubbed, so there is no mock order to clean up on the way back.
    LAUNCH_MODE: str = ""

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
    # Set to 1 when POSTGRES_SERVER is a TRANSACTION-mode pooler (PgBouncer,
    # Supabase Supavisor on :6543). Such a pooler hands a different backend
    # connection to each statement, so a prepared statement created on one is
    # missing on the next — asyncpg then fails with
    # `prepared statement "__asyncpg_stmt_1__" does not exist`, intermittently
    # and only under concurrency. Disables statement caching to suit.
    # Leave 0 for a direct connection or SESSION-mode pooling (:5432), where
    # caching is both safe and a meaningful speed-up.
    DB_PGBOUNCER_MODE: int = 0

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Twilio ────────────────────────────────────────────────────────────────
    # Authenticate with EITHER an API key (SK... + secret, preferred: scoped and
    # revocable without rotating everything) OR the account's auth token.
    # TWILIO_ACCOUNT_SID (AC...) is required either way — an API key identifies
    # the credential, not the account it acts on.
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_API_KEY_SID: str = ""
    TWILIO_API_KEY_SECRET: str = ""
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
    # Cash-on-delivery only. Set to 1 to launch before Razorpay KYC clears:
    # online payment is hidden at checkout and the RAZORPAY_* credentials stop
    # being required to boot. Unset it (or set 0) and the full fail-closed
    # behaviour returns — no Razorpay code is removed or bypassed, so this is a
    # one-variable round trip in either direction.
    PAYMENTS_COD_ONLY: int = 0

    # ── Cloudflare R2 ────────────────────────────────────────────────────────
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY: str = ""
    R2_SECRET_KEY: str = ""
    R2_BUCKET_NAME: str = "zisun-media"
    CLOUDFLARE_CDN_BASE_URL: str = ""

    # ── Shiprocket ────────────────────────────────────────────────────────────
    SHIPROCKET_EMAIL: str = ""
    SHIPROCKET_PASSWORD: str = ""
    # Origin pincode for serviceability and rate lookups. Defaults to the
    # registered business address in Bengaluru; override if dispatch moves.
    SHIPROCKET_PICKUP_PINCODE: str = "560094"
    # Courier serviceability is cached, but the two halves age differently.
    # Prepaid coverage is stable. The per-pincode COD flag is not: couriers
    # suspend COD to a pincode intraday when RTO spikes there, so a day-old
    # "COD available" is a day of orders taken against a courier that will not
    # collect. Six hours is the compromise the research settled on.
    SERVICEABILITY_CACHE_SECONDS: int = 86400
    SERVICEABILITY_COD_CACHE_SECONDS: int = 21600

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
            # Twilio only sends the login OTP. Browse-only has no login, so
            # demanding the credentials would deadlock the launch on a second
            # vendor's onboarding for a feature nobody can reach.
            if not self.is_browse_only:
                missing += [
                    k for k, v in {
                        "TWILIO_ACCOUNT_SID": self.TWILIO_ACCOUNT_SID,
                        "TWILIO_FROM_NUMBER": self.TWILIO_FROM_NUMBER,
                    }.items() if not v
                ]
                # Either auth style is acceptable, so neither can be checked flatly.
                if not self.has_twilio_auth:
                    missing.append(
                        "TWILIO_AUTH_TOKEN (or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)"
                    )
            # Razorpay is required only when online payment can actually be
            # selected. Under PAYMENTS_COD_ONLY no checkout path reaches the
            # gateway, so demanding live keys would block launch on KYC alone.
            if not (self.PAYMENTS_COD_ONLY or self.is_browse_only):
                missing += [
                    k for k, v in {
                        "RAZORPAY_KEY_ID": self.RAZORPAY_KEY_ID,
                        "RAZORPAY_KEY_SECRET": self.RAZORPAY_KEY_SECRET,
                        "RAZORPAY_WEBHOOK_SECRET": self.RAZORPAY_WEBHOOK_SECRET,
                    }.items() if not v
                ]
            if missing:
                raise ValueError(
                    f"Missing required production environment variables: {', '.join(missing)}"
                )
            # Sentry is observability, not a dependency of taking money. A
            # missing DSN must never be the reason a storefront is offline.
            if not self.SENTRY_DSN:
                logger.warning(
                    "SENTRY_DSN is not set — running in production with no error "
                    "tracking. Crashes will surface only in container logs."
                )
            if self.is_browse_only:
                logger.warning(
                    "LAUNCH_MODE=browse — checkout is DISABLED server-side and "
                    "RAZORPAY_*/TWILIO_* are not enforced. The catalogue is "
                    "public; no order can be created. Unset LAUNCH_MODE to "
                    "restore the full storefront."
                )
            if self.PAYMENTS_COD_ONLY:
                logger.warning(
                    "PAYMENTS_COD_ONLY=1 — online payment is DISABLED and Razorpay "
                    "credentials are not enforced. Unset it once KYC is approved."
                )
        return self

    @property
    def is_browse_only(self) -> bool:
        """True when the storefront is live but no order may be created."""
        return self.LAUNCH_MODE.strip().lower() == "browse"

    @property
    def checkout_enabled(self) -> bool:
        return not self.is_browse_only

    @property
    def has_twilio_auth(self) -> bool:
        """True when Twilio can be authenticated by either supported method."""
        return bool(
            self.TWILIO_AUTH_TOKEN
            or (self.TWILIO_API_KEY_SID and self.TWILIO_API_KEY_SECRET)
        )

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
    def _db_credentials(self) -> str:
        """`user:password`, percent-encoded for safe URI interpolation.

        Managed Postgres providers generate passwords containing `@`, `/`, `:`
        and `#`. Interpolated raw, a password like `Zisun@020422` makes
        SQLAlchemy parse the password as `Zisun` and the host as
        `020422@db.example.com` — the connection then fails with a DNS error
        naming a host nobody configured, which is a miserable thing to debug.
        """
        return f"{quote_plus(self.POSTGRES_USER)}:{quote_plus(self.POSTGRES_PASSWORD)}"

    @property
    def sync_database_uri(self) -> str:
        return (
            f"postgresql://{self._db_credentials}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def async_database_uri(self) -> str:
        return (
            f"postgresql+asyncpg://{self._db_credentials}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()

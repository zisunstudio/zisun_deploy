"""Production must never fall back to dev-mode stubs.

Two layers are tested here:
  1. Boot — Settings() refuses to construct when a production secret is absent.
  2. Runtime — every code path that no-ops on a missing credential raises
     instead when ENVIRONMENT=production, so a secret that goes missing after
     boot can't quietly wave a payment through or 404 every product image.
"""
import pytest

from app.core.config import Settings


PROD_ENV = {
    "ENVIRONMENT": "production",
    "JWT_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----x",
    "JWT_PUBLIC_KEY": "-----BEGIN PUBLIC KEY-----x",
    "RAZORPAY_KEY_ID": "rzp_live_x",
    "RAZORPAY_KEY_SECRET": "secret_x",
    "RAZORPAY_WEBHOOK_SECRET": "whsec_x",
    "TWILIO_ACCOUNT_SID": "AC_x",
    "TWILIO_AUTH_TOKEN": "tok_x",
    "TWILIO_FROM_NUMBER": "+15550000000",
    "SENTRY_DSN": "https://x@sentry.io/1",
    "POSTGRES_PASSWORD": "pw_x",
    "REDIS_URL": "rediss://x",
    "R2_ENDPOINT_URL": "https://x.r2.cloudflarestorage.com",
    "R2_ACCESS_KEY": "ak_x",
    "R2_SECRET_KEY": "sk_x",
    "R2_BUCKET_NAME": "zisun-media",
    "CLOUDFLARE_CDN_BASE_URL": "https://cdn.zisun.in",
}


def _settings(monkeypatch, **overrides) -> Settings:
    """Build Settings from a full production env with `overrides` applied."""
    for key, value in {**PROD_ENV, **overrides}.items():
        monkeypatch.setenv(key, value)
    # _env_file would otherwise reintroduce values we deliberately blanked.
    return Settings(_env_file=None)


class TestBootValidation:
    def test_full_production_env_boots(self, monkeypatch):
        assert _settings(monkeypatch).is_production is True

    @pytest.mark.parametrize(
        "missing",
        [
            "RAZORPAY_KEY_ID",
            "RAZORPAY_KEY_SECRET",
            "RAZORPAY_WEBHOOK_SECRET",
            "R2_ENDPOINT_URL",
            "R2_ACCESS_KEY",
            "R2_SECRET_KEY",
            "R2_BUCKET_NAME",
            "CLOUDFLARE_CDN_BASE_URL",
        ],
    )
    def test_missing_secret_refuses_to_boot(self, monkeypatch, missing):
        with pytest.raises(Exception) as exc:
            _settings(monkeypatch, **{missing: ""})
        assert missing in str(exc.value)

    def test_development_tolerates_empty_secrets(self, monkeypatch):
        s = _settings(monkeypatch, ENVIRONMENT="development", RAZORPAY_KEY_SECRET="", R2_ACCESS_KEY="")
        assert s.is_production is False


class TestDevFallbackGuard:
    def test_raises_in_production(self, monkeypatch):
        s = _settings(monkeypatch)
        with pytest.raises(RuntimeError, match="ENVIRONMENT=production"):
            s.dev_fallback("Razorpay payment signature verification")

    def test_permits_in_development(self, monkeypatch):
        s = _settings(monkeypatch, ENVIRONMENT="development")
        assert s.dev_fallback("anything") is None


class TestPaymentSignatureFailsClosed:
    """An empty RAZORPAY_KEY_SECRET in prod must not verify every payment."""

    def test_prod_missing_secret_raises(self, monkeypatch):
        from app.api.endpoints import checkout

        monkeypatch.setattr(
            checkout, "settings", _settings(monkeypatch, RAZORPAY_KEY_SECRET="")
        )
        with pytest.raises(RuntimeError):
            checkout._verify_payment_signature("order_x", "pay_x", "forged")

    def test_dev_missing_secret_still_skips(self, monkeypatch):
        from app.api.endpoints import checkout

        monkeypatch.setattr(
            checkout,
            "settings",
            _settings(monkeypatch, ENVIRONMENT="development", RAZORPAY_KEY_SECRET=""),
        )
        assert checkout._verify_payment_signature("order_x", "pay_x", "anything") is True


class TestWebhookSignatureFailsClosed:
    def test_prod_missing_webhook_secret_raises(self, monkeypatch):
        from app.api.endpoints import orders

        monkeypatch.setattr(
            orders, "settings", _settings(monkeypatch, RAZORPAY_WEBHOOK_SECRET="")
        )
        with pytest.raises(RuntimeError):
            orders.verify_razorpay_signature(b'{"event":"payment.captured"}', "forged")

    def test_dev_missing_webhook_secret_still_skips(self, monkeypatch):
        from app.api.endpoints import orders

        monkeypatch.setattr(
            orders,
            "settings",
            _settings(monkeypatch, ENVIRONMENT="development", RAZORPAY_WEBHOOK_SECRET=""),
        )
        assert orders.verify_razorpay_signature(b"{}", "anything") is True


class TestR2FailsClosed:
    def test_prod_missing_key_raises_on_upload(self, monkeypatch):
        from app.core import storage

        monkeypatch.setattr(storage, "settings", _settings(monkeypatch, R2_ACCESS_KEY=""))
        with pytest.raises(RuntimeError):
            storage.generate_upload_presigned_url("media/x.jpg", "image/jpeg")

    def test_prod_missing_key_raises_on_delete(self, monkeypatch):
        from app.core import storage

        monkeypatch.setattr(storage, "settings", _settings(monkeypatch, R2_ACCESS_KEY=""))
        with pytest.raises(RuntimeError):
            storage.delete_r2_object("media/x.jpg")

    def test_dev_returns_placeholder_urls(self, monkeypatch):
        from app.core import storage

        monkeypatch.setattr(
            storage,
            "settings",
            _settings(monkeypatch, ENVIRONMENT="development", R2_ACCESS_KEY=""),
        )
        out = storage.generate_upload_presigned_url("media/x.jpg", "image/jpeg")
        assert out["cdn_url"] == "/media/media/x.jpg"


class TestDatabaseUriEncoding:
    """Managed providers hand out passwords with URI-significant characters."""

    def test_at_sign_in_password_does_not_corrupt_host(self, monkeypatch):
        s = _settings(
            monkeypatch,
            POSTGRES_USER="postgres",
            POSTGRES_PASSWORD="Zisun@020422",
            POSTGRES_SERVER="db.example.supabase.co",
            POSTGRES_PORT="5432",
            POSTGRES_DB="postgres",
        )
        for uri in (s.sync_database_uri, s.async_database_uri):
            assert "Zisun%40020422" in uri
            # The raw form would yield host `020422@db.example.supabase.co`.
            assert uri.endswith("@db.example.supabase.co:5432/postgres")

    def test_sqlalchemy_parses_the_encoded_uri_back(self, monkeypatch):
        sa = pytest.importorskip("sqlalchemy")
        s = _settings(
            monkeypatch,
            POSTGRES_USER="postgres",
            POSTGRES_PASSWORD="p@ss/w:rd#1",
            POSTGRES_SERVER="db.example.supabase.co",
        )
        url = sa.engine.make_url(s.sync_database_uri)
        assert url.host == "db.example.supabase.co"
        assert url.password == "p@ss/w:rd#1"


class TestCeleryRedisTLS:
    """Celery raises at import on a rediss:// URL lacking ssl_cert_reqs."""

    def _url(self, monkeypatch, redis_url):
        from app import celery_app as mod

        monkeypatch.setattr(mod.settings, "REDIS_URL", redis_url, raising=False)
        return mod._redis_url()

    def test_tls_url_gets_cert_requirement(self, monkeypatch):
        url = self._url(monkeypatch, "rediss://default:pw@x.upstash.io:6379")
        assert url.endswith("?ssl_cert_reqs=required")

    def test_existing_query_string_is_preserved(self, monkeypatch):
        url = self._url(monkeypatch, "rediss://default:pw@x.upstash.io:6379/0?foo=1")
        assert url == "rediss://default:pw@x.upstash.io:6379/0?foo=1&ssl_cert_reqs=required"

    def test_explicit_setting_is_not_overridden(self, monkeypatch):
        given = "rediss://default:pw@x.upstash.io:6379?ssl_cert_reqs=none"
        assert self._url(monkeypatch, given) == given

    def test_plaintext_url_untouched(self, monkeypatch):
        given = "redis://redis.railway.internal:6379/0"
        assert self._url(monkeypatch, given) == given


class TestTwilioAuthStyles:
    """An API key (SK...) and the account auth token are not interchangeable."""

    def test_api_key_alone_satisfies_boot(self, monkeypatch):
        s = _settings(
            monkeypatch,
            TWILIO_AUTH_TOKEN="",
            TWILIO_API_KEY_SID="SK00000000000000000000000000000000",
            TWILIO_API_KEY_SECRET="secret_x",
        )
        assert s.has_twilio_auth is True

    def test_auth_token_alone_satisfies_boot(self, monkeypatch):
        s = _settings(monkeypatch, TWILIO_API_KEY_SID="", TWILIO_API_KEY_SECRET="")
        assert s.has_twilio_auth is True

    def test_api_key_sid_without_secret_is_rejected(self, monkeypatch):
        with pytest.raises(Exception, match="TWILIO_AUTH_TOKEN"):
            _settings(
                monkeypatch,
                TWILIO_AUTH_TOKEN="",
                TWILIO_API_KEY_SID="SK00000000000000000000000000000000",
                TWILIO_API_KEY_SECRET="",
            )

    def test_neither_credential_refuses_to_boot(self, monkeypatch):
        with pytest.raises(Exception, match="TWILIO_AUTH_TOKEN"):
            _settings(monkeypatch, TWILIO_AUTH_TOKEN="", TWILIO_API_KEY_SID="", TWILIO_API_KEY_SECRET="")

    def test_api_key_uses_three_argument_client(self, monkeypatch):
        """Two-arg form with an SK key would target /Accounts/SK.../Messages."""
        import sys, types
        from app.core import twilio as mod

        captured = {}

        class _FakeClient:
            def __init__(self, *args):
                captured["args"] = args

        fake = types.ModuleType("twilio.rest")
        fake.Client = _FakeClient
        monkeypatch.setitem(sys.modules, "twilio", types.ModuleType("twilio"))
        monkeypatch.setitem(sys.modules, "twilio.rest", fake)

        monkeypatch.setattr(mod, "settings", _settings(
            monkeypatch,
            TWILIO_ACCOUNT_SID="ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            TWILIO_AUTH_TOKEN="",
            TWILIO_API_KEY_SID="SK00000000000000000000000000000000",
            TWILIO_API_KEY_SECRET="secret_x",
        ))
        mod.get_twilio_client()
        assert captured["args"] == (
            "SK00000000000000000000000000000000", "secret_x",
            "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )


class TestCodOnlyMode:
    """Razorpay KYC must not be able to hold the whole storefront offline."""

    def _no_razorpay(self):
        return {"RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": "", "RAZORPAY_WEBHOOK_SECRET": ""}

    def test_cod_only_boots_without_razorpay(self, monkeypatch):
        s = _settings(monkeypatch, PAYMENTS_COD_ONLY="1", **self._no_razorpay())
        assert s.PAYMENTS_COD_ONLY == 1

    def test_razorpay_still_required_when_cod_only_is_off(self, monkeypatch):
        with pytest.raises(Exception, match="RAZORPAY_KEY_ID"):
            _settings(monkeypatch, PAYMENTS_COD_ONLY="0", **self._no_razorpay())

    def test_missing_sentry_dsn_no_longer_blocks_boot(self, monkeypatch):
        """Error tracking must never gate revenue."""
        s = _settings(monkeypatch, SENTRY_DSN="")
        assert s.SENTRY_DSN == ""
        assert s.is_production is True

    def test_cod_only_does_not_relax_other_guards(self, monkeypatch):
        with pytest.raises(Exception, match="R2_ACCESS_KEY"):
            _settings(monkeypatch, PAYMENTS_COD_ONLY="1", R2_ACCESS_KEY="", **self._no_razorpay())


class TestPgBouncerMode:
    def test_disabled_by_default(self, monkeypatch):
        assert _settings(monkeypatch).DB_PGBOUNCER_MODE == 0

    def test_connect_args_empty_when_off(self, monkeypatch):
        from app.core import database as db
        monkeypatch.setattr(db, "settings", _settings(monkeypatch, DB_PGBOUNCER_MODE="0"))
        assert db._async_connect_args() == {}

    def test_both_caches_disabled_in_pooler_mode(self, monkeypatch):
        from app.core import database as db
        monkeypatch.setattr(db, "settings", _settings(monkeypatch, DB_PGBOUNCER_MODE="1"))
        args = db._async_connect_args()
        assert args["statement_cache_size"] == 0
        assert args["prepared_statement_cache_size"] == 0


class TestBrowseOnlyLaunchMode:
    """A storefront must be able to go live before its payment gateway does.

    Browse-only is the pre-launch state: catalogue public, ordering closed. It
    relaxes only the credentials whose features it switches off, and it reverts
    by deleting one variable.
    """

    def _no_gateways(self):
        return {
            "RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": "", "RAZORPAY_WEBHOOK_SECRET": "",
            "TWILIO_ACCOUNT_SID": "", "TWILIO_AUTH_TOKEN": "", "TWILIO_FROM_NUMBER": "",
            "SENTRY_DSN": "",
        }

    def test_boots_with_no_payment_or_sms_vendor(self, monkeypatch):
        s = _settings(monkeypatch, LAUNCH_MODE="browse", **self._no_gateways())
        assert s.is_browse_only is True
        assert s.checkout_enabled is False

    def test_same_env_without_the_flag_refuses_to_boot(self, monkeypatch):
        """The one-variable round trip: removing it restores fail-closed."""
        with pytest.raises(Exception) as exc:
            _settings(monkeypatch, **self._no_gateways())
        assert "RAZORPAY_KEY_ID" in str(exc.value)
        assert "TWILIO_ACCOUNT_SID" in str(exc.value)

    @pytest.mark.parametrize(
        "missing",
        ["R2_ACCESS_KEY", "CLOUDFLARE_CDN_BASE_URL", "JWT_PRIVATE_KEY", "POSTGRES_PASSWORD"],
    )
    def test_does_not_relax_what_browsing_needs(self, monkeypatch, missing):
        with pytest.raises(Exception, match=missing):
            _settings(monkeypatch, LAUNCH_MODE="browse", **{missing: ""}, **self._no_gateways())

    @pytest.mark.parametrize("value", ["", "soon", "preview", "BROWSE-ONLY"])
    def test_only_the_exact_value_opens_the_relaxation(self, monkeypatch, value):
        """A typo must fail closed, not silently launch with checkout half-off."""
        with pytest.raises(Exception, match="RAZORPAY_KEY_ID"):
            _settings(monkeypatch, LAUNCH_MODE=value, **self._no_gateways())

    @pytest.mark.parametrize("value", ["browse", "BROWSE", " Browse "])
    def test_value_is_case_and_whitespace_tolerant(self, monkeypatch, value):
        assert _settings(monkeypatch, LAUNCH_MODE=value, **self._no_gateways()).is_browse_only


class TestBrowseOnlyRefusesToCreateOrders:
    """Hiding the button is presentation. This is the rule."""

    @pytest.mark.asyncio
    async def test_route_dependency_returns_503(self, monkeypatch):
        from fastapi import HTTPException
        from app.core import launch

        monkeypatch.setattr(launch, "settings", _settings(monkeypatch, LAUNCH_MODE="browse"))
        with pytest.raises(HTTPException) as exc:
            await launch.require_checkout_enabled()
        assert exc.value.status_code == 503
        assert "WhatsApp" in exc.value.detail

    @pytest.mark.asyncio
    async def test_route_dependency_passes_when_checkout_is_open(self, monkeypatch):
        from app.core import launch

        monkeypatch.setattr(launch, "settings", _settings(monkeypatch))
        assert await launch.require_checkout_enabled() is None

    @pytest.mark.asyncio
    async def test_service_refuses_even_when_the_dependency_is_bypassed(self, monkeypatch):
        """Callers that are not HTTP routes must hit the same wall."""
        from fastapi import HTTPException
        from app.core import config as config_mod
        from app.services.checkout import CheckoutService

        browse = _settings(monkeypatch, LAUNCH_MODE="browse")
        monkeypatch.setattr(config_mod, "settings", browse)

        svc = CheckoutService(db=None)
        with pytest.raises(HTTPException) as exc:
            await svc.initiate_checkout(user_id=None, address_id=None)
        assert exc.value.status_code == 503

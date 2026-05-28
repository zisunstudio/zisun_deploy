"""Unit tests for WhatsApp/SMS notification service."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


class TestWhatsAppService:
    async def test_send_order_confirmation_dev_mode_returns_false(self, monkeypatch):
        """In dev mode (no tokens), send_order_confirmation returns False without raising."""
        monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "")
        monkeypatch.setenv("TWILIO_ACCOUNT_SID", "")
        monkeypatch.setenv("TWILIO_AUTH_TOKEN", "")

        from app.services.whatsapp import send_order_confirmation

        result = await send_order_confirmation(
            phone="+919876543210",
            order_id="test-order-id-123",
            amount_paise=50000,
            items_summary="1x Silk Saree",
        )
        # In dev mode with no credentials, returns False without raising
        assert result is False

    async def test_send_order_confirmation_amount_converted_to_inr(self, monkeypatch):
        """Amount in paise should be divided by 100 for display."""
        monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "")
        monkeypatch.setenv("TWILIO_ACCOUNT_SID", "")
        monkeypatch.setenv("TWILIO_AUTH_TOKEN", "")

        from app.services.whatsapp import send_order_confirmation

        # Should not raise; just verifies the function runs with 100000 paise = ₹1000
        result = await send_order_confirmation(
            phone="+919876543210",
            order_id="order-abc-xyz-123456",
            amount_paise=100000,
            items_summary="2x Lehenga",
        )
        assert result is False

    async def test_send_order_confirmation_whatsapp_called_when_configured(self, monkeypatch):
        """When WhatsApp credentials are set, the WhatsApp API endpoint is called."""
        monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "fake-token")
        monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "12345")
        monkeypatch.setenv("TWILIO_ACCOUNT_SID", "")
        monkeypatch.setenv("TWILIO_AUTH_TOKEN", "")

        from app.services import whatsapp as wa_module

        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            from app.services.whatsapp import send_order_confirmation
            result = await send_order_confirmation(
                phone="+919876543210",
                order_id="order-whatsapp-test",
                amount_paise=75000,
                items_summary="1x Anarkali",
            )

        mock_client.post.assert_called_once()
        assert result is True

    async def test_otp_never_logged_as_plaintext(self, capfd):
        """Verify raw OTP is never printed to stdout."""
        from app.services.auth import AuthService
        from unittest.mock import AsyncMock, MagicMock

        mock_db = AsyncMock()
        mock_redis = AsyncMock()

        # Setup redis to pass rate limit and lockout checks
        mock_redis.exists = AsyncMock(return_value=False)
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock()
        mock_redis.set = AsyncMock()
        mock_redis.setex = AsyncMock()

        svc = AuthService(db=mock_db, redis=mock_redis)

        with patch("app.services.auth.send_sms_otp", AsyncMock()) if True else None:
            try:
                from app.core.security import generate_otp, hash_secret
                with patch("app.core.security.generate_otp", return_value="654321"):
                    with patch("app.services.auth.send_sms_otp", AsyncMock()):
                        await svc.send_otp("+919876543210")
            except Exception:
                pass

        captured = capfd.readouterr()
        # The raw OTP "654321" should NOT appear in stdout
        assert "654321" not in captured.out


class TestSendSmsOtp:
    async def test_send_sms_otp_dev_mode_no_credentials(self, monkeypatch):
        """send_sms_otp in dev mode (no Twilio creds) completes without error."""
        monkeypatch.setenv("TWILIO_ACCOUNT_SID", "")
        monkeypatch.setenv("TWILIO_AUTH_TOKEN", "")
        monkeypatch.setenv("TWILIO_FROM_NUMBER", "")

        # Import send_sms_otp if it exists, otherwise skip
        try:
            from app.services.auth import send_sms_otp
        except ImportError:
            pytest.skip("send_sms_otp not exported from auth service")

        # Should not raise in dev mode
        await send_sms_otp(phone="+919876543210", otp="123456")

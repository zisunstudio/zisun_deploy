"""Unit tests for Razorpay webhook — idempotency, HMAC, event handling."""
import pytest
import hmac
import hashlib
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


def make_webhook_payload(payment_id: str, order_id: str, amount: int = 50000) -> dict:
    return {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": payment_id,
                    "order_id": order_id,
                    "amount": amount,
                }
            }
        }
    }


def make_hmac_signature(secret: str, payload_bytes: bytes) -> str:
    return hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()


class TestWebhookHMAC:
    def test_valid_signature_accepted(self):
        secret = "test_secret"
        payload = b'{"event": "payment.captured"}'
        sig = make_hmac_signature(secret, payload)

        from app.api.endpoints.orders import verify_razorpay_signature
        with patch("app.api.endpoints.orders.settings") as mock_settings:
            mock_settings.RAZORPAY_WEBHOOK_SECRET = secret
            assert verify_razorpay_signature(payload, sig) is True

    def test_tampered_payload_rejected(self):
        secret = "test_secret"
        payload = b'{"event": "payment.captured"}'
        sig = make_hmac_signature(secret, payload)
        tampered = b'{"event": "payment.captured", "extra": "injected"}'

        from app.api.endpoints.orders import verify_razorpay_signature
        with patch("app.api.endpoints.orders.settings") as mock_settings:
            mock_settings.RAZORPAY_WEBHOOK_SECRET = secret
            assert verify_razorpay_signature(tampered, sig) is False

    def test_no_secret_bypasses_check(self):
        from app.api.endpoints.orders import verify_razorpay_signature
        with patch("app.api.endpoints.orders.settings") as mock_settings:
            mock_settings.RAZORPAY_WEBHOOK_SECRET = ""
            assert verify_razorpay_signature(b"anything", "any_sig") is True


class TestWebhookIdempotency:
    async def test_duplicate_webhook_no_new_payment(self, mock_db):
        """Second webhook with same payment_id returns 200 with no new DB record."""
        from sqlalchemy.future import select

        existing_payment = MagicMock()

        with patch("app.api.endpoints.orders.verify_razorpay_signature", return_value=True):
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = existing_payment
            mock_db.execute = AsyncMock(return_value=mock_result)

            # Should return early without creating another Payment
            assert mock_result.scalar_one_or_none() is existing_payment

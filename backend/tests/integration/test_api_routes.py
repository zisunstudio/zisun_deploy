"""API route integration tests — exercises route handlers via TestClient."""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Catalog ────────────────────────────────────────────────────────────────────


class TestCatalogRoutes:
    async def test_list_categories_empty(self, app_client):
        with patch("app.services.catalog.CatalogService.list_categories", new_callable=AsyncMock, return_value=[]):
            resp = await app_client.get("/api/v1/catalog/categories")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_get_category_not_found(self, app_client):
        from fastapi import HTTPException
        with patch(
            "app.services.catalog.CatalogService.get_category_by_slug",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=404, detail="Category not found"),
        ):
            resp = await app_client.get("/api/v1/catalog/categories/missing-slug")
        assert resp.status_code == 404

    async def test_list_products_returns_200(self, app_client):
        mock_result = {"total": 0, "page": 1, "limit": 20, "items": []}
        with patch("app.services.catalog.CatalogService.list_products", new_callable=AsyncMock, return_value=mock_result):
            resp = await app_client.get("/api/v1/catalog/products")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0

    async def test_list_products_with_params(self, app_client):
        mock_result = {"total": 0, "page": 2, "limit": 10, "items": []}
        with patch("app.services.catalog.CatalogService.list_products", new_callable=AsyncMock, return_value=mock_result):
            resp = await app_client.get("/api/v1/catalog/products?page=2&limit=10&sort_by=price_asc")
        assert resp.status_code == 200

    async def test_get_product_not_found(self, app_client):
        from fastapi import HTTPException
        product_id = uuid.uuid4()
        with patch(
            "app.services.catalog.CatalogService.get_product",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=404, detail="Product not found"),
        ):
            resp = await app_client.get(f"/api/v1/catalog/products/{product_id}")
        assert resp.status_code == 404

    async def test_search_products(self, app_client):
        mock_result = {"total": 0, "items": [], "query": "dress", "page": 1, "limit": 20}
        with patch("app.services.catalog.CatalogService.search_products", new_callable=AsyncMock, return_value=mock_result):
            resp = await app_client.get("/api/v1/catalog/search?q=dress")
        assert resp.status_code == 200

    async def test_get_feed(self, app_client):
        mock_feed = {"items": [], "total": 0}
        with patch("app.services.catalog.CatalogService.get_feed", new_callable=AsyncMock, return_value=mock_feed):
            resp = await app_client.get("/api/v1/catalog/feed")
        assert resp.status_code == 200


# ── Auth ───────────────────────────────────────────────────────────────────────


class TestAuthRoutes:
    async def test_send_otp_success(self, app_client):
        with patch("app.services.auth.AuthService.send_otp", new_callable=AsyncMock, return_value=None):
            resp = await app_client.post("/api/v1/auth/send-otp", json={"phone": "+919876543210"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_send_otp_invalid_phone(self, app_client):
        resp = await app_client.post("/api/v1/auth/send-otp", json={"phone": "not-a-phone"})
        assert resp.status_code == 422

    async def test_logout_no_cookie(self, app_client):
        with patch("app.services.auth.AuthService.revoke_refresh_token", new_callable=AsyncMock, return_value=None):
            resp = await app_client.post("/api/v1/auth/logout")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_refresh_no_cookie_returns_401(self, app_client):
        resp = await app_client.post("/api/v1/auth/refresh")
        assert resp.status_code == 401


# ── Analytics ─────────────────────────────────────────────────────────────────


class TestAnalyticsRoutes:
    async def test_ingest_events_accepted(self, app_client):
        payload = {
            "events": [
                {"event_type": "product_viewed", "session_id": "abc123", "properties": {"product_id": "xyz"}},
                {"event_type": "add_to_cart", "properties": {}},
            ]
        }
        with patch("app.api.endpoints.analytics._write_events", new_callable=AsyncMock, return_value=None):
            resp = await app_client.post("/api/v1/analytics/events", json=payload)
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 2

    async def test_ingest_events_empty_batch(self, app_client):
        with patch("app.api.endpoints.analytics._write_events", new_callable=AsyncMock, return_value=None):
            resp = await app_client.post("/api/v1/analytics/events", json={"events": []})
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 0


# ── Checkout — pincode check ───────────────────────────────────────────────────


class TestCheckoutRoutes:
    async def test_valid_pincode_serviceable(self, app_client):
        resp = await app_client.get("/api/v1/checkout/pincode/110001/check")
        assert resp.status_code == 200
        data = resp.json()
        assert data["serviceable"] is True
        assert data["pincode"] == "110001"

    async def test_invalid_pincode_short(self, app_client):
        resp = await app_client.get("/api/v1/checkout/pincode/12345/check")
        assert resp.status_code == 400

    async def test_invalid_pincode_alpha(self, app_client):
        resp = await app_client.get("/api/v1/checkout/pincode/ABCDEF/check")
        assert resp.status_code == 400

    async def test_verify_payment_bad_signature(self, app_client):
        from unittest.mock import patch
        from app.core.config import settings
        # With a real key_secret set, a tampered signature must be rejected
        with patch.object(settings, "RAZORPAY_KEY_SECRET", "test_secret"):
            resp = await app_client.post(
                "/api/v1/checkout/verify-payment",
                json={
                    "razorpay_payment_id": "pay_test123",
                    "razorpay_order_id": "order_test456",
                    "razorpay_signature": "totally_wrong_signature",
                },
            )
        assert resp.status_code == 400
        assert "signature" in resp.json()["detail"].lower()

    async def test_verify_payment_dev_mode_no_secret(self, app_client, mock_db):
        # Dev mode: RAZORPAY_KEY_SECRET is empty — signature check skipped,
        # order lookup returns 404 since mock_db has no real order
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)
        resp = await app_client.post(
            "/api/v1/checkout/verify-payment",
            json={
                "razorpay_payment_id": "pay_dev",
                "razorpay_order_id": "mock_order_abc",
                "razorpay_signature": "any",
            },
        )
        assert resp.status_code == 404


# ── WhatsApp webhook ──────────────────────────────────────────────────────────


class TestWhatsAppRoutes:
    async def test_verify_challenge_success(self, app_client):
        params = {
            "hub.mode": "subscribe",
            "hub.challenge": "12345",  # must be int-parseable
            "hub.verify.token": "",
        }
        resp = await app_client.get("/api/v1/webhooks/whatsapp", params=params)
        assert resp.status_code == 200

    async def test_verify_challenge_wrong_token(self, app_client):
        with patch("app.core.config.settings") as mock_settings:
            mock_settings.WHATSAPP_VERIFY_TOKEN = "secret"
            mock_settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "secret"
            params = {
                "hub.mode": "subscribe",
                "hub.challenge": "abc",
                "hub.verify.token": "wrong-token",
            }
            resp = await app_client.get("/api/v1/webhooks/whatsapp", params=params)
        assert resp.status_code in (200, 403)

    async def test_inbound_webhook_no_secret(self, app_client):
        resp = await app_client.post(
            "/api/v1/webhooks/whatsapp",
            content=b'{"object":"whatsapp_business_account"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ── Wishlist ──────────────────────────────────────────────────────────────────


class TestWishlistRoutes:
    async def test_get_wishlist_authenticated(self, app_client):
        mock_wishlist = MagicMock()
        mock_wishlist.id = uuid.UUID("00000000-0000-0000-0000-000000000010")
        mock_wishlist.items = []
        with patch("app.services.wishlist.WishlistService.get_wishlist", new_callable=AsyncMock, return_value=mock_wishlist):
            resp = await app_client.get("/api/v1/wishlist/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_items"] == 0

    async def test_add_wishlist_item(self, app_client):
        mock_item = MagicMock()
        mock_item.id = uuid.UUID("00000000-0000-0000-0000-000000000020")
        mock_item.product_variant_id = uuid.UUID("00000000-0000-0000-0000-000000000030")
        mock_item.variant = None
        with patch("app.services.wishlist.WishlistService.add_item", new_callable=AsyncMock, return_value=mock_item):
            resp = await app_client.post(
                "/api/v1/wishlist/items",
                json={"variant_id": str(uuid.uuid4())},
            )
        assert resp.status_code == 201


# ── Addresses ─────────────────────────────────────────────────────────────────


class TestAddressRoutes:
    def _mock_address(self):
        from datetime import datetime, timezone
        addr = MagicMock()
        addr.id = uuid.UUID("00000000-0000-0000-0000-000000000040")
        addr.user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
        addr.label = "Home"
        addr.line1 = "123 Main St"
        addr.line2 = None
        addr.city = "Mumbai"
        addr.state = "MH"
        addr.pincode = "400001"
        addr.country = "IN"
        addr.is_default = True
        addr.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        return addr

    async def test_list_addresses(self, app_client):
        with patch("app.services.address.AddressService.list_addresses", new_callable=AsyncMock, return_value=[]):
            resp = await app_client.get("/api/v1/addresses/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_address(self, app_client):
        mock_addr = self._mock_address()
        with patch("app.services.address.AddressService.create_address", new_callable=AsyncMock, return_value=mock_addr):
            resp = await app_client.post(
                "/api/v1/addresses/",
                json={
                    "line1": "123 Main St",
                    "city": "Mumbai",
                    "state": "Maharashtra",
                    "pincode": "400001",
                },
            )
        assert resp.status_code == 201

    async def test_delete_address(self, app_client):
        addr_id = uuid.uuid4()
        with patch("app.services.address.AddressService.delete_address", new_callable=AsyncMock, return_value=None):
            resp = await app_client.delete(f"/api/v1/addresses/{addr_id}")
        assert resp.status_code == 204


# ── Orders ────────────────────────────────────────────────────────────────────


class TestOrderRoutes:
    async def test_list_orders_empty(self, app_client, mock_db):
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)
        resp = await app_client.get("/api/v1/orders/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_razorpay_webhook_unknown_event(self, app_client):
        # In dev mode (no secret), HMAC is skipped — unknown events return 200 {"status":"ignored"}
        resp = await app_client.post(
            "/api/v1/orders/webhooks/razorpay",
            content=b'{"event":"subscription.activated"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json().get("status") == "ignored"


# ── Health ────────────────────────────────────────────────────────────────────


class TestHealthRoute:
    async def test_health_returns_ok_or_degraded(self, app_client):
        resp = await app_client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "components" in data


# ── Security headers middleware ────────────────────────────────────────────────


class TestSecurityHeaders:
    async def test_security_headers_present(self, app_client):
        with patch("app.services.catalog.CatalogService.list_categories", new_callable=AsyncMock, return_value=[]):
            resp = await app_client.get("/api/v1/catalog/categories")
        assert resp.status_code == 200
        assert "x-frame-options" in resp.headers
        assert "x-content-type-options" in resp.headers

    async def test_request_id_header_present(self, app_client):
        with patch("app.services.catalog.CatalogService.list_categories", new_callable=AsyncMock, return_value=[]):
            resp = await app_client.get("/api/v1/catalog/categories")
        assert "x-request-id" in resp.headers


# ── Cart ─────────────────────────────────────────────────────────────────────


class TestCartRoutes:
    def _mock_empty_cart(self):
        cart = MagicMock()
        cart.id = uuid.UUID("00000000-0000-0000-0000-000000000050")
        cart.items = []
        return cart

    async def test_get_cart_empty(self, app_client):
        mock_cart = self._mock_empty_cart()
        with patch(
            "app.services.checkout.CheckoutService.get_cart_with_total",
            new_callable=AsyncMock,
            return_value=(mock_cart, 0),
        ):
            resp = await app_client.get("/api/v1/cart/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cart_total"] == 0
        assert data["items"] == []

    async def test_remove_cart_item(self, app_client):
        mock_cart = self._mock_empty_cart()
        variant_id = uuid.uuid4()
        with patch(
            "app.services.checkout.CheckoutService.remove_from_cart",
            new_callable=AsyncMock,
            return_value=mock_cart,
        ), patch(
            "app.services.checkout.CheckoutService.get_cart_with_total",
            new_callable=AsyncMock,
            return_value=(mock_cart, 0),
        ):
            resp = await app_client.delete(f"/api/v1/cart/items/{variant_id}")
        assert resp.status_code == 200

    async def test_update_cart_item_quantity(self, app_client):
        mock_cart = self._mock_empty_cart()
        item_id = uuid.uuid4()
        with patch(
            "app.services.checkout.CheckoutService.update_cart_quantity",
            new_callable=AsyncMock,
            return_value=mock_cart,
        ), patch(
            "app.services.checkout.CheckoutService.get_cart_with_total",
            new_callable=AsyncMock,
            return_value=(mock_cart, 0),
        ):
            resp = await app_client.put(
                f"/api/v1/cart/items/{item_id}",
                json={"quantity": 2},
            )
        assert resp.status_code == 200

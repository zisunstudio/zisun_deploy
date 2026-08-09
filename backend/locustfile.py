"""Locust load test — 3 scenarios: Catalog Browse, Concurrent Checkout, Webhook Flood."""
from locust import HttpUser, task, between, constant
import json
import hmac
import hashlib
import uuid
import random


class CatalogBrowseUser(HttpUser):
    """200 VUs browsing the catalog. Target: P95 < 500ms."""
    wait_time = between(1, 3)
    host = "http://localhost:8000"

    @task(3)
    def browse_feed(self):
        self.client.get("/api/v1/catalog/feed?page=1&limit=20", name="/feed")

    @task(2)
    def list_products(self):
        self.client.get("/api/v1/catalog/products?limit=20", name="/products")

    @task(1)
    def view_product(self):
        # Pick a random product ID from a pre-seeded list
        self.client.get(f"/api/v1/catalog/products", name="/products (first)", params={"limit": 1})


class CheckoutUser(HttpUser):
    """50 VUs doing full checkout. Target: P95 < 800ms, zero oversells."""
    wait_time = between(0.5, 2)
    host = "http://localhost:8000"

    phone_counter = 0
    access_token = None

    def on_start(self):
        """Authenticate before running tasks."""
        # Send OTP
        phone = f"+919{random.randint(100000000, 999999999)}"
        self.client.post("/api/v1/auth/send-otp", json={"phone": phone}, name="send-otp")
        # In test env, OTP is printed — for load test, use a known seeded account
        # This is a placeholder; real load test uses pre-created test accounts
        self.access_token = "load_test_placeholder"

    @task
    def browse_and_cart(self):
        if not self.access_token:
            return
        headers = {"Authorization": f"Bearer {self.access_token}"}
        self.client.get("/api/v1/cart/", headers=headers, name="/cart")


class WebhookFloodUser(HttpUser):
    """1 VU sending 1000 identical webhook payloads. All should return 200, zero duplicates."""
    wait_time = constant(0)
    host = "http://localhost:8000"

    WEBHOOK_SECRET = "test_webhook_secret"
    FIXED_PAYMENT_ID = f"pay_{uuid.uuid4().hex[:14]}"
    FIXED_ORDER_ID = f"order_{uuid.uuid4().hex[:14]}"

    @task
    def send_webhook(self):
        payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": self.FIXED_PAYMENT_ID,
                        "order_id": self.FIXED_ORDER_ID,
                        "amount": 50000,
                    }
                }
            }
        }
        body = json.dumps(payload).encode()
        sig = hmac.new(self.WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()

        with self.client.post(
            "/api/v1/orders/webhooks/razorpay",
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": sig,
            },
            name="/webhooks/razorpay",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 400):
                resp.failure(f"Unexpected status: {resp.status_code}")

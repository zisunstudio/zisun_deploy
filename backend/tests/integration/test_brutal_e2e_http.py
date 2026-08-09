"""BRUTAL end-to-end HTTP tests — drive the REAL app over HTTP against a REAL
database (the whole stack: routing, request validation, auth dependency,
service, DB, Redis). This is the closest thing to a real user hitting the API.

Auto-skips if Postgres is unreachable.
"""
import uuid

import pytest
import fakeredis.aioredis
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text, select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.user import User, UserRole
from app.models.catalog import Product, ProductVariant
from app.models.order import Order, Address, OrderStatus


_engine = create_async_engine(settings.async_database_uri, poolclass=NullPool)
_Session = async_sessionmaker(bind=_engine, expire_on_commit=False, class_=AsyncSession)


def _db_reachable_sync() -> bool:
    try:
        import psycopg2
        psycopg2.connect(
            host=settings.POSTGRES_SERVER, port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER, password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB, connect_timeout=2,
        ).close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_reachable_sync(), reason="Postgres not reachable")

TABLES = ["coupon_usages", "inventory_locks", "order_items", "orders",
          "cart_items", "carts", "product_variants", "products", "addresses", "users"]


@pytest.fixture
async def seeded():
    """Truncate, seed one user + address + product/variant. Returns ids."""
    async with _Session() as s:
        await s.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        u = User(phone="+919812345678", role=UserRole.user)
        s.add(u); await s.flush()
        a = Address(user_id=u.id, line1="1 St", city="Kochi", state="Kerala", pincode="682001")
        s.add(a); await s.flush()
        p = Product(name="Cotton Kurta", base_price=100000, is_active=True)
        s.add(p); await s.flush()
        v = ProductVariant(product_id=p.id, sku=f"SKU-{uuid.uuid4().hex[:8]}", stock=5,
                           price_delta=0, version=1, is_active=True)
        s.add(v); await s.flush()
        await s.commit()
        return {"user_id": u.id, "address_id": a.id, "variant_id": v.id,
                "phone": u.phone, "role": u.role}


@pytest.fixture
async def client(seeded):
    """Real app over HTTP with real-DB session + fake Redis + seeded user auth."""
    from app.main import app
    from app.core.database import get_async_db
    from app.core.redis import get_redis
    from app.core.security import get_current_user

    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

    async def _override_db():
        async with _Session() as s:
            yield s

    class _AuthUser:
        id = seeded["user_id"]
        phone = seeded["phone"]
        role = seeded["role"]
        deleted_at = None

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: _AuthUser()

    with patch("app.main.get_redis_client", new=AsyncMock(return_value=fake_redis)), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            c._seeded = seeded  # attach for convenience
            yield c

    app.dependency_overrides.clear()


API = "/api/v1"


class TestPurchaseFlowHTTP:
    async def test_full_flow_add_view_checkout(self, client, seeded):
        # Add to cart
        r = await client.post(f"{API}/cart/items",
                              json={"variant_id": str(seeded["variant_id"]), "quantity": 2})
        assert r.status_code == 200, r.text

        # View cart — total must be server-computed
        r = await client.get(f"{API}/cart/")
        assert r.status_code == 200
        assert r.json()["cart_total"] == 200000

        # Checkout (Razorpay)
        r = await client.post(f"{API}/cart/checkout/initiate",
                              json={"address_id": str(seeded["address_id"]),
                                    "payment_method": "RAZORPAY"},
                              headers={"X-Idempotency-Key": f"k-{uuid.uuid4()}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["amount"] == 200000 and body["order_id"]
        assert body["is_cod"] is False

        # DB: order persisted, stock decremented
        async with _Session() as s:
            orders = (await s.execute(select(Order))).scalars().all()
            v = (await s.execute(select(ProductVariant).where(
                ProductVariant.id == seeded["variant_id"]))).scalar_one()
        assert len(orders) == 1 and orders[0].status == OrderStatus.PAYMENT_PENDING
        assert v.stock == 3  # 5 - 2

    async def test_idempotent_double_submit_creates_one_order(self, client, seeded):
        await client.post(f"{API}/cart/items",
                          json={"variant_id": str(seeded["variant_id"]), "quantity": 1})
        key = f"idem-{uuid.uuid4()}"
        payload = {"address_id": str(seeded["address_id"]), "payment_method": "RAZORPAY"}
        r1 = await client.post(f"{API}/cart/checkout/initiate", json=payload,
                               headers={"X-Idempotency-Key": key})
        # Re-add to cart (first checkout cleared it) and submit SAME key again
        await client.post(f"{API}/cart/items",
                          json={"variant_id": str(seeded["variant_id"]), "quantity": 1})
        r2 = await client.post(f"{API}/cart/checkout/initiate", json=payload,
                               headers={"X-Idempotency-Key": key})
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["order_id"] == r2.json()["order_id"]  # same order — idempotent

        async with _Session() as s:
            orders = (await s.execute(select(Order))).scalars().all()
            v = (await s.execute(select(ProductVariant).where(
                ProductVariant.id == seeded["variant_id"]))).scalar_one()
        assert len(orders) == 1        # exactly one order
        assert v.stock == 4            # decremented once (5 - 1), not twice

    async def test_checkout_empty_cart_400(self, client, seeded):
        r = await client.post(f"{API}/cart/checkout/initiate",
                              json={"address_id": str(seeded["address_id"]),
                                    "payment_method": "RAZORPAY"})
        assert r.status_code == 400

    async def test_add_more_than_stock_409(self, client, seeded):
        r = await client.post(f"{API}/cart/items",
                              json={"variant_id": str(seeded["variant_id"]), "quantity": 99})
        assert r.status_code == 409

    async def test_add_zero_quantity_422(self, client, seeded):
        """quantity must be > 0 — schema validation rejects 0."""
        r = await client.post(f"{API}/cart/items",
                              json={"variant_id": str(seeded["variant_id"]), "quantity": 0})
        assert r.status_code == 422

    async def test_add_unknown_variant_404(self, client, seeded):
        r = await client.post(f"{API}/cart/items",
                              json={"variant_id": str(uuid.uuid4()), "quantity": 1})
        assert r.status_code == 404

    async def test_cod_flow_no_razorpay(self, client, seeded):
        await client.post(f"{API}/cart/items",
                          json={"variant_id": str(seeded["variant_id"]), "quantity": 1})
        r = await client.post(f"{API}/cart/checkout/initiate",
                              json={"address_id": str(seeded["address_id"]),
                                    "payment_method": "COD"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_cod"] is True
        assert body["razorpay_order_id"] in (None, "")

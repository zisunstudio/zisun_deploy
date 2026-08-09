"""BRUTAL real-database tests for the money path.

Unlike the mock-based suite, these run against a REAL PostgreSQL instance so
they exercise the actual behaviour that mocks can't: server-side price recalc,
atomic stock decrement, inventory-lock creation, coupon application + usage
recording, COD limits, and idempotency.

Requires a running Postgres reachable via the standard POSTGRES_* env vars with
migrations applied (alembic upgrade head). Skipped automatically if the DB is
unreachable, so the mock suite still runs in CI without Postgres.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import text, select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.user import User, UserRole
from app.models.catalog import Product, ProductVariant
from app.models.order import (
    Order, OrderItem, OrderStatus, Address, InventoryLock, LockStatus, PaymentMethod,
)
from app.models.cart import Cart, CartItem
from app.models.coupon import Coupon, CouponUsage, CouponType
from app.services.checkout import CheckoutService
from app.services.coupon import COD_MAX_ORDER_VALUE_PAISE


# ── DB availability gate (sync check — no event-loop entanglement) ───────────────
# NullPool: every session gets a fresh connection, so connections are never
# reused across pytest-asyncio's per-test event loops.
_engine = create_async_engine(settings.async_database_uri, poolclass=NullPool)
_Session = async_sessionmaker(bind=_engine, expire_on_commit=False, class_=AsyncSession)


def _db_reachable_sync() -> bool:
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=settings.POSTGRES_SERVER, port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER, password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB, connect_timeout=2,
        )
        conn.close()
        return True
    except Exception:
        return False


_DB_OK = _db_reachable_sync()
pytestmark = pytest.mark.skipif(not _DB_OK, reason="Postgres not reachable for real-DB tests")


TABLES = [
    "coupon_usages", "inventory_locks", "order_items", "orders",
    "cart_items", "carts", "coupons", "product_variants", "products",
    "addresses", "users",
]


@pytest.fixture
async def db():
    """Truncate money-path tables, yield a real session."""
    async with _Session() as s:
        await s.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await s.commit()
        yield s


# ── Seed helpers ────────────────────────────────────────────────────────────────

async def seed_user(db, phone="+919876500001") -> User:
    u = User(phone=phone, name="Buyer", role=UserRole.user)
    db.add(u)
    await db.flush()
    return u


async def seed_address(db, user_id) -> Address:
    a = Address(user_id=user_id, line1="1 Test St", city="Kochi", state="Kerala",
                pincode="682001", is_default=True)
    db.add(a)
    await db.flush()
    return a


async def seed_product(db, base_price=100000, stock=10, price_delta=0, sku=None) -> ProductVariant:
    p = Product(name="Cotton Kurta", base_price=base_price, is_active=True)
    db.add(p)
    await db.flush()
    v = ProductVariant(
        product_id=p.id, sku=sku or f"SKU-{uuid.uuid4().hex[:8]}",
        size="M", color="Indigo", stock=stock, price_delta=price_delta,
        version=1, is_active=True,
    )
    db.add(v)
    await db.flush()
    return v


async def add_cart_item(db, user_id, variant_id, qty) -> Cart:
    res = await db.execute(select(Cart).where(Cart.user_id == user_id))
    cart = res.scalar_one_or_none()
    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        await db.flush()
    db.add(CartItem(cart_id=cart.id, product_variant_id=variant_id, quantity=qty))
    await db.flush()
    return cart


async def seed_coupon(db, **kw) -> Coupon:
    defaults = dict(
        code=f"C{uuid.uuid4().hex[:6].upper()}", type=CouponType.FLAT, value=10000,
        min_order_value=0, max_discount=None, usage_limit=None, per_user_limit=1,
        expires_at=None, is_active=True, is_referral=False,
    )
    defaults.update(kw)
    c = Coupon(**defaults)
    db.add(c)
    await db.flush()
    return c


# ── Checkout happy path & atomicity ──────────────────────────────────────────────

class TestCheckoutRealDB:
    async def test_happy_path_decrements_stock_creates_lock_clears_cart(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=10)
        await add_cart_item(db, u.id, v.id, 2)
        await db.commit()

        svc = CheckoutService(db)
        order, rzp = await svc.initiate_checkout(u.id, addr.id, PaymentMethod.RAZORPAY)

        assert order.status == OrderStatus.PAYMENT_PENDING
        assert order.total_amount == 200000  # 2 * 100000
        assert rzp is not None  # mock order id in dev mode

        # Stock decremented
        fresh = (await db.execute(select(ProductVariant).where(ProductVariant.id == v.id))).scalar_one()
        assert fresh.stock == 8

        # Inventory lock created
        locks = (await db.execute(select(InventoryLock).where(InventoryLock.order_id == order.id))).scalars().all()
        assert len(locks) == 1 and locks[0].reserved_qty == 2 and locks[0].status == LockStatus.ACTIVE

        # Order item snapshot
        items = (await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
        assert len(items) == 1 and items[0].unit_price == 100000

        # Cart cleared
        remaining = (await db.execute(select(CartItem))).scalars().all()
        assert remaining == []

    async def test_empty_cart_rejected(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.initiate_checkout(u.id, addr.id)
        assert ei.value.status_code == 400

    async def test_insufficient_stock_is_atomic(self, db):
        """Stock < qty must 409 AND leave stock untouched, no order, no lock."""
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, stock=1)
        vid = v.id  # capture before rollback (rollback expires ORM attrs)
        await add_cart_item(db, u.id, v.id, 5)  # want 5, only 1
        await db.commit()

        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.initiate_checkout(u.id, addr.id)
        assert ei.value.status_code == 409

        # Endpoint would roll back the request's session on the raised 409;
        # simulate that and confirm nothing was persisted.
        await db.rollback()
        fresh = (await db.execute(select(ProductVariant).where(ProductVariant.id == vid))).scalar_one()
        assert fresh.stock == 1  # untouched — atomic
        assert (await db.execute(select(Order))).scalars().all() == []
        assert (await db.execute(select(InventoryLock))).scalars().all() == []

    async def test_exact_stock_succeeds_to_zero(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, stock=3)
        await add_cart_item(db, u.id, v.id, 3)
        await db.commit()
        svc = CheckoutService(db)
        order, _ = await svc.initiate_checkout(u.id, addr.id)
        fresh = (await db.execute(select(ProductVariant).where(ProductVariant.id == v.id))).scalar_one()
        assert fresh.stock == 0

    async def test_price_recalculated_server_side(self, db):
        """Even if a variant's price changed, order uses the live DB price."""
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, price_delta=50000, stock=5)  # 150000/unit
        await add_cart_item(db, u.id, v.id, 1)
        await db.commit()
        svc = CheckoutService(db)
        order, _ = await svc.initiate_checkout(u.id, addr.id)
        assert order.total_amount == 150000

    async def test_multi_item_total(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v1 = await seed_product(db, base_price=100000, stock=5)
        v2 = await seed_product(db, base_price=25000, stock=5)
        await add_cart_item(db, u.id, v1.id, 2)  # 200000
        await add_cart_item(db, u.id, v2.id, 3)  # 75000
        await db.commit()
        svc = CheckoutService(db)
        order, _ = await svc.initiate_checkout(u.id, addr.id)
        assert order.total_amount == 275000


# ── COD ──────────────────────────────────────────────────────────────────────────

class TestCODRealDB:
    async def test_cod_sets_amount_due_no_razorpay(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=5)
        await add_cart_item(db, u.id, v.id, 1)
        await db.commit()
        svc = CheckoutService(db)
        order, rzp = await svc.initiate_checkout(u.id, addr.id, PaymentMethod.COD)
        assert rzp is None
        assert order.razorpay_order_id is None
        assert order.payment_method == PaymentMethod.COD
        assert order.cod_amount_due == 100000

    async def test_cod_over_limit_rejected_atomically(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        # price above COD ceiling
        v = await seed_product(db, base_price=COD_MAX_ORDER_VALUE_PAISE + 100000, stock=5)
        vid = v.id  # capture before rollback
        await add_cart_item(db, u.id, v.id, 1)
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.initiate_checkout(u.id, addr.id, PaymentMethod.COD)
        assert ei.value.status_code == 400
        await db.rollback()
        # no order, stock restored/untouched
        assert (await db.execute(select(Order))).scalars().all() == []
        fresh = (await db.execute(select(ProductVariant).where(ProductVariant.id == vid))).scalar_one()
        assert fresh.stock == 5

    async def test_cod_exactly_at_limit_allowed(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=COD_MAX_ORDER_VALUE_PAISE, stock=5)
        await add_cart_item(db, u.id, v.id, 1)
        await db.commit()
        svc = CheckoutService(db)
        order, _ = await svc.initiate_checkout(u.id, addr.id, PaymentMethod.COD)
        assert order.cod_amount_due == COD_MAX_ORDER_VALUE_PAISE


# ── Coupons applied through checkout (real usage recording) ───────────────────────

class TestCouponCheckoutRealDB:
    async def test_flat_coupon_applied_and_usage_recorded(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=5)
        await add_cart_item(db, u.id, v.id, 1)
        c = await seed_coupon(db, type=CouponType.FLAT, value=30000)
        await db.commit()

        svc = CheckoutService(db)
        order, _ = await svc.initiate_checkout(u.id, addr.id, coupon_code=c.code)
        assert order.discount_amount == 30000
        assert order.total_amount == 70000
        assert order.coupon_id == c.id

        usages = (await db.execute(select(CouponUsage).where(CouponUsage.coupon_id == c.id))).scalars().all()
        assert len(usages) == 1 and usages[0].user_id == u.id and usages[0].order_id == order.id

    async def test_percent_coupon_capped_by_max_discount(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=5)
        await add_cart_item(db, u.id, v.id, 1)
        # 50% of 100000 = 50000, capped at 20000
        c = await seed_coupon(db, type=CouponType.PERCENT, value=50, max_discount=20000)
        await db.commit()
        svc = CheckoutService(db)
        order, _ = await svc.initiate_checkout(u.id, addr.id, coupon_code=c.code)
        assert order.discount_amount == 20000
        assert order.total_amount == 80000

    async def test_coupon_discount_never_negative_total(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=50000, stock=5)
        await add_cart_item(db, u.id, v.id, 1)
        c = await seed_coupon(db, type=CouponType.FLAT, value=999999)  # absurdly large
        await db.commit()
        svc = CheckoutService(db)
        order, _ = await svc.initiate_checkout(u.id, addr.id, coupon_code=c.code)
        assert order.total_amount == 0
        assert order.discount_amount <= 50000

    async def test_expired_coupon_rejected(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=5)
        await add_cart_item(db, u.id, v.id, 1)
        c = await seed_coupon(db, expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc))
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.initiate_checkout(u.id, addr.id, coupon_code=c.code)
        assert ei.value.status_code == 400

    async def test_min_order_not_met_rejected(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=50000, stock=5)
        await add_cart_item(db, u.id, v.id, 1)  # 50000
        c = await seed_coupon(db, min_order_value=200000)
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.initiate_checkout(u.id, addr.id, coupon_code=c.code)
        assert ei.value.status_code == 400

    async def test_per_user_limit_blocks_second_use(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=10)
        c = await seed_coupon(db, per_user_limit=1, type=CouponType.FLAT, value=10000)
        # First use
        await add_cart_item(db, u.id, v.id, 1)
        await db.commit()
        svc = CheckoutService(db)
        await svc.initiate_checkout(u.id, addr.id, coupon_code=c.code)
        # Second use should be blocked
        await add_cart_item(db, u.id, v.id, 1)
        await db.commit()
        with pytest.raises(HTTPException) as ei:
            await svc.initiate_checkout(u.id, addr.id, coupon_code=c.code)
        assert ei.value.status_code == 400

    async def test_nonexistent_coupon_rejected(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=5)
        await add_cart_item(db, u.id, v.id, 1)
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.initiate_checkout(u.id, addr.id, coupon_code="DOESNOTEXIST")
        assert ei.value.status_code == 404


# ── Idempotency ──────────────────────────────────────────────────────────────────

class TestIdempotencyRealDB:
    async def test_same_key_returns_same_order_no_double_decrement(self, db):
        u = await seed_user(db)
        addr = await seed_address(db, u.id)
        v = await seed_product(db, base_price=100000, stock=10)
        await add_cart_item(db, u.id, v.id, 2)
        await db.commit()
        svc = CheckoutService(db)
        key = f"mock_order_idem_{uuid.uuid4()}"
        order1, _ = await svc.initiate_checkout(u.id, addr.id, idempotency_key=key)

        # Re-run with same key — should return the existing order, not create a new one
        order2, _ = await svc.initiate_checkout(u.id, addr.id, idempotency_key=key)
        assert order1.id == order2.id

        orders = (await db.execute(select(Order))).scalars().all()
        assert len(orders) == 1
        fresh = (await db.execute(select(ProductVariant).where(ProductVariant.id == v.id))).scalar_one()
        assert fresh.stock == 8  # decremented once only


# ── add_to_cart brutal edge cases ────────────────────────────────────────────────

class TestAddToCartRealDB:
    async def test_add_inactive_variant_rejected(self, db):
        u = await seed_user(db)
        v = await seed_product(db, stock=5)
        v.is_active = False
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.add_to_cart(u.id, v.id, 1)
        assert ei.value.status_code == 409

    async def test_add_more_than_stock_rejected(self, db):
        u = await seed_user(db)
        v = await seed_product(db, stock=2)
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.add_to_cart(u.id, v.id, 5)
        assert ei.value.status_code == 409

    async def test_add_nonexistent_variant_404(self, db):
        u = await seed_user(db)
        await db.commit()
        svc = CheckoutService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.add_to_cart(u.id, uuid.uuid4(), 1)
        assert ei.value.status_code == 404

    async def test_incremental_add_exceeding_stock_rejected(self, db):
        u = await seed_user(db)
        v = await seed_product(db, stock=3)
        await db.commit()
        svc = CheckoutService(db)
        await svc.add_to_cart(u.id, v.id, 2)  # ok
        with pytest.raises(HTTPException) as ei:
            await svc.add_to_cart(u.id, v.id, 2)  # 2+2=4 > 3
        assert ei.value.status_code == 409

"""BRUTAL real-database tests for Celery task internals — zombie cleanup,
expired-lock release, and outbox processing. The existing tests fully mock the
DB, so the actual stock-restoration and state changes were never verified.

Auto-skips if Postgres is unreachable.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock

import pytest
from sqlalchemy import text, select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.user import User, UserRole
from app.models.catalog import Product, ProductVariant
from app.models.order import (
    Order, OrderStatus, Address, InventoryLock, LockStatus, OutboxEvent, PaymentMethod,
)


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

TABLES = ["outbox_events", "inventory_locks", "order_items", "orders",
          "product_variants", "products", "addresses", "users"]


@pytest.fixture
async def db():
    async with _Session() as s:
        await s.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await s.commit()
        yield s


async def _seed_order(db, *, status=OrderStatus.PAYMENT_PENDING, stock_after=8,
                      reserved=2, lock_status=LockStatus.ACTIVE, age_minutes=40,
                      lock_expiry_minutes=-5):
    u = User(phone=f"+9198{uuid.uuid4().int % 10**8:08d}", role=UserRole.user)
    db.add(u); await db.flush()
    a = Address(user_id=u.id, line1="x", city="Kochi", state="Kerala", pincode="682001")
    db.add(a); await db.flush()
    p = Product(name="Kurta", base_price=100000, is_active=True)
    db.add(p); await db.flush()
    v = ProductVariant(product_id=p.id, sku=f"SKU-{uuid.uuid4().hex[:8]}", stock=stock_after,
                       price_delta=0, version=1, is_active=True)
    db.add(v); await db.flush()
    o = Order(user_id=u.id, status=status, total_amount=200000, address_id=a.id,
              payment_method=PaymentMethod.RAZORPAY)
    db.add(o); await db.flush()
    lock = InventoryLock(
        product_variant_id=v.id, order_id=o.id, reserved_qty=reserved,
        status=lock_status,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=lock_expiry_minutes),
    )
    db.add(lock); await db.flush()
    oid, vid, lid = o.id, v.id, lock.id
    await db.commit()
    # Force the order's age via raw SQL (created_at has a server default)
    async with _Session() as s2:
        await s2.execute(
            text("UPDATE orders SET created_at = now() - make_interval(mins => :m) WHERE id = :id"),
            {"m": age_minutes, "id": oid},
        )
        await s2.commit()
    return oid, vid, lid


class TestZombieCleanupRealDB:
    async def test_old_pending_cancelled_stock_restored_outbox_written(self, db):
        oid, vid, lid = await _seed_order(db, stock_after=8, reserved=2, age_minutes=40)
        from app.tasks.commerce import _cleanup_zombie_orders
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session):
            await _cleanup_zombie_orders()

        async with _Session() as s:
            o = (await s.execute(select(Order).where(Order.id == oid))).scalar_one()
            v = (await s.execute(select(ProductVariant).where(ProductVariant.id == vid))).scalar_one()
            lock = (await s.execute(select(InventoryLock).where(InventoryLock.id == lid))).scalar_one()
            ev = (await s.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == str(oid)))).scalars().all()
        assert o.status == OrderStatus.CANCELLED
        assert v.stock == 10           # 8 + reserved 2 restored
        assert lock.status == LockStatus.RELEASED
        assert any(e.event_type == "ORDER_CANCELLED" for e in ev)

    async def test_recent_pending_not_cancelled(self, db):
        oid, vid, _ = await _seed_order(db, stock_after=8, age_minutes=5)  # too new
        from app.tasks.commerce import _cleanup_zombie_orders
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session):
            await _cleanup_zombie_orders()
        async with _Session() as s:
            o = (await s.execute(select(Order).where(Order.id == oid))).scalar_one()
            v = (await s.execute(select(ProductVariant).where(ProductVariant.id == vid))).scalar_one()
        assert o.status == OrderStatus.PAYMENT_PENDING  # untouched
        assert v.stock == 8                             # not restored

    async def test_paid_order_never_cancelled(self, db):
        oid, _, _ = await _seed_order(db, status=OrderStatus.PAID, age_minutes=120)
        from app.tasks.commerce import _cleanup_zombie_orders
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session):
            await _cleanup_zombie_orders()
        async with _Session() as s:
            o = (await s.execute(select(Order).where(Order.id == oid))).scalar_one()
        assert o.status == OrderStatus.PAID


class TestExpiredLockReleaseRealDB:
    async def test_expired_active_lock_released_and_stock_restored(self, db):
        _, vid, lid = await _seed_order(db, stock_after=5, reserved=3,
                                        lock_status=LockStatus.ACTIVE, lock_expiry_minutes=-10)
        from app.tasks.commerce import _release_expired_locks
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session):
            await _release_expired_locks()
        async with _Session() as s:
            v = (await s.execute(select(ProductVariant).where(ProductVariant.id == vid))).scalar_one()
            lock = (await s.execute(select(InventoryLock).where(InventoryLock.id == lid))).scalar_one()
        assert lock.status == LockStatus.EXPIRED
        assert v.stock == 8  # 5 + 3

    async def test_unexpired_lock_untouched(self, db):
        _, vid, lid = await _seed_order(db, stock_after=5, reserved=3,
                                        lock_status=LockStatus.ACTIVE, lock_expiry_minutes=+30)
        from app.tasks.commerce import _release_expired_locks
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session):
            await _release_expired_locks()
        async with _Session() as s:
            v = (await s.execute(select(ProductVariant).where(ProductVariant.id == vid))).scalar_one()
            lock = (await s.execute(select(InventoryLock).where(InventoryLock.id == lid))).scalar_one()
        assert lock.status == LockStatus.ACTIVE
        assert v.stock == 5  # not restored


class TestOutboxRealDB:
    async def test_order_paid_event_published(self, db):
        async with _Session() as s:
            ev = OutboxEvent(aggregate_type="Order", aggregate_id=str(uuid.uuid4()),
                             event_type="ORDER_PAID",
                             payload={"phone": "+919876500000", "order_id": "x",
                                      "amount": 100000, "items_summary": "1 kurta"})
            s.add(ev); await s.commit(); eid = ev.id
        from app.tasks.commerce import _process_outbox
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session), \
             patch("app.services.whatsapp.send_order_confirmation", new=AsyncMock()) as mock_send:
            await _process_outbox()
        async with _Session() as s:
            ev = (await s.execute(select(OutboxEvent).where(OutboxEvent.id == eid))).scalar_one()
        assert ev.published_at is not None
        mock_send.assert_awaited_once()

    async def test_already_published_not_resent(self, db):
        async with _Session() as s:
            ev = OutboxEvent(aggregate_type="Order", aggregate_id="y",
                             event_type="ORDER_PAID",
                             payload={"phone": "+91", "order_id": "y", "amount": 1},
                             published_at=datetime.now(timezone.utc))
            s.add(ev); await s.commit()
        from app.tasks.commerce import _process_outbox
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session), \
             patch("app.services.whatsapp.send_order_confirmation", new=AsyncMock()) as mock_send:
            await _process_outbox()
        mock_send.assert_not_awaited()  # already published → skipped

    async def test_one_failing_event_does_not_block_others(self, db):
        async with _Session() as s:
            good = OutboxEvent(aggregate_type="Order", aggregate_id="good",
                               event_type="ORDER_PAID",
                               payload={"phone": "+91", "order_id": "good", "amount": 1})
            bad = OutboxEvent(aggregate_type="Order", aggregate_id="bad",
                              event_type="ORDER_PAID",
                              payload={"phone": "+91", "order_id": "bad", "amount": 1})
            s.add(bad); await s.flush()   # bad created first → processed first
            s.add(good); await s.commit()
            bad_id, good_id = bad.id, good.id

        async def _flaky(**kwargs):
            if kwargs.get("order_id") == "bad":
                raise RuntimeError("whatsapp down")

        from app.tasks.commerce import _process_outbox
        with patch("app.tasks.commerce.AsyncSessionLocal", _Session), \
             patch("app.services.whatsapp.send_order_confirmation", new=_flaky):
            await _process_outbox()
        async with _Session() as s:
            bad = (await s.execute(select(OutboxEvent).where(OutboxEvent.id == bad_id))).scalar_one()
            good = (await s.execute(select(OutboxEvent).where(OutboxEvent.id == good_id))).scalar_one()
        assert bad.published_at is None      # failed → left unpublished for retry
        assert good.published_at is not None  # unaffected by the failure

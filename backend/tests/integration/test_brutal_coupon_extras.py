"""BRUTAL real-DB tests for the remaining coupon service methods —
referral-coupon generation, usage stats, and active-only listing.
Auto-skips if Postgres is unreachable.
"""
import uuid

import pytest
from sqlalchemy import text, select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.user import User, UserRole
from app.models.order import Order, Address, OrderStatus, PaymentMethod
from app.models.coupon import Coupon, CouponUsage, CouponType
from app.services.coupon import CouponService


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


@pytest.fixture
async def db():
    async with _Session() as s:
        await s.execute(text(
            "TRUNCATE coupon_usages, coupons, orders, addresses, users "
            "RESTART IDENTITY CASCADE"))
        await s.commit()
        yield s


async def _mk_order(db, user_id) -> uuid.UUID:
    a = Address(user_id=user_id, line1="x", city="Kochi", state="Kerala", pincode="682001")
    db.add(a); await db.flush()
    o = Order(user_id=user_id, status=OrderStatus.PAID, total_amount=1000,
              address_id=a.id, payment_method=PaymentMethod.RAZORPAY)
    db.add(o); await db.flush()
    return o.id


class TestReferralGeneration:
    async def test_generates_unique_active_referral_coupon(self, db):
        svc = CouponService(db)
        c = await svc.generate_referral_coupon(uuid.uuid4(), "3210")
        await db.commit()
        assert c.is_referral is True
        assert c.type == CouponType.PERCENT and c.value == 10
        assert c.max_discount == 10000 and c.min_order_value == 50000
        assert c.usage_limit == 1 and c.per_user_limit == 1
        assert c.code.startswith("REF-3210-")

    async def test_two_referrals_have_distinct_codes(self, db):
        svc = CouponService(db)
        c1 = await svc.generate_referral_coupon(uuid.uuid4(), "3210")
        c2 = await svc.generate_referral_coupon(uuid.uuid4(), "3210")
        await db.commit()
        assert c1.code != c2.code  # random suffix guarantees uniqueness


class TestUsageStatsAndListing:
    async def test_usage_stats_counts_records(self, db):
        u = User(phone="+919812345000", role=UserRole.user)
        db.add(u); await db.flush()
        c = Coupon(code="STATS10", type=CouponType.FLAT, value=1000, min_order_value=0,
                   per_user_limit=5, is_active=True)
        db.add(c); await db.flush()
        # Two usages against real orders (order_id is an FK)
        o1 = await _mk_order(db, u.id)
        o2 = await _mk_order(db, u.id)
        db.add(CouponUsage(coupon_id=c.id, user_id=u.id, order_id=o1))
        db.add(CouponUsage(coupon_id=c.id, user_id=u.id, order_id=o2))
        await db.commit()

        svc = CouponService(db)
        stats = await svc.get_usage_stats(c.id)
        assert stats["total_uses"] == 2

    async def test_usage_stats_zero_when_unused(self, db):
        c = Coupon(code="UNUSED", type=CouponType.FLAT, value=1000, min_order_value=0,
                   per_user_limit=1, is_active=True)
        db.add(c); await db.commit()
        svc = CouponService(db)
        stats = await svc.get_usage_stats(c.id)
        assert stats["total_uses"] == 0

    async def test_list_active_only_excludes_inactive(self, db):
        db.add(Coupon(code="ACTIVE1", type=CouponType.FLAT, value=1000, min_order_value=0,
                      per_user_limit=1, is_active=True))
        db.add(Coupon(code="DEAD1", type=CouponType.FLAT, value=1000, min_order_value=0,
                      per_user_limit=1, is_active=False))
        await db.commit()
        svc = CouponService(db)
        active = await svc.list_coupons(active_only=True)
        all_ = await svc.list_coupons(active_only=False)
        assert {c.code for c in active} == {"ACTIVE1"}
        assert {c.code for c in all_} == {"ACTIVE1", "DEAD1"}

"""BRUTAL real-database tests for the discovery path — product listing,
sort/filter/pagination, get_product, category-by-slug, search (incl. injection
safety), and the Redis-cached feed.

Auto-skips if Postgres is unreachable.
"""
import uuid

import pytest
import fakeredis.aioredis
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.catalog import Category, Product, ProductVariant, ProductMedia, MediaType
from app.services.catalog import CatalogService


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

TABLES = ["product_media", "product_variants", "products", "categories"]


@pytest.fixture
async def db():
    async with _Session() as s:
        await s.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await s.commit()
        yield s


@pytest.fixture
def redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


async def mk_product(db, name="Kurta", price=100000, active=True, deleted=False,
                     description=None, category_id=None, with_variant=True):
    p = Product(name=name, base_price=price, is_active=active, description=description,
                category_id=category_id)
    db.add(p); await db.flush()
    if deleted:
        from datetime import datetime, timezone
        p.deleted_at = datetime.now(timezone.utc)
    if with_variant:
        db.add(ProductVariant(product_id=p.id, sku=f"SKU-{uuid.uuid4().hex[:8]}",
                              stock=5, price_delta=0, version=1, is_active=True))
    await db.flush()
    return p


# ── list_products ────────────────────────────────────────────────────────────────

class TestListProducts:
    async def test_sort_price_asc_desc_and_effective_price(self, db):
        await mk_product(db, name="Cheap", price=10000)
        await mk_product(db, name="Mid", price=50000)
        await mk_product(db, name="Pricey", price=90000)
        await db.commit()
        svc = CatalogService(db)

        asc = await svc.list_products(sort_by="price_asc")
        assert [p.base_price for p in asc["items"]] == [10000, 50000, 90000]
        desc = await svc.list_products(sort_by="price_desc")
        assert [p.base_price for p in desc["items"]] == [90000, 50000, 10000]
        # effective_price injected on variants
        assert asc["items"][0].variants[0].effective_price == 10000

    async def test_excludes_soft_deleted_and_inactive(self, db):
        await mk_product(db, name="Live")
        await mk_product(db, name="Dead", deleted=True)
        await mk_product(db, name="Hidden", active=False)
        await db.commit()
        svc = CatalogService(db)
        res = await svc.list_products(is_active=True)
        names = {p.name for p in res["items"]}
        assert names == {"Live"}
        assert res["total"] == 1

    async def test_pagination_bounds(self, db):
        for i in range(5):
            await mk_product(db, name=f"P{i}", price=1000 * (i + 1))
        await db.commit()
        svc = CatalogService(db)
        page1 = await svc.list_products(page=1, limit=2)
        page3 = await svc.list_products(page=3, limit=2)
        assert page1["total"] == 5 and len(page1["items"]) == 2
        assert len(page3["items"]) == 1  # 5th item alone
        # beyond the end → empty, total still correct
        page99 = await svc.list_products(page=99, limit=2)
        assert page99["items"] == [] and page99["total"] == 5

    async def test_category_filter(self, db):
        cat = Category(name="Kurtas", slug="kurtas", is_active=True)
        db.add(cat); await db.flush()
        await mk_product(db, name="InCat", category_id=cat.id)
        await mk_product(db, name="NoCat")
        await db.commit()
        svc = CatalogService(db)
        res = await svc.list_products(category_id=str(cat.id))
        assert {p.name for p in res["items"]} == {"InCat"}


# ── get_product ──────────────────────────────────────────────────────────────────

class TestGetProduct:
    async def test_found(self, db):
        p = await mk_product(db, name="Findable")
        await db.commit()
        svc = CatalogService(db)
        got = await svc.get_product(p.id)
        assert got.id == p.id and got.variants[0].effective_price == p.base_price

    async def test_missing_404(self, db):
        svc = CatalogService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.get_product(uuid.uuid4())
        assert ei.value.status_code == 404

    async def test_soft_deleted_404(self, db):
        p = await mk_product(db, name="Gone", deleted=True)
        await db.commit()
        svc = CatalogService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.get_product(p.id)
        assert ei.value.status_code == 404


# ── category by slug ─────────────────────────────────────────────────────────────

class TestCategoryBySlug:
    async def test_returns_only_active_products(self, db):
        cat = Category(name="Dresses", slug="dresses", is_active=True)
        db.add(cat); await db.flush()
        await mk_product(db, name="ActiveDress", active=True, category_id=cat.id)
        await mk_product(db, name="InactiveDress", active=False, category_id=cat.id)
        await db.commit()
        svc = CatalogService(db)
        got = await svc.get_category_by_slug("dresses")
        assert got.product_count == 1
        assert {p.name for p in got.products} == {"ActiveDress"}

    async def test_missing_slug_404(self, db):
        svc = CatalogService(db)
        with pytest.raises(HTTPException) as ei:
            await svc.get_category_by_slug("nope")
        assert ei.value.status_code == 404


# ── search ───────────────────────────────────────────────────────────────────────

class TestSearch:
    async def test_finds_by_name_case_insensitive(self, db):
        await mk_product(db, name="Indigo Cotton Kurta")
        await mk_product(db, name="Red Silk Saree")
        await db.commit()
        svc = CatalogService(db)
        res = await svc.search_products("kurta")
        assert any("Kurta" in p.name for p in res["items"])
        assert all("Saree" not in p.name for p in res["items"])

    async def test_finds_by_description(self, db):
        await mk_product(db, name="Mystery Item", description="breathable summer linen")
        await db.commit()
        svc = CatalogService(db)
        res = await svc.search_products("linen")
        assert res["total"] >= 1

    async def test_no_results_empty(self, db):
        await mk_product(db, name="Kurta")
        await db.commit()
        svc = CatalogService(db)
        res = await svc.search_products("zzzznonexistentzzz")
        assert res["items"] == [] and res["total"] == 0

    async def test_injection_string_is_safe(self, db):
        await mk_product(db, name="Normal Product")
        await db.commit()
        svc = CatalogService(db)
        # Must not raise, must not drop the table
        res = await svc.search_products("'; DROP TABLE products; --")
        assert isinstance(res["items"], list)
        # table still intact
        still = await svc.list_products()
        assert still["total"] == 1

    async def test_excludes_inactive_and_deleted(self, db):
        await mk_product(db, name="Cotton Live", active=True)
        await mk_product(db, name="Cotton Dead", deleted=True)
        await mk_product(db, name="Cotton Hidden", active=False)
        await db.commit()
        svc = CatalogService(db)
        res = await svc.search_products("cotton")
        assert {p.name for p in res["items"]} == {"Cotton Live"}


# ── feed (Redis cache) ───────────────────────────────────────────────────────────

class TestFeed:
    async def test_product_fallback_feed(self, db, redis):
        await mk_product(db, name="FeedItem")
        await db.commit()
        svc = CatalogService(db, redis=redis)
        feed = await svc.get_feed(page=1, limit=10)
        assert any(item.get("name") == "FeedItem" for item in feed)

    async def test_feed_is_cached(self, db, redis):
        await mk_product(db, name="First")
        await db.commit()
        svc = CatalogService(db, redis=redis)
        feed1 = await svc.get_feed(page=1, limit=10)
        assert len(feed1) == 1

        # Add another product AFTER the first (cached) call
        await mk_product(db, name="Second")
        await db.commit()
        feed2 = await svc.get_feed(page=1, limit=10)
        # Served from cache → still shows only the first product
        assert len(feed2) == 1
        assert feed1 == feed2

    async def test_cache_key_is_per_page(self, db, redis):
        for i in range(3):
            await mk_product(db, name=f"F{i}")
        await db.commit()
        svc = CatalogService(db, redis=redis)
        p1 = await svc.get_feed(page=1, limit=2)
        p2 = await svc.get_feed(page=2, limit=2)
        assert len(p1) == 2 and len(p2) == 1  # distinct pages, not a shared cache blob

"""BRUTAL real-DB tests for bulk product import and bulk stock CSV.

Drives the real admin endpoints over HTTP against real Postgres.
Auto-skips if Postgres is unreachable.
"""
import io
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
from app.models.catalog import Category, Product, ProductVariant, ProductMedia


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

TABLES = ["product_media", "product_variants", "products", "categories", "users"]
ADMIN = "/api/admin/v1"


@pytest.fixture
async def client():
    from app.main import app
    from app.core.database import get_async_db
    from app.core.redis import get_redis
    from app.core.security import get_current_user

    async with _Session() as s:
        await s.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        admin = User(phone="+919888800001", role=UserRole.admin)
        s.add(admin)
        s.add(Category(name="Kurtas", slug="kurtas", is_active=True))
        await s.commit()
        admin_id = admin.id

    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

    async def _override_db():
        async with _Session() as s:
            yield s

    class _Admin:
        id = admin_id
        phone = "+919888800001"
        role = UserRole.admin
        deleted_at = None

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: _Admin()

    with patch("app.main.get_redis_client", new=AsyncMock(return_value=fake_redis)), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c

    app.dependency_overrides.clear()


def _csv(body: str):
    return {"file": ("catalog.csv", io.BytesIO(body.encode("utf-8")), "text/csv")}


HEADER = ("name,description,base_price_paise,category_slug,sku,size,color,stock,"
          "price_delta_paise,image_url\n")


class TestBulkProductImport:
    async def test_imports_one_product_with_three_variants(self, client):
        body = HEADER + (
            "Indigo Cotton Kurta,Handwoven cotton,149900,kurtas,ZSN-KUR-IND-S,S,Indigo,12,0,https://cdn/x.jpg\n"
            "Indigo Cotton Kurta,,149900,kurtas,ZSN-KUR-IND-M,M,Indigo,18,0,\n"
            "Indigo Cotton Kurta,,149900,kurtas,ZSN-KUR-IND-L,L,Indigo,10,0,\n"
        )
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["created_products"] == 1
        assert data["created_variants"] == 3

        async with _Session() as s:
            p = (await s.execute(select(Product))).scalar_one()
            variants = (await s.execute(select(ProductVariant))).scalars().all()
            media = (await s.execute(select(ProductMedia))).scalars().all()
        assert p.name == "Indigo Cotton Kurta"
        assert p.base_price == 149900
        assert p.description == "Handwoven cotton"   # taken from first row
        assert p.category_id is not None              # resolved from slug
        assert {v.size for v in variants} == {"S", "M", "L"}
        assert sum(v.stock for v in variants) == 40
        assert len(media) == 1                        # first non-empty image_url

    async def test_multiple_products_grouped_by_name(self, client):
        body = HEADER + (
            "Kurta A,,149900,,SKU-A1,S,Red,5,0,\n"
            "Kurta A,,149900,,SKU-A2,M,Red,5,0,\n"
            "Co-ord B,,249900,,SKU-B1,S,Beige,3,0,\n"
        )
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 201
        assert r.json()["created_products"] == 2
        assert r.json()["created_variants"] == 3

    async def test_price_delta_applied(self, client):
        body = HEADER + "Kurta,,100000,,SKU-XL,XL,Blue,4,20000,\n"
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 201
        async with _Session() as s:
            v = (await s.execute(select(ProductVariant))).scalar_one()
        assert v.price_delta == 20000

    # ── rejection paths (all-or-nothing) ──────────────────────────────────────

    async def test_duplicate_sku_in_csv_rejected_nothing_written(self, client):
        body = HEADER + (
            "Kurta,,149900,,DUP-1,S,Red,5,0,\n"
            "Kurta,,149900,,DUP-1,M,Red,5,0,\n"
        )
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 422
        assert any("duplicate SKU" in e for e in r.json()["detail"]["errors"])
        async with _Session() as s:
            assert (await s.execute(select(Product))).scalars().all() == []

    async def test_existing_sku_rejected(self, client):
        body = HEADER + "Kurta,,149900,,SAME-SKU,S,Red,5,0,\n"
        assert (await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))).status_code == 201
        r2 = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r2.status_code == 422
        assert any("already exists" in e for e in r2.json()["detail"]["errors"])
        async with _Session() as s:
            assert len((await s.execute(select(Product))).scalars().all()) == 1  # only the first

    async def test_unknown_category_rejected(self, client):
        body = HEADER + "Kurta,,149900,nonexistent-cat,SKU-Q,S,Red,5,0,\n"
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 422
        assert any("Unknown category_slug" in e for e in r.json()["detail"]["errors"])

    async def test_negative_stock_rejected(self, client):
        body = HEADER + "Kurta,,149900,,SKU-N,S,Red,-3,0,\n"
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 422
        assert any("stock cannot be negative" in e for e in r.json()["detail"]["errors"])

    async def test_non_numeric_price_rejected(self, client):
        body = HEADER + "Kurta,,not-a-number,,SKU-P,S,Red,5,0,\n"
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 422
        assert any("whole number" in e for e in r.json()["detail"]["errors"])

    async def test_missing_required_column_rejected(self, client):
        body = "name,base_price_paise,sku\nKurta,149900,SKU-Z\n"  # no `stock`
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 422
        assert "stock" in str(r.json()["detail"])

    async def test_empty_csv_rejected(self, client):
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(HEADER))
        assert r.status_code == 422

    async def test_all_errors_reported_at_once(self, client):
        """Operator should see every bad row, not just the first."""
        body = HEADER + (
            "Kurta,,abc,,SKU-E1,S,Red,5,0,\n"
            "Kurta,,149900,,SKU-E2,M,Red,-1,0,\n"
        )
        r = await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(body))
        assert r.status_code == 422
        assert len(r.json()["detail"]["errors"]) >= 2

    async def test_template_endpoint(self, client):
        r = await client.get(f"{ADMIN}/products/bulk-import-template")
        assert r.status_code == 200
        assert "base_price_paise" in r.json()["columns"]


class TestBulkStockCsvFixed:
    """The endpoint the admin Inventory page now calls (was 404 before the fix)."""

    async def test_updates_stock_and_returns_errors_key(self, client):
        setup = HEADER + "Kurta,,149900,,STK-1,S,Red,5,0,\n"
        assert (await client.post(f"{ADMIN}/products/bulk-import-csv", files=_csv(setup))).status_code == 201

        r = await client.post(f"{ADMIN}/products/bulk-stock-csv",
                              files=_csv("sku,new_stock\nSTK-1,42\n"))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["updated"] == 1
        assert body["errors"] == []   # key always present — UI reads it unconditionally

        async with _Session() as s:
            v = (await s.execute(select(ProductVariant).where(ProductVariant.sku == "STK-1"))).scalar_one()
        assert v.stock == 42

    async def test_unknown_sku_rejected(self, client):
        r = await client.post(f"{ADMIN}/products/bulk-stock-csv",
                              files=_csv("sku,new_stock\nNOPE-1,5\n"))
        assert r.status_code == 422

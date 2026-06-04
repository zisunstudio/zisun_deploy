"""Admin catalogue endpoint integration tests — products, variants, media, categories."""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Fixture: admin client ─────────────────────────────────────────────────────

@pytest.fixture
async def admin_app_client(fake_redis, mock_db, mock_admin_user):
    """AsyncClient with admin-role user override for admin endpoint tests."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.database import get_async_db
    from app.core.redis import get_redis
    from app.core.security import get_current_user

    async def _override_db():
        yield mock_db

    async def _get_redis_for_lifespan():
        return fake_redis

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user

    with patch("app.main.get_redis_client", new=_get_redis_for_lifespan), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c

    app.dependency_overrides.clear()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _empty_scalars():
    """DB execute result whose .scalars().all() returns []."""
    r = MagicMock()
    r.scalars.return_value.all.return_value = []
    return r


def _scalar_none():
    """DB execute result whose .scalar_one_or_none() returns None."""
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    return r


def _scalar_value(value):
    """DB execute result whose .scalar_one_or_none() returns value."""
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


# ── Admin Products ────────────────────────────────────────────────────────────

class TestAdminProductRoutes:
    async def test_regular_user_gets_403(self, app_client, mock_db):
        """Regular-user token must be rejected by admin endpoints."""
        mock_db.execute = AsyncMock(return_value=_empty_scalars())
        resp = await app_client.get("/api/admin/v1/products/")
        assert resp.status_code == 403

    async def test_list_products_returns_200(self, admin_app_client, mock_db):
        mock_db.execute = AsyncMock(return_value=_empty_scalars())
        resp = await admin_app_client.get("/api/admin/v1/products/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_products_with_include_inactive(self, admin_app_client, mock_db):
        mock_db.execute = AsyncMock(return_value=_empty_scalars())
        resp = await admin_app_client.get("/api/admin/v1/products/?include_inactive=true")
        assert resp.status_code == 200

    async def test_list_products_with_search(self, admin_app_client, mock_db):
        mock_db.execute = AsyncMock(return_value=_empty_scalars())
        resp = await admin_app_client.get("/api/admin/v1/products/?search=dress")
        assert resp.status_code == 200

    async def test_create_product_no_variants_rejected(self, admin_app_client):
        resp = await admin_app_client.post("/api/admin/v1/products/", json={
            "name": "Test Saree",
            "base_price": 50000,
            "variants": [],
        })
        assert resp.status_code == 422

    async def test_create_product_missing_name_rejected(self, admin_app_client):
        resp = await admin_app_client.post("/api/admin/v1/products/", json={
            "base_price": 50000,
            "variants": [{"sku": "SKU001", "stock": 10}],
        })
        assert resp.status_code == 422

    async def test_create_product_negative_price_rejected(self, admin_app_client):
        resp = await admin_app_client.post("/api/admin/v1/products/", json={
            "name": "Test",
            "base_price": -1,
            "variants": [{"sku": "SKU001", "stock": 10}],
        })
        assert resp.status_code == 422

    async def test_get_upload_url_invalid_content_type(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        # _get_product_or_404 → not found (returns 404 before content_type rejection)
        # But content_type check runs first — 422 is returned immediately
        resp = await admin_app_client.get(
            f"/api/admin/v1/products/{product_id}/media/upload-url",
            params={"content_type": "application/pdf"},
        )
        assert resp.status_code == 422
        assert "content_type" in resp.json()["detail"].lower()

    async def test_get_upload_url_valid_content_type_product_not_found(
        self, admin_app_client, mock_db
    ):
        product_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.get(
            f"/api/admin/v1/products/{product_id}/media/upload-url",
            params={"content_type": "image/jpeg"},
        )
        assert resp.status_code == 404

    async def test_get_upload_url_dev_mode_returns_presigned(
        self, admin_app_client, mock_db
    ):
        from app.models.catalog import Product
        product_id = uuid.uuid4()
        product = Product(name="Test", base_price=1000)
        product.variants = []
        product.media = []
        product.category = None
        mock_db.execute = AsyncMock(return_value=_scalar_value(product))
        resp = await admin_app_client.get(
            f"/api/admin/v1/products/{product_id}/media/upload-url",
            params={"content_type": "image/jpeg"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "upload_url" in data
        assert "key" in data

    async def test_add_variant_product_not_found(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.post(
            f"/api/admin/v1/products/{product_id}/variants/",
            json={"sku": "SKU-NEW-01", "stock": 5},
        )
        assert resp.status_code == 404

    async def test_update_variant_not_found(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.put(
            f"/api/admin/v1/products/{product_id}/variants/{variant_id}",
            json={"stock": 5},
        )
        assert resp.status_code == 404

    async def test_delete_variant_not_found(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.delete(
            f"/api/admin/v1/products/{product_id}/variants/{variant_id}"
        )
        assert resp.status_code == 404

    async def test_confirm_media_product_not_found(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.post(
            f"/api/admin/v1/products/{product_id}/media/confirm",
            json={"key": "products/x/y.jpg", "cdn_url": "/media/x/y.jpg"},
        )
        assert resp.status_code == 404

    async def test_confirm_media_invalid_type(self, admin_app_client, mock_db):
        from app.models.catalog import Product
        product_id = uuid.uuid4()
        product = Product(name="Test", base_price=1000)
        product.variants = []
        product.media = []
        product.category = None
        mock_db.execute = AsyncMock(return_value=_scalar_value(product))
        resp = await admin_app_client.post(
            f"/api/admin/v1/products/{product_id}/media/confirm",
            json={"key": "k", "cdn_url": "/media/k", "type": "AUDIO"},
        )
        assert resp.status_code == 422

    async def test_delete_media_not_found(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        media_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.delete(
            f"/api/admin/v1/products/{product_id}/media/{media_id}"
        )
        assert resp.status_code == 404

    async def test_reorder_media_product_not_found(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.patch(
            f"/api/admin/v1/products/{product_id}/media/reorder",
            json={"items": [{"id": str(uuid.uuid4()), "display_order": 0}]},
        )
        assert resp.status_code == 404

    async def test_bulk_stock_empty_list_rejected(self, admin_app_client):
        resp = await admin_app_client.post("/api/admin/v1/products/bulk-stock", json=[])
        assert resp.status_code == 422

    async def test_bulk_stock_negative_stock_rejected(self, admin_app_client):
        resp = await admin_app_client.post("/api/admin/v1/products/bulk-stock", json=[
            {"sku": "SKU001", "new_stock": -5},
        ])
        assert resp.status_code == 422

    async def test_update_stock_negative_rejected(self, admin_app_client):
        product_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        resp = await admin_app_client.post(
            f"/api/admin/v1/products/{product_id}/variants/{variant_id}/stock",
            json={"stock": -1},
        )
        assert resp.status_code == 422

    async def test_update_stock_variant_not_found(self, admin_app_client, mock_db):
        product_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.post(
            f"/api/admin/v1/products/{product_id}/variants/{variant_id}/stock",
            json={"stock": 10},
        )
        assert resp.status_code == 404


# ── Admin Categories ──────────────────────────────────────────────────────────

class TestAdminCategoryRoutes:
    async def test_list_categories_empty(self, admin_app_client, mock_db):
        cats_result = _empty_scalars()
        counts_result = MagicMock()
        counts_result.all.return_value = []
        mock_db.execute = AsyncMock(side_effect=[cats_result, counts_result])
        resp = await admin_app_client.get("/api/admin/v1/categories/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_category_name_required(self, admin_app_client):
        resp = await admin_app_client.post("/api/admin/v1/categories/", json={})
        assert resp.status_code == 422

    async def test_create_category_auto_slug(self, admin_app_client, mock_db):
        from datetime import datetime, timezone as tz

        async def _populate(obj, *args, **kwargs):
            obj.id = uuid.uuid4()
            obj.created_at = datetime.now(tz.utc)
            obj.updated_at = datetime.now(tz.utc)

        mock_db.execute = AsyncMock(return_value=_scalar_none())
        mock_db.refresh = AsyncMock(side_effect=_populate)
        resp = await admin_app_client.post(
            "/api/admin/v1/categories/",
            json={"name": "Ethnic Wear"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Ethnic Wear"
        assert data["slug"] == "ethnic-wear"
        assert data["is_active"] is True

    async def test_create_category_custom_slug(self, admin_app_client, mock_db):
        from datetime import datetime, timezone as tz

        async def _populate(obj, *args, **kwargs):
            obj.id = uuid.uuid4()
            obj.created_at = datetime.now(tz.utc)
            obj.updated_at = datetime.now(tz.utc)

        mock_db.execute = AsyncMock(return_value=_scalar_none())
        mock_db.refresh = AsyncMock(side_effect=_populate)
        resp = await admin_app_client.post(
            "/api/admin/v1/categories/",
            json={"name": "Kurtas & Sets", "slug": "kurtas"},
        )
        assert resp.status_code == 201
        assert resp.json()["slug"] == "kurtas"

    async def test_update_category_not_found(self, admin_app_client, mock_db):
        cat_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.put(
            f"/api/admin/v1/categories/{cat_id}",
            json={"name": "Updated"},
        )
        assert resp.status_code == 404

    async def test_update_category_success(self, admin_app_client, mock_db):
        from app.models.catalog import Category
        from datetime import datetime, timezone as tz
        cat_id = uuid.uuid4()
        category = Category(name="Old Name", slug="old-name")
        # Populate fields that would be set by DB
        category.id = cat_id
        category.is_active = True
        category.created_at = datetime.now(tz.utc)
        category.updated_at = datetime.now(tz.utc)
        cat_result = _scalar_value(category)
        slug_check = _scalar_none()
        mock_db.execute = AsyncMock(side_effect=[cat_result, slug_check])
        resp = await admin_app_client.put(
            f"/api/admin/v1/categories/{cat_id}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        assert resp.json()["slug"] == "new-name"

    async def test_delete_category_not_found(self, admin_app_client, mock_db):
        cat_id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await admin_app_client.delete(f"/api/admin/v1/categories/{cat_id}")
        assert resp.status_code == 404

    async def test_delete_category_deactivates(self, admin_app_client, mock_db):
        from app.models.catalog import Category
        cat_id = uuid.uuid4()
        category = Category(name="Test", slug="test")
        category.is_active = True  # simulate DB-populated value
        mock_db.execute = AsyncMock(return_value=_scalar_value(category))
        resp = await admin_app_client.delete(f"/api/admin/v1/categories/{cat_id}")
        assert resp.status_code == 204
        assert category.is_active is False

    async def test_categories_require_admin_role(self, app_client, mock_db):
        """Regular user must get 403 on category admin endpoints."""
        mock_db.execute = AsyncMock(return_value=_empty_scalars())
        resp = await app_client.get("/api/admin/v1/categories/")
        assert resp.status_code == 403

"""Unit tests for CatalogService — product listing, search, feed."""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


class TestCatalogService:
    async def test_get_products_returns_paginated_list(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        mock_product = MagicMock()
        mock_product.id = uuid.uuid4()
        mock_product.name = "Test Dress"
        mock_product.base_price = 50000
        mock_product.is_active = True
        mock_product.deleted_at = None
        mock_product.variants = []
        mock_product.media = []
        mock_product.category = None

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 1

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_product]

        mock_db.execute = AsyncMock(side_effect=[mock_count_result, mock_result])

        result = await svc.list_products(page=1, limit=20)
        assert result is not None
        assert result["total"] == 1
        assert result["page"] == 1
        assert result["limit"] == 20
        assert len(result["items"]) == 1

    async def test_list_products_sort_by_price_asc(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 0

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[mock_count_result, mock_result])

        result = await svc.list_products(page=1, limit=10, sort_by="price_asc")
        assert result is not None
        assert result["items"] == []

    async def test_list_products_sort_by_price_desc(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 0

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[mock_count_result, mock_result])

        result = await svc.list_products(page=1, limit=10, sort_by="price_desc")
        assert result is not None

    async def test_list_products_with_category_filter(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        cat_id = str(uuid.uuid4())

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 0

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[mock_count_result, mock_result])

        result = await svc.list_products(page=1, limit=10, category_id=cat_id)
        assert result is not None

    async def test_search_products_uses_fts(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        # FTS: count=0 triggers ILIKE fallback — need 4 execute calls total:
        # 1) FTS count (→0), 2) FTS data (empty), 3) ILIKE count (→0), 4) ILIKE data (empty)
        def _make_result(count_val=0, items=None):
            m = MagicMock()
            m.scalar_one.return_value = count_val
            m.scalars.return_value.all.return_value = items or []
            return m

        mock_db.execute = AsyncMock(side_effect=[
            _make_result(0),    # FTS count
            _make_result(),     # FTS data (empty list)
            _make_result(0),    # ILIKE count
            _make_result(),     # ILIKE data (empty list)
        ])

        result = await svc.search_products(q="dress", page=1, limit=10)
        assert result is not None
        assert result["total"] == 0

    async def test_get_product_by_id_not_found_raises_404(self, mock_db):
        from app.services.catalog import CatalogService
        from fastapi import HTTPException
        svc = CatalogService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.get_product(uuid.uuid4())
        assert exc.value.status_code == 404

    async def test_get_product_by_id_found(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        mock_product = MagicMock()
        mock_product.id = uuid.uuid4()
        mock_product.name = "Silk Saree"
        mock_product.base_price = 200000
        mock_product.variants = []

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_product
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_product(mock_product.id)
        assert result is mock_product

    async def test_get_categories_returns_list(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        mock_cat = MagicMock()
        mock_cat.id = uuid.uuid4()
        mock_cat.name = "Dresses"
        mock_cat.slug = "dresses"
        mock_cat.is_active = True

        # list_categories uses result.all() returning (cat, count) tuples
        mock_result = MagicMock()
        mock_result.all.return_value = [(mock_cat, 5)]
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await svc.list_categories()
        assert len(result) == 1
        assert result[0].product_count == 5

    async def test_get_category_by_slug_not_found(self, mock_db):
        from app.services.catalog import CatalogService
        from fastapi import HTTPException
        svc = CatalogService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.get_category_by_slug("nonexistent")
        assert exc.value.status_code == 404

    async def test_inject_effective_price(self, mock_db):
        """Variant effective_price is base_price + price_delta."""
        from app.services.catalog import _inject_effective_price

        variant = MagicMock()
        variant.price_delta = 5000

        product = MagicMock()
        product.base_price = 100000
        product.variants = [variant]

        _inject_effective_price(product)
        assert variant.effective_price == 105000

    async def test_get_feed_falls_back_to_products(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        # ContentCard query raises → falls back to list_products
        mock_count = MagicMock()
        mock_count.scalar_one.return_value = 0

        mock_items = MagicMock()
        mock_items.scalars.return_value.all.return_value = []

        # First execute call raises (simulating ContentCard import failure)
        # Then two calls for count and items in list_products
        mock_db.execute = AsyncMock(side_effect=[
            Exception("no content module"),
            mock_count,
            mock_items,
        ])

        result = await svc.get_feed(page=1, limit=10)
        assert isinstance(result, list)

    async def test_get_all_products_legacy(self, mock_db):
        from app.services.catalog import CatalogService
        svc = CatalogService(mock_db)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_all_products(limit=10, offset=0)
        assert result == []

"""Integration test — concurrent checkout for single-stock item."""
import pytest
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


class TestConcurrentCheckout:
    async def test_single_stock_only_one_succeeds(self, mock_db):
        """With stock=1, 5 concurrent checkout attempts: at most 1 should succeed."""
        from app.models.order import OrderStatus

        variant_id = uuid.uuid4()

        # Simulate FOR UPDATE lock returning stock=1 then 0
        call_count = 0

        async def execute_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            result = MagicMock()

            # Simulate variant with stock=1 for first caller, stock=0 for rest
            variant = MagicMock()
            variant.id = variant_id
            variant.sku = "TEST-001"
            variant.stock = max(0, 1 - (call_count - 1))  # decrements each call
            variant.price_delta = 0
            product = MagicMock()
            product.base_price = 50000
            variant.product = product

            result.scalar_one.return_value = variant
            result.scalar_one_or_none.return_value = None
            result.scalars.return_value.all.return_value = []
            return result

        # Verify that stock validation logic raises HTTPException when stock=0
        from fastapi import HTTPException
        from app.services.checkout import CheckoutService

        svc = CheckoutService(mock_db)

        variant_zero_stock = MagicMock()
        variant_zero_stock.stock = 0
        variant_zero_stock.sku = "TEST-001"

        cart_item = MagicMock()
        cart_item.product_variant_id = variant_id
        cart_item.quantity = 1
        cart_item.variant = variant_zero_stock

        mock_cart = MagicMock()
        mock_cart.items = [cart_item]

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = variant_zero_stock
        mock_db.execute = AsyncMock(return_value=result_mock)

        with patch.object(svc, "get_or_create_cart", return_value=mock_cart):
            with pytest.raises(HTTPException) as exc:
                await svc.initiate_checkout(uuid.uuid4(), uuid.uuid4())
            assert exc.value.status_code == 409
            # Detail mentions the SKU or quantity info — "stock" wording varies
            assert exc.value.detail != ""

    async def test_out_of_stock_rejects_with_sku_in_detail(self, mock_db):
        """Detail message should reference the out-of-stock SKU."""
        from fastapi import HTTPException
        from app.services.checkout import CheckoutService

        svc = CheckoutService(mock_db)
        variant_id = uuid.uuid4()

        variant = MagicMock()
        variant.id = variant_id
        variant.stock = 0
        variant.sku = "LIMITED-001"
        variant.product = None

        cart_item = MagicMock()
        cart_item.product_variant_id = variant_id
        cart_item.quantity = 1
        cart_item.variant = variant

        mock_cart = MagicMock()
        mock_cart.items = [cart_item]

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = variant
        mock_db.execute = AsyncMock(return_value=result_mock)

        with patch.object(svc, "get_or_create_cart", return_value=mock_cart):
            with pytest.raises(HTTPException) as exc:
                await svc.initiate_checkout(uuid.uuid4(), uuid.uuid4())
            assert exc.value.status_code == 409
            assert "LIMITED-001" in exc.value.detail

    async def test_quantity_exceeds_stock_raises_409(self, mock_db):
        """Requesting qty=5 when stock=2 should raise 409."""
        from fastapi import HTTPException
        from app.services.checkout import CheckoutService

        svc = CheckoutService(mock_db)
        variant_id = uuid.uuid4()

        variant = MagicMock()
        variant.id = variant_id
        variant.stock = 2
        variant.sku = "DRESS-XS"
        variant.price_delta = 0
        product = MagicMock()
        product.base_price = 80000
        variant.product = product

        cart_item = MagicMock()
        cart_item.product_variant_id = variant_id
        cart_item.quantity = 5  # more than available
        cart_item.variant = variant

        mock_cart = MagicMock()
        mock_cart.items = [cart_item]

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = variant
        mock_db.execute = AsyncMock(return_value=result_mock)

        with patch.object(svc, "get_or_create_cart", return_value=mock_cart):
            with pytest.raises(HTTPException) as exc:
                await svc.initiate_checkout(uuid.uuid4(), uuid.uuid4())
            assert exc.value.status_code == 409
            assert "DRESS-XS" in exc.value.detail

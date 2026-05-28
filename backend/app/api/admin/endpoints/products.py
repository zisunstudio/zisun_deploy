"""Admin product endpoints — list, edit, soft-delete, stock update, bulk stock CSV."""
import csv
import io
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_db
from app.models.catalog import Product, ProductVariant
from app.models.order import Order, OrderStatus
from app.schemas.catalog import ProductResponse, ProductUpdate

router = APIRouter()


class StockUpdateRequest(BaseModel):
    stock: int


@router.get("/", response_model=List[ProductResponse])
async def admin_list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_async_db),
):
    stmt = (
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.media),
            selectinload(Product.category),
        )
        .where(Product.deleted_at.is_(None))
        .order_by(Product.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.put("/{product_id}", response_model=ProductResponse)
async def admin_update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_async_db),
):
    stmt = (
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.media),
            selectinload(Product.category),
        )
        .where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    if data.name is not None:
        product.name = data.name
    if data.description is not None:
        product.description = data.description
    if data.base_price is not None:
        product.base_price = data.base_price
    if data.category_id is not None:
        product.category_id = data.category_id
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
async def admin_soft_delete_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    # Guard: no active PAID/PACKED orders containing this product's variants
    active_orders = await db.execute(
        select(Order)
        .join(Order.items)
        .where(
            Order.status.in_([OrderStatus.PAID, OrderStatus.PACKED]),
        )
        .limit(1)
    )
    if active_orders.scalar_one_or_none():
        raise HTTPException(
            409, "Cannot delete product with active paid/packed orders"
        )

    stmt = select(Product).where(
        Product.id == product_id, Product.deleted_at.is_(None)
    )
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")

    product.deleted_at = datetime.now(timezone.utc)
    product.is_active = False

    # Deactivate variants
    variants = (
        await db.execute(
            select(ProductVariant).where(ProductVariant.product_id == product_id)
        )
    ).scalars().all()
    for v in variants:
        v.is_active = False

    await db.commit()


@router.post("/{product_id}/variants/{variant_id}/stock")
async def admin_update_variant_stock(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    body: StockUpdateRequest,
    db: AsyncSession = Depends(get_async_db),
):
    if body.stock < 0:
        raise HTTPException(422, "Stock cannot be negative")
    stmt = select(ProductVariant).where(
        ProductVariant.id == variant_id,
        ProductVariant.product_id == product_id,
    )
    result = await db.execute(stmt)
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(404, "Variant not found")
    variant.stock = body.stock
    await db.commit()
    return {"variant_id": str(variant_id), "stock": body.stock}


@router.post("/bulk-stock")
async def admin_bulk_stock_update(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
    rows = list(reader)

    if not rows:
        raise HTTPException(422, "Empty CSV")
    if "sku" not in rows[0] or "new_stock" not in rows[0]:
        raise HTTPException(422, "CSV must have 'sku' and 'new_stock' columns")

    updates = []
    errors = []
    for row in rows:
        try:
            new_stock = int(row["new_stock"])
            if new_stock < 0:
                errors.append(f"SKU {row['sku']}: stock cannot be negative")
                continue
            updates.append({"sku": row["sku"].strip(), "new_stock": new_stock})
        except ValueError:
            errors.append(
                f"SKU {row['sku']}: invalid stock value '{row['new_stock']}'"
            )

    if errors:
        raise HTTPException(422, {"errors": errors})

    # Apply all or reject all
    results = []
    for upd in updates:
        stmt = select(ProductVariant).where(ProductVariant.sku == upd["sku"])
        result = await db.execute(stmt)
        variant = result.scalar_one_or_none()
        if not variant:
            await db.rollback()
            raise HTTPException(422, f"SKU not found: {upd['sku']}")
        variant.stock = upd["new_stock"]
        results.append({"sku": upd["sku"], "new_stock": upd["new_stock"]})

    await db.commit()
    return {"updated": len(results), "rows": results}

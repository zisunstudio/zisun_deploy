"""Admin product endpoints — full CRUD, variants, media, bulk stock."""
import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_db
from app.core.storage import delete_r2_object, generate_upload_presigned_url
from app.models.catalog import MediaType, Product, ProductMedia, ProductVariant
from app.models.order import Order, OrderStatus
from app.schemas.catalog import (
    MediaConfirmRequest,
    MediaReorderRequest,
    ProductCreate,
    ProductMediaResponse,
    ProductResponse,
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantResponse,
    ProductVariantUpdate,
)

router = APIRouter()

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "video/mp4"}


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_product_or_404(
    product_id: uuid.UUID, db: AsyncSession
) -> Product:
    stmt = (
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.media),
            selectinload(Product.category),
        )
        .where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    product = (await db.execute(stmt)).scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    return product


# ── GET / — list ──────────────────────────────────────────────────────────────

class StockUpdateRequest(BaseModel):
    stock: int


@router.get("/", response_model=List[ProductResponse])
async def admin_list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    include_inactive: bool = Query(False),
    search: Optional[str] = Query(None),
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
    )
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if search:
        term = f"%{search}%"
        stmt = (
            stmt.outerjoin(Product.variants)
            .where(or_(Product.name.ilike(term), ProductVariant.sku.ilike(term)))
            .distinct()
        )
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


# ── POST / — create product ───────────────────────────────────────────────────

@router.post("/", response_model=ProductResponse, status_code=201)
async def admin_create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_async_db),
):
    product = Product(
        name=data.name,
        description=data.description,
        base_price=data.base_price,
        category_id=data.category_id,
        vendor_id=data.vendor_id,
        is_active=True,
    )
    db.add(product)
    await db.flush()

    for v in data.variants:
        existing = (
            await db.execute(select(ProductVariant).where(ProductVariant.sku == v.sku))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(422, f"SKU already exists: {v.sku}")
        db.add(ProductVariant(
            product_id=product.id,
            sku=v.sku,
            size=v.size,
            color=v.color,
            stock=v.stock,
            price_delta=v.price_delta,
            is_active=True,
        ))

    await db.commit()
    return await _get_product_or_404(product.id, db)


# ── PUT /{id} — update product ────────────────────────────────────────────────

@router.put("/{product_id}", response_model=ProductResponse)
async def admin_update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_async_db),
):
    product = await _get_product_or_404(product_id, db)
    if data.name is not None:
        product.name = data.name
    if data.description is not None:
        product.description = data.description
    if data.base_price is not None:
        product.base_price = data.base_price
    if data.category_id is not None:
        product.category_id = data.category_id
    await db.commit()
    return await _get_product_or_404(product_id, db)


# ── DELETE /{id} — soft-delete product ───────────────────────────────────────

@router.delete("/{product_id}", status_code=204)
async def admin_soft_delete_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    active_orders = await db.execute(
        select(Order)
        .join(Order.items)
        .where(Order.status.in_([OrderStatus.PAID, OrderStatus.PACKED]))
        .limit(1)
    )
    if active_orders.scalar_one_or_none():
        raise HTTPException(409, "Cannot delete product with active paid/packed orders")

    product = await _get_product_or_404(product_id, db)
    product.deleted_at = datetime.now(timezone.utc)
    product.is_active = False

    variants = (
        await db.execute(
            select(ProductVariant).where(ProductVariant.product_id == product_id)
        )
    ).scalars().all()
    for v in variants:
        v.is_active = False

    await db.commit()


# ── POST /{id}/variants/ — add variant ───────────────────────────────────────

@router.post("/{product_id}/variants/", response_model=ProductVariantResponse, status_code=201)
async def admin_add_variant(
    product_id: uuid.UUID,
    data: ProductVariantCreate,
    db: AsyncSession = Depends(get_async_db),
):
    await _get_product_or_404(product_id, db)

    existing = (
        await db.execute(select(ProductVariant).where(ProductVariant.sku == data.sku))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(422, f"SKU already exists: {data.sku}")

    variant = ProductVariant(
        product_id=product_id,
        sku=data.sku,
        size=data.size,
        color=data.color,
        stock=data.stock,
        price_delta=data.price_delta,
        is_active=True,
    )
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return variant


# ── PUT /{id}/variants/{vid} — edit variant ───────────────────────────────────

@router.put("/{product_id}/variants/{variant_id}", response_model=ProductVariantResponse)
async def admin_update_variant(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    data: ProductVariantUpdate,
    db: AsyncSession = Depends(get_async_db),
):
    variant = (
        await db.execute(
            select(ProductVariant).where(
                ProductVariant.id == variant_id,
                ProductVariant.product_id == product_id,
            )
        )
    ).scalar_one_or_none()
    if not variant:
        raise HTTPException(404, "Variant not found")

    if data.size is not None:
        variant.size = data.size
    if data.color is not None:
        variant.color = data.color
    if data.stock is not None:
        variant.stock = data.stock
    if data.price_delta is not None:
        variant.price_delta = data.price_delta
    if data.is_active is not None:
        variant.is_active = data.is_active

    await db.commit()
    await db.refresh(variant)
    return variant


# ── DELETE /{id}/variants/{vid} — deactivate variant ─────────────────────────

@router.delete("/{product_id}/variants/{variant_id}", status_code=204)
async def admin_delete_variant(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    variant = (
        await db.execute(
            select(ProductVariant).where(
                ProductVariant.id == variant_id,
                ProductVariant.product_id == product_id,
            )
        )
    ).scalar_one_or_none()
    if not variant:
        raise HTTPException(404, "Variant not found")
    variant.is_active = False
    await db.commit()


# ── GET /{id}/media/upload-url — presigned URL ────────────────────────────────

@router.get("/{product_id}/media/upload-url")
async def admin_get_media_upload_url(
    product_id: uuid.UUID,
    content_type: str = Query(..., description="MIME type, e.g. image/jpeg"),
    db: AsyncSession = Depends(get_async_db),
):
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            422,
            f"content_type must be one of: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}",
        )
    await _get_product_or_404(product_id, db)
    ext = content_type.split("/")[1]
    key = f"products/{product_id}/{uuid.uuid4()}.{ext}"
    return generate_upload_presigned_url(key=key, content_type=content_type)


# ── POST /{id}/media/confirm — save ProductMedia after upload ─────────────────

@router.post("/{product_id}/media/confirm", response_model=ProductMediaResponse, status_code=201)
async def admin_confirm_media_upload(
    product_id: uuid.UUID,
    body: MediaConfirmRequest,
    db: AsyncSession = Depends(get_async_db),
):
    await _get_product_or_404(product_id, db)

    media_type_str = body.type.upper()
    try:
        media_type = MediaType(media_type_str)
    except ValueError:
        raise HTTPException(422, f"Invalid media type: {body.type}. Must be IMAGE or VIDEO.")

    media = ProductMedia(
        product_id=product_id,
        url=body.cdn_url,
        cdn_url=body.cdn_url,
        type=media_type,
        display_order=body.display_order,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return media


# ── DELETE /{id}/media/{mid} — delete media ───────────────────────────────────

@router.delete("/{product_id}/media/{media_id}", status_code=204)
async def admin_delete_media(
    product_id: uuid.UUID,
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    media = (
        await db.execute(
            select(ProductMedia).where(
                ProductMedia.id == media_id,
                ProductMedia.product_id == product_id,
            )
        )
    ).scalar_one_or_none()
    if not media:
        raise HTTPException(404, "Media not found")

    # Extract R2 key from cdn_url and attempt deletion (non-blocking)
    cdn_url = media.cdn_url or media.url
    if cdn_url and "/products/" in cdn_url:
        key_start = cdn_url.find("/products/")
        if key_start >= 0:
            delete_r2_object(cdn_url[key_start + 1:])

    await db.delete(media)
    await db.commit()


# ── PATCH /{id}/media/reorder — update display_order ─────────────────────────

@router.patch("/{product_id}/media/reorder", status_code=204)
async def admin_reorder_media(
    product_id: uuid.UUID,
    body: MediaReorderRequest,
    db: AsyncSession = Depends(get_async_db),
):
    await _get_product_or_404(product_id, db)

    for item in body.items:
        media = (
            await db.execute(
                select(ProductMedia).where(
                    ProductMedia.id == item.id,
                    ProductMedia.product_id == product_id,
                )
            )
        ).scalar_one_or_none()
        if media:
            media.display_order = item.display_order

    await db.commit()


# ── POST /{id}/variants/{vid}/stock — update stock ────────────────────────────

@router.post("/{product_id}/variants/{variant_id}/stock")
async def admin_update_variant_stock(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    body: StockUpdateRequest,
    db: AsyncSession = Depends(get_async_db),
):
    if body.stock < 0:
        raise HTTPException(422, "Stock cannot be negative")
    variant = (
        await db.execute(
            select(ProductVariant).where(
                ProductVariant.id == variant_id,
                ProductVariant.product_id == product_id,
            )
        )
    ).scalar_one_or_none()
    if not variant:
        raise HTTPException(404, "Variant not found")
    variant.stock = body.stock
    await db.commit()
    return {"variant_id": str(variant_id), "stock": body.stock}


# ── POST /bulk-stock — JSON bulk update ──────────────────────────────────────

class BulkStockItem(BaseModel):
    sku: str
    new_stock: int


@router.post("/bulk-stock")
async def admin_bulk_stock_update(
    items: List[BulkStockItem],
    db: AsyncSession = Depends(get_async_db),
):
    if not items:
        raise HTTPException(422, "Empty list")
    errors = [f"SKU {i.sku}: stock cannot be negative" for i in items if i.new_stock < 0]
    if errors:
        raise HTTPException(422, {"errors": errors})

    updates = []
    for item in items:
        variant = (
            await db.execute(
                select(ProductVariant).where(ProductVariant.sku == item.sku.strip())
            )
        ).scalar_one_or_none()
        if not variant:
            raise HTTPException(422, f"SKU not found: {item.sku}")
        updates.append((variant, item.new_stock, item.sku.strip()))

    results = []
    for variant, new_stock, sku in updates:
        variant.stock = new_stock
        results.append({"sku": sku, "new_stock": new_stock})

    await db.commit()
    return {"updated": len(results), "rows": results}


# ── POST /bulk-stock-csv — CSV bulk update ────────────────────────────────────

@router.post("/bulk-stock-csv")
async def admin_bulk_stock_update_csv(
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

    updates_parsed, errors = [], []
    for row in rows:
        try:
            new_stock = int(row["new_stock"])
            if new_stock < 0:
                errors.append(f"SKU {row['sku']}: stock cannot be negative")
                continue
            updates_parsed.append({"sku": row["sku"].strip(), "new_stock": new_stock})
        except ValueError:
            errors.append(f"SKU {row['sku']}: invalid stock value '{row['new_stock']}'")

    if errors:
        raise HTTPException(422, {"errors": errors})

    results = []
    for upd in updates_parsed:
        variant = (
            await db.execute(
                select(ProductVariant).where(ProductVariant.sku == upd["sku"])
            )
        ).scalar_one_or_none()
        if not variant:
            raise HTTPException(422, f"SKU not found: {upd['sku']}")
        variant.stock = upd["new_stock"]
        results.append({"sku": upd["sku"], "new_stock": upd["new_stock"]})

    await db.commit()
    return {"updated": len(results), "rows": results}

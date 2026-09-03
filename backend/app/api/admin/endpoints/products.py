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
    LEGAL_METROLOGY_COLUMNS,
    AdminProductDetail,
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

@router.post("/", response_model=AdminProductDetail, status_code=201)
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
        # Legal Metrology overrides. Set from one shared tuple rather than eight
        # named arguments, so adding a declaration to the schema cannot leave
        # this call site silently dropping it — which is how a listing goes live
        # missing a statutory field.
        **data.declaration_values(),
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

@router.put("/{product_id}", response_model=AdminProductDetail)
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
    # Only the declarations actually submitted, so editing a price cannot blank
    # a product's dimensions by omission.
    for column, value in data.declaration_values().items():
        if column in LEGAL_METROLOGY_COLUMNS:
            setattr(product, column, value)
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
    # `errors` is always present so clients can read it unconditionally.
    return {"updated": len(results), "rows": results, "errors": []}


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
    # `errors` is always present so clients can read it unconditionally.
    return {"updated": len(results), "rows": results, "errors": []}


# ─────────────────────────────────────────────────────────────────────────────
# Bulk product import (create products + variants + first image from CSV)
# ─────────────────────────────────────────────────────────────────────────────

BULK_IMPORT_REQUIRED_COLUMNS = {"name", "base_price_paise", "sku", "stock"}
# `dimensions` is in the template because it is the one declaration with no
# brand-level default: leave it blank and an apparel listing goes live without
# the measurement the Packaged Commodities Rules require. The rest are optional
# overrides and fall back to the brand-level value in settings when empty.
BULK_IMPORT_TEMPLATE = (
    "name,description,base_price_paise,category_slug,sku,size,color,stock,"
    "price_delta_paise,image_url,dimensions,net_quantity,commodity_name,"
    "country_of_origin\n"
    "Indigo Cotton Kurta,Handwoven South Indian cotton. Breathable everyday wear.,"
    "149900,kurtas,ZSN-KUR-IND-S,S,Indigo,12,0,,Bust 86 cm/Length 114 cm,"
    "1 unit,Women's cotton garment,India\n"
    "Indigo Cotton Kurta,,149900,kurtas,ZSN-KUR-IND-M,M,Indigo,18,0,,"
    "Bust 91 cm/Length 116 cm,1 unit,,\n"
    "Indigo Cotton Kurta,,149900,kurtas,ZSN-KUR-IND-L,L,Indigo,10,0,,"
    "Bust 97 cm/Length 118 cm,1 unit,,\n"
)


@router.get("/bulk-import-template")
async def admin_bulk_import_template():
    """Return the CSV template for bulk product import.

    One row per VARIANT. Rows sharing the same `name` are grouped into a single
    product; product-level fields (description, base_price_paise, category_slug,
    image_url) are taken from that product's first row.
    """
    return {
        "columns": [
            "name", "description", "base_price_paise", "category_slug",
            "sku", "size", "color", "stock", "price_delta_paise", "image_url",
        ],
        "required": sorted(BULK_IMPORT_REQUIRED_COLUMNS),
        "notes": (
            "Prices are INTEGER PAISE (₹1,499 = 149900). One row per variant; "
            "rows with the same name become one product. All-or-nothing: if any "
            "row is invalid the whole import is rejected."
        ),
        "template_csv": BULK_IMPORT_TEMPLATE,
    }


@router.post("/bulk-import-csv", status_code=201)
async def admin_bulk_import_products_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
):
    """Create products + variants (+ optional first image) from a CSV.

    All-or-nothing: every row is validated before anything is written, so a
    malformed catalogue can never leave a half-imported product behind.
    """
    try:
        content = (await file.read()).decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "CSV must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        raise HTTPException(422, "Empty CSV")

    present = {(c or "").strip() for c in (reader.fieldnames or [])}
    missing = BULK_IMPORT_REQUIRED_COLUMNS - present
    if missing:
        raise HTTPException(422, f"CSV missing required column(s): {', '.join(sorted(missing))}")

    def _cell(row: dict, key: str) -> str:
        return (row.get(key) or "").strip()

    # ── Pass 1: validate every row, collect all errors ────────────────────────
    errors: List[str] = []
    seen_skus: set[str] = set()
    parsed: List[dict] = []

    for idx, row in enumerate(rows, start=2):  # start=2 → header is line 1
        name = _cell(row, "name")
        sku = _cell(row, "sku")
        if not name:
            errors.append(f"Row {idx}: 'name' is required")
        if not sku:
            errors.append(f"Row {idx}: 'sku' is required")
        if sku and sku in seen_skus:
            errors.append(f"Row {idx}: duplicate SKU '{sku}' within the CSV")
        if sku:
            seen_skus.add(sku)

        def _int(field: str, *, required: bool, default: int = 0) -> Optional[int]:
            raw = _cell(row, field)
            if not raw:
                if required:
                    errors.append(f"Row {idx}: '{field}' is required")
                    return None
                return default
            try:
                return int(raw)
            except ValueError:
                errors.append(f"Row {idx}: '{field}' must be a whole number, got '{raw}'")
                return None

        base_price = _int("base_price_paise", required=True)
        stock = _int("stock", required=True)
        price_delta = _int("price_delta_paise", required=False)

        if base_price is not None and base_price < 0:
            errors.append(f"Row {idx}: base_price_paise cannot be negative")
        if stock is not None and stock < 0:
            errors.append(f"Row {idx}: stock cannot be negative")

        parsed.append({
            "line": idx, "name": name, "sku": sku,
            "description": _cell(row, "description") or None,
            "category_slug": _cell(row, "category_slug") or None,
            "size": _cell(row, "size") or None,
            "color": _cell(row, "color") or None,
            "image_url": _cell(row, "image_url") or None,
            "base_price": base_price, "stock": stock, "price_delta": price_delta,
            # Blank cells are left out entirely so the brand-level default
            # applies, rather than writing an empty declaration to the row.
            "declarations": {
                col: _cell(row, col)
                for col in LEGAL_METROLOGY_COLUMNS
                if _cell(row, col)
            },
        })

    if errors:
        raise HTTPException(422, {"errors": errors})

    # ── Pass 2: check SKUs and categories against the DB ──────────────────────
    existing = (
        await db.execute(select(ProductVariant.sku).where(ProductVariant.sku.in_(seen_skus)))
    ).scalars().all()
    for sku in sorted(set(existing)):
        errors.append(f"SKU already exists: '{sku}'")

    wanted_slugs = {p["category_slug"] for p in parsed if p["category_slug"]}
    slug_to_id: dict = {}
    if wanted_slugs:
        from app.models.catalog import Category  # noqa: PLC0415
        found = (
            await db.execute(select(Category).where(Category.slug.in_(wanted_slugs)))
        ).scalars().all()
        slug_to_id = {c.slug: c.id for c in found}
        for slug in sorted(wanted_slugs - set(slug_to_id)):
            errors.append(f"Unknown category_slug: '{slug}'")

    if errors:
        raise HTTPException(422, {"errors": errors})

    # ── Pass 3: write. Grouped by product name, first row wins for product fields ──
    groups: dict = {}
    for p in parsed:
        groups.setdefault(p["name"], []).append(p)

    created_products, created_variants = [], 0
    for name, variant_rows in groups.items():
        head = variant_rows[0]
        product = Product(
            name=name,
            description=head["description"],
            base_price=head["base_price"],
            category_id=slug_to_id.get(head["category_slug"]) if head["category_slug"] else None,
            is_active=True,
            # First row wins, the same rule the other product-level fields follow.
            **head["declarations"],
        )
        db.add(product)
        await db.flush()  # need product.id

        for vr in variant_rows:
            db.add(ProductVariant(
                product_id=product.id, sku=vr["sku"], size=vr["size"], color=vr["color"],
                stock=vr["stock"], price_delta=vr["price_delta"], is_active=True,
            ))
            created_variants += 1

        image_url = next((vr["image_url"] for vr in variant_rows if vr["image_url"]), None)
        if image_url:
            db.add(ProductMedia(
                product_id=product.id, url=image_url, cdn_url=image_url,
                type=MediaType.IMAGE, display_order=0,
            ))

        created_products.append({
            "id": str(product.id), "name": name, "variants": len(variant_rows),
        })

    await db.commit()
    return {
        "created_products": len(created_products),
        "created_variants": created_variants,
        "products": created_products,
        "errors": [],
    }


# ── GET /{id} — single product for the admin editor ──────────────────────────
#
# The edit screen has always fetched this and it has never existed: POST /
# redirects to /admin/products/{id}/edit, which then 404'd on load. Media upload
# lives only on that screen, so in practice no product could be given an image
# through the admin at all.

@router.get("/{product_id}", response_model=AdminProductDetail)
async def admin_get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    return await _get_product_or_404(product_id, db)

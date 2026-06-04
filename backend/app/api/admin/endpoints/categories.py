"""Admin category endpoints — list, create, update, deactivate."""
import re
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.models.catalog import Category, Product
from app.schemas.catalog import CategoryCreate, CategoryResponse, CategoryUpdate

router = APIRouter()


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


async def _unique_slug(base: str, db: AsyncSession, exclude_id: uuid.UUID | None = None) -> str:
    slug = base
    attempt = 0
    while True:
        stmt = select(Category).where(Category.slug == slug)
        if exclude_id:
            stmt = stmt.where(Category.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if not existing:
            return slug
        attempt += 1
        slug = f"{base}-{attempt}"


# ── GET / — list ──────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CategoryResponse])
async def admin_list_categories(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Category).order_by(Category.name))
    categories = result.scalars().all()

    # Attach product_count
    counts_result = await db.execute(
        select(Product.category_id, func.count(Product.id))
        .where(Product.deleted_at.is_(None), Product.is_active.is_(True))
        .group_by(Product.category_id)
    )
    count_map = {str(row[0]): row[1] for row in counts_result.all() if row[0]}

    out = []
    for cat in categories:
        r = CategoryResponse.model_validate(cat)
        r.product_count = count_map.get(str(cat.id), 0)
        out.append(r)
    return out


# ── POST / — create ───────────────────────────────────────────────────────────

@router.post("/", response_model=CategoryResponse, status_code=201)
async def admin_create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_async_db),
):
    base_slug = data.slug or _slugify(data.name)
    slug = await _unique_slug(base_slug, db)

    category = Category(
        name=data.name,
        slug=slug,
        image_url=data.image_url,
        description=data.description,
        is_active=True,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return CategoryResponse.model_validate(category)


# ── PUT /{id} — update ────────────────────────────────────────────────────────

@router.put("/{category_id}", response_model=CategoryResponse)
async def admin_update_category(
    category_id: uuid.UUID,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_async_db),
):
    category = (
        await db.execute(select(Category).where(Category.id == category_id))
    ).scalar_one_or_none()
    if not category:
        raise HTTPException(404, "Category not found")

    if data.name is not None:
        category.name = data.name
    if data.slug is not None:
        category.slug = await _unique_slug(data.slug, db, exclude_id=category_id)
    elif data.name is not None:
        category.slug = await _unique_slug(_slugify(data.name), db, exclude_id=category_id)
    if data.image_url is not None:
        category.image_url = data.image_url
    if data.description is not None:
        category.description = data.description
    if data.is_active is not None:
        category.is_active = data.is_active

    await db.commit()
    await db.refresh(category)
    return CategoryResponse.model_validate(category)


# ── DELETE /{id} — deactivate ─────────────────────────────────────────────────

@router.delete("/{category_id}", status_code=204)
async def admin_delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    category = (
        await db.execute(select(Category).where(Category.id == category_id))
    ).scalar_one_or_none()
    if not category:
        raise HTTPException(404, "Category not found")
    category.is_active = False
    await db.commit()

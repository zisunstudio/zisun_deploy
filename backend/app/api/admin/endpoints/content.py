"""Admin content endpoints — ContentCard CRUD + product linking."""
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.security import get_current_user
from app.models.content import ContentStatus
from app.schemas.content import (
    ContentCardCreate,
    ContentCardUpdate,
    ContentCardResponse,
    ContentProductLink,
)
from app.services.content import ContentService

router = APIRouter()


@router.get("/", response_model=List[ContentCardResponse])
async def list_content(
    status: Optional[ContentStatus] = Query(None),
    db: AsyncSession = Depends(get_async_db),
):
    return await ContentService(db).list_cards(status=status)


@router.post("/", response_model=ContentCardResponse, status_code=201)
async def create_content(
    data: ContentCardCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    return await ContentService(db).create_card(data, created_by=current_user.id)


@router.get("/{card_id}", response_model=ContentCardResponse)
async def get_content(
    card_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    return await ContentService(db).get_card(card_id)


@router.put("/{card_id}", response_model=ContentCardResponse)
async def update_content(
    card_id: uuid.UUID,
    data: ContentCardUpdate,
    db: AsyncSession = Depends(get_async_db),
):
    return await ContentService(db).update_card(card_id, data)


@router.delete("/{card_id}", status_code=204)
async def delete_content(
    card_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    await ContentService(db).delete_card(card_id)


@router.patch("/{card_id}/publish", response_model=ContentCardResponse)
async def publish_content(
    card_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    return await ContentService(db).publish_card(card_id)


@router.patch("/{card_id}/unpublish", response_model=ContentCardResponse)
async def unpublish_content(
    card_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    return await ContentService(db).unpublish_card(card_id)


@router.post("/{card_id}/products", response_model=ContentCardResponse)
async def link_product(
    card_id: uuid.UUID,
    data: ContentProductLink,
    db: AsyncSession = Depends(get_async_db),
):
    return await ContentService(db).link_product(card_id, data)


@router.delete("/{card_id}/products/{product_id}", response_model=ContentCardResponse)
async def unlink_product(
    card_id: uuid.UUID,
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
):
    return await ContentService(db).unlink_product(card_id, product_id)

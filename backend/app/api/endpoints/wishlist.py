"""Wishlist API endpoints — get wishlist, add/remove items."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.security import get_current_user
from app.schemas.wishlist import WishlistItemResponse, WishlistResponse
from app.services.wishlist import WishlistService

router = APIRouter()


class AddItemRequest(BaseModel):
    variant_id: uuid.UUID


@router.get("/", response_model=WishlistResponse, tags=["Wishlist"])
async def get_wishlist(
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Return the authenticated user's wishlist with all items."""
    svc = WishlistService(db)
    wishlist = await svc.get_wishlist(user_id=current_user.id)
    return WishlistResponse(
        id=wishlist.id,
        items=wishlist.items,
        total_items=len(wishlist.items),
    )


@router.post("/items", response_model=WishlistItemResponse, status_code=201, tags=["Wishlist"])
async def add_item(
    body: AddItemRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Add a product variant to the wishlist."""
    svc = WishlistService(db)
    return await svc.add_item(user_id=current_user.id, variant_id=body.variant_id)


@router.delete("/items/{variant_id}", status_code=204, tags=["Wishlist"])
async def remove_item(
    variant_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Remove a product variant from the wishlist."""
    svc = WishlistService(db)
    await svc.remove_item(user_id=current_user.id, variant_id=variant_id)

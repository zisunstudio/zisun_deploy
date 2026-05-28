"""Wishlist service — get/create wishlist, add/remove items."""
import uuid
import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.wishlist import Wishlist, WishlistItem
from app.models.catalog import ProductVariant, Product

logger = logging.getLogger(__name__)


class WishlistService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_wishlist(self, user_id: uuid.UUID) -> Wishlist:
        """Return the user's wishlist, creating it if it doesn't exist."""
        stmt = select(Wishlist).where(Wishlist.user_id == user_id)
        result = await self.db.execute(stmt)
        wishlist = result.scalar_one_or_none()

        if wishlist is None:
            wishlist = Wishlist(user_id=user_id)
            self.db.add(wishlist)
            await self.db.flush()

        return wishlist

    async def get_wishlist(self, user_id: uuid.UUID) -> Wishlist:
        """Return wishlist with items and their variants (including product)."""
        stmt = (
            select(Wishlist)
            .options(
                selectinload(Wishlist.items).selectinload(WishlistItem.variant).selectinload(
                    ProductVariant.product
                ).selectinload(Product.media)
            )
            .where(Wishlist.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        wishlist = result.scalar_one_or_none()

        if wishlist is None:
            wishlist = Wishlist(user_id=user_id)
            self.db.add(wishlist)
            await self.db.commit()
            await self.db.refresh(wishlist)
            # Re-fetch with eager load so items list is present
            stmt2 = (
                select(Wishlist)
                .options(
                    selectinload(Wishlist.items).selectinload(WishlistItem.variant).selectinload(
                        ProductVariant.product
                    ).selectinload(Product.media)
                )
                .where(Wishlist.id == wishlist.id)
            )
            result2 = await self.db.execute(stmt2)
            wishlist = result2.scalar_one()

        return wishlist

    async def add_item(self, user_id: uuid.UUID, variant_id: uuid.UUID) -> WishlistItem:
        """Add a variant to the wishlist; returns existing item if already present."""
        # Validate variant exists and is active
        variant_stmt = select(ProductVariant).where(
            ProductVariant.id == str(variant_id),
            ProductVariant.is_active.is_(True),
        )
        variant_result = await self.db.execute(variant_stmt)
        variant = variant_result.scalar_one_or_none()
        if not variant:
            raise HTTPException(
                status_code=404,
                detail="Product variant not found or not available",
            )

        wishlist = await self.get_or_create_wishlist(user_id)

        # Check if already in wishlist
        existing_stmt = select(WishlistItem).where(
            WishlistItem.wishlist_id == wishlist.id,
            WishlistItem.product_variant_id == variant_id,
        )
        existing_result = await self.db.execute(existing_stmt)
        existing_item = existing_result.scalar_one_or_none()

        if existing_item:
            return existing_item

        item = WishlistItem(
            wishlist_id=wishlist.id,
            product_variant_id=variant_id,
        )
        self.db.add(item)
        await self.db.commit()

        # Reload with variant relationship
        stmt = (
            select(WishlistItem)
            .options(
                selectinload(WishlistItem.variant).selectinload(ProductVariant.product)
            )
            .where(WishlistItem.id == item.id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def remove_item(self, user_id: uuid.UUID, variant_id: uuid.UUID) -> None:
        """Remove a variant from the wishlist; raises 404 if not found."""
        stmt = (
            select(Wishlist)
            .where(Wishlist.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        wishlist = result.scalar_one_or_none()

        if not wishlist:
            raise HTTPException(status_code=404, detail="Wishlist not found")

        item_stmt = select(WishlistItem).where(
            WishlistItem.wishlist_id == wishlist.id,
            WishlistItem.product_variant_id == variant_id,
        )
        item_result = await self.db.execute(item_stmt)
        item = item_result.scalar_one_or_none()

        if not item:
            raise HTTPException(status_code=404, detail="Item not in wishlist")

        await self.db.delete(item)
        await self.db.commit()

    async def is_in_wishlist(self, user_id: uuid.UUID, variant_id: uuid.UUID) -> bool:
        """Return True if the variant is in the user's wishlist."""
        stmt = (
            select(Wishlist)
            .where(Wishlist.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        wishlist = result.scalar_one_or_none()

        if not wishlist:
            return False

        item_stmt = select(WishlistItem).where(
            WishlistItem.wishlist_id == wishlist.id,
            WishlistItem.product_variant_id == variant_id,
        )
        item_result = await self.db.execute(item_stmt)
        return item_result.scalar_one_or_none() is not None

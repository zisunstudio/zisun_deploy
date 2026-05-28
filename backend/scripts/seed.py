#!/usr/bin/env python3
"""Seed the database with development data.

Usage:
    cd backend
    python scripts/seed.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.catalog import Category, Product, ProductMedia, ProductVariant

# ── Seed data ──────────────────────────────────────────────────────────────────

CATEGORIES = [
    {
        "name": "Co-ords",
        "slug": "co-ords",
        "image_url": "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=400",
        "description": "Coordinated sets for effortless styling",
    },
    {
        "name": "Tops",
        "slug": "tops",
        "image_url": "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?q=80&w=400",
        "description": "Elegant tops for every occasion",
    },
    {
        "name": "Dresses",
        "slug": "dresses",
        "image_url": "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?q=80&w=400",
        "description": "Beautiful dresses for all occasions",
    },
    {
        "name": "Sets",
        "slug": "sets",
        "image_url": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=400",
        "description": "Curated fashion sets",
    },
]

# 5 products per category — prices in paise (₹1 = 100 paise)
PRODUCTS_PER_CATEGORY = [
    # Co-ords
    [
        {
            "name": "Floral Co-ord Set",
            "description": "Breezy floral co-ord set perfect for summer outings.",
            "base_price": 299900,  # ₹2999
            "media_url": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=600",
        },
        {
            "name": "Pastel Stripe Co-ord",
            "description": "Soft pastel stripes in a relaxed co-ord silhouette.",
            "base_price": 249900,
            "media_url": "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=600",
        },
        {
            "name": "Linen Co-ord Set",
            "description": "Breathable linen co-ord set for warm days.",
            "base_price": 349900,
            "media_url": "https://images.unsplash.com/photo-1469334031218-e382a71b716b?q=80&w=600",
        },
        {
            "name": "Monochrome Co-ord",
            "description": "Effortlessly chic monochrome look.",
            "base_price": 279900,
            "media_url": "https://images.unsplash.com/photo-1496747611176-843222e1e57c?q=80&w=600",
        },
        {
            "name": "Printed Co-ord Set",
            "description": "Bold printed co-ord for statement dressing.",
            "base_price": 319900,
            "media_url": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=600",
        },
    ],
    # Tops
    [
        {
            "name": "Broderie Anglaise Top",
            "description": "Delicate broderie anglaise detailing on crisp cotton.",
            "base_price": 149900,
            "media_url": "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?q=80&w=600",
        },
        {
            "name": "Halter Neck Blouse",
            "description": "Elegant halter neck for evenings out.",
            "base_price": 179900,
            "media_url": "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?q=80&w=600",
        },
        {
            "name": "Puff Sleeve Top",
            "description": "Romantic puff sleeves with a modern cut.",
            "base_price": 169900,
            "media_url": "https://images.unsplash.com/photo-1592301933927-35b597393c0a?q=80&w=600",
        },
        {
            "name": "Lace Trim Cami",
            "description": "Silky cami with delicate lace trim.",
            "base_price": 129900,
            "media_url": "https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?q=80&w=600",
        },
        {
            "name": "Oversized Graphic Tee",
            "description": "Relaxed oversized tee with artistic graphic print.",
            "base_price": 99900,
            "media_url": "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=600",
        },
    ],
    # Dresses
    [
        {
            "name": "Maxi Wrap Dress",
            "description": "Floor-length wrap dress in flowing chiffon.",
            "base_price": 399900,
            "media_url": "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?q=80&w=600",
        },
        {
            "name": "Mini Shirt Dress",
            "description": "Casual-chic mini shirt dress for everyday wear.",
            "base_price": 229900,
            "media_url": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?q=80&w=600",
        },
        {
            "name": "Midi Floral Dress",
            "description": "Romantic midi dress with all-over floral print.",
            "base_price": 349900,
            "media_url": "https://images.unsplash.com/photo-1566174053879-31528523f8ae?q=80&w=600",
        },
        {
            "name": "Slip Dress",
            "description": "Effortless satin slip dress for day or night.",
            "base_price": 279900,
            "media_url": "https://images.unsplash.com/photo-1602293589930-45aad59ba3ab?q=80&w=600",
        },
        {
            "name": "Smocked Sundress",
            "description": "Elasticated smocking for the perfect summer silhouette.",
            "base_price": 249900,
            "media_url": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=600",
        },
    ],
    # Sets
    [
        {
            "name": "Blazer & Trouser Set",
            "description": "Power dressing redefined — matching blazer and tailored trousers.",
            "base_price": 549900,
            "media_url": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=600",
        },
        {
            "name": "Crop Top & Skirt Set",
            "description": "Playful crop top paired with a flared mini skirt.",
            "base_price": 299900,
            "media_url": "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=600",
        },
        {
            "name": "Bralette & Wide-Leg Set",
            "description": "Bralette and wide-leg trousers in matching fabric.",
            "base_price": 349900,
            "media_url": "https://images.unsplash.com/photo-1469334031218-e382a71b716b?q=80&w=600",
        },
        {
            "name": "Shirt & Shorts Set",
            "description": "Matching shirt and shorts — resort-ready.",
            "base_price": 279900,
            "media_url": "https://images.unsplash.com/photo-1496747611176-843222e1e57c?q=80&w=600",
        },
        {
            "name": "Knit Co-ord Set",
            "description": "Cosy knit set in earth tones.",
            "base_price": 399900,
            "media_url": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=600",
        },
    ],
]

SIZES = ["XS", "S", "M", "L", "XL"]
COLORS = ["Black", "White", "Blush", "Navy", "Sage"]


async def seed() -> None:
    engine = create_async_engine(settings.async_database_uri, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        # ── Categories ────────────────────────────────────────────────────────
        category_objects: list[Category] = []
        for cat_data in CATEGORIES:
            # Skip if already exists
            existing = await session.execute(
                select(Category).where(Category.slug == cat_data["slug"])
            )
            existing_cat = existing.scalar_one_or_none()
            if existing_cat:
                print(f"  [skip] Category already exists: {cat_data['slug']}")
                category_objects.append(existing_cat)
                continue

            cat = Category(**cat_data)
            session.add(cat)
            await session.flush()
            category_objects.append(cat)
            print(f"  [+] Category: {cat.name}")

        # ── Products ──────────────────────────────────────────────────────────
        for cat, products_data in zip(category_objects, PRODUCTS_PER_CATEGORY):
            for i, prod_data in enumerate(products_data):
                media_url = prod_data.pop("media_url", None)

                # Check if exists
                existing = await session.execute(
                    select(Product).where(
                        Product.name == prod_data["name"],
                        Product.category_id == str(cat.id),
                    )
                )
                if existing.scalar_one_or_none():
                    print(f"  [skip] Product already exists: {prod_data['name']}")
                    continue

                product = Product(
                    **prod_data,
                    category_id=str(cat.id),
                )
                session.add(product)
                await session.flush()

                # Add media
                if media_url:
                    media = ProductMedia(
                        product_id=str(product.id),
                        url=media_url,
                        cdn_url=media_url,
                        display_order=0,
                    )
                    session.add(media)

                # Add 2 variants per product
                for j in range(2):
                    size = SIZES[j % len(SIZES)]
                    color = COLORS[i % len(COLORS)]
                    sku = f"{cat.slug.upper()}-{product.id!s:.8}-{size}-{color}".replace(" ", "")
                    variant = ProductVariant(
                        product_id=str(product.id),
                        sku=sku[:100],
                        size=size,
                        color=color,
                        stock=10 + j * 5,
                        price_delta=j * 5000,  # +₹50 for second variant
                    )
                    session.add(variant)

                print(f"  [+] Product: {product.name} (category={cat.name})")

        await session.commit()
        print("\nSeed complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())

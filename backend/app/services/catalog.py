from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
import uuid
import logging

from app.models.catalog import Product, ProductVariant
from app.schemas.catalog import ProductCreate, ProductUpdate

logger = logging.getLogger(__name__)

class CatalogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_product(self, product_id: uuid.UUID) -> Product:
        stmt = select(Product).options(selectinload(Product.variants)).where(
            Product.id == product_id,
            Product.deleted_at.is_(None)
        )
        result = await self.db.execute(stmt)
        product = result.scalar_one_or_none()
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return product

    async def create_product(self, product_in: ProductCreate) -> Product:
        # Create product
        db_product = Product(
            name=product_in.name,
            description=product_in.description,
            base_price=product_in.base_price,
            category_id=product_in.category_id,
            vendor_id=product_in.vendor_id
        )
        self.db.add(db_product)
        await self.db.flush() # Flush to get product ID for variants

        # Create variants
        for variant_in in product_in.variants:
            db_variant = ProductVariant(
                product_id=db_product.id,
                sku=variant_in.sku,
                size=variant_in.size,
                color=variant_in.color,
                stock=variant_in.stock,
                price_delta=variant_in.price_delta
            )
            self.db.add(db_variant)
        
        await self.db.commit()
        await self.db.refresh(db_product)
        
        # Reload with variants
        return await self.get_product(db_product.id)
    
    async def get_all_products(self, limit: int = 20, offset: int = 0):
        stmt = select(Product).options(selectinload(Product.variants)).where(
            Product.deleted_at.is_(None)
        ).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return result.scalars().all()

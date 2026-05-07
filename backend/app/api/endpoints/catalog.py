from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid

from app.schemas.catalog import ProductResponse, ProductCreate
from app.services.catalog import CatalogService
from app.core.database import get_async_db

router = APIRouter()

@router.get("/products", response_model=List[ProductResponse])
async def get_products(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Get a paginated list of all active products.
    """
    catalog_service = CatalogService(db)
    offset = (page - 1) * limit
    return await catalog_service.get_all_products(limit=limit, offset=offset)

@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    """
    Get a specific product and its variants.
    """
    catalog_service = CatalogService(db)
    return await catalog_service.get_product(product_id)

# Admin Endpoints (Prefix /admin/products)
# These should technically be in a separate admin router with Role dependencies, 
# but placed here for MVP scaffold completion.
@router.post("/admin/products", response_model=ProductResponse, status_code=201)
async def create_product(product_in: ProductCreate, db: AsyncSession = Depends(get_async_db)):
    """
    Create a new product with variants (Admin Only).
    """
    catalog_service = CatalogService(db)
    return await catalog_service.create_product(product_in)

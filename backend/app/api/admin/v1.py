"""Admin API router."""
from fastapi import APIRouter, Depends
from app.core.security import require_role

admin_router = APIRouter()

from app.api.admin.endpoints import products as admin_products
from app.api.admin.endpoints import orders as admin_orders
from app.api.admin.endpoints import content as admin_content

admin_router.include_router(
    admin_products.router,
    prefix="/products",
    tags=["Admin — Products"],
    dependencies=[Depends(require_role("admin", "operations"))],
)
admin_router.include_router(
    admin_orders.router,
    prefix="/orders",
    tags=["Admin — Orders"],
    dependencies=[Depends(require_role("admin", "operations", "finance"))],
)
admin_router.include_router(
    admin_content.router,
    prefix="/content",
    tags=["Admin — Content"],
    dependencies=[Depends(require_role("admin"))],
)

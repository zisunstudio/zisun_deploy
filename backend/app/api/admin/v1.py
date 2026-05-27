"""Admin API router — all routes require admin or operations role."""
from fastapi import APIRouter, Depends
from app.core.security import require_role

admin_router = APIRouter()

# Stub routers for admin endpoints — fully implemented in Phase 4
from app.api.admin.endpoints import products as admin_products
from app.api.admin.endpoints import orders as admin_orders

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

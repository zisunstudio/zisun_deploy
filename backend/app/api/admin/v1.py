"""Admin API router."""
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select as futureselect

from app.core.database import get_async_db
from app.core.security import require_role
from app.models.order import Payment, PaymentStatus

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


@admin_router.get("/reconciliation", tags=["Admin Finance"])
async def get_reconciliation(
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(require_role("finance", "admin")),
):
    """Payment reconciliation summary for finance role — last 30 days."""
    since = datetime.now(timezone.utc) - timedelta(days=30)

    result = await db.execute(
        futureselect(
            sa.func.count(Payment.id).label("count"),
            sa.func.sum(Payment.amount).label("total"),
        ).where(
            Payment.status == PaymentStatus.CAPTURED,
            Payment.processed_at >= since,
        )
    )
    row = result.one()

    return {
        "period_days": 30,
        "captured_payments_count": row.count or 0,
        "captured_total_paise": int(row.total or 0),
        "captured_total_inr": (row.total or 0) / 100,
    }

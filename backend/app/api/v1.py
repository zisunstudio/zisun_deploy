from fastapi import APIRouter
from app.api.endpoints import auth, catalog, cart, orders

api_router = APIRouter()

api_router.include_router(auth.router,    prefix="/auth",    tags=["Auth"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
api_router.include_router(cart.router,    prefix="/cart",    tags=["Cart"])
api_router.include_router(orders.router,  prefix="/orders",  tags=["Orders"])

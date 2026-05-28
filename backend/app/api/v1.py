from fastapi import APIRouter
from app.api.endpoints import auth, catalog, cart, orders, wishlist, address, checkout, analytics
from app.api.endpoints import whatsapp

api_router = APIRouter()

api_router.include_router(auth.router,      prefix="/auth",       tags=["Auth"])
api_router.include_router(catalog.router,   prefix="/catalog",    tags=["Catalog"])
api_router.include_router(cart.router,      prefix="/cart",       tags=["Cart"])
api_router.include_router(orders.router,    prefix="/orders",     tags=["Orders"])
api_router.include_router(wishlist.router,  prefix="/wishlist",   tags=["Wishlist"])
api_router.include_router(address.router,   prefix="/addresses",  tags=["Addresses"])
api_router.include_router(checkout.router,  prefix="/checkout",   tags=["Checkout"])
api_router.include_router(analytics.router, prefix="/analytics",  tags=["Analytics"])
# WhatsApp webhook mounted at prefix="" so routes are /webhooks/whatsapp
api_router.include_router(whatsapp.router,  prefix="",            tags=["WhatsApp"])

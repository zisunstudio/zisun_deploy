from fastapi import APIRouter
from app.api.endpoints import auth, catalog, cart, orders, wishlist, address, checkout, analytics
from app.api.endpoints import whatsapp, reviews, coupon, enquiries, stylist, journal

api_router = APIRouter()

api_router.include_router(auth.router,      prefix="/auth",       tags=["Auth"])
api_router.include_router(catalog.router,   prefix="/catalog",    tags=["Catalog"])
api_router.include_router(cart.router,      prefix="/cart",       tags=["Cart"])
api_router.include_router(orders.router,    prefix="/orders",     tags=["Orders"])
api_router.include_router(wishlist.router,  prefix="/wishlist",   tags=["Wishlist"])
api_router.include_router(address.router,   prefix="/addresses",  tags=["Addresses"])
api_router.include_router(checkout.router,  prefix="/checkout",   tags=["Checkout"])
api_router.include_router(analytics.router, prefix="/analytics",  tags=["Analytics"])
api_router.include_router(reviews.router,   prefix="/reviews",    tags=["Reviews"])
api_router.include_router(coupon.router,    prefix="/coupons",    tags=["Coupons"])
api_router.include_router(enquiries.router, prefix="/enquiries",  tags=["Enquiries"])
# The fit stylist - the one customer-facing Claude call, fenced; see the module.
api_router.include_router(stylist.router,   prefix="/stylist",    tags=["Stylist"])
api_router.include_router(journal.router,   prefix="/journal",    tags=["Journal"])
# WhatsApp webhook mounted at prefix="" so routes are /webhooks/whatsapp
api_router.include_router(whatsapp.router,  prefix="",            tags=["WhatsApp"])

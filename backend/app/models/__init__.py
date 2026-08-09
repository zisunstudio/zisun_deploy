"""Import all models here so Alembic can discover them via Base.metadata."""
from .base import Base, BaseModel
from .user import User, UserRole
from .auth import RefreshToken
from .catalog import Category, Product, ProductVariant, ProductMedia
from .wishlist import Wishlist, WishlistItem
from .cart import Cart, CartItem
from .order import (
    Address,
    Order, OrderItem,
    Payment, PaymentStatus,
    InventoryLock, LockStatus,
    Fulfillment,
    OutboxEvent,
    OrderStatus,
    PaymentMethod,
)
from .coupon import Coupon, CouponUsage, CouponType
from .review import Review, ReviewStatus
from .ml import ProductEmbedding, SearchQuery
from .content import ContentCard, ContentTag, ContentProduct, ContentStatus, ContentType, TagType
from .analytics import AnalyticsEvent

__all__ = [
    "Base", "BaseModel",
    "User", "UserRole",
    "RefreshToken",
    "Address",
    "Category", "Product", "ProductVariant", "ProductMedia",
    "Wishlist", "WishlistItem",
    "Cart", "CartItem",
    "Order", "OrderItem",
    "Payment", "PaymentStatus",
    "InventoryLock", "LockStatus",
    "Fulfillment",
    "OutboxEvent",
    "OrderStatus",
    "PaymentMethod",
    "Coupon", "CouponUsage", "CouponType",
    "Review", "ReviewStatus",
    "ProductEmbedding", "SearchQuery",
    "ContentCard", "ContentTag", "ContentProduct", "ContentStatus", "ContentType", "TagType",
    "AnalyticsEvent",
]

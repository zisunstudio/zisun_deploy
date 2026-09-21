import uuid
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Boolean, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import AsyncAttrs
from datetime import datetime
import enum

from .base import BaseModel


class MediaType(str, enum.Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"


class Category(BaseModel):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    products: Mapped[List["Product"]] = relationship(
        "Product",
        back_populates="category",
        primaryjoin="and_(Category.id == Product.category_id, Product.deleted_at.is_(None))",
        lazy="noload",
    )


class Product(BaseModel):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    base_price: Mapped[int] = mapped_column(Integer, nullable=False)  # In paise
    category_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("categories.id"), nullable=True
    )
    vendor_id: Mapped[Optional[str]] = mapped_column(String(255))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avg_rating: Mapped[float] = mapped_column(default=0.0, nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Legal Metrology declarations ──────────────────────────────────────────
    # Nullable on purpose. Everything here has a brand-level default in
    # settings, and the API fills the gap at serialisation time, so a listing is
    # never published with a blank declaration just because nobody typed one in.
    # A value here overrides the default for that one product.
    commodity_name: Mapped[Optional[str]] = mapped_column(String(255))
    # Free text, not a number: the rules ask for the declaration as printed
    # ("1 unit", "1 set of 2 pieces"), and a co-ord set is not one piece.
    net_quantity: Mapped[Optional[str]] = mapped_column(String(120))
    # Garment measurements in centimetres. Explicitly required for apparel.
    # Per-size numbers live in the size guide; this is the summary declaration.
    dimensions: Mapped[Optional[str]] = mapped_column(String(255))
    country_of_origin: Mapped[Optional[str]] = mapped_column(String(120))
    manufacturer_name: Mapped[Optional[str]] = mapped_column(String(255))
    manufacturer_address: Mapped[Optional[str]] = mapped_column(Text)

    # ── Fabric and care ───────────────────────────────────────────────────────
    # Every one of these answers something a real customer named. From 26 survey
    # responses: doubt about quality was the top reason for not buying from a
    # small brand (12), colour bleeding the top complaint about ethnic wear they
    # already own (9), missing pockets second (7), and creasing and heat joint
    # third (5 each).
    #
    # All nullable, and unlike the Legal Metrology block there are no
    # brand-level defaults. These are measured facts about one garment; a
    # fallback would be a claim nobody checked, printed on a product page.
    fabric_composition: Mapped[Optional[str]] = mapped_column(String(255))
    # Grams per square metre. The honest answer to "is it thin?" and, for
    # cotton, to "will it be hot?".
    fabric_gsm: Mapped[Optional[int]] = mapped_column(Integer)
    weave: Mapped[Optional[str]] = mapped_column(String(120))
    # Tri-state on purpose: true, false, and "nobody has checked yet" are three
    # different things, and only the first two should be shown.
    has_pockets: Mapped[Optional[bool]] = mapped_column(Boolean)
    colourfastness: Mapped[Optional[str]] = mapped_column(String(255))
    wash_care: Mapped[Optional[str]] = mapped_column(String(255))

    # ── Offers ────────────────────────────────────────────────────────────────
    # The price the product is being marked down FROM, in paise. NULL means no
    # offer: the storefront shows base_price alone. A value below base_price
    # is rejected in the schema — a "discount" that raises the price is a bug
    # in the admin form, not a merchandising decision.
    # base_price stays the selling price throughout, so nothing in checkout,
    # inventory locks or Razorpay amounts has to know offers exist.
    compare_at_price: Mapped[Optional[int]] = mapped_column(Integer)
    # When the offer stops. NULL with a compare_at_price = open-ended. The
    # storefront counts down to it; the API keeps returning compare_at_price
    # after it passes but the resolver reports the offer as inactive, so a
    # forgotten timer cannot leave a stale "-30%" on the page.
    offer_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # ── Shelf ─────────────────────────────────────────────────────────────────
    # Manual pin. Lower sorts first; NULL means "let attention decide". The
    # storefront's default order is: pinned products by shelf_rank, then the
    # rest by an attention score computed from analytics with time decay
    # (see services/shelf.py). The founder drags the ones she wants up front;
    # the algorithm arranges everything she has not touched.
    shelf_rank: Mapped[Optional[int]] = mapped_column(Integer, index=True)

    # ── Size chart ────────────────────────────────────────────────────────────
    # Per-product measurements the founder enters, overriding the category
    # chart in the storefront. Shape:
    #   {"unit": "cm" | "in", "rows": [{"size": "M", "chest": 91, "waist": 76,
    #     "hip": 99, "top_length": 116, "bottom_length": 98}]}
    # Stored in the unit she typed; the storefront converts for display so the
    # customer can toggle. bottom_length is optional per row.
    size_chart: Mapped[Optional[dict]] = mapped_column(JSONB)

    # ── Ways to wear it ───────────────────────────────────────────────────────
    # [{"occasion": "The office", "note": "..."}], at most four. Drafted by
    # Claude in the console, edited by the founder, served as stored text -
    # the storefront never calls a model.
    styling_notes: Mapped[Optional[list]] = mapped_column(JSONB)

    # ── Garment attributes ────────────────────────────────────────────────────
    # The questions a customer asks before buying ethnic wear, and the ones the
    # founder is answering by hand in the WhatsApp group today. Every one is a
    # fact about the garment, so all are nullable with no brand-level default —
    # the panel omits what nobody has filled in rather than guessing.
    #
    # Colour lives here as well as on the variant: the variant's colour is the
    # one you are ordering, this is the garment's described colour ("Indigo with
    # off-white border"), which is what a listing photograph needs explaining.
    colour: Mapped[Optional[str]] = mapped_column(String(120))
    print_type: Mapped[Optional[str]] = mapped_column(String(120))
    pattern: Mapped[Optional[str]] = mapped_column(String(120))
    neck_type: Mapped[Optional[str]] = mapped_column(String(120))
    sleeve_type: Mapped[Optional[str]] = mapped_column(String(120))
    # Tri-state, like has_pockets: attached, not attached, and not yet checked
    # are three different answers and only the first two should be printed.
    sleeve_attached: Mapped[Optional[bool]] = mapped_column(Boolean)
    dupatta_included: Mapped[Optional[bool]] = mapped_column(Boolean)

    variants: Mapped[List["ProductVariant"]] = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )
    media: Mapped[List["ProductMedia"]] = relationship(
        "ProductMedia",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductMedia.display_order",
    )
    category: Mapped[Optional["Category"]] = relationship(
        "Category", back_populates="products", lazy="noload"
    )


class ProductVariant(BaseModel):
    __tablename__ = "product_variants"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id"), index=True, nullable=False
    )
    sku: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    size: Mapped[Optional[str]] = mapped_column(String(50))
    color: Mapped[Optional[str]] = mapped_column(String(50))
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_delta: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )  # Added to base_price
    version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )  # Optimistic locking
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="variants")


class ProductMedia(BaseModel):
    __tablename__ = "product_media"

    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    cdn_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    type: Mapped[MediaType] = mapped_column(
        SAEnum(MediaType, name="mediatype"), nullable=False, default=MediaType.IMAGE
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Which colour this photograph shows. NULL = the product in general, shown
    # for every variant. Set = shown when that variant's colour is selected,
    # and used as the card image for that colour. ON DELETE SET NULL, not
    # CASCADE: deleting a variant must not delete its photographs — they are
    # the founder's most expensive asset and reassigning is one click.
    variant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), index=True, nullable=True
    )

    product: Mapped["Product"] = relationship("Product", back_populates="media")

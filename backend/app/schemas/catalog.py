from pydantic import BaseModel, Field, computed_field, field_validator
from typing import Optional, List
from datetime import datetime
import uuid
import enum

from app.core.config import settings

_MAX_PRICE_PAISE = 100_000_000  # 1 crore rupees in paise


class SortBy(str, enum.Enum):
    price_asc = "price_asc"
    price_desc = "price_desc"
    newest = "newest"


# ── Media ─────────────────────────────────────────────────────────────────────

class ProductMediaResponse(BaseModel):
    id: uuid.UUID
    url: str
    cdn_url: Optional[str] = None
    type: str
    display_order: int

    class Config:
        from_attributes = True


# ── Variants ──────────────────────────────────────────────────────────────────

class ProductVariantBase(BaseModel):
    sku: str
    size: Optional[str] = None
    color: Optional[str] = None
    stock: int = Field(default=0, ge=0)
    price_delta: int = Field(default=0)

    @field_validator("price_delta")
    @classmethod
    def price_delta_within_bounds(cls, v: int) -> int:
        if abs(v) > _MAX_PRICE_PAISE:
            raise ValueError(f"price_delta {v} exceeds maximum allowed value of {_MAX_PRICE_PAISE} paise")
        return v


class ProductVariantCreate(ProductVariantBase):
    pass


class ProductVariantUpdate(BaseModel):
    size: Optional[str] = None
    color: Optional[str] = None
    stock: Optional[int] = Field(None, ge=0)
    price_delta: Optional[int] = None
    is_active: Optional[bool] = None


class ProductVariantResponse(ProductVariantBase):
    id: uuid.UUID
    product_id: uuid.UUID
    version: int
    is_active: bool = True
    effective_price: Optional[int] = None  # base_price + price_delta, injected by service

    class Config:
        from_attributes = True


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    image_url: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True
    product_count: int = 0

    class Config:
        from_attributes = True


class CategoryDetail(CategoryResponse):
    products: List["ProductResponse"] = []

    class Config:
        from_attributes = True


# ── Products ──────────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    base_price: int = Field(..., ge=0)
    category_id: Optional[uuid.UUID] = None
    vendor_id: Optional[str] = None

    @field_validator("base_price")
    @classmethod
    def base_price_within_bounds(cls, v: int) -> int:
        if v > _MAX_PRICE_PAISE:
            raise ValueError(f"base_price {v} exceeds maximum allowed value of {_MAX_PRICE_PAISE} paise")
        return v


class LegalMetrologyFields(BaseModel):
    """
    The per-product declaration overrides, as an admin submits them.

    Separate from `LegalMetrology` below, which is the *resolved* block the
    storefront reads. These are the raw overrides: every one may be omitted, and
    the brand-level default in settings fills the gap — except `dimensions`,
    which has no honest brand-wide value and is therefore the one field an
    apparel listing must actually carry. Shared by create and update so the two
    cannot drift apart.
    """

    commodity_name: Optional[str] = Field(None, max_length=255)
    net_quantity: Optional[str] = Field(None, max_length=120)
    dimensions: Optional[str] = Field(None, max_length=255)
    country_of_origin: Optional[str] = Field(None, max_length=120)
    manufacturer_name: Optional[str] = Field(None, max_length=255)
    manufacturer_address: Optional[str] = None

    def declaration_values(self) -> dict:
        """
        Only the declaration keys actually supplied.

        Restricted to this class's own fields on purpose: subclasses add `name`,
        `base_price`, `variants` and the rest, and an unfiltered model_dump would
        hand all of them to `Product(**values)` — duplicating arguments the
        caller already passes and blowing up with a TypeError.

        exclude_unset keeps an omitted field out entirely, so a PUT that changes
        only the price cannot blank a product's dimensions by silence.
        """
        supplied = self.model_dump(exclude_unset=True, exclude_none=True)
        own = set(LegalMetrologyFields.model_fields)
        return {k: v for k, v in supplied.items() if k in own}


LEGAL_METROLOGY_COLUMNS = tuple(LegalMetrologyFields.model_fields)


class ProductCreate(ProductBase, LegalMetrologyFields):
    variants: List[ProductVariantCreate] = Field(..., min_length=1)


class ProductUpdate(LegalMetrologyFields):
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    base_price: Optional[int] = Field(None, ge=0)
    category_id: Optional[uuid.UUID] = None


class LegalMetrology(BaseModel):
    """
    The pre-purchase declarations the Packaged Commodities Rules require.

    Resolved server-side rather than in the browser so that every surface that
    reads a product — the PDP today, an invoice or a marketplace feed later —
    sees the same values, and so a missing column can never render as a blank
    legal declaration on the page.
    """

    commodity_name: str
    net_quantity: str
    dimensions: Optional[str] = None
    country_of_origin: str
    manufacturer_name: str
    manufacturer_address: str
    consumer_care_name: str
    consumer_care_email: str
    consumer_care_phone: str

    @classmethod
    def resolve(cls, product) -> "LegalMetrology":
        """Per-product value where one is set, brand-level default otherwise."""
        return cls(
            commodity_name=getattr(product, "commodity_name", None) or settings.LM_COMMODITY_NAME,
            net_quantity=getattr(product, "net_quantity", None) or settings.LM_NET_QUANTITY,
            # Dimensions have no sensible brand-wide default — a kurti and a
            # co-ord set do not share measurements — so this one stays absent
            # until the product carries it, and the PDP omits the row.
            dimensions=getattr(product, "dimensions", None) or None,
            country_of_origin=getattr(product, "country_of_origin", None) or settings.LM_COUNTRY_OF_ORIGIN,
            manufacturer_name=getattr(product, "manufacturer_name", None) or settings.LM_MANUFACTURER_NAME,
            manufacturer_address=getattr(product, "manufacturer_address", None) or settings.LM_MANUFACTURER_ADDRESS,
            consumer_care_name=settings.LM_CONSUMER_CARE_NAME,
            consumer_care_email=settings.LM_CONSUMER_CARE_EMAIL,
            consumer_care_phone=settings.LM_CONSUMER_CARE_PHONE,
        )


class ProductResponse(ProductBase):
    id: uuid.UUID
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    variants: List[ProductVariantResponse] = []
    media: List[ProductMediaResponse] = []
    category: Optional[CategoryResponse] = None

    # Populated from the row, excluded from the response: these are the raw
    # per-product overrides, and only `legal_metrology` below — which folds in
    # the brand-level defaults — is safe for a client to render.
    commodity_name: Optional[str] = Field(None, exclude=True)
    net_quantity: Optional[str] = Field(None, exclude=True)
    dimensions: Optional[str] = Field(None, exclude=True)
    country_of_origin: Optional[str] = Field(None, exclude=True)
    manufacturer_name: Optional[str] = Field(None, exclude=True)
    manufacturer_address: Optional[str] = Field(None, exclude=True)

    # Declarations the buyer must be able to read before paying. Computed, so
    # it needs no work at any of the call sites that build a ProductResponse.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def legal_metrology(self) -> LegalMetrology:
        return LegalMetrology.resolve(self)

    class Config:
        from_attributes = True


class AdminProductDetail(ProductResponse):
    """
    What the admin edit screen needs, which is not what the storefront needs.

    `ProductResponse` hides the raw declaration columns on purpose: the
    storefront must read the resolved `legal_metrology` block and never the
    unresolved one. An editor is the opposite case — it has to show what is
    actually stored, blank included, or it renders empty inputs and writes those
    blanks back over real values on the next save.

    Re-declaring the fields without `exclude` overrides the parent.
    """

    commodity_name: Optional[str] = None
    net_quantity: Optional[str] = None
    dimensions: Optional[str] = None
    country_of_origin: Optional[str] = None
    manufacturer_name: Optional[str] = None
    manufacturer_address: Optional[str] = None


class ProductListResponse(BaseModel):
    items: List[ProductResponse]
    total: int
    page: int
    limit: int

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    items: List[ProductResponse]
    total: int
    page: int
    limit: int
    query: str

    class Config:
        from_attributes = True


# ── Resolve forward references ─────────────────────────────────────────────────
CategoryDetail.model_rebuild()


# ── Admin catalogue schemas ────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    image_url: Optional[str] = None
    description: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    image_url: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class MediaConfirmRequest(BaseModel):
    key: str
    cdn_url: str
    type: str = "IMAGE"
    display_order: int = 0


class MediaReorderItem(BaseModel):
    id: uuid.UUID
    display_order: int


class MediaReorderRequest(BaseModel):
    items: list[MediaReorderItem]

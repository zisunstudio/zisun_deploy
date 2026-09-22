from pydantic import BaseModel, Field, computed_field, field_validator
from typing import Literal, Optional, List
from datetime import datetime, timezone
import uuid
import enum

from app.core.config import settings

_MAX_PRICE_PAISE = 100_000_000  # 1 crore rupees in paise


class SortBy(str, enum.Enum):
    # Default storefront order: pinned first, then live attention — services/shelf.py
    shelf = "shelf"
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
    # Which colour variant this photograph shows; None = the product in general.
    variant_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


# ── Variants ──────────────────────────────────────────────────────────────────

class ProductVariantBase(BaseModel):
    sku: str
    size: Optional[str] = None
    color: Optional[str] = None

    @field_validator("size", "color", mode="before")
    @classmethod
    def _trim(cls, v):
        # "Purple " and "Purple" were two colours on the product page.
        return v.strip() or None if isinstance(v, str) else v
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


class FabricSpecFields(BaseModel):
    """Fabric and care, as an admin enters them.

    No brand-level defaults anywhere in here, unlike the Legal Metrology block.
    Those declarations are true of everything ZISUN sells; these are measured
    facts about one garment, and a fallback would put a claim nobody checked on
    a live product page.
    """

    fabric_composition: Optional[str] = Field(None, max_length=255)
    fabric_gsm: Optional[int] = Field(None, ge=1, le=2000)
    weave: Optional[str] = Field(None, max_length=120)
    has_pockets: Optional[bool] = None
    colourfastness: Optional[str] = Field(None, max_length=255)
    wash_care: Optional[str] = Field(None, max_length=255)

    def spec_values(self) -> dict:
        """Only this class's own supplied keys — see LegalMetrologyFields."""
        supplied = self.model_dump(exclude_unset=True, exclude_none=True)
        own = set(FabricSpecFields.model_fields)
        return {k: v for k, v in supplied.items() if k in own}


FABRIC_SPEC_COLUMNS = tuple(FabricSpecFields.model_fields)


class GarmentAttributeFields(BaseModel):
    """The garment attributes, as an admin submits them.

    The seven questions a customer asks before buying ethnic wear. Same rule as
    the fabric block: nullable, no brand-level defaults, because these are facts
    about one garment rather than a house style.
    """

    colour: Optional[str] = Field(None, max_length=120)
    print_type: Optional[str] = Field(None, max_length=120)
    pattern: Optional[str] = Field(None, max_length=120)
    neck_type: Optional[str] = Field(None, max_length=120)
    sleeve_type: Optional[str] = Field(None, max_length=120)
    sleeve_attached: Optional[bool] = None
    dupatta_included: Optional[bool] = None
    fit: Optional[str] = Field(None, max_length=120)
    garment_length: Optional[str] = Field(None, max_length=120)
    embroidery: Optional[str] = Field(None, max_length=120)
    bottom_type: Optional[str] = Field(None, max_length=120)
    occasion: Optional[str] = Field(None, max_length=120)
    # Ordered: the order she lists them is the order the page prints them.
    set_pieces: Optional[List[str]] = Field(None, max_length=6)

    @field_validator("set_pieces")
    @classmethod
    def clean_pieces(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        out: List[str] = []
        for piece in v:
            name = (piece or "").strip()[:60]
            # Case-insensitive de-dupe: "Kurta" and "kurta" are one garment,
            # and "1 set - 3 pieces" derived from a duplicate is a wrong
            # statutory declaration, not just an untidy list.
            if name and name.lower() not in {o.lower() for o in out}:
                out.append(name)
        return out or None

    def attribute_values(self) -> dict:
        """Only this class's own supplied keys — see LegalMetrologyFields."""
        supplied = self.model_dump(exclude_unset=True, exclude_none=True)
        own = set(GarmentAttributeFields.model_fields)
        return {k: v for k, v in supplied.items() if k in own}


GARMENT_ATTRIBUTE_COLUMNS = tuple(GarmentAttributeFields.model_fields)


class SizeChartRow(BaseModel):
    """One size, as measured. Units are whatever the chart says; the storefront converts."""
    size: str = Field(..., min_length=1, max_length=12)
    chest: float = Field(..., gt=0, lt=400)
    waist: float = Field(..., gt=0, lt=400)
    hip: float = Field(..., gt=0, lt=400)
    top_length: float = Field(..., gt=0, lt=400)
    # Only for sets sold with trousers. Absent on a single garment.
    bottom_length: Optional[float] = Field(None, gt=0, lt=400)


class SizeChart(BaseModel):
    """Per-product size chart, stored in the unit the founder typed.

    She measures in whichever she has to hand — the tape says inches, the
    pattern says centimetres — and forcing a conversion at entry is how a 91 cm
    chest gets typed as a 91 inch one. The unit is stored alongside and the
    storefront converts for the customer.
    """
    unit: Literal["cm", "in"] = "cm"
    rows: List[SizeChartRow] = Field(default_factory=list, max_length=12)

    @field_validator("rows")
    @classmethod
    def sizes_unique(cls, rows: List[SizeChartRow]) -> List[SizeChartRow]:
        seen = set()
        for r in rows:
            key = r.size.strip().upper()
            if key in seen:
                raise ValueError(f"size {r.size!r} appears twice")
            seen.add(key)
        return rows


class StylingNote(BaseModel):
    """One way to wear a piece: where to, and how."""
    occasion: str = Field(..., min_length=1, max_length=40)
    note: str = Field(..., min_length=1, max_length=360)

    @field_validator("occasion", "note")
    @classmethod
    def trimmed(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("cannot be blank")
        return v


class MerchandisingFields(BaseModel):
    """Offers, shelf position and the size chart, as an admin submits them."""

    # The price being marked down FROM, in paise. Must exceed base_price — a
    # "discount" that raises the price is a form mistake, and it is rejected
    # here rather than shown as "-(-20)%" to a customer.
    compare_at_price: Optional[int] = Field(None, ge=0)
    offer_ends_at: Optional[datetime] = None
    # Manual shelf position; None = let attention decide.
    shelf_rank: Optional[int] = Field(None, ge=0, le=100000)
    size_chart: Optional[SizeChart] = None
    # Ways to wear it. Four is the ceiling: the product page shows them as
    # chips on one line of a phone, and a fifth wraps.
    styling_notes: Optional[List[StylingNote]] = Field(None, max_length=4)

    def merchandising_values(self) -> dict:
        supplied = self.model_dump(exclude_unset=True)
        own = set(MerchandisingFields.model_fields)
        out = {k: v for k, v in supplied.items() if k in own}
        if "size_chart" in out and out["size_chart"] is not None:
            out["size_chart"] = SizeChart.model_validate(out["size_chart"]).model_dump()
        return out


MERCHANDISING_COLUMNS = tuple(MerchandisingFields.model_fields)


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

    @field_validator("net_quantity")
    @classmethod
    def not_a_bare_count(cls, v: Optional[str]) -> Optional[str]:
        """Reject "5".

        Net quantity is what is inside one pack. Typed as a bare number on a
        garment it reads to a customer as five kurtas, and it was: the field
        said "5" on a single co-ord set. A quantity needs its unit, and for
        apparel the unit is the garment - "1 set", "2 pieces". Leaving it
        empty is better than guessing, because set_pieces derives it.
        """
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if v.isdigit():
            raise ValueError(
                f"net quantity {v!r} needs its unit - write \"1 set\" or "
                f"\"{v} pieces\", or list the pieces and leave this blank"
            )
        return v
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


class ProductCreate(ProductBase, LegalMetrologyFields, FabricSpecFields, GarmentAttributeFields, MerchandisingFields):
    variants: List[ProductVariantCreate] = Field(..., min_length=1)


class ProductUpdate(LegalMetrologyFields, FabricSpecFields, GarmentAttributeFields, MerchandisingFields):
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    base_price: Optional[int] = Field(None, ge=0)
    category_id: Optional[uuid.UUID] = None


def _net_quantity_from_pieces(pieces) -> Optional[str]:
    """The statutory net quantity, derived from what is in the set.

    Derived rather than typed so the declaration cannot drift from the
    "what's included" line the customer reads higher up the page, and so
    nobody has to translate a co-ord set into Legal Metrology wording.
    """
    if not pieces or not isinstance(pieces, list):
        return None
    n = len([p for p in pieces if str(p).strip()])
    if n <= 0:
        return None
    return "1 piece" if n == 1 else f"1 set - {n} pieces"


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
    # Optional: ZISUN publishes an email and, when one exists, a business
    # phone. It must never fall back to the founder's personal number - see
    # settings.LM_CONSUMER_CARE_PHONE.
    consumer_care_phone: Optional[str] = None

    @classmethod
    def resolve(cls, product) -> "LegalMetrology":
        """Per-product value where one is set, brand-level default otherwise."""
        return cls(
            commodity_name=getattr(product, "commodity_name", None) or settings.LM_COMMODITY_NAME,
            net_quantity=(
                getattr(product, "net_quantity", None)
                or _net_quantity_from_pieces(getattr(product, "set_pieces", None))
                or settings.LM_NET_QUANTITY
            ),
            # Dimensions have no sensible brand-wide default — a kurti and a
            # co-ord set do not share measurements — so this one stays absent
            # until the product carries it, and the PDP omits the row.
            dimensions=getattr(product, "dimensions", None) or None,
            country_of_origin=getattr(product, "country_of_origin", None) or settings.LM_COUNTRY_OF_ORIGIN,
            manufacturer_name=getattr(product, "manufacturer_name", None) or settings.LM_MANUFACTURER_NAME,
            # Always the configured value, never the product row's. The form used
            # to pre-fill the founder's home address into every listing, so
            # rows in the database still carry it; the public page must not.
            manufacturer_address=settings.LM_MANUFACTURER_ADDRESS,
            consumer_care_name=settings.LM_CONSUMER_CARE_NAME,
            consumer_care_email=settings.LM_CONSUMER_CARE_EMAIL,
            consumer_care_phone=settings.LM_CONSUMER_CARE_PHONE or None,
        )


class FabricSpecs(BaseModel):
    """What the product page shows under Fabric and care.

    Absent fields stay absent. An empty row on a quality panel is worse than no
    row: it reads as a specification we declined to give, on the exact question
    the customer is already suspicious about.
    """

    fabric_composition: Optional[str] = None
    fabric_gsm: Optional[int] = None
    weave: Optional[str] = None
    has_pockets: Optional[bool] = None
    colourfastness: Optional[str] = None
    wash_care: Optional[str] = None

    @property
    def is_empty(self) -> bool:
        return not any(
            v is not None for v in self.model_dump().values()
        )

    @classmethod
    def resolve(cls, product) -> "FabricSpecs":
        return cls(**{
            name: getattr(product, name, None) for name in FABRIC_SPEC_COLUMNS
        })


class GarmentAttributes(BaseModel):
    """What the product page shows under the garment's details.

    Absent fields stay absent, for the same reason as FabricSpecs: a blank row
    reads as a detail we declined to give, on exactly the question the customer
    is trying to answer.
    """

    colour: Optional[str] = None
    print_type: Optional[str] = None
    pattern: Optional[str] = None
    neck_type: Optional[str] = None
    sleeve_type: Optional[str] = None
    sleeve_attached: Optional[bool] = None
    dupatta_included: Optional[bool] = None
    fit: Optional[str] = None
    garment_length: Optional[str] = None
    embroidery: Optional[str] = None
    bottom_type: Optional[str] = None
    occasion: Optional[str] = None
    set_pieces: Optional[List[str]] = None

    @property
    def is_empty(self) -> bool:
        return not any(v is not None for v in self.model_dump().values())

    @classmethod
    def resolve(cls, product) -> "GarmentAttributes":
        return cls(**{
            name: getattr(product, name, None) for name in GARMENT_ATTRIBUTE_COLUMNS
        })


class Offer(BaseModel):
    """What the storefront shows about a markdown. Resolved, never stored.

    `active` is the only field the UI should branch on. It is false when there
    is no compare_at_price, when the markdown is not actually a markdown, or
    when offer_ends_at has passed — so a timer the founder forgot to clear
    cannot leave a stale badge on a live page.
    """
    active: bool = False
    compare_at_price: Optional[int] = None
    discount_pct: Optional[int] = None
    ends_at: Optional[datetime] = None

    @classmethod
    def resolve(cls, product) -> "Offer":
        cmp = getattr(product, "compare_at_price", None)
        base = getattr(product, "base_price", None)
        ends = getattr(product, "offer_ends_at", None)
        if not cmp or not base or cmp <= base:
            return cls()
        if ends is not None:
            now = datetime.now(timezone.utc)
            if ends.tzinfo is None:
                ends = ends.replace(tzinfo=timezone.utc)
            if ends <= now:
                return cls(compare_at_price=cmp, ends_at=ends, active=False)
        pct = int(round((cmp - base) * 100 / cmp))
        return cls(active=True, compare_at_price=cmp, discount_pct=pct, ends_at=ends)


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
    fabric_composition: Optional[str] = Field(None, exclude=True)
    fabric_gsm: Optional[int] = Field(None, exclude=True)
    weave: Optional[str] = Field(None, exclude=True)
    has_pockets: Optional[bool] = Field(None, exclude=True)
    colourfastness: Optional[str] = Field(None, exclude=True)
    wash_care: Optional[str] = Field(None, exclude=True)

    # Declarations the buyer must be able to read before paying. Computed, so
    # it needs no work at any of the call sites that build a ProductResponse.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def legal_metrology(self) -> LegalMetrology:
        return LegalMetrology.resolve(self)

    # Fabric and care. Computed like the block above so no call site that builds
    # a ProductResponse has to remember it.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def fabric_specs(self) -> FabricSpecs:
        return FabricSpecs.resolve(self)

    # Garment attributes. Same pattern again so no call site building a
    # ProductResponse has to remember to attach it.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def garment_attributes(self) -> GarmentAttributes:
        return GarmentAttributes.resolve(self)

    # Offer. Resolved every time so an expired timer switches the badge off
    # without a write, and the discount percentage is computed in one place.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def offer(self) -> Offer:
        return Offer.resolve(self)

    # Per-product size chart, if the founder entered one. The storefront falls
    # back to the category chart when this is null.
    size_chart: Optional[SizeChart] = None
    shelf_rank: Optional[int] = None
    # How the founder would wear it, by occasion. Null or empty hides the
    # section on the product page.
    styling_notes: Optional[List[StylingNote]] = None

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
    fabric_composition: Optional[str] = None
    fabric_gsm: Optional[int] = None
    weave: Optional[str] = None
    has_pockets: Optional[bool] = None
    colourfastness: Optional[str] = None
    wash_care: Optional[str] = None
    # The garment attributes were missing from this list, and the omission
    # silently destroyed data: the editor reads `product.colour` to seed its
    # inputs, got undefined, rendered them blank, and wrote those blanks back
    # over real values on the next save. The founder entered a piece's
    # colour, print, neck and sleeve, saved twice, and the product page
    # showed nothing - which read as "the storefront ignores what I type".
    # Anything an admin can write has to be readable back here.
    colour: Optional[str] = None
    print_type: Optional[str] = None
    pattern: Optional[str] = None
    neck_type: Optional[str] = None
    sleeve_type: Optional[str] = None
    sleeve_attached: Optional[bool] = None
    dupatta_included: Optional[bool] = None
    fit: Optional[str] = None
    garment_length: Optional[str] = None
    embroidery: Optional[str] = None
    bottom_type: Optional[str] = None
    occasion: Optional[str] = None
    set_pieces: Optional[List[str]] = None


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
    # Attach to a colour at upload time, so a founder photographing five
    # colourways can assign each shot as it lands rather than in a second pass.
    variant_id: Optional[uuid.UUID] = None


class MediaReorderItem(BaseModel):
    id: uuid.UUID
    display_order: int


class MediaReorderRequest(BaseModel):
    items: list[MediaReorderItem]

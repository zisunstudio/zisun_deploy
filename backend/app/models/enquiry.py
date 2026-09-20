"""A tap on "Order on WhatsApp", and what became of it.

While checkout is closed this is the order book. The storefront writes a
row the moment someone opens WhatsApp with a piece in front of them; the
founder moves it to replied, ordered (with what was paid) or lost from the
console. Everything the analytics board says about conversion and revenue
in browse mode comes from here.
"""
import enum
import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class EnquiryStatus(str, enum.Enum):
    NEW = "new"
    REPLIED = "replied"
    ORDERED = "ordered"
    LOST = "lost"


class EnquirySource(str, enum.Enum):
    BAG = "bag"            # the bag drawer's Order on WhatsApp
    PRODUCT = "product"    # "ask about this piece" under the buy action
    SHEET = "sheet"        # the shop-the-look sheet
    FAB = "fab"            # the floating button
    FOOTER = "footer"      # the footer's WhatsApp link
    COMMUNITY = "community"  # the ZISUN Tales group link


class WhatsAppEnquiry(BaseModel):
    __tablename__ = "whatsapp_enquiries"

    session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    # SET NULL, never CASCADE: the enquiry outlives the listing it was about.
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    variant_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    product_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    colour: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=EnquiryStatus.NEW.value, index=True)
    order_amount_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

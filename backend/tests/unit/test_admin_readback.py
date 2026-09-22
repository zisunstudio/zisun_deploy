"""Anything an admin can write must be readable back.

This invariant has been broken twice, and both times it *destroyed data*
rather than failing loudly: the editor seeds its inputs from the admin
detail response, a missing field arrives `undefined`, the input renders
blank, and the next save writes that blank over a real value.

  - The seven garment attributes: the founder entered a piece's colour,
    neck and sleeve, saved twice, and concluded the storefront ignored her.
  - compare_at_price / offer_ends_at: editing any piece with a live offer
    silently cleared the offer.

The test reads the model and the schemas as text, so it needs no database
and no app import, and it fails the build the moment a third column is
added to the model and left out of the read-back.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL = (ROOT / "app/models/catalog.py").read_text()
SCHEMA = (ROOT / "app/schemas/catalog.py").read_text()

# Columns the admin never submits, or that are computed for display.
NOT_WRITABLE = {
    "id", "created_at", "updated_at", "deleted_at",
    "category", "variants", "media",           # relationships
    "avg_rating", "review_count",              # derived from reviews
    "view_count", "purchase_count",            # derived from events
}


def _product_columns() -> set[str]:
    body = re.search(r"class Product\(.*?\n(.*?)\nclass ", MODEL, re.S).group(1)
    return {c for c in re.findall(r"^    (\w+): Mapped", body, re.M)} - NOT_WRITABLE


def _fields(cls: str) -> tuple[str, set[str]]:
    m = re.search(rf"class {cls}\(([^)]*)\):(.*?)(?=\nclass )", SCHEMA, re.S)
    if not m:
        return "", set()
    return m.group(1), set(re.findall(r"^    (\w+)\s*:", m.group(2), re.M))


def _all_fields(cls: str, seen: set[str] | None = None) -> set[str]:
    seen = seen or set()
    bases, own = _fields(cls)
    out = set(own)
    for b in (x.strip() for x in bases.split(",")):
        if b and b not in seen and f"class {b}(" in SCHEMA:
            seen.add(b)
            out |= _all_fields(b, seen)
    return out


def test_admin_detail_reads_back_every_writable_column():
    readable = _all_fields("AdminProductDetail")
    missing = sorted(c for c in _product_columns() if c not in readable)
    assert not missing, (
        "These Product columns can be written but not read back, so the "
        "console form will render them blank and save the blanks over real "
        "data. Add them to AdminProductDetail: " + ", ".join(missing)
    )


def test_every_admin_input_field_is_readable_back():
    """The other direction: a field in an input schema must come back too."""
    readable = _all_fields("AdminProductDetail")
    written: set[str] = set()
    for cls in ("GarmentAttributeFields", "MerchandisingFields", "LegalMetrologyFields", "FabricFields"):
        _, own = _fields(cls)
        written |= own
    # Write-only by design: these are commands, not stored columns.
    written -= {"variants", "media", "size_chart", "styling_notes", "shelf_rank"}
    missing = sorted(f for f in written if f not in readable and f in MODEL)
    assert not missing, "Writable but not readable back: " + ", ".join(missing)

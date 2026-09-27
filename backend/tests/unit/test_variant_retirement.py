"""A deleted variant stays deleted.

The console's Delete set is_active=False and nothing else, so the row and
its stock came back on the next load. Deletion now removes a never-ordered
variant or retires one with history (deleted_at, stock 0). These tests keep
the three things that made "deleted" untrustworthy from coming back.
"""
import re
from pathlib import Path

from sqlalchemy.dialects import postgresql

ROOT = Path(__file__).resolve().parents[2]


def test_product_variants_never_include_retired_rows():
    from app.models.catalog import Product
    sql = str(Product.variants.property.primaryjoin.compile(dialect=postgresql.dialect()))
    assert "product_variants.deleted_at IS NULL" in sql


def test_no_background_job_gives_stock_back_to_a_retired_variant():
    """Expiring holds and marketplace returns add stock back. On a retired
    variant that revived a row she had deleted."""
    offenders = []
    for path in list((ROOT / "app/tasks").glob("*.py")) + list((ROOT / "app/services").glob("*.py")):
        lines = path.read_text().splitlines()
        for i, line in enumerate(lines):
            if re.search(r"\.stock \+=", line):
                guard = "\n".join(lines[max(0, i - 3):i])
                if "deleted_at is None" not in guard:
                    offenders.append(f"{path.name}:{i + 1}")
    assert not offenders, f"stock restored without checking deleted_at: {offenders}"


def test_sku_uniqueness_is_scoped_to_live_variants():
    from app.models.catalog import ProductVariant
    idx = next(i for i in ProductVariant.__table__.indexes if i.name == "uq_product_variants_sku")
    assert idx.unique
    assert "deleted_at IS NULL" in str(idx.dialect_options["postgresql"]["where"])


def test_every_admin_variant_lookup_skips_retired_rows():
    src = (ROOT / "app/api/admin/endpoints/products.py").read_text()
    lookups = re.findall(r"select\(ProductVariant\)\.where\((.*?)\)\s*(?:\.with_for_update\(\))?\s*\)", src, re.S)
    assert lookups, "no variant lookups found - has the file moved?"
    missing = [l.strip()[:60] for l in lookups if "deleted_at" not in l and "is_active" not in l]
    assert not missing, f"admin lookups that could reach a retired variant: {missing}"

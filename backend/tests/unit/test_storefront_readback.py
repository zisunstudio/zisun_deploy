"""Every column a rendered block reads must be declared on `ProductResponse`.

The product page's nested blocks are `@computed_field` properties that call
`X.resolve(self)`, and every `resolve` reaches for its columns with
`getattr(product, ...)`. `product` here is this schema, not the ORM row, so a
column `ProductResponse` does not declare is not an attribute at all: the
getattr falls to its default and the value silently becomes null.

It is silent in the worst way. Nothing raises, the endpoint returns 200, the
block is present and correctly shaped, and every field inside it is empty.

That is what happened. `ProductResponse` declared all six fabric-spec columns
and none of the nineteen garment attributes, so `GarmentAttributes.resolve`
returned nineteen nulls on every product, on every request, whatever the row
held - and `set_pieces` going the same way meant the Legal Metrology net
quantity quietly fell back to the brand default instead of "1 set - 2 pieces".
The founder entered a piece's colour, fit, print, neck and sleeve; the console
read them back correctly, because `AdminProductDetail` re-declares them; the
product page showed nothing. She reported it four times, and each time it was
diagnosed as missing data - because the public API was what everyone checked
the data with, and the public API was the broken thing.

`test_admin_readback.py` is the mirror of this file and could not have caught
it: it guards what the *editor* reads. This guards what the *customer* reads.

The requirement is derived from the source rather than from a hand-kept list,
so a new block, or a new column in an existing one, is covered the day it is
written.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = (ROOT / "app/schemas/catalog.py").read_text()


def _resolve_bodies() -> str:
    """Every `def resolve(...)` in the schema module, concatenated."""
    bodies = re.findall(r"def resolve\(cls, product\).*?(?=\n    @|\nclass )", SCHEMA, re.S)
    assert bodies, "no resolve() methods found — has the module been restructured?"
    return "\n".join(bodies)


def _columns_read() -> set[str]:
    """Column names the blocks read off the model, both ways they do it."""
    body = _resolve_bodies()
    # getattr(product, "literal", ...)
    names = set(re.findall(r'getattr\(\s*product\s*,\s*"(\w+)"', body))
    # getattr(product, name, None) for name in SOME_COLUMNS
    for tup in re.findall(r"for name in (\w+_COLUMNS)", body):
        m = re.search(rf"^{tup} = tuple\((\w+)\.model_fields\)", SCHEMA, re.M)
        assert m, f"{tup} is no longer built from a Fields class — update this test"
        cls_body = re.search(rf"class {m.group(1)}\(.*?\):(.*?)(?=\nclass |\n\w)", SCHEMA, re.S)
        assert cls_body, f"cannot locate class {m.group(1)}"
        names |= set(re.findall(r"^    (\w+)\s*:", cls_body.group(1), re.M))
    return names


def _class_body(name: str) -> tuple[str, list[str]]:
    m = re.search(rf"^class {name}\(([^)]*)\):(.*?)(?=^class )", SCHEMA, re.S | re.M)
    assert m, f"cannot locate class {name}"
    bases = [b.strip() for b in m.group(1).split(",") if b.strip()]
    return m.group(2), bases


def _fields_of(name: str) -> set[str]:
    """Declared fields, following base classes inside this module.

    Without the inheritance walk this check reports `base_price` as missing -
    it is declared on `ProductBase` - and a guard that cries wolf is one that
    gets deleted.
    """
    body, bases = _class_body(name)
    fields = set(re.findall(r"^    (\w+)\s*:", body, re.M))
    for base in bases:
        if re.search(rf"^class {base}\(", SCHEMA, re.M):
            fields |= _fields_of(base)
    return fields


def _product_response_fields() -> set[str]:
    return _fields_of("ProductResponse")


def test_blocks_can_read_every_column_they_resolve_from():
    missing = sorted(_columns_read() - _product_response_fields())
    assert not missing, (
        "ProductResponse does not declare these columns, so the blocks that "
        f"resolve from them serialise as null on every product: {missing}. "
        "Declare each one with Field(None, exclude=True), as the fabric "
        "specs are — populated for the computed block, never serialised twice."
    )


def test_the_guard_would_have_caught_the_original_bug():
    """The check is only worth having if it fails on the shape of the bug."""
    declared = _product_response_fields()
    assert "neck_type" in declared and "colour" in declared
    without = declared - {"neck_type"}
    assert sorted(_columns_read() - without) == ["neck_type"]

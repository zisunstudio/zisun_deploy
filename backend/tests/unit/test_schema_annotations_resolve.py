"""Every schema annotation must resolve without deferred evaluation.

This exists because a class ordering bug shipped to production and took the API
down, while passing every local check.

Python 3.14 — which this machine runs — defers annotation evaluation under
PEP 649, so a computed field annotated with a class defined *later* in the
module resolves happily. The production image runs Python 3.12, which evaluates
that annotation at class-creation time and raises NameError on import. The
container never booted; the local import test said everything was fine.

`typing.get_type_hints` forces the eager behaviour on any interpreter, so this
catches the same mistake here rather than in a deploy log.
"""

import typing

import pytest

from app.schemas import catalog as catalog_schemas

# Every model that carries a computed field or a forward reference worth
# checking. Named explicitly rather than discovered, so adding a schema is a
# deliberate decision to cover it.
MODELS = [
    "ProductBase",
    "ProductCreate",
    "ProductUpdate",
    "LegalMetrologyFields",
    "LegalMetrology",
    "FabricSpecFields",
    "FabricSpecs",
    "ProductResponse",
    "AdminProductDetail",
    "ProductListResponse",
]


@pytest.mark.parametrize("name", MODELS)
def test_annotations_resolve_eagerly(name):
    cls = getattr(catalog_schemas, name)
    # Raises NameError for a forward reference that only a deferring
    # interpreter would tolerate.
    hints = typing.get_type_hints(cls)
    assert hints, f"{name} resolved no annotations at all"


def test_product_response_still_computes_both_blocks():
    """
    The two computed fields are the ones whose return annotations caused the
    outage. If either disappears, the storefront silently loses a panel.
    """
    computed = set(catalog_schemas.ProductResponse.model_computed_fields)
    assert {"legal_metrology", "fabric_specs"} <= computed


def test_computed_field_types_are_defined_before_use():
    """
    Ordering, stated as source position rather than inferred from behaviour —
    the behaviour is exactly what differs between 3.12 and 3.14.
    """
    import inspect

    src = inspect.getsource(catalog_schemas)
    for cls_name in ("LegalMetrology", "FabricSpecs"):
        assert src.index(f"class {cls_name}(BaseModel):") < src.index(
            "class ProductResponse(ProductBase):"
        ), f"{cls_name} must be defined before ProductResponse annotates it"

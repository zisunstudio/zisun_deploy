"""The admin catalogue upload path, end to end at the HTTP layer.

Two defects motivate this file, both of which made uploading a real catalogue
impossible rather than merely awkward:

1. `GET /products/{id}` did not exist. Creating a product redirects the admin to
   /admin/products/{id}/edit, that screen fetches this route, and media upload
   lives only on that screen — so in practice no product could be given an image
   through the admin at all.

2. The Legal Metrology columns could not be written. They existed on the model
   and were rendered on the product page, but `ProductCreate` and `ProductUpdate`
   did not carry them, so every product uploaded through the admin went live with
   no dimensions — the one declaration that has no brand-level fallback.

The route-order test guards the fix for (1): a catch-all `/{product_id}`
registered before the literal `/bulk-import-template` would swallow it.
"""

import datetime
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
async def admin_app_client(fake_redis, mock_db, mock_admin_user):
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.database import get_async_db
    from app.core.redis import get_redis
    from app.core.security import get_current_user

    async def _override_db():
        yield mock_db

    async def _get_redis_for_lifespan():
        return fake_redis

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user

    with patch("app.main.get_redis_client", new=_get_redis_for_lifespan), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c

    app.dependency_overrides.clear()


ADMIN = "/api/admin/v1/products"


class TestRouteOrdering:
    """
    The literal paths must keep winning over the catch-all `/{product_id}`.
    Starlette matches in registration order, so this is decided by where the
    route sits in the module — which is exactly the kind of thing that gets
    quietly broken by someone adding a handler in a tidier-looking place.
    """

    def test_literal_get_paths_are_registered_before_the_catch_all(self):
        import inspect
        from app.api.admin.endpoints import products as mod

        src = inspect.getsource(mod)
        catch_all = src.index('@router.get("/{product_id}", ')
        for literal in ('@router.get("/bulk-import-template")',):
            assert src.index(literal) < catch_all, (
                f"{literal} is registered after the catch-all and will be shadowed"
            )

    async def test_bulk_import_template_still_resolves(self, admin_app_client):
        """Would come back 422 (bad UUID) if the catch-all had swallowed it."""
        r = await admin_app_client.get(f"{ADMIN}/bulk-import-template")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "template_csv" in body
        assert r.status_code != 422


class TestBulkImportTemplate:
    async def test_template_declares_dimensions(self, admin_app_client):
        """
        Dimensions is the one declaration with no brand-level default, so it has
        to be in the template a shop owner actually fills in — otherwise the
        omission is invisible until a listing is already live.
        """
        r = await admin_app_client.get(f"{ADMIN}/bulk-import-template")
        csv_text = r.json()["template_csv"]
        header = csv_text.splitlines()[0].split(",")
        for column in ("dimensions", "net_quantity", "commodity_name", "country_of_origin"):
            assert column in header, f"{column} missing from the import template"

    async def test_every_template_row_matches_the_header_width(self, admin_app_client):
        """A template that does not parse teaches the wrong shape."""
        import csv as csvmod
        import io

        r = await admin_app_client.get(f"{ADMIN}/bulk-import-template")
        csv_text = r.json()["template_csv"]
        rows = list(csvmod.reader(io.StringIO(csv_text)))
        width = len(rows[0])
        for i, row in enumerate(rows[1:], start=2):
            assert len(row) == width, f"template line {i} has {len(row)} fields, header has {width}"


class TestDeclarationsSurviveAnEdit:
    """
    The admin editor reads this route to populate its form. If the response
    hides the stored declarations, the form renders empty inputs and the next
    save writes those blanks back — losing data by omission.
    """

    async def test_admin_detail_exposes_the_stored_declarations(self, admin_app_client, mock_db):
        from app.models.catalog import Product

        pid = uuid.uuid4()
        product = Product(
            name="Kasavu Panel Kurti",
            description=None,
            base_price=219900,
            is_active=True,
            dimensions="Bust 86-102 cm, Length 116-122 cm",
            net_quantity="1 unit",
        )
        product.id = pid
        product.variants = []
        product.media = []
        product.category = None
        product.vendor_id = None
        product.category_id = None
        # Normally set by the DB default; the response model requires them.
        product.created_at = product.updated_at = datetime.datetime.now(datetime.timezone.utc)

        result = MagicMock()
        result.scalar_one_or_none.return_value = product
        mock_db.execute = AsyncMock(return_value=result)

        r = await admin_app_client.get(f"{ADMIN}/{pid}")
        assert r.status_code == 200, r.text
        body = r.json()
        # The raw override, visible to the editor...
        assert body["dimensions"] == "Bust 86-102 cm, Length 116-122 cm"
        assert body["net_quantity"] == "1 unit"
        # ...alongside the resolved block the storefront reads.
        assert body["legal_metrology"]["dimensions"] == "Bust 86-102 cm, Length 116-122 cm"
        assert body["legal_metrology"]["country_of_origin"], "brand default did not fill in"


class TestUpdateDoesNotBlankByOmission:
    async def test_price_only_update_leaves_declarations_alone(self):
        """
        A PUT that changes the price sends no declaration keys. Those must not
        be interpreted as "set these to null".
        """
        from app.schemas.catalog import ProductUpdate

        payload = ProductUpdate.model_validate({"base_price": 159900})
        assert payload.declaration_values() == {}

    async def test_supplied_declarations_are_returned_for_writing(self):
        from app.schemas.catalog import ProductUpdate

        payload = ProductUpdate.model_validate({"dimensions": "Bust 97 cm"})
        assert payload.declaration_values() == {"dimensions": "Bust 97 cm"}

    async def test_create_payload_yields_only_declaration_keys(self):
        """
        `declaration_values()` is spread into `Product(**values)` next to
        explicit name/base_price arguments, so it must not leak the other fields
        or the call raises TypeError on duplicate keywords.
        """
        from app.schemas.catalog import ProductCreate

        payload = ProductCreate.model_validate({
            "name": "Sungudi Everyday Kurti",
            "base_price": 149900,
            "dimensions": "Bust 91 cm, Length 116 cm",
            "variants": [{"sku": "ZSN-1", "size": "M", "stock": 4, "price_delta": 0}],
        })
        values = payload.declaration_values()
        assert values == {"dimensions": "Bust 91 cm, Length 116 cm"}
        for leaked in ("name", "base_price", "variants", "description"):
            assert leaked not in values

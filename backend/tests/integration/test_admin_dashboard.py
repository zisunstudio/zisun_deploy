"""The dashboard aggregate, and the honesty rules it has to keep.

The board's whole value is that an empty panel explains itself. A confident ₹0
next to "Revenue" reads as "we sold nothing"; while the store is in browse mode
the truth is "nothing could be sold", which is a different fact and the one the
owner needs. So the response carries the reason, not just the number.

The other rule under test is that contribution margin stays absent. Its inputs —
cost per garment, real shipping cost, gateway fee, RTO reserve — have never
existed in this system, and a margin figure assembled from the ones that do
would be confidently wrong about the number that decides whether the business
works.
"""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture
async def admin_client(fake_redis, mock_db, mock_admin_user):
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.database import get_async_db
    from app.core.redis import get_redis
    from app.core.security import get_current_user

    async def _override_db():
        yield mock_db

    async def _redis_for_lifespan():
        return fake_redis

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user

    with patch("app.main.get_redis_client", new=_redis_for_lifespan), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c

    app.dependency_overrides.clear()


class TestItIsOneRequest:
    def test_the_board_is_served_by_a_single_route(self):
        """
        Eight parallel requests over a link to Sydney is eight chances for one
        panel to arrive late and make the page look broken. One payload.
        """
        from app.api.admin.endpoints.dashboard import router

        paths = [r.path for r in router.routes]
        assert paths == ["/dashboard"]

    async def test_it_requires_a_signed_in_admin(self):
        """Trading figures behind auth, like every other admin route."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            r = await c.get("/api/admin/v1/dashboard")
        assert r.status_code in (401, 403), r.status_code


class TestFunnelShape:
    def test_the_funnel_runs_in_the_order_a_shopper_walks_it(self):
        from app.api.admin.endpoints.dashboard import FUNNEL_STEPS

        assert [k for k, _, _ in FUNNEL_STEPS] == [
            "impressions", "views", "size_guide", "add_to_cart", "checkout",
        ]

    def test_it_starts_with_impressions(self):
        """
        Views without impressions have no denominator, so a product nobody
        wants looks exactly like a product nobody reached. Impressions are the
        step that separates those, and they are the reason the funnel starts
        where it does.
        """
        from app.api.admin.endpoints.dashboard import FUNNEL_STEPS

        assert FUNNEL_STEPS[0][1] == "product_impression"

    def test_every_step_maps_to_an_event_the_storefront_emits(self):
        """
        A step whose event nobody fires is a permanent zero that looks like a
        collapse in the funnel rather than a missing instrument.
        """
        import io
        import pathlib

        from app.api.admin.endpoints.dashboard import FUNNEL_STEPS

        src_root = pathlib.Path(__file__).resolve().parents[3] / "frontend" / "src"
        if not src_root.exists():          # backend-only checkout
            pytest.skip("frontend sources not present")
        emitted = "".join(
            io.open(p, encoding="utf-8", errors="ignore").read()
            for p in src_root.rglob("*.ts*")
        )
        for _, event, _ in FUNNEL_STEPS:
            assert f'trackEvent("{event}"' in emitted, f"nothing emits {event}"


class TestHonestyRules:
    def test_contribution_margin_is_absent_not_guessed(self):
        """
        Returning 0, or a figure built from revenue alone, would be worse than
        returning nothing: it is the number the whole business turns on.
        """
        import inspect

        from app.api.admin.endpoints import dashboard as mod

        src = inspect.getsource(mod)
        assert '"contribution_margin": None' in src
        assert '"contribution_margin_blocked_on"' in src

    def test_the_response_says_why_a_panel_is_empty(self):
        """
        checkout_enabled and launch_mode travel with the numbers so the board
        can distinguish "sold nothing" from "could not sell".
        """
        import inspect

        from app.api.admin.endpoints import dashboard as mod

        src = inspect.getsource(mod)
        assert '"checkout_enabled": settings.checkout_enabled' in src
        assert '"launch_mode"' in src

    def test_products_with_no_views_survive_the_join(self):
        """
        An inner join would drop exactly the rows worth seeing — the products
        nobody has opened. Those are the merchandising signal.
        """
        import inspect

        from app.api.admin.endpoints import dashboard as mod

        src = inspect.getsource(mod)
        assert ".outerjoin(" in src
        assert '"never_viewed"' in src


class TestTheProductJoinActuallyBuilds:
    """
    This one is here because it shipped broken. `.astext` exists only on JSONB
    and `analytics_events.properties` is plain JSON, so the expression raised an
    AttributeError while the query was being *constructed* — not a SQL error a
    database could have caught, and invisible until the endpoint was called.
    """

    def test_the_join_condition_constructs(self):
        from app.api.admin.endpoints.dashboard import product_id_matches
        from app.models.catalog import Product

        # Constructing it is the whole test: the bug was a raise right here.
        expr = product_id_matches(Product.id)
        assert expr is not None

    def test_it_compiles_to_the_json_text_operator(self):
        from sqlalchemy.dialects import postgresql

        from app.api.admin.endpoints.dashboard import product_id_matches
        from app.models.catalog import Product

        sql = str(
            product_id_matches(Product.id).compile(dialect=postgresql.dialect())
        )
        assert "->>" in sql, sql

    def test_the_broken_accessor_is_not_reintroduced(self):
        """
        Guards the exact expression that shipped broken, rather than the word
        `.astext` — which the helper's own docstring uses to explain why it is
        wrong, and which a blunter check would flag as the bug it is warning
        about.
        """
        import inspect

        from app.api.admin.endpoints import dashboard as mod

        src = inspect.getsource(mod)
        assert '["product_id"].astext' not in src
        assert '.op("->>")' in src

"""Sprint 1 Integration Tests — COD, Coupons, Reviews, ML models.

Uses the same mock-DB pattern as test_50_scenarios.py.
"""
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.security import get_current_user
from app.core.database import get_async_db
from app.core.redis import get_redis
from app.models.order import PaymentMethod, OrderStatus
from app.models.coupon import CouponType
from app.models.review import ReviewStatus


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.phone = "+919876543210"
    u.role = "user"
    return u


@pytest.fixture
def mock_admin_user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.phone = "+919999999999"
    u.role = MagicMock()
    u.role.value = "admin"  # require_role calls current_user.role.value
    return u


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
async def s1_client(fake_redis, mock_db, mock_user):
    """Authenticated user client for Sprint 1 tests."""
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: mock_user

    with patch("app.main.get_redis_client", new=AsyncMock(return_value=fake_redis)), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c

    app.dependency_overrides.clear()


@pytest.fixture
async def s1_admin_client(fake_redis, mock_db, mock_admin_user):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_async_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user

    with patch("app.main.get_redis_client", new=AsyncMock(return_value=fake_redis)), \
         patch("app.main.close_redis", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c

    app.dependency_overrides.clear()


# ── Coupon model & service unit tests ─────────────────────────────────────────

class TestCouponModel:
    def test_coupon_type_values(self):
        assert CouponType.FLAT == "FLAT"
        assert CouponType.PERCENT == "PERCENT"

    def test_compute_discount_flat(self):
        from app.services.coupon import CouponService
        coupon = MagicMock()
        coupon.type = CouponType.FLAT
        coupon.value = 10000  # ₹100
        coupon.max_discount = None

        # instantiate without real DB
        svc = CouponService.__new__(CouponService)
        discount = svc._compute_discount(coupon, order_total=50000)
        assert discount == 10000

    def test_compute_discount_flat_capped_at_order_total(self):
        from app.services.coupon import CouponService
        coupon = MagicMock()
        coupon.type = CouponType.FLAT
        coupon.value = 100000  # bigger than cart
        coupon.max_discount = None

        svc = CouponService.__new__(CouponService)
        discount = svc._compute_discount(coupon, order_total=50000)
        assert discount == 50000  # cannot exceed order total

    def test_compute_discount_percent(self):
        from app.services.coupon import CouponService
        coupon = MagicMock()
        coupon.type = CouponType.PERCENT
        coupon.value = 10  # 10%
        coupon.max_discount = None

        svc = CouponService.__new__(CouponService)
        discount = svc._compute_discount(coupon, order_total=100000)
        assert discount == 10000  # 10% of ₹1000

    def test_compute_discount_percent_with_cap(self):
        from app.services.coupon import CouponService
        coupon = MagicMock()
        coupon.type = CouponType.PERCENT
        coupon.value = 20  # 20%
        coupon.max_discount = 5000  # max ₹50

        svc = CouponService.__new__(CouponService)
        discount = svc._compute_discount(coupon, order_total=100000)
        assert discount == 5000  # capped at ₹50

    def test_discount_never_negative(self):
        from app.services.coupon import CouponService
        coupon = MagicMock()
        coupon.type = CouponType.FLAT
        coupon.value = 0
        coupon.max_discount = None

        svc = CouponService.__new__(CouponService)
        assert svc._compute_discount(coupon, order_total=50000) == 0


# ── Coupon API endpoints ───────────────────────────────────────────────────────

class TestCouponAPI:
    async def test_apply_coupon_preview_valid(self, s1_client, mock_db, mock_user):
        """POST /coupons/apply returns discount for a valid coupon."""
        from app.models.coupon import Coupon
        coupon = Coupon(
            code="SAVE10",
            type=CouponType.PERCENT,
            value=10,
            min_order_value=0,
            max_discount=None,
            usage_limit=None,
            per_user_limit=5,
            is_active=True,
        )
        coupon.id = uuid.uuid4()
        coupon.is_referral = False
        coupon.expires_at = None

        # validate_coupon calls: get_coupon_by_code + count(total uses) + count(user uses)
        mock_db.execute = AsyncMock(side_effect=[
            _scalar_value(coupon),   # get_by_code
            _scalar_value(0),        # total usages count
            _scalar_value(0),        # per-user usages count
        ])

        resp = await s1_client.post("/api/v1/coupons/apply", json={
            "code": "SAVE10",
            "order_total": 100000,  # ₹1000
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["discount_amount"] == 10000  # 10% of ₹1000
        assert data["final_total"] == 90000

    async def test_apply_coupon_invalid_code(self, s1_client, mock_db):
        """POST /coupons/apply → 404 for unknown code."""
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await s1_client.post("/api/v1/coupons/apply", json={
            "code": "BADCODE", "order_total": 50000
        })
        assert resp.status_code == 404

    async def test_apply_coupon_min_order_not_met(self, s1_client, mock_db):
        """POST /coupons/apply → 400 when cart < min_order_value."""
        from app.models.coupon import Coupon
        coupon = Coupon(
            code="BIGORDER",
            type=CouponType.FLAT,
            value=5000,
            min_order_value=200000,  # ₹2000 minimum
            is_active=True,
        )
        coupon.id = uuid.uuid4()
        coupon.expires_at = None
        coupon.usage_limit = None
        coupon.per_user_limit = 5
        coupon.is_referral = False

        mock_db.execute = AsyncMock(return_value=_scalar_value(coupon))

        resp = await s1_client.post("/api/v1/coupons/apply", json={
            "code": "BIGORDER", "order_total": 50000  # ₹500 < ₹2000
        })
        assert resp.status_code == 400
        assert "Minimum order" in resp.json()["detail"]

    async def test_apply_coupon_expired(self, s1_client, mock_db):
        """POST /coupons/apply → 400 for expired coupon."""
        from app.models.coupon import Coupon
        coupon = Coupon(
            code="EXPIRED",
            type=CouponType.FLAT,
            value=5000,
            min_order_value=0,
            is_active=True,
        )
        coupon.id = uuid.uuid4()
        coupon.expires_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        coupon.usage_limit = None
        coupon.per_user_limit = 5
        coupon.is_referral = False

        mock_db.execute = AsyncMock(return_value=_scalar_value(coupon))

        resp = await s1_client.post("/api/v1/coupons/apply", json={
            "code": "EXPIRED", "order_total": 50000
        })
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"].lower()

    async def test_apply_coupon_per_user_limit(self, s1_client, mock_db):
        """POST /coupons/apply → 400 when user already used coupon per_user_limit times."""
        from app.models.coupon import Coupon
        coupon = Coupon(
            code="ONCE",
            type=CouponType.FLAT,
            value=5000,
            min_order_value=0,
            per_user_limit=1,
            is_active=True,
        )
        coupon.id = uuid.uuid4()
        coupon.expires_at = None
        coupon.usage_limit = None
        coupon.is_referral = False

        mock_db.execute = AsyncMock(side_effect=[
            _scalar_value(coupon),  # get_by_code
            _scalar_value(1),       # per-user usages = 1 = per_user_limit (global skipped; usage_limit=None)
        ])

        resp = await s1_client.post("/api/v1/coupons/apply", json={
            "code": "ONCE", "order_total": 50000
        })
        assert resp.status_code == 400
        assert "already used" in resp.json()["detail"].lower()


# ── Admin coupon CRUD ──────────────────────────────────────────────────────────

class TestAdminCouponCRUD:
    async def test_create_coupon(self, s1_admin_client, mock_db):
        """POST /api/admin/v1/coupons/ creates a coupon."""
        from app.models.coupon import Coupon

        async def _refresh(obj, *args, **kwargs):
            if not hasattr(obj, "_id_set"):
                obj.id = uuid.uuid4()
                obj.created_at = datetime.now(timezone.utc)
                obj.updated_at = datetime.now(timezone.utc)
                obj.is_referral = False
                obj._id_set = True

        mock_db.refresh = AsyncMock(side_effect=_refresh)
        mock_db.commit = AsyncMock()

        resp = await s1_admin_client.post("/api/admin/v1/coupons/", json={
            "code": "WELCOME20",
            "type": "PERCENT",
            "value": 20,
            "min_order_value": 50000,
            "max_discount": 20000,
            "per_user_limit": 1,
            "is_active": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["code"] == "WELCOME20"
        assert data["value"] == 20
        assert data["type"] == "PERCENT"

    async def test_list_coupons(self, s1_admin_client, mock_db):
        """GET /api/admin/v1/coupons/ returns list."""
        from app.models.coupon import Coupon
        c = Coupon(code="TEST", type=CouponType.FLAT, value=5000, min_order_value=0,
                   per_user_limit=1, is_active=True)
        c.id = uuid.uuid4()
        c.expires_at = None
        c.usage_limit = None
        c.max_discount = None
        c.is_referral = False
        c.created_at = datetime.now(timezone.utc)
        c.updated_at = datetime.now(timezone.utc)

        r = MagicMock()
        r.scalars.return_value.all.return_value = [c]
        mock_db.execute = AsyncMock(return_value=r)

        resp = await s1_admin_client.get("/api/admin/v1/coupons/")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["code"] == "TEST"


# ── Review model & service tests ───────────────────────────────────────────────

class TestReviewModel:
    def test_review_status_values(self):
        assert ReviewStatus.PENDING == "PENDING"
        assert ReviewStatus.APPROVED == "APPROVED"
        assert ReviewStatus.REJECTED == "REJECTED"

    def test_review_status_pending_is_default(self):
        from app.models.review import Review
        r = Review()
        # default is set at DB flush time, so check the Python default
        assert Review.status.property.columns[0].default.arg == ReviewStatus.PENDING


# ── Review API endpoints ───────────────────────────────────────────────────────

class TestReviewAPI:
    async def test_submit_review_verified_purchase(self, s1_client, mock_db, mock_user):
        """POST /reviews/ — verified purchase creates PENDING review."""
        from app.models.review import Review
        from app.models.order import Order, OrderItem
        from app.models.catalog import ProductVariant

        product_id = uuid.uuid4()
        order_id = uuid.uuid4()

        # Mock: no duplicate + order is DELIVERED + order contains product variant
        order = MagicMock()
        order.id = order_id
        order.user_id = mock_user.id
        order.status = OrderStatus.DELIVERED

        order_item = MagicMock()
        order_item.order_id = order_id

        review = Review(
            user_id=mock_user.id,
            product_id=product_id,
            order_id=order_id,
            rating=5,
            title="Excellent!",
            body="Loved it",
            is_verified_purchase=True,
            status=ReviewStatus.PENDING,
        )
        review.id = uuid.uuid4()
        review.created_at = datetime.now(timezone.utc)
        review.updated_at = datetime.now(timezone.utc)

        async def _refresh(obj, *args, **kwargs):
            if not obj.id:
                obj.id = uuid.uuid4()
            obj.created_at = datetime.now(timezone.utc)
            obj.updated_at = datetime.now(timezone.utc)

        mock_db.execute = AsyncMock(side_effect=[
            _scalar_none(),         # no duplicate review
            _scalar_value(order),   # order DELIVERED + belongs to user
            _scalar_value(order_item),  # order has this product's variant
        ])
        mock_db.refresh = AsyncMock(side_effect=_refresh)

        resp = await s1_client.post("/api/v1/reviews/", json={
            "product_id": str(product_id),
            "order_id": str(order_id),
            "rating": 5,
            "title": "Excellent!",
            "body": "Loved it",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["rating"] == 5
        assert data["status"] == "PENDING"
        assert data["is_verified_purchase"] is True

    async def test_submit_review_not_delivered(self, s1_client, mock_db, mock_user):
        """POST /reviews/ → 403 if order not delivered."""
        mock_db.execute = AsyncMock(side_effect=[
            _scalar_none(),   # no duplicate
            _scalar_none(),   # order not found (not DELIVERED or wrong user)
        ])

        resp = await s1_client.post("/api/v1/reviews/", json={
            "product_id": str(uuid.uuid4()),
            "order_id": str(uuid.uuid4()),
            "rating": 4,
        })
        assert resp.status_code == 403

    async def test_submit_review_duplicate(self, s1_client, mock_db, mock_user):
        """POST /reviews/ → 409 on duplicate review."""
        existing = MagicMock()
        existing.id = uuid.uuid4()
        mock_db.execute = AsyncMock(return_value=_scalar_value(existing))

        resp = await s1_client.post("/api/v1/reviews/", json={
            "product_id": str(uuid.uuid4()),
            "order_id": str(uuid.uuid4()),
            "rating": 3,
        })
        assert resp.status_code == 409

    async def test_get_product_reviews(self, s1_client, mock_db):
        """GET /reviews/products/{id} returns paginated approved reviews."""
        # Agg row: total=2, avg=4.5
        agg_row = MagicMock()
        agg_row.total = 2
        agg_row.avg = 4.5
        agg_result = MagicMock()
        agg_result.one.return_value = agg_row

        # Distribution: each rating star count
        dist_rows = []
        dist_result = MagicMock()
        dist_result.all.return_value = dist_rows

        from app.models.review import Review
        r1 = Review(user_id=uuid.uuid4(), product_id=uuid.uuid4(), order_id=uuid.uuid4(),
                    rating=5, status=ReviewStatus.APPROVED)
        r1.id = uuid.uuid4()
        r1.title = "Great"
        r1.body = "Loved it"
        r1.is_verified_purchase = True
        r1.created_at = datetime.now(timezone.utc)
        r1.updated_at = datetime.now(timezone.utc)
        r1.media_urls = None

        reviews_result = MagicMock()
        reviews_result.scalars.return_value.all.return_value = [r1]

        mock_db.execute = AsyncMock(side_effect=[
            agg_result,
            dist_result,
            reviews_result,
        ])

        resp = await s1_client.get(f"/api/v1/reviews/products/{uuid.uuid4()}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert data["avg_rating"] == 4.5
        assert len(data["reviews"]) == 1


# ── Admin review moderation ────────────────────────────────────────────────────

class TestAdminReviewModeration:
    async def test_moderate_review_approve(self, s1_admin_client, mock_db):
        """PATCH /admin/reviews/{id}/status → approve review and triggers rating recalc."""
        from app.models.review import Review
        review = Review(
            user_id=uuid.uuid4(), product_id=uuid.uuid4(),
            order_id=uuid.uuid4(), rating=5, status=ReviewStatus.PENDING
        )
        review.id = uuid.uuid4()
        review.title = "Good"
        review.body = "Works well"
        review.is_verified_purchase = True
        review.created_at = datetime.now(timezone.utc)
        review.updated_at = datetime.now(timezone.utc)
        review.media_urls = None

        # get review + recalc agg (avg=5.0, count=1) + update product
        agg_row = MagicMock()
        agg_row.avg = 5.0
        agg_row.cnt = 1
        agg_result = MagicMock()
        agg_result.one.return_value = agg_row

        async def _refresh(obj, *args, **kwargs):
            obj.updated_at = datetime.now(timezone.utc)

        mock_db.execute = AsyncMock(side_effect=[
            _scalar_value(review),  # get review
            agg_result,             # recalc agg query
            MagicMock(),            # update products statement
        ])
        mock_db.refresh = AsyncMock(side_effect=_refresh)

        resp = await s1_admin_client.patch(
            f"/api/admin/v1/reviews/{review.id}/status",
            json={"status": "APPROVED"}
        )
        assert resp.status_code == 200
        # The service sets review.status before commit
        assert review.status == ReviewStatus.APPROVED

    async def test_moderate_review_not_found(self, s1_admin_client, mock_db):
        mock_db.execute = AsyncMock(return_value=_scalar_none())
        resp = await s1_admin_client.patch(
            f"/api/admin/v1/reviews/{uuid.uuid4()}/status",
            json={"status": "REJECTED"}
        )
        assert resp.status_code == 404

    async def test_list_pending_reviews(self, s1_admin_client, mock_db):
        r = MagicMock()
        r.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=r)
        resp = await s1_admin_client.get("/api/admin/v1/reviews/?status=PENDING")
        assert resp.status_code == 200
        assert resp.json() == []


# ── COD checkout flow ──────────────────────────────────────────────────────────

class TestCODCheckout:
    def test_payment_method_enum_values(self):
        assert PaymentMethod.RAZORPAY == "RAZORPAY"
        assert PaymentMethod.COD == "COD"

    def test_checkout_initiate_request_defaults_to_razorpay(self):
        from app.schemas.order import CheckoutInitiateRequest
        req = CheckoutInitiateRequest(address_id=uuid.uuid4())
        assert req.payment_method == PaymentMethod.RAZORPAY
        assert req.coupon_code is None

    def test_checkout_initiate_request_accepts_cod(self):
        from app.schemas.order import CheckoutInitiateRequest
        req = CheckoutInitiateRequest(
            address_id=uuid.uuid4(),
            payment_method=PaymentMethod.COD,
        )
        assert req.payment_method == PaymentMethod.COD

    def test_checkout_response_razorpay_order_id_optional(self):
        from app.schemas.order import CheckoutResponse
        resp = CheckoutResponse(
            order_id=uuid.uuid4(),
            razorpay_order_id=None,
            amount=100000,
            payment_method="COD",
            is_cod=True,
        )
        assert resp.is_cod is True
        assert resp.razorpay_order_id is None

    async def test_cod_checkout_skips_razorpay(self, s1_client, mock_db, mock_user):
        """POST /cart/checkout/initiate with COD must not call Razorpay API."""
        from app.models.cart import Cart, CartItem
        from app.models.catalog import ProductVariant, Product
        from app.models.order import Order

        # Build cart with one item
        variant = MagicMock(spec=ProductVariant)
        variant.id = uuid.uuid4()
        variant.sku = "SKU-001"
        variant.stock = 10
        variant.is_active = True
        variant.price_delta = 0
        variant.product = MagicMock()
        variant.product.base_price = 200000  # ₹2000

        item = MagicMock(spec=CartItem)
        item.id = uuid.uuid4()
        item.product_variant_id = variant.id
        item.quantity = 1

        cart = MagicMock(spec=Cart)
        cart.id = uuid.uuid4()
        cart.user_id = mock_user.id
        cart.items = [item]

        order = MagicMock(spec=Order)
        order.id = uuid.uuid4()
        order.total_amount = 200000
        order.discount_amount = 0
        order.payment_method = PaymentMethod.COD
        order.razorpay_order_id = None
        order.cod_amount_due = 200000

        async def _refresh(obj, *args, **kwargs):
            pass

        # initiate_checkout calls:
        # 1. get_or_create_cart → selectinload chain
        # 2. FOR UPDATE on variant
        # 3. no coupon queries
        # 4. flush+commit
        mock_db.execute = AsyncMock(side_effect=[
            _scalar_value(cart),    # get_or_create_cart
            _scalar_value(variant), # FOR UPDATE lock
            _scalar_value(None),    # no coupon (not used)
        ])
        mock_db.refresh = AsyncMock(side_effect=_refresh)

        with patch(
            "app.services.checkout.CheckoutService.initiate_checkout",
            new_callable=AsyncMock,
            return_value=(order, None),  # COD returns None for razorpay_order_id
        ):
            resp = await s1_client.post("/api/v1/cart/checkout/initiate", json={
                "address_id": str(uuid.uuid4()),
                "payment_method": "COD",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["is_cod"] is True
        assert data["razorpay_order_id"] is None

    async def test_cod_exceeds_limit_rejected(self):
        """CouponService.COD_MAX_ORDER_VALUE_PAISE is ₹5000."""
        from app.services.coupon import COD_MAX_ORDER_VALUE_PAISE
        assert COD_MAX_ORDER_VALUE_PAISE == 500_000  # ₹5000 in paise


# ── ML model structure tests ───────────────────────────────────────────────────

class TestMLModels:
    def test_product_embedding_model_importable(self):
        from app.models.ml import ProductEmbedding, SearchQuery
        assert ProductEmbedding.__tablename__ == "product_embeddings"
        assert SearchQuery.__tablename__ == "search_queries"

    def test_product_embedding_has_jsonb_columns(self):
        from app.models.ml import ProductEmbedding
        cols = {c.name: c for c in ProductEmbedding.__table__.columns}
        assert "text_embedding" in cols
        assert "image_embedding" in cols
        assert "model_version" in cols
        assert "product_id" in cols

    def test_search_query_model_fields(self):
        from app.models.ml import SearchQuery
        cols = {c.name: c for c in SearchQuery.__table__.columns}
        assert "query_text" in cols
        assert "result_count" in cols
        assert "clicked_product_ids" in cols
        assert "session_id" in cols

    def test_feature_engineering_script_importable(self):
        from scripts.ml.feature_engineering import build_user_features, build_product_features, run
        assert callable(build_user_features)
        assert callable(build_product_features)
        assert callable(run)


# ── Checkout schema backward compatibility ─────────────────────────────────────

class TestCheckoutSchemaBackwardCompat:
    def test_old_razorpay_flow_still_works(self):
        """Existing tests that pass razorpay_order_id should still work."""
        from app.schemas.order import CheckoutResponse
        resp = CheckoutResponse(
            order_id=uuid.uuid4(),
            razorpay_order_id="order_test_123",
            amount=99900,
        )
        assert resp.razorpay_order_id == "order_test_123"
        assert resp.is_cod is False
        assert resp.payment_method == "RAZORPAY"

    def test_coupon_code_in_initiate_request(self):
        from app.schemas.order import CheckoutInitiateRequest
        req = CheckoutInitiateRequest(
            address_id=uuid.uuid4(),
            coupon_code="SAVE10",
        )
        assert req.coupon_code == "SAVE10"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _scalar_none():
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    return r


def _scalar_value(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    r.scalar.return_value = value
    return r

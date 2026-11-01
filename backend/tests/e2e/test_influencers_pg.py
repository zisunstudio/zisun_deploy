"""Influencers end to end, against a real Postgres.

Runs only when ZISUN_PG_TESTS=1 and the POSTGRES_* variables point at a
throwaway database migrated to head (see docs/INFLUENCERS.md, "Testing").
Orders go through the real `/checkout/guest` endpoint - the same price
recalculation, stock locks and coupon rules as a customer's - so what is
proven here is the path production takes, not a mock of it.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.skipif(os.environ.get("ZISUN_PG_TESTS") != "1", reason="needs a throwaway Postgres")

NOW = datetime.now(timezone.utc)
RUN = uuid.uuid4().hex[:6]


async def make_world():
    import fakeredis.aioredis
    import httpx
    from app.core import redis as redis_mod
    redis_mod._redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    from app.main import app
    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    from app.models.catalog import Category, Product, ProductVariant
    from app.models.user import User, UserRole

    async with AsyncSessionLocal() as db:
        cat = Category(name=f"Sets {RUN}", slug=f"sets-{RUN}", is_active=True)
        db.add(cat); await db.flush()
        products, variants = [], []
        for n, (name, price) in enumerate([("Rani Pink Set", 134900), ("Rich Wine Set", 112400), ("Navy Kurti", 34900)]):
            p = Product(name=f"{name} {RUN}", base_price=price, category_id=cat.id, is_active=True)
            db.add(p); await db.flush()
            v = ProductVariant(product_id=p.id, sku=f"T{RUN}{n}", size="M", color="Pink", stock=50, is_active=True)
            db.add(v); await db.flush()
            products.append(p); variants.append(v)
        admin = User(phone=f"+9190000{RUN[:5].translate(str.maketrans('abcdef', '123456'))}", name="Admin", role=UserRole.admin)
        db.add(admin); await db.commit()
        token = create_access_token(str(admin.id), "admin")

    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    H = {"Authorization": f"Bearer {token}"}
    return {"client": client, "H": H, "products": products, "variants": variants, "Session": AsyncSessionLocal}


def phone(n: int) -> str:
    return f"+91{9000000000 + int(RUN, 16) % 900000 * 100 + n}"


async def guest(c, variant, *, method="COD", n=1, influencer=None, clicked=None, coupon=None, who=None):
    body = {"name": "Test Buyer", "phone": who or phone(n), "items": [{"variant_id": str(variant.id), "quantity": 1}],
            "address": {"line1": f"{n} Test Flat", "line2": "Test Street", "city": "Bengaluru", "state": "Karnataka", "pincode": "560001"},
            "payment_method": method}
    if influencer:
        body["influencer"] = influencer
    if clicked:
        body["influencer_clicked_at"] = clicked.isoformat()
    if coupon:
        body["coupon_code"] = coupon
    r = await c.post("/api/v1/checkout/guest", json=body)
    assert r.status_code == 201, r.text
    return r.json()["order_id"]


async def test_the_whole_journey():
    world = await make_world()
    from sqlalchemy.future import select
    from app.models.analytics import AnalyticsEvent
    from app.models.influencer import InfluencerCommission
    from app.models.order import Order, OrderStatus
    from app.services import influencer as svc

    c, H, products, variants, Session = world["client"], world["H"], world["products"], world["variants"], world["Session"]
    report = []

    # 1. A collection of three, in the founder's order, invisible until published.
    r = await c.post("/api/admin/v1/collections", headers=H, json={"name": f"Influencer Edit {RUN}", "product_ids": [str(products[2].id), str(products[0].id), str(products[1].id)]})
    assert r.status_code == 201, r.text
    col = r.json()
    assert (await c.get(f"/api/v1/catalog/collections/{col['slug']}")).status_code == 404
    pv = (await c.get(f"/api/admin/v1/collections/{col['id']}", headers=H)).json()["preview"]
    assert [p["id"] for p in pv["products"]] == [str(products[i].id) for i in (2, 0, 1)]
    r = await c.put(f"/api/admin/v1/collections/{col['id']}", headers=H, json={"name": col["name"], "is_published": True})
    page = (await c.get(f"/api/v1/catalog/collections/{col['slug']}")).json()
    assert [p["name"] for p in page["products"]] == [products[i].name for i in (2, 0, 1)]
    report.append("collection: 3 pieces, founder's order kept, hidden until published")

    # 2. Two influencers on the same collection; Riya also has a code.
    r = await c.post("/api/admin/v1/influencers", headers=H, json={"name": f"Riya {RUN}", "code": f"riya-{RUN}", "phone": phone(90), "collection_id": col["id"],
                                                                   "commission_type": "percent", "commission_value": 10, "discount_code": f"RIYA{RUN.upper()}", "discount_percent": 10})
    assert r.status_code == 201, r.text
    riya = r.json()
    r = await c.post("/api/admin/v1/influencers", headers=H, json={"name": f"Sneha {RUN}", "code": f"sneha-{RUN}", "collection_id": col["id"],
                                                                   "commission_type": "fixed", "commission_value": 10000})
    sneha = r.json()
    land = (await c.get(f"/api/v1/influencers/{sneha['code']}/landing")).json()
    assert land["path"] == f"/collections/{col['slug']}"
    # Her default link can open one piece instead; anything off the shop is refused.
    body = {"name": sneha["name"], "commission_type": "fixed", "commission_value": 10000, "landing": f"/product/{products[1].id}"}
    assert (await c.put(f"/api/admin/v1/influencers/{sneha['id']}", headers=H, json=body)).status_code == 200
    assert (await c.get(f"/api/v1/influencers/{sneha['code']}/landing")).json()["path"] == f"/product/{products[1].id}"
    bad = await c.put(f"/api/admin/v1/influencers/{sneha['id']}", headers=H, json={**body, "landing": "https://elsewhere.example"})
    assert bad.status_code == 422
    body["landing"] = f"/collections/{col['slug']}"
    await c.put(f"/api/admin/v1/influencers/{sneha['id']}", headers=H, json=body)
    assert (await c.get(f"/api/v1/influencers/{sneha['code']}/landing")).json()["path"] == f"/collections/{col['slug']}"
    report.append("a link can open one piece or a collection; a link to another site is refused")

    active = [x["code"] for x in (await c.get("/api/v1/coupons/active")).json()]
    assert riya["discount_code"] not in active
    report.append("two influencers on one collection; short link lands on it; Riya's code is not advertised")

    # 3. Orders.
    o_cod = await guest(c, variants[1], method="COD", n=1, influencer=sneha["code"], clicked=NOW - timedelta(days=2))
    o_pre = await guest(c, variants[0], method="RAZORPAY", n=2, influencer=sneha["code"], clicked=NOW - timedelta(hours=1), coupon=riya["discount_code"])
    o_old = await guest(c, variants[2], method="COD", n=3, influencer=sneha["code"], clicked=NOW - timedelta(days=31))
    o_own = await guest(c, variants[2], method="COD", n=4, influencer=riya["code"], clicked=NOW - timedelta(minutes=5), who=phone(90))
    o_rep = await guest(c, variants[2], method="COD", n=1, influencer=sneha["code"], clicked=NOW - timedelta(days=2))  # repeat buyer
    o_bad = await guest(c, variants[2], method="COD", n=5, influencer="nobody-here", clicked=NOW)

    async with Session() as db:
        orders = {o.id: o for o in (await db.execute(select(Order).where(Order.id.in_([uuid.UUID(x) for x in (o_cod, o_pre, o_old, o_own, o_rep, o_bad)])))).scalars()}
        rows = {r.order_id: r for r in (await db.execute(select(InfluencerCommission))).scalars()}

        def who(o): return (str(orders[uuid.UUID(o)].influencer_id) if orders[uuid.UUID(o)].influencer_id else None, orders[uuid.UUID(o)].influencer_via)
        assert who(o_cod) == (sneha["id"], "link")
        assert who(o_pre) == (riya["id"], "code"), "her code beats another influencer's link"
        assert who(o_old) == (None, None), "a tap 31 days ago is outside the window"
        assert who(o_bad) == (None, None)
        assert who(o_rep) == (sneha["id"], "link"), "a repeat order inside the window still counts"
        cod, pre, own = orders[uuid.UUID(o_cod)], orders[uuid.UUID(o_pre)], orders[uuid.UUID(o_own)]
        assert rows[cod.id].amount_paise == 10000 and rows[cod.id].status == "pending"
        assert rows[pre.id].base_paise == pre.total_amount - pre.shipping_amount
        assert rows[pre.id].amount_paise == rows[pre.id].base_paise // 10
        assert rows[own.id].status == "void" and rows[own.id].reason == "Her own order" and rows[own.id].amount_paise == 0
        report.append(f"COD via Sneha's link: credited, ₹100 pending; prepaid with Riya's code over Sneha's link: Riya, 10% of ₹{(pre.total_amount - pre.shipping_amount) / 100:,.2f} goods (delivery excluded)")
        report.append("tap 31 days old: credited to nobody; unknown code: nobody; her own phone: void, ₹0; repeat order in window: credited")

        # 4. No double credit: attributing the same order again changes nothing.
        cod.influencer_id = None
        await svc.attribute(db, cod, link_code=riya["code"], clicked_at=NOW, buyer_phone=phone(1))
        await db.flush()
        n = len((await db.execute(select(InfluencerCommission).where(InfluencerCommission.order_id == cod.id))).scalars().all())
        assert n == 1
        await db.rollback()
        report.append("second attribution of the same order: still one commission row")

        # 5. Lifecycle: delivered + 14 days earns; cancelled voids; returned after earning reverses; undelivered COD stays pending.
        cod = await db.get(Order, uuid.UUID(o_cod)); rep = await db.get(Order, uuid.UUID(o_rep)); pre = await db.get(Order, uuid.UUID(o_pre))
        cod.status = OrderStatus.DELIVERED; pre.status = OrderStatus.CANCELLED
        await db.flush()
        await svc.settle(db, NOW)
        await svc.settle(db, NOW + timedelta(days=15))
        r_cod = (await db.execute(select(InfluencerCommission).where(InfluencerCommission.order_id == cod.id))).scalar_one()
        r_pre = (await db.execute(select(InfluencerCommission).where(InfluencerCommission.order_id == pre.id))).scalar_one()
        r_rep = (await db.execute(select(InfluencerCommission).where(InfluencerCommission.order_id == rep.id))).scalar_one()
        assert (r_cod.status, r_pre.status, r_rep.status) == ("earned", "void", "pending")
        assert await svc.mark_paid(db, [r_cod.id, r_pre.id, r_rep.id], "UPI-TEST-1", NOW) == 1
        cod.status = OrderStatus.RETURNED
        await db.flush()
        await svc.settle(db, NOW + timedelta(days=16))
        assert r_cod.status == "reversed" and r_cod.reason == "The order came back"
        report.append("delivered + 14 days: payable; cancelled: void; COD not delivered: pending; only payable rows can be paid; returned after payment: reversed")
        await db.rollback()

        # 6. Traffic: clicks, sessions, visitors and the funnel, from the events the site already sends.
        def ev(kind, sess, visitor, **p):
            return AnalyticsEvent(event_type=kind, session_id=sess, properties={"influencer": sneha["code"], "visitor": visitor, **p}, created_at=NOW - timedelta(hours=1))
        pid = str(products[1].id)
        db.add_all([
            ev("influencer_click", "s1", "v1"), ev("page_view", "s1", "v1"), ev("page_view", "s1", "v1"),   # a refresh
            ev("product_viewed", "s1", "v1", product_id=pid), ev("add_to_cart", "s1", "v1", product_id=pid),
            ev("checkout_initiated", "s1", "v1"),
            ev("influencer_click", "s2", "v1", returning=True), ev("page_view", "s2", "v1", returning=True),  # same person, later
            ev("influencer_click", "s3", "v2"), ev("product_viewed", "s3", "v2", product_id=pid),
        ])
        await db.commit()

    perf = (await c.get("/api/admin/v1/influencers/performance", headers=H,
                        params={"start": (NOW - timedelta(days=1)).isoformat(), "end": (NOW + timedelta(days=1)).isoformat()})).json()
    s = next(x for x in perf["influencers"] if x["id"] == sneha["id"])
    assert (s["clicks"], s["sessions"], s["visitors"], s["returning_visitors"]) == (3, 3, 2, 1)
    assert (s["product_views"], s["add_to_cart"], s["checkouts"]) == (2, 1, 1)
    assert s["top_viewed"][0]["id"] == pid and s["top_viewed"][0]["views"] == 2
    assert s["orders"] == 2 and s["statuses"]["cod_pending"] == 2, s
    assert s["committed_paise"] > 0 and s["collected_paise"] == 0, "COD placed is owed, never collected"
    r = next(x for x in perf["influencers"] if x["id"] == riya["id"])
    assert r["statuses"]["unpaid"] == 1 and r["orders_by_code"] == 0, "a prepaid order nobody paid for is not an order"

    # The gateway confirms the prepaid order: now it is an order, and collected money.
    async with Session() as db:
        pre = await db.get(Order, uuid.UUID(o_pre)); pre.status = OrderStatus.PAID; await db.commit()
        paid_total = pre.total_amount
    perf = (await c.get("/api/admin/v1/influencers/performance", headers=H,
                        params={"start": (NOW - timedelta(days=1)).isoformat(), "end": (NOW + timedelta(days=1)).isoformat()})).json()
    r = next(x for x in perf["influencers"] if x["id"] == riya["id"])
    assert r["orders_by_code"] == 1 and r["collected_paise"] == paid_total and r["statuses"]["confirmed"] == 1
    assert str(products[0].id) in [x["id"] for x in r["top_bought"]]
    report.append(f"Riya: prepaid order with her code counts only once paid - then ₹{paid_total // 100} collected, best seller named")
    report.append(f"Sneha: {s['clicks']} clicks, {s['sessions']} sessions, {s['visitors']} visitors (1 returning) - a refresh added nothing; 2 views, 1 bag, 1 checkout; 2 COD orders counted as owed, not collected")

    print("\n" + "\n".join(f"  PASS  {line}" for line in report))

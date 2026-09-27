"""The Amazon connector, against a faked Amazon that answers SP-API's shapes.

There is no seller account yet, so this is the proof: token exchange,
pagination, throttling, the Pending quirk, PII absent without approval,
AFN not touching the shelf, and a gzipped settlement report read by the
same code as a hand-exported one.
"""
import gzip
import json
from datetime import datetime, timezone
from urllib.parse import parse_qs

import httpx
import pytest

from app.services import amazon_sp as sp

CFG = sp.Config(client_id="cid", client_secret="sec", refresh_token="rt", endpoint="https://sp.test")


class FakeAmazon:
    """Routes by path; records what it was asked. `throttle_once` makes the
    first orders call answer 429 with a Retry-After."""

    def __init__(self, *, throttle_once=False):
        self.calls = []
        self.throttle_once = throttle_once
        self.tokens_issued = 0

    def handler(self, req: httpx.Request) -> httpx.Response:
        self.calls.append((req.method, req.url.path, dict(parse_qs(req.url.query.decode()))))
        p = req.url.path
        if req.url.host == "api.amazon.com":
            body = parse_qs(req.content.decode())
            assert body["grant_type"] == ["refresh_token"] and body["refresh_token"] == ["rt"]
            self.tokens_issued += 1
            return httpx.Response(200, json={"access_token": f"tok{self.tokens_issued}", "expires_in": 3600})
        if req.url.host == "sp.test":
            assert req.headers.get("x-amz-access-token", "").startswith("tok"), "every API call carries the token"
        else:
            assert "x-amz-access-token" not in req.headers, "a pre-signed download URL must not carry it"
        q = parse_qs(req.url.query.decode())
        if p == "/orders/v0/orders":
            if self.throttle_once:
                self.throttle_once = False
                return httpx.Response(429, headers={"Retry-After": "0"}, json={"errors": [{"message": "QuotaExceeded"}]})
            if q.get("NextToken") == ["page2"]:
                return httpx.Response(200, json={"payload": {"Orders": [ORDER_CANCELLED, ORDER_PENDING, ORDER_AFN]}})
            assert q["MarketplaceIds"] == ["A21TJRUUN4KGV"]
            assert "LastUpdatedAfter" in q
            return httpx.Response(200, json={"payload": {"Orders": [ORDER_SHIPPED], "NextToken": "page2"}})
        if p.startswith("/orders/v0/orders/") and p.endswith("/orderItems"):
            oid = p.split("/")[4]
            if oid == "403-PENDING":
                raise AssertionError("items must not be asked for a Pending order")
            if oid == "403-SHIPPED" and not q.get("NextToken"):
                return httpx.Response(200, json={"payload": {"OrderItems": [ITEM_M], "NextToken": "i2"}})
            if oid == "403-SHIPPED":
                return httpx.Response(200, json={"payload": {"OrderItems": [ITEM_L]}})
            if oid == "403-AFN":
                return httpx.Response(200, json={"payload": {"OrderItems": [ITEM_M]}})
            return httpx.Response(200, json={"payload": {"OrderItems": [dict(ITEM_M, ItemPrice=None)]}})
        if p == "/reports/2021-06-30/reports":
            assert q["reportTypes"] == [sp.SETTLEMENT_REPORT]
            return httpx.Response(200, json={"reports": [
                {"reportId": "r1", "processingStatus": "DONE", "reportDocumentId": "d1"},
                {"reportId": "r0", "processingStatus": "IN_PROGRESS"},
            ]})
        if p == "/reports/2021-06-30/documents/d1":
            return httpx.Response(200, json={"reportDocumentId": "d1", "url": "https://files.test/d1.gz",
                                             "compressionAlgorithm": "GZIP"})
        if req.url.host == "files.test":
            return httpx.Response(200, content=gzip.compress(SETTLEMENT.encode()))
        return httpx.Response(404, json={"errors": [{"message": f"no route {p}"}]})


ORDER_SHIPPED = {
    "AmazonOrderId": "403-SHIPPED", "OrderStatus": "Shipped", "PurchaseDate": "2026-09-20T10:15:00Z",
    "FulfillmentChannel": "MFN", "PaymentMethod": "Other",
    # No name or street: the app is not approved for PII. City/state/pin still come.
    "ShippingAddress": {"City": "Bengaluru", "StateOrRegion": "KARNATAKA", "PostalCode": "560038", "CountryCode": "IN"},
}
ORDER_CANCELLED = {"AmazonOrderId": "403-CANC", "OrderStatus": "Canceled", "PurchaseDate": "2026-09-21T08:00:00Z",
                   "FulfillmentChannel": "MFN", "PaymentMethod": "COD"}
ORDER_PENDING = {"AmazonOrderId": "403-PENDING", "OrderStatus": "Pending", "PurchaseDate": "2026-09-22T08:00:00Z"}
ORDER_AFN = {"AmazonOrderId": "403-AFN", "OrderStatus": "Unshipped", "PurchaseDate": "2026-09-22T09:00:00Z",
             "FulfillmentChannel": "AFN", "PaymentMethod": "Other",
             "ShippingAddress": {"City": "Pune", "StateOrRegion": "MAHARASHTRA", "PostalCode": "411001"}}
ITEM_M = {"SellerSKU": "ZS-WIN-M", "ASIN": "B0X", "QuantityOrdered": 1, "ItemPrice": {"CurrencyCode": "INR", "Amount": "1124.00"}}
ITEM_L = {"SellerSKU": "ZS-WIN-L", "ASIN": "B0Y", "QuantityOrdered": 2, "ItemPrice": {"CurrencyCode": "INR", "Amount": "2248.00"}}

SETTLEMENT = (
    "settlement-id\tsettlement-start-date\tsettlement-end-date\tdeposit-date\ttotal-amount\tcurrency\ttransaction-type\torder-id\tamount-type\tamount-description\tamount\tposted-date\n"
    "S1\t2026-09-15\t2026-09-29\t2026-09-30\t2100.00\tINR\t\t\t\t\t\t\n"
    "S1\t\t\t\t\t\tOrder\t403-SHIPPED\tItemPrice\tPrincipal\t3372.00\t2026-09-25\n"
    "S1\t\t\t\t\t\tOrder\t403-SHIPPED\tItemFees\tCommission\t-472.00\t2026-09-25\n"
    "S1\t\t\t\t\t\tOrder\t403-SHIPPED\tItemFees\tFBAPerUnitFulfillmentFee\t-100.00\t2026-09-25\n"
)


async def _run(fake, **kw):
    async with sp.Client(CFG, transport=httpx.MockTransport(fake.handler), sleep=_no_sleep, **kw) as c:
        return c, await sp.fetch_orders(c, datetime(2026, 9, 1, tzinfo=timezone.utc))


async def _no_sleep(_):
    return None


@pytest.mark.asyncio
async def test_orders_are_paged_items_fetched_and_shaped_for_ingest():
    fake = FakeAmazon()
    c, parsed = await _run(fake)
    assert fake.tokens_issued == 1, "one token serves the whole session"
    by_id = {o.external_id: o for o in parsed.orders}
    assert set(by_id) == {"403-SHIPPED", "403-CANC", "403-AFN"}, parsed.problems
    s = by_id["403-SHIPPED"]
    assert s.status == "SHIPPED" and len(s.lines) == 2, "items paginate too"
    assert [l.unit_price_paise for l in s.lines] == [112400, 112400], "ItemPrice is the line total"
    assert (s.city, s.state, s.pincode, s.name, s.line1) == ("Bengaluru", "KARNATAKA", "560038", None, None)
    assert s.holds_our_stock is True
    assert by_id["403-CANC"].status == "CANCELLED" and by_id["403-CANC"].payment == "COD"
    assert by_id["403-AFN"].holds_our_stock is False, "Amazon's warehouse shipped it; not our shelf"
    assert parsed.rows_total == 4 and parsed.problems == []


@pytest.mark.asyncio
async def test_pending_orders_are_left_until_next_time():
    fake = FakeAmazon()
    await _run(fake)
    assert not any("403-PENDING" in path for _, path, _ in fake.calls)


@pytest.mark.asyncio
async def test_throttling_is_retried_and_retry_after_honoured():
    fake = FakeAmazon(throttle_once=True)
    waited = []

    async def sleep(s):
        waited.append(s)

    async with sp.Client(CFG, transport=httpx.MockTransport(fake.handler), sleep=sleep) as c:
        parsed = await sp.fetch_orders(c, datetime(2026, 9, 1, tzinfo=timezone.utc))
    assert len(parsed.orders) == 3 and waited[:1] == [0.0]


@pytest.mark.asyncio
async def test_a_refusal_is_an_error_with_amazons_words():
    def handler(req):
        if req.url.host == "api.amazon.com":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        return httpx.Response(403, json={"errors": [{"message": "Access to requested resource is denied."}]})
    async with sp.Client(CFG, transport=httpx.MockTransport(handler), sleep=_no_sleep) as c:
        with pytest.raises(sp.SpApiError, match="denied"):
            await c.orders_updated_since(datetime(2026, 9, 1, tzinfo=timezone.utc))


@pytest.mark.asyncio
async def test_settlement_report_is_downloaded_gunzipped_and_netted_per_order():
    fake = FakeAmazon()
    async with sp.Client(CFG, transport=httpx.MockTransport(fake.handler), sleep=_no_sleep) as c:
        f = await sp.fetch_settlements(c, datetime(2026, 9, 1, tzinfo=timezone.utc))
    assert f.report_ids == ["r1"], f.problems
    assert len(f.rows) == 1 and f.rows[0].external_id == "403-SHIPPED"
    assert f.rows[0].amount_paise == 337200 - 47200 - 10000, "net of Amazon's fees, never the list price"
    # The deposit date from the summary line, not the per-line posted date:
    # settled means the money reached the bank.
    assert f.rows[0].settled_on.date().isoformat() == "2026-09-30"


def test_without_credentials_it_refuses_and_names_what_is_missing():
    class S:
        AMAZON_SP_CLIENT_ID = "x"; AMAZON_SP_CLIENT_SECRET = ""; AMAZON_SP_REFRESH_TOKEN = ""
    with pytest.raises(sp.NotConfigured, match="AMAZON_SP_CLIENT_SECRET, AMAZON_SP_REFRESH_TOKEN"):
        sp.Config.from_settings(S())
    assert sp.configured(S()) is False


def test_unshipped_is_paid_not_shipped():
    ext, why = sp.to_external_order({"AmazonOrderId": "1", "OrderStatus": "Unshipped"}, [ITEM_M])
    assert ext.status == "PAID" and why is None
    ext, why = sp.to_external_order({"AmazonOrderId": "2", "OrderStatus": "Unshipped"}, [])
    assert ext is None and "no items" in why

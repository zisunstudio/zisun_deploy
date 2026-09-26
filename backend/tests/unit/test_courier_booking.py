"""Packing an order must end with a courier asked to come, or say why not.

Marking PACKED used to create a Shiprocket order and stop: no courier was
assigned, no pickup requested, nothing written back, every error swallowed.
The parcel sat on the table and the console could not say when anyone would
come for it.
"""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.models.order import CODConfirmation, Fulfillment, PaymentMethod
from app.services import shiprocket


class _Resp:
    def __init__(self, payload, status=200):
        self._payload, self.status_code, self.text = payload, status, "x"

    def json(self):
        return self._payload


REPLIES = {
    "/orders/create/adhoc": _Resp({"order_id": 111, "shipment_id": 222, "status": "NEW", "awb_code": ""}),
    "/courier/assign/awb": _Resp({
        "awb_assign_status": 1,
        "response": {"data": {"awb_code": "1411232", "courier_name": "Delhivery Surface", "shipment_id": 222}},
    }),
    "/courier/generate/pickup": _Resp({
        "pickup_status": 1,
        "response": {"pickup_scheduled_date": "2026-09-29 11:00:00", "pickup_token_number": "Reference No: 194"},
    }),
    "/courier/generate/label": _Resp({"label_created": 1, "label_url": "https://sr.example/label.pdf"}),
}


class _DB:
    async def execute(self, *_a, **_kw):
        return SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(name="Asha Rao", phone="+919876543210", email=None))

    async def flush(self):
        pass


def _order(cod=False):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        created_at=datetime(2026, 9, 26, tzinfo=timezone.utc),
        payment_method=PaymentMethod.COD if cod else PaymentMethod.RAZORPAY,
        cod_confirmation=CODConfirmation.PENDING if cod else None,
        shipping_amount=0,
        total_amount=129900,
        address=SimpleNamespace(line1="12 MG Road", line2=None, city="Bengaluru", state="Karnataka", pincode="560001"),
        items=[SimpleNamespace(product_variant_id=uuid.uuid4(), quantity=1, unit_price=129900)],
    )


@pytest.fixture
def transport(monkeypatch):
    calls: list[str] = []
    replies = dict(REPLIES)

    async def _token(_redis):
        return "tok"

    async def _redis():
        return None

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, **kw):
            path = url.replace(shiprocket.SHIPROCKET_BASE, "")
            calls.append(path)
            return replies[path]

    monkeypatch.setattr(shiprocket, "_get_token", _token)
    monkeypatch.setattr("app.core.redis.get_redis_client", _redis)
    monkeypatch.setattr(shiprocket.httpx, "AsyncClient", lambda *a, **kw: _Client())
    return SimpleNamespace(calls=calls, replies=replies)


def _fulfillment():
    return Fulfillment(carrier="shiprocket", status="NOT_BOOKED")


class TestBooking:
    async def test_books_courier_pickup_and_label(self, transport):
        f = _fulfillment()
        await shiprocket.book_shipment(_DB(), _order(), f)
        assert transport.calls == list(REPLIES)
        assert f.shipment_id == "222" and f.external_ref == "111"
        assert f.awb_number == "1411232" and f.courier_name == "Delhivery Surface"
        # Shiprocket speaks Indian time; 11:00 IST is 05:30 UTC.
        assert f.pickup_scheduled_at.astimezone(timezone.utc).hour == 5
        assert f.pickup_token == "Reference No: 194"
        assert f.label_url == "https://sr.example/label.pdf"
        assert f.last_error is None and shiprocket.is_booked(f)

    async def test_failure_is_recorded_not_swallowed(self, transport):
        transport.replies["/courier/generate/pickup"] = _Resp({"message": "Pickup address not verified"}, status=400)
        f = _fulfillment()
        await shiprocket.book_shipment(_DB(), _order(), f)
        assert f.awb_number == "1411232"
        assert f.pickup_scheduled_at is None
        assert "Pickup address not verified" in f.last_error

    async def test_retry_resumes_without_a_second_order(self, transport):
        transport.replies["/courier/assign/awb"] = _Resp({"awb_assign_status": 0, "message": "No courier serviceable"})
        f = _fulfillment()
        await shiprocket.book_shipment(_DB(), _order(), f)
        assert "No courier serviceable" in f.last_error
        transport.replies["/courier/assign/awb"] = REPLIES["/courier/assign/awb"]
        transport.calls.clear()
        await shiprocket.book_shipment(_DB(), _order(), f)
        assert "/orders/create/adhoc" not in transport.calls
        assert shiprocket.is_booked(f) and f.last_error is None

    async def test_refused_awb_status_zero_is_a_failure(self, transport):
        transport.replies["/courier/assign/awb"] = _Resp({"awb_assign_status": 0, "response": {"data": {"awb_code": "X"}}})
        f = _fulfillment()
        await shiprocket.book_shipment(_DB(), _order(), f)
        assert f.awb_number is None and f.last_error

    async def test_unconfirmed_cod_is_never_booked(self, transport):
        f = _fulfillment()
        await shiprocket.book_shipment(_DB(), _order(cod=True), f)
        assert transport.calls == []
        assert "PENDING" in f.last_error

    async def test_no_credentials_says_so(self, monkeypatch):
        async def _none(_redis):
            return None

        async def _redis():
            return None

        monkeypatch.setattr(shiprocket, "_get_token", _none)
        monkeypatch.setattr("app.core.redis.get_redis_client", _redis)
        f = _fulfillment()
        await shiprocket.book_shipment(_DB(), _order(), f)
        assert "not connected" in f.last_error


class TestCourierWords:
    @pytest.mark.parametrize("status,step", [
        ("UNDELIVERED", "attempted"),
        ("RTO DELIVERED", "returning"),
        ("DELIVERED", "delivered"),
        ("PICKUP SCHEDULED", "packed"),
        ("OUT FOR PICKUP", "packed"),
        ("NOT PICKED", "packed"),
        ("PICKED UP", "picked_up"),
        ("IN TRANSIT", "in_transit"),
        ("OUT FOR DELIVERY", "out_for_delivery"),
    ])
    def test_step(self, status, step):
        assert shiprocket.step_for(status) == step

    def test_pickup_time_is_indian(self):
        t = shiprocket.parse_pickup_time("2026-09-29 11:00:00")
        assert t.utcoffset().total_seconds() == 5.5 * 3600
        assert shiprocket.parse_pickup_time("") is None
        assert shiprocket.parse_pickup_time("soon") is None

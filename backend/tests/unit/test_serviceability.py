"""Serviceability must fail open, and must not cache COD as long as coverage.

Both behaviours are money. A false "not serviceable" loses the sale outright.
A COD flag cached for a day keeps taking COD orders against a courier that
suspended COD twelve hours ago, and every one of those is an RTO.
"""
import json

import pytest

from app.services import shiprocket


class _FakeRedis:
    """Enough Redis to exercise the two-part cache, with per-key expiry."""

    def __init__(self):
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def get(self, key):
        return self.store.get(key)

    async def setex(self, key, ttl, value):
        self.store[key] = value
        self.ttls[key] = ttl

    def expire_now(self, key):
        self.store.pop(key, None)


def _couriers(*, days=4, cod=1, name="Delhivery"):
    return {
        "data": {
            "available_courier_companies": [
                {"courier_name": name, "estimated_delivery_days": days, "cod": cod}
            ]
        }
    }


class _Resp:
    def __init__(self, payload, status=200):
        self._payload, self.status_code, self.text = payload, status, "x"

    def json(self):
        return self._payload


def _patch_transport(monkeypatch, resp_or_exc):
    """Replace the httpx client and the token lookup in one go."""

    async def _token(_redis):
        return "tok"

    monkeypatch.setattr(shiprocket, "_get_token", _token)

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **kw):
            if isinstance(resp_or_exc, Exception):
                raise resp_or_exc
            return resp_or_exc

    monkeypatch.setattr(shiprocket.httpx, "AsyncClient", lambda *a, **kw: _Client())


@pytest.fixture
def creds(monkeypatch):
    monkeypatch.setattr(shiprocket.settings, "SHIPROCKET_EMAIL", "a@b.c")
    monkeypatch.setattr(shiprocket.settings, "SHIPROCKET_PASSWORD", "pw")
    monkeypatch.setattr(shiprocket.settings, "SHIPROCKET_PICKUP_PINCODE", "560094")


class TestFailsOpen:
    async def test_no_credentials_assumes_deliverable(self, monkeypatch):
        monkeypatch.setattr(shiprocket.settings, "SHIPROCKET_EMAIL", "")
        r = await shiprocket.check_serviceability("600001")
        assert r.serviceable is True and r.source == "assumed"

    async def test_timeout_assumes_deliverable(self, creds, monkeypatch):
        _patch_transport(monkeypatch, TimeoutError("timed out"))
        r = await shiprocket.check_serviceability("600001")
        assert r.serviceable is True and r.source == "assumed"

    async def test_http_error_assumes_deliverable(self, creds, monkeypatch):
        _patch_transport(monkeypatch, _Resp({}, status=502))
        r = await shiprocket.check_serviceability("600001")
        assert r.serviceable is True and r.source == "assumed"

    async def test_assumed_answers_carry_no_estimate(self, creds, monkeypatch):
        """A date we never received must not be presented as one we did."""
        _patch_transport(monkeypatch, TimeoutError())
        r = await shiprocket.check_serviceability("600001")
        assert r.estimated_days is None

    async def test_empty_courier_list_is_a_real_no(self, creds, monkeypatch):
        """Nobody delivering there is an answer, not a failure to answer."""
        _patch_transport(monkeypatch, _Resp({"data": {"available_courier_companies": []}}))
        r = await shiprocket.check_serviceability("999999")
        assert r.serviceable is False and r.source == "live"


class TestLiveAnswer:
    async def test_reads_days_cod_and_courier(self, creds, monkeypatch):
        _patch_transport(monkeypatch, _Resp(_couriers(days=3, cod=1, name="Bluedart")))
        r = await shiprocket.check_serviceability("560001")
        assert (r.serviceable, r.cod_available, r.estimated_days, r.courier) == (
            True, True, 3, "Bluedart",
        )

    async def test_fastest_courier_sets_the_estimate(self, creds, monkeypatch):
        payload = {"data": {"available_courier_companies": [
            {"courier_name": "Slow", "estimated_delivery_days": 9, "cod": 0},
            {"courier_name": "Fast", "estimated_delivery_days": 2, "cod": 0},
        ]}}
        _patch_transport(monkeypatch, _Resp(payload))
        r = await shiprocket.check_serviceability("560001")
        assert r.estimated_days == 2 and r.courier == "Fast"

    async def test_cod_available_if_any_courier_offers_it(self, creds, monkeypatch):
        payload = {"data": {"available_courier_companies": [
            {"courier_name": "A", "estimated_delivery_days": 4, "cod": 0},
            {"courier_name": "B", "estimated_delivery_days": 6, "cod": 1},
        ]}}
        _patch_transport(monkeypatch, _Resp(payload))
        assert (await shiprocket.check_serviceability("560001")).cod_available is True


class TestTwoPartCache:
    async def test_cod_flag_gets_the_shorter_ttl(self, creds, monkeypatch):
        redis = _FakeRedis()
        _patch_transport(monkeypatch, _Resp(_couriers()))
        await shiprocket.check_serviceability("560001", redis=redis)
        base, cod = shiprocket._cache_keys("560001")
        assert redis.ttls[cod] < redis.ttls[base]
        assert redis.ttls[base] == shiprocket.settings.SERVICEABILITY_CACHE_SECONDS
        assert redis.ttls[cod] == shiprocket.settings.SERVICEABILITY_COD_CACHE_SECONDS

    async def test_second_call_is_served_from_cache(self, creds, monkeypatch):
        redis = _FakeRedis()
        _patch_transport(monkeypatch, _Resp(_couriers(days=5)))
        await shiprocket.check_serviceability("560001", redis=redis)
        # Any further network call would now raise.
        _patch_transport(monkeypatch, RuntimeError("must not be called"))
        r = await shiprocket.check_serviceability("560001", redis=redis)
        assert r.source == "cache" and r.estimated_days == 5

    async def test_expired_cod_flag_refuses_to_claim_cod(self, creds, monkeypatch):
        """The whole point of the split TTL.

        Coverage is still cached and still true. The COD flag has aged out, so
        until it is re-fetched we must not tell a customer COD is available.
        """
        redis = _FakeRedis()
        _patch_transport(monkeypatch, _Resp(_couriers(cod=1)))
        await shiprocket.check_serviceability("560001", redis=redis)
        base, cod = shiprocket._cache_keys("560001")
        redis.expire_now(cod)

        _patch_transport(monkeypatch, _Resp(_couriers(cod=0)))
        r = await shiprocket.check_serviceability("560001", redis=redis)
        assert r.serviceable is True
        assert r.cod_available is False

    async def test_cache_write_failure_does_not_fail_the_request(self, creds, monkeypatch):
        class _Broken(_FakeRedis):
            async def setex(self, *a, **kw):
                raise RuntimeError("redis down")

        _patch_transport(monkeypatch, _Resp(_couriers()))
        r = await shiprocket.check_serviceability("560001", redis=_Broken())
        assert r.serviceable is True and r.source == "live"

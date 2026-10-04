"""Referral rules that decide money: when a reward is earned, and tax on a discounted sale."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.order import OrderStatus
from app.services import referral
from app.services.gst import apportion_discount

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


class TestSettleDecision:
    def test_not_delivered_stays_pending(self):
        for s in (OrderStatus.PAYMENT_PENDING, OrderStatus.PAID, OrderStatus.PACKED, OrderStatus.SHIPPED):
            assert referral.settle_decision(s, None, NOW) == ("pending", None)

    def test_cancelled_refused_or_returned_earns_nothing(self):
        for s in (OrderStatus.CANCELLED, OrderStatus.FAILED_PAYMENT, OrderStatus.RETURNED):
            assert referral.settle_decision(s, None, NOW)[0] == "void"

    def test_delivered_starts_the_hold_then_earns(self):
        status, seen = referral.settle_decision(OrderStatus.DELIVERED, None, NOW)
        assert (status, seen) == ("pending", NOW)
        later = NOW + timedelta(days=referral.HOLD_DAYS) - timedelta(minutes=1)
        assert referral.settle_decision(OrderStatus.DELIVERED, seen, later)[0] == "pending"
        done = NOW + timedelta(days=referral.HOLD_DAYS)
        assert referral.settle_decision(OrderStatus.DELIVERED, seen, done) == ("earned", NOW)


    def test_earned_or_paid_is_reversed_only_when_the_order_comes_back(self):
        for current in ("earned", "paid"):
            assert referral.settle_decision(OrderStatus.DELIVERED, NOW, NOW, current)[0] == current
            assert referral.settle_decision(OrderStatus.RETURNED, NOW, NOW, current)[0] == "reversed"

    def test_finished_states_never_move(self):
        for current in ("void", "reversed", "recovered"):
            for s in (OrderStatus.DELIVERED, OrderStatus.RETURNED, OrderStatus.CANCELLED):
                assert referral.settle_decision(s, NOW, NOW + timedelta(days=99), current)[0] == current

    def test_hold_covers_the_whole_exchange_process(self):
        # 24h to raise + 3 days to post back + up to 8 days in transit
        assert referral.HOLD_DAYS >= 1 + 3 + 8


class TestHousehold:
    def test_one_household_however_it_is_typed(self):
        a = referral.address_key("Flat 12, Rose Apartments", "560001")
        assert a == referral.address_key("flat 12 rose apartments.", "560 001")
        assert a != referral.address_key("Flat 13, Rose Apartments", "560001")
        assert a != referral.address_key("Flat 12, Rose Apartments", "560002")

    async def test_ordinary_coupon_skips_the_address_check(self):
        db = AsyncMock()
        await referral.check_address(db, MagicMock(owner_user_id=None), uuid.uuid4(), "x", "560001")
        db.execute.assert_not_called()

    async def test_owner_address_is_refused(self):
        owner = uuid.uuid4()
        db = AsyncMock()
        row = MagicMock(user_id=owner, line1="12 Rose Apts", pincode="560001", id=uuid.uuid4())
        db.execute.return_value = MagicMock(all=lambda: [row])
        with pytest.raises(HTTPException) as e:
            await referral.check_address(db, MagicMock(owner_user_id=owner), uuid.uuid4(), "12, rose apts", "560001")
        assert "at this address" in e.value.detail

    async def test_address_that_has_ordered_before_is_refused(self):
        db = AsyncMock()
        row = MagicMock(user_id=uuid.uuid4(), line1="12 Rose Apts", pincode="560001", id=uuid.uuid4())
        db.execute.return_value = MagicMock(all=lambda: [row])
        db.scalar.return_value = 1
        with pytest.raises(HTTPException) as e:
            await referral.check_address(db, MagicMock(owner_user_id=uuid.uuid4()), uuid.uuid4(), "12 Rose Apts", "560001")
        assert "first order" in e.value.detail

    async def test_new_household_passes(self):
        db = AsyncMock()
        db.execute.return_value = MagicMock(all=lambda: [])
        await referral.check_address(db, MagicMock(owner_user_id=uuid.uuid4()), uuid.uuid4(), "9 New Road", "560001")


class TestCodes:
    def test_stem_is_her_first_name(self):
        assert referral.code_stem("Priya Sharma") == "PRIYA"
        assert referral.code_stem("Anu") == "ANU"
        assert referral.code_stem("Lakshmipriya") == "LAKSHM"

    def test_stem_falls_back(self):
        assert referral.code_stem(None) == "ZISUN"
        assert referral.code_stem("  ") == "ZISUN"
        assert referral.code_stem("J.") == "ZISUN"

    def test_normalise(self):
        assert referral.normalise_code(" priya 100 ") == "PRIYA100"
        with pytest.raises(HTTPException):
            referral.normalise_code("PR-1")
        with pytest.raises(HTTPException):
            referral.normalise_code("AB")


class TestCheckBuyer:
    async def test_owner_cannot_use_own_code(self):
        owner = uuid.uuid4()
        coupon = MagicMock(owner_user_id=owner)
        with pytest.raises(HTTPException) as e:
            await referral.check_buyer(AsyncMock(), coupon, owner)
        assert "own code" in e.value.detail

    async def test_first_order_only(self):
        db = AsyncMock()
        db.scalar.return_value = 1
        with pytest.raises(HTTPException) as e:
            await referral.check_buyer(db, MagicMock(owner_user_id=uuid.uuid4()), uuid.uuid4())
        assert "first order" in e.value.detail

    async def test_new_buyer_passes(self):
        db = AsyncMock()
        db.scalar.return_value = 0
        await referral.check_buyer(db, MagicMock(owner_user_id=uuid.uuid4()), uuid.uuid4())

    async def test_ordinary_coupon_untouched(self):
        db = AsyncMock()
        await referral.check_buyer(db, MagicMock(owner_user_id=None), uuid.uuid4())
        db.scalar.assert_not_called()


class TestApportionDiscount:
    def test_no_discount_is_unchanged(self):
        items = [{"unit_price_paise": 103900, "quantity": 1}]
        assert apportion_discount(items, 0) is items

    def test_lines_add_back_to_what_was_paid(self):
        items = [
            {"description": "Purple Rose", "unit_price_paise": 103900, "quantity": 2},
            {"description": "Rich Wine", "unit_price_paise": 112400, "quantity": 1},
        ]
        out = apportion_discount(items, 10000 + 15000)
        assert all(o["quantity"] == 1 for o in out)
        assert len(out) == 3
        assert sum(o["unit_price_paise"] for o in out) == 103900 * 2 + 112400 - 25000
        assert all(o["unit_price_paise"] > 0 for o in out)

    def test_discount_never_exceeds_the_goods(self):
        out = apportion_discount([{"unit_price_paise": 5000, "quantity": 1}], 9000)
        assert out[0]["unit_price_paise"] == 0

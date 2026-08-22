"""COD confirmation: the dispatch gate and the reply parser.

The gate is the feature. Asking the customer and shipping anyway saves nothing,
so the tests that matter are the ones that prove an unconfirmed order cannot be
dispatched — including the states nobody thinks about, like an order created
before this flow existed.
"""
import types
from datetime import datetime, timezone

import pytest

from app.models.order import CODConfirmation, OrderStatus, PaymentMethod
from app.services.cod_confirmation import (
    apply_reply,
    confirmation_message,
    interpret_reply,
    mark_sent,
    may_dispatch,
    needs_confirmation,
)


def _order(**kw):
    o = types.SimpleNamespace(
        payment_method=PaymentMethod.COD,
        status=OrderStatus.PAYMENT_PENDING,
        cod_confirmation=CODConfirmation.PENDING,
        cod_confirmation_sent_at=None,
        cod_confirmed_at=None,
        cod_confirmation_attempts=0,
    )
    for k, v in kw.items():
        setattr(o, k, v)
    return o


class TestDispatchGate:
    def test_prepaid_always_dispatches(self):
        """The money is already collected; there is nothing to confirm."""
        o = _order(payment_method=PaymentMethod.RAZORPAY, cod_confirmation=None)
        assert may_dispatch(o) is True

    def test_confirmed_cod_dispatches(self):
        assert may_dispatch(_order(cod_confirmation=CODConfirmation.CONFIRMED)) is True

    @pytest.mark.parametrize(
        "state",
        [
            CODConfirmation.PENDING,
            CODConfirmation.DECLINED,
            CODConfirmation.UNREACHABLE,
        ],
    )
    def test_unconfirmed_cod_is_held(self, state):
        assert may_dispatch(_order(cod_confirmation=state)) is False

    def test_cod_with_no_confirmation_column_is_held(self):
        """The case that would otherwise leak.

        An order created before this flow existed, or by a code path that
        forgot to ask, has NULL here. Treating NULL as "fine to ship" would
        silently exempt exactly the orders nobody checked.
        """
        assert may_dispatch(_order(cod_confirmation=None)) is False


class TestReplyParsing:
    def test_button_reply_carries_the_order(self):
        assert interpret_reply(button_id="cod_yes:abc-123") == ("abc-123", True)
        assert interpret_reply(button_id="cod_no:abc-123") == ("abc-123", False)

    def test_unrelated_button_is_ignored(self):
        assert interpret_reply(button_id="track_order:abc") is None

    @pytest.mark.parametrize("word", ["yes", "YES", " Ok ", "confirm", "haan", "y"])
    def test_affirmative_free_text(self, word):
        assert interpret_reply(text=word) == ("", True)

    @pytest.mark.parametrize("word", ["no", "N", "cancel", "nahi", "STOP"])
    def test_negative_free_text(self, word):
        assert interpret_reply(text=word) == ("", False)

    @pytest.mark.parametrize(
        "text",
        [
            "no, when will it arrive?",
            "yes but can I change the size",
            "is this cotton?",
            "",
            "   ",
        ],
    )
    def test_sentences_are_not_treated_as_answers(self, text):
        """Guessing here is worse than not answering.

        Reading "no, when will it arrive?" as a cancellation destroys a real
        order. Anything that is not unambiguously yes or no is left for a human.
        """
        assert interpret_reply(text=text) is None


class TestApplyReply:
    def test_yes_confirms_and_timestamps(self):
        o = _order()
        assert apply_reply(o, True) is True
        assert o.cod_confirmation is CODConfirmation.CONFIRMED
        assert o.cod_confirmed_at is not None
        assert may_dispatch(o) is True

    def test_no_declines(self):
        o = _order()
        assert apply_reply(o, False) is True
        assert o.cod_confirmation is CODConfirmation.DECLINED
        assert may_dispatch(o) is False

    def test_second_reply_is_a_no_op(self):
        """Meta redelivers webhooks and customers tap twice."""
        o = _order()
        apply_reply(o, True)
        first = o.cod_confirmed_at
        assert apply_reply(o, True) is False
        assert o.cod_confirmed_at == first

    def test_yes_cannot_reverse_a_decline(self):
        o = _order(cod_confirmation=CODConfirmation.DECLINED)
        assert apply_reply(o, True) is False
        assert o.cod_confirmation is CODConfirmation.DECLINED

    def test_reply_to_a_cancelled_order_is_ignored(self):
        """A late yes must not resurrect an order whose stock went back."""
        o = _order(status=OrderStatus.CANCELLED)
        assert apply_reply(o, True) is False
        assert may_dispatch(o) is False


class TestBookkeeping:
    def test_mark_sent_counts_attempts(self):
        o = _order(cod_confirmation=None)
        mark_sent(o)
        assert o.cod_confirmation is CODConfirmation.PENDING
        assert o.cod_confirmation_attempts == 1
        assert o.cod_confirmation_sent_at is not None
        mark_sent(o)
        assert o.cod_confirmation_attempts == 2

    def test_needs_confirmation_only_for_live_cod(self):
        assert needs_confirmation(_order()) is True
        assert needs_confirmation(_order(payment_method=PaymentMethod.RAZORPAY)) is False
        assert needs_confirmation(_order(status=OrderStatus.CANCELLED)) is False

    def test_message_states_amount_and_both_options(self):
        msg = confirmation_message("abcdef123456", 199900, "Mangalgiri Kurti x1")
        assert "1999" in msg and "YES" in msg and "NO" in msg
        assert "abcdef12" in msg

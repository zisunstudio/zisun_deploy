"""Unit tests for OrderStateMachine — valid and invalid transitions."""
import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

from app.services.order_state_machine import OrderStateMachine, VALID_TRANSITIONS
from app.models.order import OrderStatus


def make_order(status: OrderStatus):
    order = MagicMock()
    order.status = status
    return order


class TestValidTransitions:
    @pytest.mark.parametrize("from_status,to_status", [
        (OrderStatus.CREATED,          OrderStatus.PAYMENT_PENDING),
        (OrderStatus.PAYMENT_PENDING,  OrderStatus.PAID),
        (OrderStatus.PAYMENT_PENDING,  OrderStatus.FAILED_PAYMENT),
        (OrderStatus.PAYMENT_PENDING,  OrderStatus.CANCELLED),
        (OrderStatus.PAID,             OrderStatus.PACKED),
        (OrderStatus.PAID,             OrderStatus.CANCELLED),
        (OrderStatus.PACKED,           OrderStatus.SHIPPED),
        (OrderStatus.PACKED,           OrderStatus.CANCELLED),
        (OrderStatus.SHIPPED,          OrderStatus.DELIVERED),
    ])
    def test_valid_transition(self, from_status, to_status):
        order = make_order(from_status)
        OrderStateMachine.transition(order, to_status)
        assert order.status == to_status


class TestInvalidTransitions:
    @pytest.mark.parametrize("from_status,to_status", [
        (OrderStatus.CANCELLED,   OrderStatus.SHIPPED),
        (OrderStatus.DELIVERED,   OrderStatus.PAID),
        (OrderStatus.DELIVERED,   OrderStatus.CANCELLED),
        (OrderStatus.CREATED,     OrderStatus.SHIPPED),
        (OrderStatus.SHIPPED,     OrderStatus.CREATED),
        (OrderStatus.FAILED_PAYMENT, OrderStatus.PAID),
        (OrderStatus.RETURNED,    OrderStatus.PAID),
        (OrderStatus.PAID,        OrderStatus.CREATED),
    ])
    def test_invalid_transition_raises_409(self, from_status, to_status):
        order = make_order(from_status)
        with pytest.raises(HTTPException) as exc_info:
            OrderStateMachine.transition(order, to_status)
        assert exc_info.value.status_code == 409

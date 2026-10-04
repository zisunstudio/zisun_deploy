from fastapi import HTTPException

from app.models.order import OrderStatus

VALID_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.CREATED: {OrderStatus.PAYMENT_PENDING},
    OrderStatus.PAYMENT_PENDING: {
        OrderStatus.PAID,
        OrderStatus.FAILED_PAYMENT,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PAID: {OrderStatus.PACKED, OrderStatus.CANCELLED},
    OrderStatus.PACKED: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    # A parcel can come back: refused at the door or undeliverable (SHIPPED),
    # or sent back and refunded under the statutory case in the exchange
    # policy (DELIVERED). Neither could be recorded before, so a sale that
    # was undone stayed a sale - in the money figures, and for any referral
    # reward that hung on it.
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED, OrderStatus.RETURNED},
    OrderStatus.DELIVERED: {OrderStatus.RETURNED},
    OrderStatus.FAILED_PAYMENT: set(),
    OrderStatus.CANCELLED: set(),
    OrderStatus.RETURNED: set(),
}


class OrderStateMachine:
    @staticmethod
    def transition(order: "Order", new_status: OrderStatus) -> None:  # noqa: F821
        """Apply a status transition, raising HTTP 409 if invalid."""
        allowed = VALID_TRANSITIONS.get(order.status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot transition order from {order.status.value} to {new_status.value}",
            )
        order.status = new_status

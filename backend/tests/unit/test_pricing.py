"""Shipping is free when she pays online; COD carries the charge."""
from app.services.pricing import shipping_for


def test_prepaid_ships_free():
    assert shipping_for("RAZORPAY", 9900) == 0


def test_cod_carries_the_charge():
    assert shipping_for("COD", 9900) == 9900
    assert shipping_for("cod", 9900) == 9900


def test_an_enum_value_works_too():
    class M:
        value = "COD"
    assert shipping_for(M(), 9900) == 9900


def test_a_negative_setting_never_pays_the_customer():
    assert shipping_for("COD", -500) == 0

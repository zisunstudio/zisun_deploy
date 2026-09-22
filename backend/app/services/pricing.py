"""What an order costs beyond its pieces.

One rule today: shipping is free when she pays online, and Cash on Delivery
carries a flat charge. COD is refused or returned far more often than a paid
order (the founder's figures: 40-60% against ~15%), each one is freight paid
twice for nothing, and the charge is both the cost of that and the nudge
toward paying online.

Pure, so it is tested without a database; the amount comes from settings
(COD_SHIPPING_FEE_PAISE) at the call site.
"""


def shipping_for(payment_method: str, cod_fee_paise: int) -> int:
    """Paise of shipping for this order. Prepaid is always free."""
    method = getattr(payment_method, "value", payment_method)
    return max(0, int(cod_fee_paise)) if str(method).upper() == "COD" else 0

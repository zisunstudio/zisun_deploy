import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.launch import require_checkout_enabled
from app.core.security import get_current_user
from app.schemas.order import (
    CartItemRequest,
    CartItemResponse,
    CartResponse,
    CheckoutInitiateRequest,
    CheckoutResponse,
    UpdateCartItemRequest,
)
from app.services.checkout import CheckoutService

router = APIRouter()


def _build_cart_response(cart, cart_total: int) -> CartResponse:
    """Construct CartResponse explicitly from ORM objects (no attr setting on ORM)."""
    item_responses = []
    for item in cart.items:
        variant = item.variant
        unit_price = 0
        product_name: Optional[str] = None
        image_url: Optional[str] = None
        size: Optional[str] = None
        color: Optional[str] = None
        sku: Optional[str] = None

        if variant:
            size = variant.size
            color = variant.color
            sku = variant.sku
            product = variant.product if hasattr(variant, "product") else None
            if product:
                unit_price = product.base_price + variant.price_delta
                product_name = product.name
                # Use first media item's cdn_url or url if available
                if hasattr(product, "media") and product.media:
                    first_media = product.media[0]
                    image_url = first_media.cdn_url or first_media.url
            else:
                unit_price = variant.price_delta

        item_responses.append(
            CartItemResponse(
                id=item.id,
                product_variant_id=item.product_variant_id,
                quantity=item.quantity,
                unit_price=unit_price,
                product_name=product_name,
                image_url=image_url,
                size=size,
                color=color,
                sku=sku,
            )
        )

    return CartResponse(
        id=cart.id,
        items=item_responses,
        cart_total=cart_total,
    )


@router.get("/", response_model=CartResponse)
async def get_cart(
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    svc = CheckoutService(db)
    cart, cart_total = await svc.get_cart_with_total(current_user.id)
    return _build_cart_response(cart, cart_total)


@router.post("/items", response_model=CartResponse, status_code=200)
async def add_item_to_cart(
    body: CartItemRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    svc = CheckoutService(db)
    cart = await svc.add_to_cart(current_user.id, body.variant_id, body.quantity)
    _, cart_total = await svc.get_cart_with_total(current_user.id)
    return _build_cart_response(cart, cart_total)


@router.delete("/items/{variant_id}", response_model=CartResponse, status_code=200)
async def remove_cart_item(
    variant_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    svc = CheckoutService(db)
    cart = await svc.remove_from_cart(current_user.id, variant_id)
    _, cart_total = await svc.get_cart_with_total(current_user.id)
    return _build_cart_response(cart, cart_total)


@router.put("/items/{item_id}", response_model=CartResponse, status_code=200)
async def update_cart_item_quantity(
    item_id: uuid.UUID,
    body: UpdateCartItemRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Update quantity of a specific cart item. quantity=0 removes the item."""
    svc = CheckoutService(db)
    cart = await svc.update_cart_quantity(current_user.id, item_id, body.quantity)
    _, cart_total = await svc.get_cart_with_total(current_user.id)
    return _build_cart_response(cart, cart_total)


@router.post(
    "/checkout/initiate",
    response_model=CheckoutResponse,
    dependencies=[Depends(require_checkout_enabled)],
)
async def initiate_checkout(
    body: CheckoutInitiateRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="X-Idempotency-Key"),
):
    svc = CheckoutService(db)
    order, razorpay_order_id = await svc.initiate_checkout(
        user_id=current_user.id,
        address_id=body.address_id,
        payment_method=body.payment_method,
        coupon_code=body.coupon_code,
        idempotency_key=idempotency_key,
    )
    return CheckoutResponse(
        order_id=order.id,
        razorpay_order_id=razorpay_order_id,
        amount=order.total_amount,
        discount_amount=order.discount_amount,
        payment_method=order.payment_method.value,
        is_cod=(order.payment_method.value == "COD"),
    )

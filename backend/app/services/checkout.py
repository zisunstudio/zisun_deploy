import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Tuple, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import Cart, CartItem
from app.models.catalog import ProductVariant, Product
from app.models.order import Order, OrderItem, OrderStatus, InventoryLock, LockStatus, OutboxEvent, PaymentMethod

logger = logging.getLogger(__name__)


def _razorpay_client():
    """Return a live Razorpay client, or None if credentials are absent/unusable.

    Callers must treat None as fatal in production — see create_order.
    """
    from app.core.config import settings
    if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
        return None
    try:
        import razorpay  # noqa: PLC0415
        return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    except Exception as exc:
        logger.warning("Razorpay client init failed: %s", exc)
        return None


class CheckoutService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─────────────────────────────────────────────────────────────────────
    # Cart helpers
    # ─────────────────────────────────────────────────────────────────────

    async def get_or_create_cart(self, user_id: uuid.UUID) -> Cart:
        """Return the user's cart (with items + variants + products eagerly loaded)."""
        # Eager-load items → variant → product → media so response building
        # (_build_cart_response reads product.media) never triggers an async
        # lazy load, which would raise MissingGreenlet and 500 GET /cart.
        _load = (
            selectinload(Cart.items)
            .selectinload(CartItem.variant)
            .selectinload(ProductVariant.product)
            .selectinload(Product.media)
        )
        stmt = select(Cart).options(_load).where(Cart.user_id == user_id)
        result = await self.db.execute(stmt)
        cart = result.scalar_one_or_none()

        if not cart:
            cart = Cart(user_id=user_id)
            self.db.add(cart)
            await self.db.commit()
            # Reload with relationships
            result2 = await self.db.execute(
                select(Cart).options(_load).where(Cart.id == cart.id)
            )
            cart = result2.scalar_one()

        return cart

    async def get_cart_with_total(self, user_id: uuid.UUID) -> Tuple[Cart, int]:
        """Return (cart, cart_total_paise).

        cart_total = sum of (product.base_price + variant.price_delta) * quantity
        """
        cart = await self.get_or_create_cart(user_id)

        total = 0
        for item in cart.items:
            variant = item.variant
            if variant and variant.product:
                unit_price = variant.product.base_price + variant.price_delta
                total += unit_price * item.quantity

        return cart, total

    async def add_to_cart(self, user_id: uuid.UUID, variant_id: uuid.UUID, quantity: int) -> Cart:
        """Add a variant to the cart (or increment existing quantity).

        Validates variant is active and has sufficient stock.
        """
        # Validate variant
        stmt_variant = select(ProductVariant).where(ProductVariant.id == variant_id)
        res_variant = await self.db.execute(stmt_variant)
        variant = res_variant.scalar_one_or_none()

        if not variant:
            raise HTTPException(status_code=404, detail="Product variant not found")
        if not variant.is_active:
            raise HTTPException(status_code=409, detail="Product variant is not available")
        if variant.stock < quantity:
            raise HTTPException(status_code=409, detail=f"Only {variant.stock} items left in stock")

        # Get or create cart
        cart = await self.get_or_create_cart(user_id)

        # Check for existing item — compare UUID to UUID
        existing_item = next(
            (item for item in cart.items if item.product_variant_id == variant_id),
            None,
        )

        if existing_item:
            new_qty = existing_item.quantity + quantity
            if new_qty > variant.stock:
                raise HTTPException(status_code=409, detail="Cannot add more. Exceeds available stock.")
            existing_item.quantity = new_qty
        else:
            new_item = CartItem(
                cart_id=cart.id,
                product_variant_id=variant_id,
                quantity=quantity,
            )
            self.db.add(new_item)

        await self.db.commit()
        return await self.get_or_create_cart(user_id)

    async def remove_from_cart(self, user_id: uuid.UUID, variant_id: uuid.UUID) -> Cart:
        """Remove a variant from the cart. Raises 404 if not in cart."""
        cart = await self.get_or_create_cart(user_id)

        item = next(
            (i for i in cart.items if i.product_variant_id == variant_id),
            None,
        )
        if not item:
            raise HTTPException(status_code=404, detail="Item not in cart")

        await self.db.delete(item)
        await self.db.commit()
        return await self.get_or_create_cart(user_id)

    async def update_cart_quantity(
        self, user_id: uuid.UUID, item_id: uuid.UUID, quantity: int
    ) -> Cart:
        """Update quantity of a specific cart item by item ID.

        quantity=0 removes the item.
        """
        cart = await self.get_or_create_cart(user_id)

        item = next((i for i in cart.items if i.id == item_id), None)
        if not item:
            raise HTTPException(status_code=404, detail="Cart item not found")

        if quantity == 0:
            await self.db.delete(item)
            await self.db.commit()
            return await self.get_or_create_cart(user_id)

        # Validate stock
        stmt_variant = select(ProductVariant).where(ProductVariant.id == item.product_variant_id)
        res = await self.db.execute(stmt_variant)
        variant = res.scalar_one_or_none()
        if not variant:
            raise HTTPException(status_code=404, detail="Product variant no longer exists")
        if quantity > variant.stock:
            raise HTTPException(status_code=409, detail=f"Only {variant.stock} items in stock")

        item.quantity = quantity
        await self.db.commit()
        return await self.get_or_create_cart(user_id)

    # ─────────────────────────────────────────────────────────────────────
    # Checkout
    # ─────────────────────────────────────────────────────────────────────

    async def initiate_checkout(
        self,
        user_id: uuid.UUID,
        address_id: uuid.UUID,
        payment_method: PaymentMethod = PaymentMethod.RAZORPAY,
        coupon_code: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Tuple[Order, Optional[str]]:
        """
        Full checkout flow:
          1. Validate cart is non-empty
          2. Server-side price recalc from DB (with FOR UPDATE row locks)
          3. Apply coupon discount if provided
          4. Create PAYMENT_PENDING Order + OrderItems + InventoryLocks + CouponUsage
          5. For Razorpay: call API (or mock if keys absent)
          6. For COD: set cod_amount_due, skip Razorpay
          7. Clear cart
          Returns (order, razorpay_order_id_or_None)
        """
        from app.services.coupon import CouponService, COD_MAX_ORDER_VALUE_PAISE
        from app.core.config import settings  # deferred: avoids circular import

        # Browse-only closes order creation outright. The route dependency
        # already refuses the request; this is the layer that matters, because
        # every other caller of initiate_checkout (an admin path, a task, a
        # future endpoint) bypasses that dependency and must not be able to
        # create an order there is no way to pay for.
        if settings.is_browse_only:
            from app.core.launch import checkout_disabled_error
            raise checkout_disabled_error()

        # Enforced server-side, not just hidden in the UI: a client can post any
        # payment_method it likes. Under COD-only the Razorpay credentials are
        # not required to boot, so a RAZORPAY order here would reach a gateway
        # we have no keys for and strand in PAYMENT_PENDING holding stock.
        if settings.PAYMENTS_COD_ONLY and payment_method != PaymentMethod.COD:
            raise HTTPException(
                status_code=400,
                detail="Online payment is temporarily unavailable. "
                       "Please choose Cash on Delivery.",
            )

        cart = await self.get_or_create_cart(user_id)

        if not cart.items:
            raise HTTPException(status_code=400, detail="Cart is empty")

        # Idempotency: if there's already a PAYMENT_PENDING order for this user
        # with the same idempotency key, return it (prevents duplicate orders /
        # double stock decrement / double Razorpay order on retries & double-taps)
        if idempotency_key:
            existing_stmt = (
                select(Order)
                .where(
                    Order.user_id == user_id,
                    Order.status == OrderStatus.PAYMENT_PENDING,
                    Order.idempotency_key == idempotency_key,
                )
            )
            existing_result = await self.db.execute(existing_stmt)
            existing_order = existing_result.scalar_one_or_none()
            if existing_order:
                return existing_order, existing_order.razorpay_order_id

        gross_total = 0
        item_snapshots = []  # list of (cart_item, fresh_variant, unit_price)

        # Acquire per-variant FOR UPDATE locks and recalculate server-side price
        for item in cart.items:
            stmt_variant = (
                select(ProductVariant)
                .options(selectinload(ProductVariant.product))
                .where(ProductVariant.id == item.product_variant_id)
                .with_for_update()
            )
            res = await self.db.execute(stmt_variant)
            fresh_variant = res.scalar_one_or_none()

            if not fresh_variant:
                raise HTTPException(status_code=409, detail="A product variant is no longer available")
            if fresh_variant.stock < item.quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Item {fresh_variant.sku} only has {fresh_variant.stock} units left",
                )

            # Server-side price from DB
            if fresh_variant.product:
                unit_price = fresh_variant.product.base_price + fresh_variant.price_delta
            else:
                unit_price = fresh_variant.price_delta

            gross_total += unit_price * item.quantity
            item_snapshots.append((item, fresh_variant, unit_price))

            # Decrement stock immediately (lock held)
            fresh_variant.stock -= item.quantity

        # Validate coupon and compute discount
        coupon_obj = None
        discount_amount = 0
        if coupon_code:
            coupon_svc = CouponService(self.db)
            coupon_obj, discount_amount = await coupon_svc.validate_coupon(
                coupon_code, user_id, gross_total
            )

        net_total = max(0, gross_total - discount_amount)

        # COD limit check
        if payment_method == PaymentMethod.COD and net_total > COD_MAX_ORDER_VALUE_PAISE:
            raise HTTPException(
                status_code=400,
                detail=f"Cash on Delivery is not available for orders above ₹{COD_MAX_ORDER_VALUE_PAISE // 100}",
            )

        # Create order
        order = Order(
            user_id=user_id,
            status=OrderStatus.PAYMENT_PENDING,
            total_amount=net_total,
            address_id=address_id,
            payment_method=payment_method,
            discount_amount=discount_amount,
            coupon_id=coupon_obj.id if coupon_obj else None,
            idempotency_key=idempotency_key,
        )
        if payment_method == PaymentMethod.COD:
            order.cod_amount_due = net_total

        self.db.add(order)
        await self.db.flush()  # get order.id

        # Create OrderItems and InventoryLocks
        lock_expiry = datetime.now(timezone.utc) + timedelta(minutes=30)
        for cart_item, variant, unit_price in item_snapshots:
            order_item = OrderItem(
                order_id=order.id,
                product_variant_id=variant.id,
                quantity=cart_item.quantity,
                unit_price=unit_price,
            )
            self.db.add(order_item)

            lock = InventoryLock(
                product_variant_id=variant.id,
                order_id=order.id,
                reserved_qty=cart_item.quantity,
                expires_at=lock_expiry,
                status=LockStatus.ACTIVE,
            )
            self.db.add(lock)

        # Record coupon usage atomically
        if coupon_obj:
            coupon_svc = CouponService(self.db)
            await coupon_svc.record_usage(coupon_obj.id, user_id, order.id)

        # Payment gateway
        razorpay_order_id: Optional[str] = None
        if payment_method == PaymentMethod.RAZORPAY:
            from app.core.config import settings  # deferred: avoids circular import

            # A mock_order_* id in production is an order Razorpay never saw:
            # the webhook can never match it, so it strands in PAYMENT_PENDING
            # holding stock — or worse, gets waved through by a verifier that
            # has no secret to check against. Fail the checkout instead.
            client = _razorpay_client()
            if client is None and settings.is_production:
                logger.error("Razorpay unavailable — refusing to create order %s", order.id)
                raise HTTPException(503, "Payment gateway unavailable. Please try again.")

            if client:
                try:
                    rz_order = client.order.create({
                        "amount": net_total,
                        "currency": "INR",
                        "receipt": str(order.id),
                    })
                    razorpay_order_id = rz_order["id"]
                    logger.info("Razorpay order created: %s", razorpay_order_id)
                except Exception as exc:
                    logger.error("Razorpay order creation failed: %s", exc)
                    if settings.is_production:
                        raise HTTPException(503, "Payment gateway unavailable. Please try again.")
                    razorpay_order_id = f"mock_order_{order.id}"
            else:
                razorpay_order_id = f"mock_order_{order.id}"
                logger.warning("DEV MODE — mock Razorpay order: %s", razorpay_order_id)

            order.razorpay_order_id = razorpay_order_id
        else:
            logger.info("COD order %s — skipping Razorpay", order.id)

        # Clear cart items
        for cart_item, _, __ in item_snapshots:
            await self.db.delete(cart_item)

        await self.db.commit()
        await self.db.refresh(order)

        return order, razorpay_order_id

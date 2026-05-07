from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
import uuid
import logging
from datetime import datetime, timedelta, timezone

from app.models.cart import Cart, CartItem
from app.models.catalog import ProductVariant
from app.models.order import Order, OrderItem, OrderStatus, InventoryLock, LockStatus

logger = logging.getLogger(__name__)

class CheckoutService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_cart(self, user_id: uuid.UUID) -> Cart:
        stmt = select(Cart).options(selectinload(Cart.items).selectinload(CartItem.variant)).where(Cart.user_id == str(user_id))
        result = await self.db.execute(stmt)
        cart = result.scalar_one_or_none()
        
        if not cart:
            cart = Cart(user_id=str(user_id))
            self.db.add(cart)
            await self.db.commit()
            await self.db.refresh(cart)
            
        return cart

    async def add_to_cart(self, user_id: uuid.UUID, variant_id: uuid.UUID, quantity: int) -> Cart:
        # 1. Validate variant exists and has stock
        stmt_variant = select(ProductVariant).where(ProductVariant.id == str(variant_id))
        res_variant = await self.db.execute(stmt_variant)
        variant = res_variant.scalar_one_or_none()
        
        if not variant:
            raise HTTPException(status_code=404, detail="Product variant not found")
            
        if variant.stock < quantity:
            raise HTTPException(status_code=409, detail=f"Only {variant.stock} items left in stock")

        # 2. Get Cart
        cart = await self.get_or_create_cart(user_id)
        
        # 3. Check if item already in cart
        existing_item = next((item for item in cart.items if str(item.product_variant_id) == str(variant_id)), None)
        
        if existing_item:
            if existing_item.quantity + quantity > variant.stock:
                raise HTTPException(status_code=409, detail="Cannot add more. Exceeds available stock.")
            existing_item.quantity += quantity
        else:
            new_item = CartItem(cart_id=cart.id, product_variant_id=str(variant_id), quantity=quantity)
            self.db.add(new_item)
            
        await self.db.commit()
        return await self.get_or_create_cart(user_id)

    async def initiate_checkout(self, user_id: uuid.UUID, address_id: uuid.UUID) -> Order:
        """
        Executes the checkout mutation:
        1. Validates Cart
        2. Acquires Inventory Locks
        3. Creates PAYMENT_PENDING Order
        4. (Mock) Calls Razorpay
        """
        cart = await self.get_or_create_cart(user_id)
        
        if not cart.items:
            raise HTTPException(status_code=400, detail="Cart is empty")

        total_amount = 0
        locks_to_create = []
        
        # 1. Optimistic Locking & Calculation
        for item in cart.items:
            # We must load the base product to get the true price. 
            # For brevity in MVP scaffold, assuming base_price + price_delta is accessible
            # We will query the variant again to ensure fresh stock data
            stmt_variant = select(ProductVariant).where(ProductVariant.id == item.product_variant_id).with_for_update()
            res = await self.db.execute(stmt_variant)
            fresh_variant = res.scalar_one()

            if fresh_variant.stock < item.quantity:
                raise HTTPException(status_code=409, detail=f"Item {fresh_variant.sku} went out of stock.")
            
            # Note: For production, load Product for base_price. Mocking price calculation here.
            item_price = 100000 + fresh_variant.price_delta # Mocked base price 1000.00 INR
            total_amount += item_price * item.quantity
            
            # Decrement stock immediately (Pessimistic DB lock held)
            fresh_variant.stock -= item.quantity
            
            # Prepare lock record
            locks_to_create.append(
                InventoryLock(
                    product_variant_id=fresh_variant.id,
                    reserved_qty=item.quantity,
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
                    status=LockStatus.ACTIVE
                )
            )

        # 2. Create Order
        order = Order(
            user_id=str(user_id),
            status=OrderStatus.PAYMENT_PENDING,
            total_amount=total_amount,
            address_id=str(address_id)
        )
        self.db.add(order)
        await self.db.flush() # Get order.id
        
        # 3. Create OrderItems & Locks
        for idx, item in enumerate(cart.items):
            # Mock price
            item_price = 100000 + item.variant.price_delta
            order_item = OrderItem(
                order_id=order.id,
                product_variant_id=item.product_variant_id,
                quantity=item.quantity,
                unit_price=item_price
            )
            self.db.add(order_item)
            
            lock = locks_to_create[idx]
            lock.order_id = order.id
            self.db.add(lock)
            
        # 4. Clear Cart
        for item in cart.items:
            await self.db.delete(item)

        await self.db.commit()
        await self.db.refresh(order)
        
        return order

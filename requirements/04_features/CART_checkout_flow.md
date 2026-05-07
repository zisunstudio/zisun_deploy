# Feature: Cart & Checkout Flow

> **Document ID:** FEAT-CART-01  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 4.4 (Lines 259-284), Section 6.1 (Lines 416-444)

---

## 1. Feature Overview

The streamlined checkout pipeline encompassing cart persistence, address selection, payment initiation, and order creation. The flow is designed to minimize friction, with a target time of under 90 seconds from cart view to order confirmation.

**Priority:** P0 — Critical path for revenue.

### User Story
As a shopper, I want to review my selected items, enter my delivery address easily, and pay securely so that I can complete my purchase with minimal effort.

---

## 2. Acceptance Criteria

### 2.1 Cart Persistence
- Cart state is stored server-side and linked to the `user_id`.
- If a user adds items while unauthenticated, the cart must be stored locally (e.g., `localStorage`) and merged with their server-side cart upon successful OTP login.

### 2.2 Checkout Flow (3 Steps)
- **Step 1: Review.** Displays item details, variant (size/color), quantity, individual prices, and the calculated subtotal.
- **Step 2: Address.** 
  - Allows selection of saved addresses.
  - New address entry must be **Pincode-first**. Entering a valid 6-digit Indian pincode automatically fills the City and State fields.
- **Step 3: Payment Selection.**
  - Razorpay intent UI (UPI, Card, Netbanking).
  - *Note: Cash on Delivery (COD) is explicitly excluded from MVP scope.*

### 2.3 Order Creation & Inventory Locking
- When the user confirms the checkout at Step 3 (before Razorpay is invoked):
  1. An Order record is created in the database with status `PAYMENT_PENDING`.
  2. **Inventory Locks** are created for the requested variants. This guarantees stock is reserved while the user completes payment.
- The system must ensure that `stock >= requested_quantity` before creating the lock. If false, the checkout is rejected with a 409 error.

### 2.4 Zombie Order Cleanup
- Orders stuck in `PAYMENT_PENDING` for more than 30 minutes must be automatically cancelled.
- A scheduled background job (e.g., Celery Beat) runs periodically to find these orders.
- Upon cancellation, the corresponding `InventoryLocks` are marked `EXPIRED`, effectively releasing the stock back to the available pool.

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **`carts` Table (Proposed):** `id`, `user_id`, `updated_at`
- **`cart_items` Table (Proposed):** `id`, `cart_id`, `product_variant_id`, `quantity`
- **`inventory_locks` Table:** `id`, `product_variant_id`, `order_id`, `reserved_qty`, `status` (active/released/expired), `expires_at` (now + 30 mins)
- **`orders` Table:** `id`, `user_id`, `status` (`PAYMENT_PENDING`), `total_amount`, `address_id`, `created_at`

---

## 4. API Contracts

### `POST /cart/items`
- **Auth:** Optional (Uses Session ID if not logged in)
- **Request:** `{ "variant_id": "var_123", "quantity": 1 }`
- **Response:** `200 OK`, updated cart object.

### `POST /checkout/initiate`
- **Auth:** Required (User JWT)
- **Request:** `{ "address_id": "addr_890" }`
- **Response:** `200 OK`
  ```json
  {
    "order_id": "ord_555",
    "razorpay_order_id": "order_Fdfdgew",
    "amount": 129900, 
    "currency": "INR"
  }
  ```
  *(Note: Amount is in paise for Razorpay)*
- **Errors:**
  - `409 Conflict` (Insufficient stock for one or more items).

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **User Abandons Payment Page** | Order remains `PAYMENT_PENDING`. The 30-minute cleanup job will eventually cancel it and release the inventory locks. |
| **Payment Succeeds AFTER Cleanup Job Runs** | (Razorpay webhook arrives late). The webhook handler must detect the order is `CANCELLED`. It must flag the payment for manual refund/review. It cannot blindly update the order to `PAID` because the stock was already released and might have been sold to someone else. |
| **Invalid Pincode** | Call out to a reliable pincode API (e.g., Postman API or internal DB). Return 400 Bad Request if unserviceable or invalid. |

---

## 6. Security & Performance Checklist

- [ ] Cart merge logic safely handles unauthenticated-to-authenticated transitions without leaking data between sessions.
- [ ] Inventory locks use database transactions to prevent race conditions during checkout initiation.
- [ ] Checkout initiation calculates `total_amount` purely server-side based on variant prices. Client-side price payloads are completely ignored.
- [ ] Background cleanup job is configured and tested under load to ensure it runs efficiently over indexed columns (`status`, `created_at`).

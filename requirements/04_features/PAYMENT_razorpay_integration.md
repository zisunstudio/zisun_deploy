# Feature: Razorpay Payment Integration

> **Document ID:** FEAT-PAY-01  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 4.4 (Lines 268-284), Section 8 (Lines 543-546), Section 11.2 (Lines 643-648)

---

## 1. Feature Overview

Integration with Razorpay to process payments via UPI, Cards, and Netbanking. This encompasses initiating the payment intent from the checkout flow, securely handling asynchronous webhooks to confirm payment success, and providing admin reconciliation capabilities.

**Priority:** P0 — Critical path for revenue.

### User Story
As a shopper, I want to pay securely using my preferred method (UPI or Card) so that my order is confirmed instantly.

---

## 2. Acceptance Criteria

### 2.1 Checkout Initiation
- Upon checkout confirmation, the backend calls the Razorpay Orders API to create a `razorpay_order_id`.
- The amount passed to Razorpay is calculated strictly **server-side** based on the database item prices. Client-side price payloads are ignored.

### 2.2 Webhook Processing (Idempotency)
- Razorpay sends async webhooks (e.g., `payment.captured`, `payment.failed`).
- **Signature Verification:** The `x-razorpay-signature` header must be verified using HMAC-SHA256 at the framework middleware level, *before* the request reaches the business logic handler.
- **Idempotency:** Webhook handlers must be strictly idempotent. 
  - Database schema enforces this via a `UNIQUE` constraint on the `payment_gateway_id` column in the `payments` table.
  - If Razorpay sends the same webhook twice, the system catches the unique constraint violation and returns `200 OK` (to stop retries) without side effects.

### 2.3 Circuit Breaker & Resilience
- **Circuit Breaker:** Calls to Razorpay APIs (like Refunds or Order Creation) must be wrapped in a circuit breaker. If Razorpay is down, the system degrades gracefully, informing the user "Payment gateway temporarily unavailable" rather than crashing or hanging.

### 2.4 Refunds (Admin Only)
- All refunds are initiated exclusively via the internal Admin dashboard.
- Automated refunds (e.g., if a user cancels a PAID order before it ships) require an Admin-level JWT to execute the API call to Razorpay.

### 2.5 Settlement Reconciliation
- A scheduled background job (e.g., daily at 02:00 IST) fetches settlement data from Razorpay and compares it against ZISUN's internal `payments` table.
- Discrepancies are flagged in the Admin Dashboard for Finance review.

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **`payments` Table:**
  - `id` (UUID)
  - `order_id` (UUID, Foreign Key)
  - `gateway` (String, e.g., 'razorpay')
  - `payment_gateway_id` (String, **UNIQUE**) — The `pay_xxx` ID from Razorpay.
  - `status` (Enum: `PENDING`, `CAPTURED`, `FAILED`, `REFUNDED`)
  - `amount` (Integer, stored in paise/cents)
  - `processed_at` (Timestamp)

---

## 4. API Contracts

### `POST /webhooks/razorpay`
- **Auth:** None (Public endpoint, but protected by HMAC signature)
- **Request:** Razorpay standard webhook JSON payload.
- **Headers:** `x-razorpay-signature`
- **Response:** `200 OK`
  - *Must always return 200 OK immediately if signature is valid, even if business logic fails later, to prevent Razorpay from pausing the webhook.*

### `POST /admin/payments/{id}/refund`
- **Auth:** Admin JWT
- **Request:** `{ "amount": 129900, "reason": "requested_by_customer" }` (Amount in paise)
- **Response:** `200 OK`, updated payment object.

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Webhook Delivery Delay** | If webhook is delayed and the 30-min zombie order cleanup cancels the order, the webhook handler must detect `status == CANCELLED` and immediately flag the payment as an "Orphaned Payment" requiring manual refund. It must not switch the order back to `PAID`. |
| **Partial Payment Capture** | Razorpay rarely captures partial amounts. If `captured_amount != order_amount`, flag order as `PAYMENT_MISMATCH` and alert admin. Do not fulfill. |
| **Invalid Webhook Signature** | Immediately return `400 Bad Request` or `401 Unauthorized` and log the IP address for potential malicious activity. |

---

## 6. Security & Compliance Checklist

- [ ] HMAC-SHA256 signature verification implemented as Middleware.
- [ ] No payment card numbers, CVVs, or bank details are ever stored in the database or logs (PCI DSS SAQ A compliance).
- [ ] Database `UNIQUE` constraint strictly applied to `payment_gateway_id`.
- [ ] Admin-only restriction heavily enforced on the `/refund` endpoints.
- [ ] Server-side price calculation strictly enforced during Razorpay order creation.

# Testing Strategy

> **Document ID:** REQ-15  
> **Version:** 1.0  
> **Owner:** QA Lead / Engineering Lead  
> **PRD Source:** Section 15 (Lines 781-838)

---

## 1. Overview

This document establishes the testing requirements for the ZISUN platform. Because ZISUN processes financial transactions and handles physical inventory, the testing strategy heavily emphasizes concurrency, state machine integrity, and idempotency over simple UI tests.

---

## 2. Automated Testing Requirements

### 2.1 Unit Tests
- **Framework:** `pytest` (with `pytest-asyncio` for async FastAPI routes).
- **Coverage Targets:**
  - `80%` minimum branch coverage on all business logic modules.
  - `100%` coverage mandated on the `Payment` and `Inventory` modules.
- **Key Scenarios:** 
  - Order state machine: Assert that all valid transitions succeed and all invalid transitions (e.g., `CANCELLED` -> `SHIPPED`) raise exceptions.
  - Auth: Assert that 5 failed OTPs reliably trigger the 1-hour lockout.

### 2.2 Integration Tests
- **Razorpay Webhooks:** Tests must use actual Razorpay webhook JSON payloads to verify HMAC signature validation, successful processing, and idempotent rejection of duplicate payloads.
- **Inventory Concurrency:** A test must simulate 100 concurrent requests attempting to decrement a variant with `stock = 1`. The assertion must verify that exactly 1 request succeeds (200 OK) and 99 fail (409 Conflict), leaving `stock = 0`.
- **Cleanup Job:** A test must insert a simulated `PAYMENT_PENDING` order dated 35 minutes ago, run the Celery cleanup task, and assert the order is `CANCELLED` and locks are released.

---

## 3. User Acceptance Testing (UAT)

The following scenarios must pass manually in a Staging environment before any production release.

| ID | Scenario | Expected Result / Pass Criteria |
|----|----------|---------------------------------|
| **UAT-01** | First-time user completes purchase end-to-end. | Order confirmed, stock decremented, WhatsApp received in < 3 mins. |
| **UAT-02** | User attempts checkout for an out-of-stock item. | Blocked by UI; "Out of stock" message shown; no order created. |
| **UAT-03** | Two users simultaneously checkout for the last unit. | One succeeds; the other sees "stock unavailable". Zero oversell. |
| **UAT-04** | User abandons payment page. | 30-min cron job runs -> order cancelled, stock restored. No orphaned orders. |
| **UAT-05** | Duplicate Razorpay webhook fired manually. | System returns 200 OK but does not create a duplicate Shiprocket fulfillment. |
| **UAT-06** | Admin cancels a `PAID` order via Dashboard. | Refund API called successfully; user notified via WhatsApp; stock restored. |
| **UAT-07** | Network drop exactly at payment submission. | App handles offline gracefully; session restored on reconnect. |
| **UAT-08** | Admin bulk updates stock via CSV. | DB stock exactly matches CSV values; validation rejects malformed rows. |

---

## 4. Load Testing

Load testing must be executed using **Locust** in a Staging environment seeded with production-scale data (100k products, 10k past orders).

| Scenario | Load Profile | Pass Criteria |
|----------|--------------|---------------|
| **Catalog Browsing** | 200 concurrent users hitting feed and product APIs. | Zero DB connection pool exhaustion. P95 latency `< 500ms`. |
| **Concurrent Checkout**| 50 users simultaneously submitting checkout mutations. | Zero inventory oversells. Zero deadlocks. P95 latency `< 800ms`. |
| **Webhook Flood** | 1,000 duplicate Razorpay webhook payloads sent concurrently. | All handled idempotently. Zero duplicate records created in DB. |

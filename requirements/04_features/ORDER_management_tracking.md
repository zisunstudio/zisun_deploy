# Feature: Order Management & Tracking

> **Document ID:** FEAT-ORDER-01  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 4.5 (Lines 286-322)

---

## 1. Feature Overview

End-to-end order lifecycle management tracking the journey from order creation to final delivery or cancellation. This feature governs the core state machine of the eCommerce platform and triggers automated notifications (WhatsApp) and downstream processes (Fulfillment).

**Priority:** P0 — Core operational requirement.

### User Story
As a shopper, I want my order status to be updated accurately and receive real-time notifications via WhatsApp so I always know where my package is.
As an admin, I want a single source of truth for an order's state to process shipments and handle customer queries.

---

## 2. Acceptance Criteria

### 2.1 Order State Machine
Every order transition must be validated. Invalid transitions (e.g., `CANCELLED` -> `SHIPPED`) must be rejected at the database/service layer.

| State | Trigger | System Action / Side Effects |
|-------|---------|------------------------------|
| `CREATED` | User initiates checkout | Reserve InventoryLocks; create order record. |
| `PAYMENT_PENDING` | Razorpay checkout initiates | Start 30-min zombie order cleanup timer. |
| `PAID` | Razorpay webhook (success) | Release InventoryLock; formally decrement stock; OutboxEvent -> trigger fulfillment. |
| `FAILED_PAYMENT` | Razorpay webhook (failure) | Release InventoryLock; notify user. |
| `PACKED` | Admin manually marks packed | OutboxEvent -> notify user via WhatsApp. |
| `SHIPPED` | Shiprocket API AWB generated | OutboxEvent -> send tracking link via WhatsApp. |
| `DELIVERED` | Shiprocket webhook or Admin | Update analytics (conversion funnels). |
| `CANCELLED` | User/Admin/30-min Timeout | Release InventoryLock; initiate refund (if previously PAID). |
| `RETURNED` | User initiates return (Phase 2) | Trigger reverse logistics via Shiprocket; process refund. |

### 2.2 Event-Driven Architecture (Outbox Pattern)
- State transitions must not synchronously call external APIs (like WhatsApp or Shiprocket) within the same database transaction.
- **Pattern:** Use the Transactional Outbox pattern. When `orders.status` is updated, insert an event (e.g., `order.paid`) into the `outbox_events` table in the *same transaction*. A background worker processes these events reliably.

### 2.3 Status Tracking UX
- **User View:** Users can view a timeline of their order status via the app or via a deep link sent on WhatsApp.
- **Admin View:** Admins can view the full status history and manually override states (e.g., force a stuck order to `DELIVERED`).

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **`orders` Table:** Must use an Enum or strict string constraint for `status`.
- **`order_history` Table (Proposed):** `id`, `order_id`, `previous_status`, `new_status`, `changed_by` (user_id/admin_id/system), `created_at`. Crucial for audit trails.
- **`outbox_events` Table:** `id`, `aggregate_type` ('order'), `aggregate_id`, `event_type`, `payload`, `published_at`, `created_at`.

---

## 4. API Contracts

### `GET /orders`
- **Auth:** User JWT
- **Response:** Paginated list of user's orders with current status and basic details.

### `GET /orders/{id}`
- **Auth:** User JWT (Must own the order)
- **Response:** Detailed order view, including items, shipping address, Razorpay payment status, and AWB tracking link (if SHIPPED).

### `POST /admin/orders/{id}/status`
- **Auth:** Admin JWT
- **Request:** `{ "status": "PACKED" }`
- **Response:** `200 OK`, updated order object.
- **Errors:** `422 Unprocessable Entity` (Invalid state transition).

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Race Condition: Manual Cancel vs Webhook** | Use `SELECT FOR UPDATE` on the order row during state transitions. If an admin cancels an order at the exact millisecond the Razorpay success webhook arrives, the DB lock ensures they are processed sequentially. |
| **Missing Webhooks** | State machine must allow manual admin overrides for all states in case an external partner (Razorpay/Shiprocket) drops a webhook. |

---

## 6. Security & Auditing Checklist

- [ ] All order state changes are logged in an append-only `order_history` table.
- [ ] Users can only view their own orders (strict tenant isolation at the SQL/ORM level).
- [ ] State transitions are validated by a strict State Machine definition in the code, preventing skipped steps (e.g., `CREATED` to `SHIPPED` directly).
- [ ] Database transactions encompass both the order update and the `outbox_events` insert.

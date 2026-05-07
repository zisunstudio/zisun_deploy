# Feature: Shiprocket Fulfillment Integration

> **Document ID:** FEAT-FULFILL-01  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 4.5 (Lines 286-322), Section 8 (Lines 547-550)

---

## 1. Feature Overview

Integration with Shiprocket to automate the logistics lifecycle. This includes verifying pincode serviceability during checkout, pushing packed orders to Shiprocket to generate an Air Waybill (AWB), and ingesting tracking webhooks to update the customer's order status in real-time.

**Priority:** P0 — Required for scalable operations without manual data entry.

### User Story
As an admin, I want orders to automatically sync with our shipping provider so that I don't have to manually copy-paste addresses to generate shipping labels.
As a shopper, I want accurate delivery estimates and tracking links for my orders.

---

## 2. Acceptance Criteria

### 2.1 Pincode Serviceability (Checkout Phase)
- When a user enters a pincode at checkout (Step 2), the system must quickly verify if Shiprocket can deliver to that pincode.
- If unserviceable, the user is immediately notified ("Sorry, we don't deliver to this area yet") before payment is initiated.

### 2.2 Shipment Creation & AWB Generation
- When an Admin marks an order as `PACKED` in the internal dashboard, an Outbox Event is fired to trigger the Shiprocket API.
- The payload sent to Shiprocket must include the ZISUN `order_id` mapped to Shiprocket's `channel_order_id` (or equivalent external reference) to guarantee **idempotency**.
- If a shipment is created successfully, the system stores the `awb_number` and `shiprocket_order_id` in the `fulfillments` table.

### 2.3 Tracking Webhooks
- Shiprocket pushes tracking updates (e.g., "Picked Up", "In Transit", "Delivered").
- The system must expose a secure webhook endpoint to receive these updates.
- When an AWB reaches a terminal state (like `Delivered`), the ZISUN order status is automatically updated to `DELIVERED`.

### 2.4 Reverse Logistics (Phase 2)
- When a user initiates a return via WhatsApp or the App, a Reverse Pickup request is sent to Shiprocket.
- The system tracks the reverse AWB until the item is marked as received at the warehouse, triggering the Razorpay refund.

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **`fulfillments` Table:**
  - `id` (UUID)
  - `order_id` (UUID, Foreign Key)
  - `carrier` (String, default: 'shiprocket')
  - `shiprocket_order_id` (String)
  - `shiprocket_shipment_id` (String)
  - `awb_number` (String, UNIQUE)
  - `status` (String)
  - `created_at`, `updated_at` (Timestamps)

---

## 4. API Contracts

### `GET /checkout/pincode/{pincode}`
- **Auth:** User JWT or Public (Rate Limited)
- **Response:** `200 OK`, `{ "serviceable": true, "city": "Mumbai", "state": "Maharashtra" }`

### `POST /webhooks/shiprocket`
- **Auth:** Custom Header (e.g., `x-shiprocket-token`) configured in Shiprocket dashboard.
- **Request:** Shiprocket tracking update JSON.
- **Response:** `200 OK` (Must return 200 immediately to acknowledge receipt).

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Shiprocket API Downtime** | If Shiprocket is down during the `PACKED` transition, the background worker retries the API call using exponential backoff. The order remains `PACKED` until the AWB is generated. |
| **Duplicate Shipment Creation** | Idempotency enforced using `order_id` as the external reference. If the API call times out but Shiprocket created the shipment, a retry must fetch the existing AWB instead of creating a second shipment. |
| **Webhook Delivery Failure** | A daily cron job polls Shiprocket for status updates on all active AWBs that haven't received a webhook update in 24 hours. |

---

## 6. Security Checklist

- [ ] Shiprocket API tokens stored securely in AWS Secrets Manager / environment variables.
- [ ] Webhook endpoint protected by a static secret token verified via constant-time string comparison.
- [ ] Webhook payload validation ensures `awb_number` belongs to a valid ZISUN order before modifying order state.

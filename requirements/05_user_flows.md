# User Flows

> **Document ID:** REQ-05  
> **Version:** 1.0  
> **Owner:** Product Lead  
> **PRD Source:** Section 5 (Lines 359-413)

---

## 1. Overview

This document maps the end-to-end user journeys through the ZISUN platform. It defines the step-by-step interactions across the client application, backend services, and third-party integrations (Razorpay, Shiprocket, WhatsApp).

---

## 2. Core Flows

### 2.1 First-Time User Purchase Flow
*Target latency: < 90 seconds from Add to Cart to Order Confirmation.*

| Step | Actor | Action | System Response / Backend Logic |
|------|-------|--------|---------------------------------|
| 1 | User | Opens app/PWA link. | Serves Shoppable Content Feed. (No auth required). |
| 2 | User | Scrolls feed; taps a "Shop Now" CTA on a content card. | Opens Product Bottom Sheet with details, sizes, and price. |
| 3 | User | Selects size and taps "Add to Cart". | Cart state updated locally. Prompts OTP Sign In (Auth Wall). |
| 4 | User | Enters 10-digit phone number. | Backend validates number, calls SMS provider (Twilio), sends 6-digit OTP. |
| 5 | User | Enters OTP. | Backend verifies OTP, issues JWTs. Local cart merges with server cart. Redirects to Checkout. |
| 6 | User | Enters delivery pincode. | Backend verifies Shiprocket serviceability. Auto-fills City/State. |
| 7 | User | Enters exact address and taps "Proceed to Pay". | Backend creates `Order` (`PAYMENT_PENDING`), acquires `InventoryLocks`, returns Razorpay `order_id`. |
| 8 | User | Selects payment method (e.g., UPI) in Razorpay SDK. | Razorpay processes payment. On success, fires webhook to ZISUN backend. |
| 9 | System| (Async) | Webhook handler verifies signature, updates order to `PAID`, releases lock, decrements stock, inserts Outbox Event. |
| 10| System| (Async) | Worker processes Outbox Event: Sends WhatsApp Order Confirmation within 60s. |

### 2.2 Return & Refund Flow (Phase 2)
*Relies heavily on WhatsApp conversational agent for initiation.*

| Step | Actor | Action | System Response / Backend Logic |
|------|-------|--------|---------------------------------|
| 1 | User | Messages WhatsApp bot: "I want to return order #1234". | Bot queries backend for order status. |
| 2 | System| (Validation) | Backend verifies order is `DELIVERED` and within the 7-day return window. |
| 3 | Bot | Replies with return reason options (1. Size issue, 2. Defective, etc.). | User replies with a number. |
| 4 | User | Confirms pickup address. | Backend triggers Shiprocket API to create a Reverse Pickup AWB. |
| 5 | System| (Async) | Updates order status to `RETURN_INITIATED`. Sends WhatsApp tracking link for pickup. |
| 6 | Courier| Picks up item and returns it to ZISUN warehouse. | Shiprocket fires webhook marking reverse AWB as delivered. |
| 7 | Admin | Inspects returned item via Admin Dashboard; clicks "Approve Refund". | Backend calls Razorpay Refunds API. Updates order to `RETURNED`. Reinstates stock count. |
| 8 | System| (Async) | Sends WhatsApp notification: "Refund initiated to original payment method." |

### 2.3 Admin Order Processing Flow
*The daily operational flow for the ZISUN warehouse team.*

| Step | Actor | Action | System Response / Backend Logic |
|------|-------|--------|---------------------------------|
| 1 | Admin | Logs into Dashboard and views Orders filtered by `PAID` status. | Backend returns paginated list of actionable orders. |
| 2 | Admin | Physically locates items in warehouse. | |
| 3 | Admin | Clicks "Mark as Packed" on the order row. | Backend updates order to `PACKED`. Inserts Outbox Event. |
| 4 | System| (Async) | Worker calls Shiprocket API to generate AWB (idempotent call). Stores AWB in `fulfillments` table. |
| 5 | System| (Async) | Worker sends WhatsApp notification: "Your order is packed and ready to ship. Tracking: [AWB Link]". |
| 6 | Courier| Scans package at pickup. | Shiprocket fires webhook -> Order updates to `SHIPPED`. |
| 7 | Courier| Delivers package to user. | Shiprocket fires webhook -> Order updates to `DELIVERED`. Trigger review request. |

---

## 3. Error Flows & Recovery

### 3.1 Payment Abandonment / Failure
- **Trigger:** User closes Razorpay modal OR UPI payment fails.
- **Flow:** Order remains in `PAYMENT_PENDING` state. The user sees a "Payment Failed / Cancelled" UI and can click "Retry Payment".
- **Recovery:** If the user does not retry, the 30-minute background cron job sweeps the order, changes state to `CANCELLED`, and releases the `InventoryLocks`.

### 3.2 Network Drop During Checkout
- **Trigger:** User loses internet connection exactly as they tap "Proceed to Pay".
- **Flow:** PWA detects offline state. Does not attempt API call. Shows "You are offline" banner.
- **Recovery:** Once connection is restored, the user taps again. If the API call fired but the response dropped, Razorpay's idempotent order creation ensures the user isn't double-charged.

### 3.3 Shiprocket API Timeout
- **Trigger:** Admin clicks "Mark as Packed" but Shiprocket API is down.
- **Flow:** Order updates to `PACKED` locally, but Outbox Worker fails to generate AWB.
- **Recovery:** Outbox Worker implements exponential backoff retries. Once Shiprocket recovers, the AWB is generated and the WhatsApp tracking link is sent delayed. Admin UI shows "AWB Pending" status badge.

# Analytics & Tracking

> **Document ID:** REQ-14  
> **Version:** 1.0  
> **Owner:** Product Lead / Data Lead  
> **PRD Source:** Section 14 (Lines 738-780)

---

## 1. Overview

This document defines the core tracking plan for the ZISUN platform. To achieve the Phase 3 goal of ML-driven personalization, the platform must start capturing high-quality behavioral data from Day 1. "Instrument everything" is a core engineering principle for this product.

---

## 2. Core Event Dictionary

All events must be logged with a persistent `session_id` and a UTC timestamp. If the user is authenticated, the `user_id` must be attached.

| Event Name | Key Properties | Business Purpose |
|------------|----------------|------------------|
| `content_viewed` | `content_id`, `content_type` (image/video), `dwell_time_ms` | Evaluates content performance and feeds the discovery funnel. |
| `product_viewed` | `product_id`, `source` (feed/search/direct) | Crucial intent signal for the recommendation engine. |
| `add_to_cart` | `product_id`, `variant_id`, `price` | High intent signal; used to calculate cart abandonment rates. |
| `checkout_started` | `order_id` (if generated), `cart_total`, `item_count` | Top of the checkout funnel. |
| `payment_initiated` | `order_id`, `payment_method` (UPI/Card) | Evaluates user payment preferences. |
| `order_completed` | `order_id`, `amount`, `payment_method`, `item_count` | The ultimate conversion KPI. |
| `cart_abandoned` | `last_step` (cart/address/payment), `cart_total` | Triggers retargeting campaigns (Phase 2). |
| `otp_requested` | `phone_hash` (not raw), `source` | Tracks the authentication funnel and SMS provider success rate. |
| `search_performed` | `query`, `results_count` | Identifies catalog gaps (what users want but can't find). |
| `return_initiated` | `order_id`, `reason`, `days_since_delivery` | Product quality signal; flags problematic SKUs. |

---

## 3. Key Conversion Funnels

The analytics tooling (e.g., Mixpanel, Amplitude, or PostHog) must be configured to track these specific funnels:

### 3.1 Content-to-Cart Funnel
1. `content_viewed`
2. `product_viewed` (via Bottom Sheet)
3. `add_to_cart`

### 3.2 Checkout Funnel
1. `checkout_started`
2. `otp_requested` (if unauthenticated)
3. `payment_initiated`
4. `order_completed`

### 3.3 Retention Funnel
1. `order_completed` (First purchase)
2. `content_viewed` (Subsequent session > 24 hours later)
3. `order_completed` (Repeat purchase)

---

## 4. Privacy & Compliance constraints (DPDP Act)

- **No Raw PII in Analytics:** Raw phone numbers and names must *never* be sent to external analytics providers. Use a one-way hash (e.g., `SHA-256(phone_number + salt)`) to track users across sessions before they authenticate.
- **Data Anonymization:** Raw behavioral data must be anonymized after 1 year, breaking the link between the `user_id` and the event stream while preserving the event history for ML training.

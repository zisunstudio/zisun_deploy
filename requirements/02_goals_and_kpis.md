# Goals & KPIs

> **Document ID:** REQ-02  
> **Version:** 1.0  
> **Last Updated:** 2026-05-03  
> **Owner:** Product Lead  
> **PRD Source:** Section 2 (Lines 60–119), Section 10 (Lines 594–633), Section 12 (Lines 663–688)

---

## Business Goals

Each business goal is stated verbatim from PRD §2.1 with added measurability criteria and engineering dependencies.

### BG-01: Achieve 100 Successful Paid Orders Within 10 Weeks of Launch

| Attribute | Detail |
|-----------|--------|
| **Metric** | Count of orders with `status = DELIVERED` or `status = PAID` |
| **Target** | 100 |
| **Timeline** | Week 10 post-launch |
| **Owner** | CEO / Growth |
| **Data source** | `orders` table: `SELECT COUNT(*) FROM orders WHERE status IN ('PAID','PACKED','SHIPPED','DELIVERED') AND created_at >= launch_date` |
| **Measurement method** | Admin dashboard — Orders tab with date filter. Automated daily report via Sentry custom metric. |
| **Engineering dependency** | Entire checkout pipeline operational: Auth → Cart → Checkout → Razorpay → Order creation → Webhook → Confirmation |
| **Success test** | At Week 10, run query. If count ≥ 100, BG-01 is met. |

### BG-02: Establish a Repeat-Customer Rate of 25%+ by Month 4

| Attribute | Detail |
|-----------|--------|
| **Metric** | (Users with ≥ 2 completed orders) ÷ (Users with ≥ 1 completed order) × 100 |
| **Target** | ≥ 25% |
| **Timeline** | Month 4 |
| **Owner** | Growth / CRM |
| **Data source** | `orders` table joined with `users`: `SELECT COUNT(DISTINCT user_id) FILTER (WHERE order_count >= 2) * 100.0 / COUNT(DISTINCT user_id) FROM (SELECT user_id, COUNT(*) as order_count FROM orders WHERE status NOT IN ('CANCELLED','FAILED_PAYMENT') GROUP BY user_id) subq` |
| **Measurement method** | Weekly cohort analysis. Admin dashboard — Analytics view (Phase 2). Manual query until then. |
| **Engineering dependency** | User identity persists across sessions (JWT refresh tokens). Order history linked to `user_id`. WhatsApp re-engagement notifications operational. |
| **Leading indicator** | D7 retention > 15% by Month 2 suggests trajectory toward 25% D30. |

### BG-03: Reach Break-Even on Unit Economics by Month 6

| Attribute | Detail |
|-----------|--------|
| **Metric** | Average gross profit per order ≥ average fixed cost per order |
| **Target** | Revenue > COGS + fulfillment per order |
| **Timeline** | Month 6 |
| **Owner** | CEO / Finance |
| **Data source** | Financial model: AOV (₹900) − COGS (₹450) − Fulfillment (₹80) − Payment fee (₹18) = ₹352 gross profit. Fixed cost: ₹50,000/month ÷ orders/month. Break-even at 142 orders/month. |
| **Measurement method** | Monthly P&L review. Admin dashboard — Payment reconciliation view cross-referenced with Shiprocket billing. |
| **Engineering dependency** | Payment reconciliation job (daily at 02:00 IST) compares ZISUN records vs Razorpay settlements. Shiprocket cost per shipment tracked in `fulfillments` table. |

### BG-04: Onboard 3 Curated Vendor Partners by Month 9

| Attribute | Detail |
|-----------|--------|
| **Metric** | Count of active vendors with ≥ 1 product listed |
| **Target** | 3 |
| **Timeline** | Month 9 |
| **Owner** | CEO / Partnerships |
| **Data source** | `products` table: `SELECT COUNT(DISTINCT vendor_id) FROM products WHERE vendor_id IS NOT NULL AND deleted_at IS NULL` |
| **Engineering dependency** | `vendor_id` column on `products` table (included at MVP, nullable). Vendor self-service portal is Phase 4, so onboarding at Month 9 is manual (admin creates products on behalf of vendor). Commission tracking is Phase 4. |

### BG-05: Build Behavioral Data Asset of 10,000+ Profiled Users by Month 10

| Attribute | Detail |
|-----------|--------|
| **Metric** | Count of distinct `user_id` values with ≥ 10 tracked events |
| **Target** | 10,000 |
| **Timeline** | Month 10 |
| **Owner** | Product / Data |
| **Data source** | Analytics events table: `SELECT COUNT(DISTINCT user_id) FROM events WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*) >= 10` |
| **Engineering dependency** | Client-side event tracker operational from Day 1. Events flushed to `POST /analytics/events` every 30 seconds. Schema includes `user_id`, `session_id`, `event`, `properties`, `device`. |
| **Leading indicator** | 1,000 profiled users by Month 4 suggests trajectory toward 10K by Month 10. |

---

## User Goals

Each user goal from PRD §2.2 with a testable success condition and the system capability that enables it.

| # | User Goal (PRD §2.2) | Testable Success Condition | Enabling System Capability |
|---|----------------------|---------------------------|---------------------------|
| UG-01 | Discover fashion that fits their aesthetic without searching for it. | User completes a purchase where the entry point was a content feed card (not search, not direct link). Measured via `content_viewed` → `add_to_cart` → `order_completed` funnel. Target: ≥ 60% of orders originate from feed. | Shoppable content feed with product-linked cards. Occasion/season tags for relevance. |
| UG-02 | Complete a purchase in under 90 seconds from intent to confirmation. | Median time from `add_to_cart` event to `order_completed` event ≤ 90 seconds for returning users. Measured via event timestamp delta. | Pre-authenticated sessions (refresh token). Saved addresses. Razorpay SDK one-tap UPI. Minimal checkout form fields. |
| UG-03 | Track and manage orders through WhatsApp without needing to log into an app. | User receives order status update via WhatsApp within 60 seconds of state transition. User can query "Where is my order?" and receive a response within 5 minutes. | WhatsApp Business API integration. Pre-approved message templates. Intent classifier for status queries (Phase 2 for conversational; MVP is outbound-only). |
| UG-04 | Feel a sense of style curation — that the platform understands their taste. | D30 retention > 25% (users who feel curated return). Qualitative: NPS score ≥ 40 in user surveys (Phase 2). | Curated content by ops team (MVP). Personalized feed via ML model (Phase 3). Occasion/season tagging for contextual relevance. |

---

## KPI Dashboard Specification

### Full KPI Table

| # | Metric | Target | Timeline | Owner | Data Source | Measurement Method | Alert Threshold |
|---|--------|--------|----------|-------|-------------|-------------------|----------------|
| KPI-01 | Gross Merchandise Value (GMV) | ₹5L/month | Month 4 | CEO / Growth | `SUM(orders.total_amount) WHERE status NOT IN ('CANCELLED','FAILED_PAYMENT')` | Admin dashboard monthly view | < ₹2L/month at Month 3 → P1 |
| KPI-02 | Order Conversion Rate | > 3.5% (sessions to orders) | Month 3 | Product | `COUNT(orders) / COUNT(DISTINCT sessions)` from analytics events | Analytics funnel: `session_started` → `order_completed` | < 2% for 7 consecutive days → P1 |
| KPI-03 | Cart Abandonment Rate | < 45% | Month 3 | Product / UX | `1 - (checkout_started / add_to_cart)` event ratio | Analytics funnel: `add_to_cart` → `checkout_started` → `order_completed` | > 60% for 2 consecutive hours → P1 |
| KPI-04 | Average Order Value (AOV) | ₹800+ | Month 2 | Catalog / Merchandising | `AVG(orders.total_amount) WHERE status NOT IN ('CANCELLED','FAILED_PAYMENT')` | Admin dashboard — weekly rolling average | < ₹600 for 7 consecutive days → P2 |
| KPI-05 | D30 Retention Rate | > 25% | Month 5 | Growth / CRM | Cohort analysis: users with ≥ 2 orders where second order is within 30 days of first | Weekly cohort report (manual query until analytics dashboard) | < 15% at Month 4 → P1 |
| KPI-06 | Payment Success Rate | > 96% | Pre-launch | Engineering | `COUNT(payments WHERE status='CAPTURED') / COUNT(payments WHERE status IN ('CAPTURED','FAILED'))` | Sentry custom metric + Admin payment reconciliation view | < 94% at any point → **P0 incident** |
| KPI-07 | Page Load Time (P95) | < 2s on 4G | Pre-launch | Engineering | Real User Monitoring (RUM) via browser Performance API. P95 of `DOMContentLoaded` time. | Sentry Performance monitoring | > 4s P95 for 1 hour → **P0 incident** |
| KPI-08 | Webhook Processing Latency | < 500ms P99 | Pre-launch | Engineering | Time from webhook receipt (logged at middleware entry) to DB commit (logged at handler exit). | Sentry transaction tracing on `/webhooks/razorpay` | > 1s P99 for 30 minutes → **P0 incident** |
| KPI-09 | Inventory Accuracy | > 99.5% | Month 1 | Ops / Engineering | `1 - (oversell_incidents / total_orders)`. Oversell = order created for item with stock = 0. | Automated check: `SELECT COUNT(*) FROM order_items oi JOIN product_variants pv ON oi.product_variant_id = pv.id WHERE pv.stock < 0` (should always be 0) | Any `stock < 0` → **P0 incident** |
| KPI-10 | WhatsApp Order Enquiry Response | < 5 min (bot) | Month 2 | Ops / Bot | Time from incoming WhatsApp message to bot response. Logged in `whatsapp_messages` table. | Average response time dashboard (Phase 2) | > 15 min average over 1 hour → P1 |

### KPI Dependency Map

```
Leading Indicators                    Lagging Indicators
──────────────────                    ──────────────────

Page Load Time (KPI-07) ────────────→ Order Conversion Rate (KPI-02)
  (slow load → users leave)

Payment Success Rate (KPI-06) ──────→ GMV (KPI-01)
  (failed payments = lost revenue)

Cart Abandonment Rate (KPI-03) ─────→ Order Conversion Rate (KPI-02)
  (abandoned carts = lost conversions)

Order Conversion Rate (KPI-02) ─────→ GMV (KPI-01)
  (more conversions × AOV = GMV)

AOV (KPI-04) ───────────────────────→ GMV (KPI-01)
  (higher AOV × conversions = GMV)

Inventory Accuracy (KPI-09) ────────→ Payment Success Rate (KPI-06)
  (stock errors cause checkout failures)

Webhook Latency (KPI-08) ──────────→ WhatsApp Response (KPI-10)
  (slow webhooks delay notifications)

D30 Retention (KPI-05) ────────────→ GMV (KPI-01) [long-term]
  (repeat customers compound revenue)
```

**Interpretation guide:**
- Fix **leading indicators** first — they cascade into lagging indicators.
- A P0 on KPI-06 (Payment Success Rate) is the highest priority because it directly blocks revenue.
- KPI-07 (Page Load Time) is a leading indicator for conversion. If load time degrades, expect conversion to drop within 24–48 hours.

### Alert Thresholds

| Alert | Condition | Severity | Response SLA | Escalation |
|-------|-----------|----------|-------------|------------|
| Payment success rate drop | < 94% over any 1-hour window | **P0** | 15 minutes | On-call engineer → Engineering Lead → CEO |
| Cart abandonment spike | > 60% for 2 consecutive hours | **P1** | 1 hour | Product Lead → Engineering Lead |
| Page load degradation | P95 > 4s for 1 hour | **P0** | 15 minutes | On-call engineer → Engineering Lead |
| Webhook processing delay | P99 > 1s for 30 minutes | **P0** | 15 minutes | On-call engineer → Engineering Lead |
| Inventory oversell | Any `product_variants.stock < 0` | **P0** | Immediate | On-call engineer → Engineering Lead → CEO |
| Reconciliation mismatch | Razorpay settlement ≠ ZISUN records by > ₹0 | **P0** | 4 hours | Finance Lead → Engineering Lead |
| GMV below trajectory | < 50% of monthly target at mid-month | **P1** | 24 hours | CEO → Growth → Product |
| Conversion rate sustained drop | < 2% for 7 consecutive days | **P1** | 48 hours | Product Lead → UX → Engineering |

---

## North Star Metric

**Metric:** Weekly Completed Orders from Content-Originated Sessions

**Definition:** Count of orders with `status IN ('PAID','PACKED','SHIPPED','DELIVERED')` where the user's session included a `content_viewed` event before the `add_to_cart` event, measured on a rolling 7-day window.

**Rationale:**

This metric captures the unique value proposition of ZISUN — that content drives commerce. It combines:

1. **Commerce health** — orders are completing (payment works, inventory works, fulfillment works).
2. **Content effectiveness** — users are discovering products through content, not direct search or external links.
3. **User engagement** — users are scrolling the feed, viewing content, and converting. This is the full funnel in one number.

**Why not GMV?** GMV is a lagging indicator that conflates AOV with order count. A few high-AOV orders can mask poor conversion. The North Star must reflect product-market fit, not spending power.

**Why not DAU?** DAU measures engagement but not commerce intent. Users can browse without buying. ZISUN's business model requires transactions, not attention.

**Why "content-originated"?** If most orders come from direct product links (e.g., shared on WhatsApp by a friend), the content platform is not providing value. The content-originated qualifier ensures the metric measures what makes ZISUN different.

**Measurement:**
```sql
SELECT COUNT(DISTINCT o.id)
FROM orders o
JOIN events e_content ON e_content.session_id = o.session_id
  AND e_content.event = 'content_viewed'
  AND e_content.timestamp < o.created_at
JOIN events e_cart ON e_cart.session_id = o.session_id
  AND e_cart.event = 'add_to_cart'
  AND e_cart.timestamp > e_content.timestamp
  AND e_cart.timestamp < o.created_at
WHERE o.status IN ('PAID','PACKED','SHIPPED','DELIVERED')
  AND o.created_at >= NOW() - INTERVAL '7 days';
```

**[ASSUMPTION]** `session_id` is tracked on both analytics events and orders. The `orders` table does not have `session_id` in the PRD schema (§7.1). Engineering must add a `session_id UUID` column to the `orders` table at migration time. This is a non-breaking addition.

**Targets:**
| Timeline | Target | Basis |
|----------|--------|-------|
| Week 6 (MVP launch) | 10/week | ~1.4 orders/day from content |
| Month 3 | 50/week | Growing content library + repeat users |
| Month 6 | 200/week | WhatsApp re-engagement + larger catalog |
| Month 10 | 500/week | Personalized feed increasing conversion |

---

## Goal-to-KPI Traceability Matrix

| Business Goal | Primary KPI | Supporting KPIs |
|---------------|-------------|-----------------|
| BG-01 (100 orders in 10 weeks) | North Star (weekly content orders) | KPI-02 (conversion rate), KPI-06 (payment success) |
| BG-02 (25% repeat rate) | KPI-05 (D30 retention) | KPI-10 (WhatsApp response), KPI-04 (AOV) |
| BG-03 (Break-even by M6) | KPI-01 (GMV), KPI-04 (AOV) | KPI-06 (payment success), KPI-09 (inventory accuracy) |
| BG-04 (3 vendors by M9) | Vendor count (manual) | KPI-01 (GMV proves platform viability) |
| BG-05 (10K profiled users by M10) | Event count per user | KPI-02 (conversion = engaged users), KPI-07 (load time = retention) |

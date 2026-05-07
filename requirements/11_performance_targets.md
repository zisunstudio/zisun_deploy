# Performance Targets

> **Document ID:** REQ-11  
> **Version:** 1.0  
> **Owner:** Engineering Lead  
> **PRD Source:** Section 10 (Lines 594-633)

---

## 1. Overview

This document specifies the exact performance SLA (Service Level Agreement) targets for the ZISUN platform. It defines latency thresholds across percentiles and outlines the expected concurrency targets for load testing.

---

## 2. Latency Thresholds

Performance is measured across three tiers. **P50** is the median experience. **P95** is the target for the vast majority of users. The **Hard Limit** is the threshold at which the system is considered "failing" for that specific request, triggering a timeout or degradation fallback.

| Metric / Operation | Target (P50) | Target (P95) | Hard Limit |
|--------------------|--------------|--------------|------------|
| **Content Feed Load** (First Paint) | `< 800ms` | `< 2s` | `< 4s` |
| **Product Detail Page Load** | `< 500ms` | `< 1.5s` | `< 3s` |
| **Cart → Checkout Initiation** | `< 300ms` | `< 800ms` | `< 2s` |
| **Payment Webhook Processing** | `< 150ms` | `< 500ms` | `< 1s` |
| **OTP Delivery** (via SMS) | `< 5s` | `< 10s` | `< 30s` |
| **WhatsApp Order Confirmation** | `< 30s` | `< 60s` | `< 120s` |
| **Admin Order List Load** (1,000 rows)| `< 400ms` | `< 1s` | `< 2s` |
| **Image Load** (Mobile, 4G Network) | `< 1s` | `< 2s` | `< 4s` |

---

## 3. Concurrency & Load Testing Targets

The system architecture must be proven capable of handling the following concurrency loads via simulated testing (e.g., using Locust) prior to release.

| Phase | Concurrency Target | Definition |
|-------|--------------------|------------|
| **MVP (Launch)** | 200 | 200 users actively executing the checkout mutation pipeline simultaneously. |
| **Month 6** | 2,000 | 10x growth. Requires read-replicas for catalog and horizontal scaling of API instances. |
| **Year 1** | 10,000 | Mass traffic events (e.g., Diwali Sale). Requires mature caching layers (Redis) and highly optimized DB indexing. |

---

## 4. Engineering Implementation Rules

To meet the NFRs above, the engineering team must adhere to the following rules:

### 4.1 Database Performance
- **Zero Sequential Scans:** Unindexed queries on tables with >1,000 rows are treated as production bugs.
- **Connection Pooling:** The backend must use a robust connection pooler (e.g., PgBouncer or SQLAlchemy async pools) to handle high concurrent connections without exhausting database memory.

### 4.2 API Performance
- **Pagination:** All list endpoints must be paginated. Maximum payload size per request should not exceed 100KB.
- **Asynchronous Boundaries:** Heavy external network calls (WhatsApp, Shiprocket) must *never* be placed in the critical path of a user's API request. They must be offloaded to background workers via the Outbox pattern.

### 4.3 Frontend Performance
- **Asset Optimization:** Images must be compressed (WebP) and served via CDN. Videos must be highly compressed.
- **Cumulative Layout Shift (CLS):** Target `< 0.1`. Images must have explicit height/width attributes or blur-up placeholders to prevent content from jumping as assets load.
- **Virtualization:** The shoppable content feed must use virtualized scrolling to remove off-screen DOM nodes, ensuring the app does not crash on low-RAM Android devices.

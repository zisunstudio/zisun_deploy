# Risks & Assumptions

> **Document ID:** REQ-13  
> **Version:** 1.0  
> **Owner:** Engineering Lead / Product Lead  
> **PRD Source:** Section 13 (Lines 690-736)

---

## 1. Overview

This document acts as the central risk register for the ZISUN platform. It identifies potential failure points—both technical and operational—and mandates specific mitigation strategies. It also documents foundational business assumptions that shape the engineering constraints.

---

## 2. Risk Register

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| **WhatsApp template rejection blocks order confirmation** | Medium | High | Pre-approve all outbound message templates with Meta 5 days before development starts. Ensure the Twilio SMS fallback mechanism is fully configured, tested, and actively monitored. |
| **Shiprocket API downtime during order creation** | Medium | High | Implement a Circuit Breaker pattern. If the API fails, the backend queues the Outbox event for exponential backoff retries. Provide a manual AWB entry fallback in the Admin Dashboard. Review SLA formally with Shiprocket account manager. |
| **Inventory oversell under concurrent load** | Low | High | Enforce atomic decrement strictly at the database level (`SELECT FOR UPDATE` or Optimistic Locking). Conduct high-concurrency load testing using Locust specifically targeting the checkout pipeline before launch. |
| **Razorpay webhook duplication causes double fulfillment** | Medium | High | Enforce strict idempotency at the database schema level using a `UNIQUE` constraint on the `payment_gateway_id` column. The webhook handler must catch integrity errors and return `200 OK` to stop retries without executing side effects. |
| **Low organic traffic; no content discovery flywheel** | High | High | Engineering cannot solve this. Product/Marketing must execute a content strategy (Instagram Reels, influencer seeding) budgeted and planned pre-launch. |
| **Key person dependency on Engineering Lead** | Medium | High | Enforce strict documentation standards (like this Requirements System). Ensure no single point of knowledge failure regarding infrastructure deployment, secret management, or database migrations. |
| **Razorpay settlement delays affect cash flow** | Low | Medium | Business team must review T+2 settlement terms. Maintain a 60-day operational cash buffer. Implement the daily automated settlement reconciliation job to flag discrepancies instantly. |
| **Mid-range Android performance issues with video content** | Medium | Medium | Implement a video compression pipeline (HLS streaming or heavily compressed MP4). Use device-grade detection (e.g., via User-Agent or network API) to adapt video quality or fall back to high-res static thumbnails on slow connections. |

---

## 3. Key Dependencies & Assumptions

Engineering timelines and architecture decisions are based on the following assumptions holding true. If any of these are invalidated, the Phase 1 MVP timeline is at risk.

### 3.1 Third-Party Stability
1. **SLAs:** Razorpay and Shiprocket APIs will remain stable and available. Their documented SLAs have been reviewed and accepted prior to contract signing.
2. **Meta Approvals:** WhatsApp Business API message templates will be approved by Meta within their stated 5 business day window.

### 3.2 Operational Constraints
3. **Catalog Readiness:** The initial product catalog (comprising the first 50 SKUs, complete with high-quality imagery, pricing, and exact variant stock counts) will be curated and ready for upload by Week 2 of development.
4. **Admin Training:** The operations team will be fully trained on the Internal Admin Dashboard before the system processes its first real customer order, ensuring no manual database intervention is required.

### 3.3 Product Scope (Strict Boundaries)
5. **Cash on Delivery (COD):** COD is **strictly out of scope** for the Phase 1 MVP. It will only be considered in Phase 2 or later, after Non-Delivery Ratio (NDR) tracking mechanisms are fully established.
6. **Tech Stack:** The engineering team is proficient in **Python/FastAPI** (Backend) and **React/Next.js** (Frontend PWA). No ramp-up time or major tech-stack shifts are budgeted for the MVP phase.

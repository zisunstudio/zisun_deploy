# System Requirements

> **Document ID:** REQ-06  
> **Version:** 1.0  
> **Owner:** Engineering Lead  
> **PRD Source:** Section 6 (Lines 414-485)

---

## 1. Overview

This document outlines the Functional and Non-Functional Requirements (NFRs) that govern the architectural constraints of the ZISUN platform. These constraints override individual feature specifications if a conflict occurs.

---

## 2. Functional Requirements (FR)

These are the system-level functional invariants that the platform must maintain.

| ID | Module | Requirement | Priority |
|----|--------|-------------|----------|
| **FR-01** | Auth | The system must authenticate users via OTP with strict rate limiting (5 OTP requests per phone number per hour). | P0 |
| **FR-02** | Auth | JWT access tokens expire in exactly 15 minutes. Refresh tokens expire in 30 days and must rotate upon every use. | P0 |
| **FR-03** | Catalog | Product stock decrement operations must be atomic at the database level (e.g., Optimistic Locking). Concurrent checkouts cannot oversell a variant. | P0 |
| **FR-04** | Order | Every order state transition must be validated against a strict state machine schema. Invalid transitions must be rejected by the backend. | P0 |
| **FR-05** | Payment | The Razorpay webhook handler must be strictly idempotent using a `UNIQUE` database constraint on the `payment_gateway_id` column. | P0 |
| **FR-06** | Payment | Orders remaining in `PAYMENT_PENDING` for > 30 minutes must be automatically cancelled by a background cleanup job, releasing any active inventory locks. | P0 |
| **FR-07** | Fulfillment | Shiprocket API calls must be idempotent. Re-attempted calls must check for an existing Air Waybill (AWB) before creating a new shipment. | P0 |
| **FR-08** | Admin | The admin dashboard must support full order management capabilities, eliminating the need for direct database access for daily operations. | P0 |
| **FR-09** | Notification| An order confirmation message via WhatsApp must be dispatched within 60 seconds of the order status changing to `PAID`. | P1 |
| **FR-10** | Analytics | All critical user events (content view, add-to-cart, purchase, abandon) must be logged with a persistent `session_id` and timestamp. | P1 |

---

## 3. Non-Functional Requirements (NFR)

### 3.1 Performance
The system must be highly responsive to prevent user drop-off, particularly on Tier-2 mobile networks.
- **API Response Time:** 
  - Catalog reads (GET): `< 300ms` (P95)
  - Order creation (POST): `< 500ms` (P95)
- **Frontend Load Time:** 
  - Shoppable feed initial first paint: `< 2 seconds` on a 4G connection (10 Mbps).
- **Checkout Velocity:** 
  - Under 90 seconds end-to-end (from tapping the cart to order confirmation UI).
- **Background Processing:** 
  - Webhook ingestion latency: `< 500ms` (P99) from request receipt to database commit.

### 3.2 Scalability
The architecture must support variable traffic spikes common in content-driven commerce.
- **MVP Capacity:** Must support 1,000 concurrent active users without degradation (Month 1).
- **Target Capacity:** Designed to scale to 50,000 concurrent users via read replicas and horizontal scaling of stateless API nodes.
- **Database Rules:** No sequential table scans allowed on production tables. Indexes must be utilized for all queries from Day 1.

### 3.3 Availability
- **Platform Target:** 99.5% uptime (allows ~3.6 hours of downtime per month).
- **Critical Path Target:** The checkout and payment pipelines mandate 99.9% availability.
- **Resilience:** Circuit breakers must be implemented around external API calls (Razorpay, Shiprocket) to allow the system to gracefully degrade (e.g., showing a friendly error) rather than hanging or crashing.
- **Deployments:** Zero-downtime deployments enforced via a rolling update strategy.

### 3.4 Security & Compliance
- **In Transit:** All data encrypted via TLS 1.3. HTTP traffic automatically redirected to HTTPS.
- **At Rest:** Database encryption enabled (RDS AES-256) and Object Storage Server-Side Encryption (S3 SSE) enforced.
- **Webhook Integrity:** Razorpay webhooks must have their HMAC-SHA256 signature verified at the *middleware layer* before reaching specific route handlers.
- **Rate Limiting:** 
  - Public endpoints: 100 requests per minute per IP.
  - Auth endpoints: 10 requests per minute per IP.
- **Data Privacy:** Sensitive data (payment card numbers, complete OTPs) must *never* be written to application logs or error monitoring tools (like Sentry). PCI-DSS scope is isolated by delegating card collection entirely to Razorpay.

# Integrations Architecture

> **Document ID:** REQ-09  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 8 (Lines 538-568)

---

## 1. Overview

This document specifies the technical integration requirements for all third-party services utilized by the ZISUN platform. It defines the primary purpose of each integration, the key technical requirements, and the mandatory fallback strategies to ensure high availability (99.9% on critical paths).

---

## 2. External Services Matrix

### 2.1 Razorpay (Payments)
- **Purpose:** Primary payment gateway (UPI, Cards, Netbanking).
- **Key Requirements:**
  - Strict HMAC-SHA256 signature verification on all incoming webhooks (enforced at the middleware level).
  - Webhook handlers must be idempotent (enforced via database unique constraint on `payment_gateway_id`).
  - Integration with Razorpay Refunds API for return processing.
  - Integration with Settlement APIs for automated daily financial reconciliation.
- **Fallback / Degradation Strategy:**
  - Circuit breaker around Razorpay API calls.
  - If Razorpay is down, block checkout initiation gracefully with a message: "Payment gateway temporarily unavailable. Please try again in a few minutes." Do not allow the app to hang.

### 2.2 Shiprocket (Fulfillment)
- **Purpose:** Shipping logistics, AWB generation, and delivery tracking.
- **Key Requirements:**
  - Order creation API must utilize the ZISUN `order_id` as the `external_ref` to ensure idempotency.
  - Webhook endpoint for ingesting real-time tracking updates (Picked Up, In Transit, Delivered).
  - Reverse pickup API integration for the returns flow (Phase 2).
  - Pincode serviceability pre-check API utilized during the user checkout flow.
- **Fallback / Degradation Strategy:**
  - If API fails during order packing, alert the Admin via dashboard. Allow manual entry of fulfillment details/AWB in the admin dashboard.

### 2.3 WhatsApp Business API (via Meta)
- **Purpose:** Primary post-purchase notification channel and conversational customer support bot.
- **Key Requirements:**
  - Management of the strict 24-hour customer service session window.
  - Use of pre-approved message templates for all proactive notifications.
  - Webhook endpoint with `X-Hub-Signature-256` verification for inbound messages.
- **Fallback / Degradation Strategy:**
  - If WhatsApp delivery fails (or user is not on WhatsApp), system immediately falls back to SMS via Twilio.

### 2.4 Twilio (SMS)
- **Purpose:** OTP delivery for authentication; fallback channel for order notifications.
- **Key Requirements:**
  - Deliver OTPs within a 10-second SLA.
  - Monitor delivery success rates.
- **Fallback / Degradation Strategy:**
  - If Twilio is down or rate limits are hit, authentication is fundamentally blocked. Implement circuit breaking to prevent cost overruns in the event of an SMS bombing attack.

### 2.5 Cloudflare R2 / AWS S3 (Media Storage)
- **Purpose:** Object storage for catalog images and feed videos.
- **Key Requirements:**
  - Media stored privately and served via signed URLs or a CDN.
  - Auto-thumbnail generation (e.g., via Cloudflare Image Resizing or an S3 Lambda trigger) to create 3 different sizes upon upload.
- **Fallback / Degradation Strategy:**
  - If the CDN drops, fall back to serving directly via the S3/R2 bucket URL to maintain feed functionality, albeit at slower load times.

### 2.6 Sentry (Error Monitoring)
- **Purpose:** Application error tracking and performance monitoring.
- **Key Requirements:**
  - All unhandled exceptions captured with contextual request data.
  - User IDs attached to errors (anonymized where appropriate).
  - P0 alerts routed immediately for payment or checkout failures.
- **Fallback / Degradation Strategy:**
  - Standard stdout JSON logging acts as the primary fallback if Sentry ingestion fails. Critical errors alert via fallback email system.

---

## 3. Infrastructure & Tooling Integrations

### 3.1 Alembic (Database Migrations)
- **Purpose:** Safe, version-controlled relational database schema management.
- **Key Requirements:**
  - All schema changes strictly executed via versioned migration files.
  - Zero manual `ALTER` statements executed against the production database.
- **Fallback / Degradation Strategy:**
  - CI/CD pipeline enforces automatic rollback of the deployment if an Alembic migration fails during the release process.

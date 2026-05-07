# Security & Compliance

> **Document ID:** REQ-10  
> **Version:** 1.0  
> **Owner:** Security Lead  
> **PRD Source:** Section 11 (Lines 635-662)

---

## 1. Overview

This document outlines the security controls, architectural safeguards, and regulatory compliance requirements for the ZISUN platform. It covers authentication, payments, API security, and adherence to Indian data privacy laws.

---

## 2. Authentication & Authorization Security

### 2.1 OTP Defenses
- **Brute-Force Protection:** 5 consecutive incorrect OTP attempts automatically trigger a 1-hour lockout for that specific phone number.
- **Rate Limiting (Generation):** Maximum of 5 OTP generation requests per phone number per hour.
- **Rate Limiting (Network):** Maximum of 10 authentication-related requests per IP address per minute to prevent volumetric attacks.

### 2.2 JWT Management
- **Signing Algorithm:** Tokens must be signed using `RS256` (Asymmetric RSA). Symmetric (`HS256`) is explicitly prohibited.
- **Key Rotation:** RSA key pairs must be rotated quarterly.
- **Refresh Tokens:** 
  - Never stored in plain text. Must be hashed (e.g., Argon2id or bcrypt) in the database.
  - Strictly one-time use. Must be rotated upon every successful refresh request.
  - Transmitted to the client exclusively via `httpOnly`, `Secure`, `SameSite=Strict` cookies.

---

## 3. Payment & Financial Security

### 3.1 PCI-DSS Compliance
- **Scope Isolation:** ZISUN operates under **PCI-DSS SAQ A**.
- **Data Prohibition:** The platform must *never* capture, transmit, or store Primary Account Numbers (PAN), CVVs, or bank login credentials. All raw payment data entry happens entirely within the Razorpay SDK/Checkout iframe.

### 3.2 Webhook Integrity
- **Middleware Verification:** All Razorpay webhooks must be verified using the `X-Razorpay-Signature` header (HMAC-SHA256).
- **Enforcement Layer:** This verification must happen at the framework middleware level. It cannot be delegated to individual route handlers to prevent accidental exposure.

### 3.3 Transaction Integrity
- **Server-Side Pricing:** The payment amount sent to Razorpay during order creation must be calculated entirely server-side based on the active catalog prices. Client-side price payloads must be ignored to prevent manipulation.
- **Refund Authority:** Automated refund API calls require an Admin-level JWT. The system must prevent standard users from triggering the Razorpay Refunds API directly.

---

## 4. API & Infrastructure Security

### 4.1 Transport & Network
- **Encryption:** All data in transit must be encrypted using TLS 1.2 or TLS 1.3.
- **Redirection:** HTTP traffic must be permanently redirected (301) to HTTPS at the Nginx or Cloudflare edge layer.
- **CORS:** Cross-Origin Resource Sharing must be strictly whitelisted to known ZISUN frontend domains. Wildcard (`*`) origins are prohibited on API routes.

### 4.2 Application Defenses
- **SQL Injection:** Prohibited via the mandatory use of the SQLAlchemy ORM. Raw SQL queries with string interpolation are banned.
- **XSS & Injection:** All incoming request bodies must be validated and sanitized using **Pydantic** schemas before reaching business logic.

### 4.3 Secrets Management
- Environment variables (Database URIs, API Keys, JWT Private Keys) must not be stored in raw `.env` files in production or committed to version control.
- Secrets must be injected at runtime via a secure vault (e.g., AWS Secrets Manager or GitHub Secrets during CI/CD).

---

## 5. Compliance: India DPDP Act (2023)

The Digital Personal Data Protection (DPDP) Act of 2023 governs the platform's handling of customer data.

### 5.1 Data Minimization & Consent
- **Collection Limit:** The platform must only collect Personally Identifiable Information (PII) strictly necessary for commerce (Name, Phone Number, Delivery Address).
- **Third-Party Sharing:** User data must *not* be shared with external ad networks without explicit, opt-in consent.
- **Vendor Agreements:** Data Processing Agreements (DPAs) must be reviewed with all processors (Razorpay, Shiprocket, Twilio, Meta).

### 5.2 Right to Erasure
- **Account Deletion:** Users have the legal right to request data deletion.
- **Implementation:** The system must support the anonymization/soft-deletion of User records. 
  - *Constraint:* Financial records (`orders`, `payments`) cannot be deleted due to GST data retention laws (7 years). In these cases, the user's name/address on the order record is scrambled/anonymized, but the financial totals remain intact.

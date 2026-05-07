# Feature: OTP-Based Authentication

> **Document ID:** FEAT-AUTH-01  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 4.1 (Lines 187-208), Section 11.1 (Lines 637-642)

---

## 1. Feature Overview

Phone number-based login using a One-Time Password (OTP) delivered via SMS, with WhatsApp fallback. The system issues JWTs (JSON Web Tokens) upon successful verification. There are no passwords in the ZISUN platform.

**Priority:** P0 — Required for all commerce activity.

### User Story
As a first-time user, I want to sign in with my phone number so that I don't need to create or remember a password, enabling a frictionless checkout experience.

---

## 2. Acceptance Criteria

### 2.1 OTP Generation & Delivery
- **Format:** 10-digit Indian mobile number validation before generating OTP.
- **Payload:** OTP is exactly 6 digits, cryptographically random (not pseudo-random).
- **Validity:** OTP is valid for exactly 5 minutes (300 seconds) from generation.
- **Delivery SLA:** Delivered within 10 seconds via SMS.
- **Fallback:** SMS is the primary channel. WhatsApp delivery can be added as a fallback (Phase 2).
- **[ASSUMPTION]:** Using Twilio or MSG91 as the SMS provider.

### 2.2 Rate Limiting & Lockouts
- **Generation Limit:** Maximum 5 OTP requests per phone number per hour.
  - *Response on breach:* 429 Too Many Requests with a clear cooldown message.
- **Brute Force Protection:** 5 incorrect OTP verifications trigger a 1-hour lockout on that phone number.
- **IP Rate Limit:** Maximum 10 authentication-related requests per IP per minute.

### 2.3 Token Issuance
- **Access Token:** RS256 signed JWT, 15-minute expiry. Contains `sub` (user_id), `role`, and `jti`.
- **Refresh Token:** 30-day expiry.
  - Sent to the client as an `httpOnly`, `Secure`, `SameSite=Strict` cookie.
  - Stored as a hash (e.g., bcrypt/argon2) in the server database (or Redis), never in plain text.
- **Token Rotation:** Every refresh action generates a new refresh token and invalidates the previous one to prevent replay attacks.

### 2.4 Role-Based Access
- Standard users are assigned the `user` role.
- Admin users require a secondary confirmation step (an admin-specific OTP flag or 2FA via authenticator app).

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **Users Table:** Needs `phone` (UNIQUE), `role`, `deleted_at`.
- **Redis Storage:** 
  - Key: `otp:{phone_number}` -> Value: `hash(OTP)`, TTL: 300s.
  - Key: `otp_attempts:{phone_number}` -> Value: `int`, TTL: 3600s.
  - Key: `lockout:{phone_number}` -> Value: `boolean`, TTL: 3600s.

---

## 4. API Contracts

### `POST /auth/send-otp`
- **Auth:** None
- **Request:** `{ "phone": "+919876543210" }`
- **Response:** `200 OK`, `{ "message": "OTP sent successfully" }`
- **Errors:**
  - `400 Bad Request` (Invalid phone format)
  - `429 Too Many Requests` (Rate limit or cooldown active)

### `POST /auth/verify-otp`
- **Auth:** None
- **Request:** `{ "phone": "+919876543210", "otp": "123456" }`
- **Response:** `200 OK`, `{ "access_token": "ey...", "token_type": "bearer", "user": {...} }` (Sets `refresh_token` in `Set-Cookie` header).
- **Errors:**
  - `401 Unauthorized` (Invalid or expired OTP)
  - `403 Forbidden` (Account locked)

### `POST /auth/refresh`
- **Auth:** Cookie (`refresh_token`)
- **Request:** Empty body
- **Response:** `200 OK`, `{ "access_token": "ey..." }` (Updates `refresh_token` in `Set-Cookie` header).
- **Errors:**
  - `401 Unauthorized` (Invalid/expired refresh token)

### `POST /auth/logout`
- **Auth:** Cookie (`refresh_token`)
- **Request:** Empty body
- **Response:** `200 OK`, `{ "message": "Logged out" }` (Clears `Set-Cookie`).

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **SIM Swap Attack** | JWT rotation invalidates stolen refresh tokens when reused. No sensitive account mutation without fresh OTP. |
| **Concurrent Login** | Allowed for MVP. The newest refresh token rotates the session. |
| **Invalid Phone Format** | Regex validation (`^\+91[6-9]\d{9}$`). Return 400 immediately to save SMS provider costs. |
| **SMS Provider Outage** | Circuit breaker on SMS service; monitor via Sentry. |

---

## 6. Security Checklist

- [ ] Rate limits strictly enforced (10/min/IP, 5 OTP/hr/phone).
- [ ] Lockout mechanism active after 5 failed verifications.
- [ ] JWTs signed with RS256 (asymmetric); private key securely stored.
- [ ] Refresh tokens securely hashed in the backend; sent as `httpOnly` cookies.
- [ ] Raw OTPs are never logged in application logs or Sentry.
- [ ] Phone numbers in logs are masked (e.g., `+9198******10`).

# Feature: WhatsApp Commerce Agent

> **Document ID:** FEAT-WHATSAPP-01  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 4.6 (Lines 323-344), Section 8 (Lines 551-554)

---

## 1. Feature Overview

A WhatsApp Business API integration serving as the primary post-purchase communication channel. It sends proactive order updates and acts as a conversational bot for customer support queries (tracking, returns), catering heavily to Persona 3 (Divya) who prefers messaging over app navigation.

**Priority:** P1 — Month 1-2. (MVP launch can rely on SMS, but WhatsApp must follow immediately).

### User Story
As a shopper, I want to receive my order confirmation and tracking updates directly on WhatsApp, and ask "Where is my order?" to get an instant reply without opening a separate app.

---

## 2. Acceptance Criteria

### 2.1 Proactive Notifications (Outbound)
- **Order Confirmation:** Sent within 60 seconds of an order transitioning to the `PAID` state.
- **Shipping Update:** Sent when an order transitions to `SHIPPED`, including the AWB tracking link.
- **Template Pre-Approval:** All outbound messages must use Meta-approved message templates.
- **Fallback:** If a WhatsApp message fails to deliver (e.g., user doesn't have WhatsApp on that number), the system must automatically fallback to sending an SMS via Twilio.

### 2.2 Conversational Agent (Inbound)
- **Order Tracking Intent:** If a user messages "Where is my order?" (or similar variants), the bot replies with the current status of their latest active order.
- **Return Intent (Phase 2):** If a user messages "I want to return order #1234", the bot validates the 7-day return window and initiates the reverse logistics flow.
- **Intent Classification:** The system uses NLP/regex to classify user intent. If confidence is below the threshold, the bot must gracefully escalate the chat to a human agent.

### 2.3 Session Management
- WhatsApp enforces a **24-hour customer service window**. Free-form replies are only allowed within 24 hours of the last user-initiated message.
- If a user replies to an old notification outside this window, the bot must prompt them with a template message to re-open the session.

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **`whatsapp_messages` Table (Proposed):** `id`, `user_id`, `phone_number`, `direction` (inbound/outbound), `message_type` (template/text), `template_name`, `status` (sent/delivered/read/failed), `created_at`.
- **`whatsapp_sessions` Table (Proposed):** `id`, `user_id`, `last_user_message_at` (used to enforce the 24-hour window rule).

---

## 4. API Contracts

### `POST /webhooks/whatsapp`
- **Auth:** Meta Webhook Verification Token.
- **Request:** WhatsApp Cloud API Webhook JSON (contains incoming messages, delivery receipts).
- **Response:** `200 OK` (Must return immediately; processing happens via background worker).

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Template Rejection by Meta** | Templates must be submitted 5 days prior to launch. If rejected, the system degrades to SMS fallback for order confirmations. |
| **Ambiguous User Queries** | "Cancel my order please" vs "How do I cancel?". If intent classifier confidence is < 80%, bot replies: "I'm not sure I understood. Do you want to: 1. Track Order 2. Return Item 3. Speak to Human". |
| **Spam/Abuse** | Rate limit inbound processing. If a user sends >20 messages in a minute, ignore and drop. |

---

## 6. Security Checklist

- [ ] Webhook endpoint validates the `X-Hub-Signature-256` header to ensure payloads actually originate from Meta.
- [ ] PII in WhatsApp messages is minimized (e.g., only use first name and order number; do not send full address or payment details in chat).
- [ ] API keys for Meta Graph API / WhatsApp Business API stored securely in AWS Secrets Manager.
- [ ] Fallback SMS logic handles potential Twilio rate limits and validates phone numbers.

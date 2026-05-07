# Product Overview

> **Document ID:** REQ-01  
> **Version:** 1.0  
> **Last Updated:** 2026-05-03  
> **Owner:** Product Lead  
> **PRD Source:** Section 1 (Lines 19–58), Section 12 (Lines 663–688), Section 17 (Lines 864–881)

---

## Vision Statement

> *ZISUN is a mobile-first, content-driven commerce platform that fuses storytelling with shopping. Unlike traditional eCommerce catalogues, ZISUN puts discovery at the center of the experience — every piece of content is a potential transaction, and every transaction is a story.*

— PRD §1.1, verbatim

### Vision Decomposition for Engineering

| Vision Element | Engineering Implication |
|----------------|------------------------|
| "Mobile-first" | UI must be designed for 5-inch 720p screens first, then scaled up. Performance budgets are set against 4G (10 Mbps) baseline. Touch targets ≥ 44×44pt. |
| "Content-driven" | Content is the primary navigation surface. The feed — not categories or search — is the homepage. Content delivery (images, video) must be fast and reliable from Day 1. CDN is mandatory, not optional. |
| "Fuses storytelling with shopping" | Every content card must be shoppable. The data model must link content entities to product entities with positional metadata. The UX must allow purchase without leaving the content context (bottom sheet pattern). |
| "Discovery at the center" | Browse-first, not search-first. Feed API must be optimized for low-latency paginated reads. Personalization hooks (tags, behavioral events) must be instrumented from Day 1, even though the ML model ships in Phase 3. |

---

## Problem Statement

Indian eCommerce today suffers from three compounding failures. Each failure has a direct engineering implication that shapes ZISUN's architecture.

### Failure 1: Discovery Deficit

**Problem:** Search-first commerce assumes users know what they want. Most users — especially in fashion — do not. They need inspiration, context, and narrative.

**Engineering Implication:**
- The primary interface is a content feed, not a search bar or category grid.
- The feed must support mixed media types (images, videos, bundles) in a single scrollable stream.
- Feed ranking must be extensible: chronological sort at MVP, weighted scoring (recency + engagement + personalization) at Phase 3.
- Every content item must carry metadata (occasion tags, season tags, price band) that enables future personalization without schema migration.

### Failure 2: Trust Gap

**Problem:** Generic product listings with stock photos and templated descriptions do not build brand affinity. Conversion rates remain low because emotional connection is absent.

**Engineering Implication:**
- Product presentation must support rich media: multiple images (min 1, max 10), optional video, editorial captions.
- Content cards are curated by the ZISUN ops team (not auto-generated). The admin dashboard must support content creation, product linking, and scheduled publishing.
- The content-to-product link is many-to-many: one content card can feature multiple products, and one product can appear in multiple content cards.
- Brand story is not a separate page — it is embedded in the content feed itself. No separate "About" or "Brand Story" section needed at MVP.

### Failure 3: Experience Fragmentation

**Problem:** Content lives on Instagram and YouTube; purchasing happens on Flipkart or Myntra. There is no single platform that closes the loop from story to sale in one gesture.

**Engineering Implication:**
- The purchase action must be reachable from the content card in a single tap (bottom sheet, not page navigation).
- Post-purchase experience (order tracking, returns, support) must work via WhatsApp — the user should never need to "go back to the app" for status updates.
- The checkout flow target is under 90 seconds from intent to confirmation (PRD §4.4). This requires: pre-authenticated sessions, saved addresses, and minimal form fields.
- Content and commerce share one platform. There is no separate "content app" and "shop app." The backend serves both content and transactional APIs from a single service.

---

## Solution Overview

ZISUN closes the gap between content consumption and commerce execution through four pillars.

### Pillar 1: Shoppable Content

> Every reel, story card, and editorial is directly linked to purchasable products. The content IS the storefront.

**Technical Feasibility:**
- Data model: `Contents` table linked to `Products` via `ContentProducts` junction table with `display_order`, `position_x`, `position_y` for spatial product tagging.
- Content types supported: `IMAGE`, `VIDEO`, `BUNDLE` (enum).
- Media storage: Cloudflare R2 with CDN delivery via signed URLs (1h TTL).
- Video transcoding: ffmpeg worker generates 3 renditions (360p, 720p, 1080p) on upload.
- Feed API: cursor-based pagination, 20 items per page, filterable by tags.

**[ASSUMPTION]** Using Cloudflare R2 over AWS S3 for media storage. Reason: $0 egress cost vs S3's $0.09/GB for CDN delivery to Indian users. The PRD lists "AWS S3 / Cloudflare R2" (§8) — both are acceptable. Can be overridden to S3 if the team has existing AWS media infrastructure.

### Pillar 2: Mobile-Native Checkout

> Frictionless OTP auth, one-tap payment via Razorpay, and WhatsApp-based order management for users who prefer messaging over apps.

**Technical Feasibility:**
- OTP auth: 6-digit OTP via SMS (Twilio), hashed in Redis with 300s TTL, RS256-signed JWT.
- Payment: Razorpay SDK (client-side) handles card/UPI/wallet. Server creates Razorpay order, client completes payment, webhook confirms.
- WhatsApp: Meta WhatsApp Business API v18+ for post-purchase notifications. Pre-approved message templates required.
- Checkout target: < 90 seconds. Requires: single-tap auth for returning users (refresh token), saved addresses, and payment method memory via Razorpay tokenization.

**[ASSUMPTION]** Using Twilio as the SMS provider for OTP delivery. The PRD does not specify an SMS provider but mentions "Twilio SMS as primary fallback" for WhatsApp (§8). Using Twilio for both OTP and WhatsApp fallback simplifies vendor management. Can be overridden to MSG91 or Gupshup.

### Pillar 3: Story-Led Brand Building

> Vendors present products through curated narratives — occasion-based, season-based, lifestyle-based — not SKU grids.

**Technical Feasibility:**
- Content tagging system: `occasion_tags[]` and `season_tags[]` as PostgreSQL array columns on the `Contents` table.
- Admin CMS: content creation UI in the admin dashboard with product search/link, tag assignment, and publish scheduling.
- MVP is own-inventory only (ZISUN sources and sells). Vendor self-service portal deferred to Phase 4 (PRD §12).
- No algorithmic curation at MVP — feed is sorted by `published_at DESC`. Editorial curation is manual via the admin dashboard.

### Pillar 4: AI Personalization (Phase 2+)

> Behavioral signals feed a recommendation engine that adapts the discovery feed to each user's style fingerprint.

**Technical Feasibility (instrumentation only at MVP):**
- All behavioral events (content_viewed, product_viewed, add_to_cart, etc.) are tracked from Day 1 via a client-side event queue that flushes to `POST /analytics/events`.
- Events stored in PostgreSQL `events` table at MVP. Migration to Kafka + ClickHouse at Phase 3.
- No ML model, no recommendation engine, no personalized feed at MVP. The infrastructure is: collect data now, use it later.
- Phase 3 target: collaborative filtering model trained on behavioral embeddings. Feed ranking shifts from chronological to weighted score (0.4 × recency + 0.3 × engagement + 0.3 × personalization).

---

## Competitive Differentiation

| Dimension | ZISUN | Myntra / Meesho |
|-----------|-------|-----------------|
| **Discovery model** | Story + content-first. Feed is the homepage. Users discover through inspiration, not search. | Search + category grid. Users must know what they want. Discovery is accidental. |
| **UX model** | Editorial / immersive. Content cards with rich media. Purchase via bottom sheet without leaving feed. | Catalogue / transactional. Product listing pages with filters. Standard PDP → cart → checkout flow. |
| **Target cohort** | Style-aware 18–35. Tier 1–3 cities. Willing to pay premium for curation. | Price-sensitive mass market (Meesho) or broad demographic (Myntra). Compete on price or assortment breadth. |
| **Content role** | Primary interface. Content IS the storefront. Every piece of content is shoppable. | Marketing add-on. Content (blogs, lookbooks) is separate from the shopping flow. |
| **WhatsApp commerce** | Native, first-class. Post-purchase lifecycle managed entirely via WhatsApp. Order status, returns, support — all in chat. | Absent (Myntra) or bolt-on (Meesho). Push notifications, not conversational. |
| **Personalization** | Behavioral + style AI (Phase 3). Per-user style fingerprint trained on scroll/dwell/cart/purchase signals. | Basic purchase history. Recommendations based on past orders and browse history. No content-consumption signals. |

### Competitive Moat Timeline

- **Month 1–6:** Curation quality + WhatsApp-native experience. This is operational, not technical.
- **Month 6–10:** Behavioral data asset. 10,000+ profiled users create a dataset no competitor has (content-consumption signals linked to purchase outcomes).
- **Year 2+:** AI personalization flywheel. Data → model → better feed → more engagement → more data. This is the long-term moat.

---

## Scope Boundaries

### In Scope — MVP (Phase 1, Weeks 1–6)

The following features MUST ship for MVP. No order can be processed without all of these operational.

| Feature | Priority | PRD Section |
|---------|----------|-------------|
| OTP-based authentication (phone number, SMS, JWT) | P0 | §4.1 |
| Shoppable content feed (image + video cards, product linking) | P0 | §4.2 |
| Product catalog with variant management (size, color, SKU, stock) | P0 | §4.3 |
| Cart & checkout (cart persistence, address, payment initiation) | P0 | §4.4 |
| Razorpay payment integration (order creation, webhook, idempotency) | P0 | §4.4 |
| Order management with state machine (CREATED → DELIVERED lifecycle) | P0 | §4.5 |
| WhatsApp order confirmation (PAID → message sent within 60s) | P1 | §4.6 |
| Admin dashboard — basic (order list, product CRUD, stock management) | P0 | §4.7 |
| Sentry error monitoring with P0 alerts on payment errors | P0 | §8 |
| Zombie order cleanup job (auto-cancel PAYMENT_PENDING > 30 min) | P0 | §4.4 |

**MVP Exit Criteria (from PRD §12):**
- 100 successful paid orders processed.
- Payment success rate > 96% over 50 test transactions.
- Zero inventory oversell incidents in 1,000 concurrent-request load test.
- Admin dashboard used successfully by non-engineer for 48 hours.

### Out of Scope — MVP

The following items are **explicitly excluded** from MVP. No engineer should build these in Phase 1.

| Item | Reason for Exclusion | Phase |
|------|----------------------|-------|
| Cash on Delivery (COD) | PRD §13.2: "NOT in scope for MVP; added in Phase 2 after NDR tracking is in place." | Phase 2 |
| Coupon / discount codes | PRD §4.4: Listed as P1. Requires validation engine (expiry, usage limit, min order). | Phase 2 |
| Review & ratings system | PRD §12: Phase 2 feature. | Phase 2 |
| Return & refund flow (full) | PRD §12: Shiprocket automation + reverse logistics in Phase 2. Basic admin-initiated refund is in MVP. | Phase 2 |
| WhatsApp bot for order status queries | PRD §4.6: Intent classification and conversational flows are Phase 2. MVP has outbound notifications only. | Phase 2 |
| Search functionality | PRD does not list search as a P0 feature. Discovery is feed-based at MVP. | Phase 2 |
| Push notifications | PRD §12: Phase 3 feature. | Phase 3 |
| Personalized feed (ML-driven ranking) | PRD §12: Phase 3. MVP feed is chronological. | Phase 3 |
| Vendor onboarding portal | PRD §12: Phase 4. MVP is own-inventory only. | Phase 4 |
| Multi-region deployment | PRD §12: Phase 4. MVP runs in a single region (ap-south-1 Mumbai). | Phase 4 |
| AR try-on | PRD §17.2: Year 2+ roadmap. | Year 2+ |

### Deliberately Deferred — Phase 2+ With Specific Rationale

| Feature | Deferral Rationale | Prerequisite |
|---------|--------------------|-------------|
| COD | Requires NDR (Non-Delivery Ratio) tracking to prevent COD fraud/rejection. NDR tracking depends on Shiprocket webhook integration, which is Phase 2. | Shiprocket webhooks operational |
| Coupon engine | Requires validated pricing rules, stacking prevention logic, and abuse detection. Premature implementation risks revenue leakage. | Core checkout stable for 4 weeks |
| WhatsApp conversational bot | Requires intent classification, session management, and confidence-based escalation. Outbound-only templates are sufficient for MVP order confirmation. | 500+ real user messages for intent corpus |
| Recommendation engine | Requires behavioral data asset (10,000+ profiled users). Shipping a bad recommendation engine is worse than shipping a chronological feed. | 10K profiled users, event pipeline |

---

## Key Architectural Constraints

Product decisions in the PRD impose the following non-negotiable architectural constraints.

### 1. Mobile-First → Next.js PWA

**Decision:** Next.js 14 App Router as a Progressive Web App (PWA).

**[ASSUMPTION]** The PRD says "Mobile-First eCommerce + Content Platform" but does not specify native (React Native / Flutter) vs web (PWA). Choosing Next.js PWA because:
- The Admin Dashboard (PRD §4.7) must run on the same deployment ("Same deployment as frontend; /admin/* routes protected"). This is natural in Next.js but requires a separate app in React Native.
- The MVP timeline is 6 weeks. A PWA ships faster than a native app.
- PWA can be installed on Android home screens and works offline with service workers.
- React Native can be introduced in Phase 4 if native performance (e.g., AR try-on) is needed.

**Override:** If native app distribution (App Store / Play Store) is required for MVP, switch to React Native for consumer app + separate Next.js app for admin. This adds ~2 weeks to MVP timeline.

### 2. WhatsApp-Native → Meta Business API v18+

**Constraint:** WhatsApp is a first-class channel for post-purchase lifecycle (PRD §4.6). This requires:
- Meta WhatsApp Business API account (not WhatsApp Web or unofficial APIs).
- API version: v18+ (current stable as of 2024).
- Pre-approved message templates submitted and approved by Meta before go-live (5 business day lead time per PRD §13.2).
- 24-hour session window: after a user message, ZISUN can reply with freeform text for 24 hours. Outside the window, only pre-approved templates can be sent.
- Webhook endpoint (`POST /webhooks/whatsapp`) must be HTTPS, publicly accessible, and verify Meta's `X-Hub-Signature-256` header.

**Risk:** Template rejection by Meta blocks order confirmation flow. Mitigation: SMS fallback via Twilio pre-configured and tested before launch (PRD §13.1).

### 3. Content-First → CDN is Mandatory on Day 1

**Constraint:** The shoppable feed is the primary interface. Every feed load fetches media (images, video thumbnails). Without a CDN:
- Divya persona (Tier 2, budget Android, inconsistent 4G) will experience 5–10s image loads from origin.
- Video first-frame delivery target (< 1s on 4G) is impossible from S3 direct.
- P95 feed load target (< 2s on 4G) cannot be met.

**Implementation:**
- Media stored in Cloudflare R2 (or AWS S3).
- Delivered via Cloudflare CDN using signed URLs with 1-hour TTL.
- Image thumbnails auto-generated at 3 sizes on upload (small: 150px, medium: 400px, large: 800px).
- Video thumbnails: first frame extracted at 0s via ffmpeg, stored separately.
- CDN cache invalidation on media delete.

### 4. Own-Inventory Model at MVP → No Multi-Vendor Complexity

**Constraint:** PRD §16.1 states Phase 1–2 is "Direct Margin (Own Inventory)." ZISUN sources directly and sells at 40–60% gross margin. Vendor onboarding portal is Phase 4.

**Engineering Implication:**
- No `vendor_id` filtering in catalog queries at MVP. All products belong to ZISUN.
- The `vendor_id` column exists in the `Products` table (PRD §7.1) but is nullable and unused at MVP. It is included now to avoid a migration later.
- No commission calculation, no vendor payout, no vendor dashboard. These are Phase 4.
- Admin dashboard is the sole product management interface. No self-service for external vendors.

### 5. PostgreSQL as Primary Datastore → No Microservices

**Constraint:** PRD §7 defines a single relational data model with 10 core entities. The MVP is a monolithic FastAPI application backed by PostgreSQL.

**[ASSUMPTION]** Single PostgreSQL instance for MVP. Read replica added in Phase 4 (PRD §12, Phase 4: "Read replica for catalog"). No microservice decomposition until Year 2+ when the vendor portal introduces a service boundary.

**Engineering Implication:**
- All transactions (order creation, inventory lock, payment recording) are PostgreSQL ACID transactions. No distributed transactions.
- Background workers (Celery) connect to the same PostgreSQL instance.
- Redis is used for: OTP storage, rate limiting, JWT revocation, session caching, and feed cache. Redis is NOT the primary datastore for any business entity.

### 6. India-Only Deployment → ap-south-1 Region

**Constraint:** Target market is India (Tier 1, 2, 3 cities). All infrastructure is deployed in the Mumbai region (AWS ap-south-1 or equivalent).

**Engineering Implication:**
- All timestamps stored as `TIMESTAMPTZ` and displayed in IST (UTC+5:30) on the frontend.
- Phone number validation: Indian mobile format only (`^[6-9]\d{9}$`).
- Currency: INR only. All monetary amounts in `NUMERIC(10,2)`.
- Razorpay: INR-only payment gateway (matches constraint).
- Shiprocket: India-only logistics provider (matches constraint).
- Multi-region (Mumbai + Singapore) deferred to Phase 4 (PRD §17.3).

---

## Technology Stack Summary

| Layer | Technology | PRD Reference | Decision Basis |
|-------|-----------|---------------|----------------|
| **Backend framework** | FastAPI (Python 3.11+) | §13.2: "Python/FastAPI proficiency" | PRD-specified |
| **Frontend framework** | Next.js 14 (App Router) | §13.2: "React/Next.js proficiency" | PRD-specified |
| **Database** | PostgreSQL 15+ | §7: relational data model | PRD-implied (SQL schema, ACID transactions) |
| **Cache / Queue broker** | Redis 7+ | §4.1: OTP storage, rate limiting | PRD-implied |
| **Task queue** | Celery 5.3+ | §12 Phase 4: "Celery migration" implies Celery in use | PRD-implied |
| **ORM** | SQLAlchemy 2.0+ (async) | §11.3: "SQL queries via SQLAlchemy ORM" | PRD-specified |
| **Migrations** | Alembic | §8: "All schema changes via versioned migration files" | PRD-specified |
| **Payments** | Razorpay | §8: primary payment gateway | PRD-specified |
| **Fulfillment** | Shiprocket | §8: shipping & fulfillment | PRD-specified |
| **Notifications** | WhatsApp Business API + Twilio SMS | §4.6, §8 | PRD-specified |
| **Media storage** | Cloudflare R2 | §8: "AWS S3 / Cloudflare R2" | [ASSUMPTION] — R2 chosen for $0 egress |
| **CDN** | Cloudflare | §8: CDN delivery with signed URLs | PRD-implied |
| **Error monitoring** | Sentry | §8: "All exceptions captured" | PRD-specified |
| **Frontend styling** | Tailwind CSS v3 | Agent prompt specification | Agent-specified |
| **Animations** | Framer Motion | Agent prompt specification | Agent-specified |
| **Testing** | pytest, Locust | §15: "pytest with pytest-asyncio", "Locust" | PRD-specified |

---

## Relationship to Future Roadmap (Year 2+)

The following Year 2+ features from PRD §17 are documented here to ensure MVP architecture does not accidentally preclude them.

| Future Feature | MVP Architectural Consideration |
|----------------|--------------------------------|
| **Behavioral style fingerprinting** | Event tracking instrumented from Day 1. All events carry `session_id`, `user_id`, and `properties` object. Schema is extensible. |
| **Predictive restocking** | Product sales velocity is calculable from `order_items` + `orders.created_at`. No additional instrumentation needed at MVP. |
| **AI Stylist Agent** | WhatsApp webhook handler is extensible. Intent classifier can be swapped from keyword-based to ML-based without API changes. |
| **AR try-on** | Product media supports video. AR would add a new media type. `ProductMedia` table has `type` column (IMAGE, VIDEO, extendable to AR_MODEL). |
| **Shoppable video (native overlay)** | `ContentProducts` table already stores `position_x`, `position_y` for spatial product placement. Video overlay rendering is a frontend concern. |
| **Social commerce graph** | `Users` table exists. Social graph would be a new `user_follows` table. No MVP table conflicts. |
| **Kafka streaming backbone** | Outbox pattern used at MVP. Migration to Kafka means the outbox poller pushes to Kafka instead of Celery. No business logic changes. |
| **Multi-region deployment** | `Orders` table has `region` column (PRD §7.1). Data partitioning by `region` is possible. |
| **Vendor self-service portal** | `Products` table has `vendor_id` column (nullable at MVP). Vendor portal adds a `vendors` table and makes `vendor_id` required. |

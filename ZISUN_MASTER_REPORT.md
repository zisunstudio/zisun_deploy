# ZISUN — Master Reference Document
### Build Documentation + Expert Board Strategic Review

> **Version**: Sprint 1 Complete | **Date**: June 2026 | **Branch**: `claude/dev-stage-assessment-EKD1q`

---

## TABLE OF CONTENTS

**Part A — Complete Build Documentation**
1. [Architecture Overview](#1-architecture-overview)
2. [Database Models & Schema](#2-database-models--schema)
3. [API Endpoints — Public](#3-api-endpoints--public)
4. [API Endpoints — Admin](#4-api-endpoints--admin)
5. [Services & Business Logic](#5-services--business-logic)
6. [Celery Background Tasks](#6-celery-background-tasks)
7. [Middleware & Security](#7-middleware--security)
8. [Alembic Migrations](#8-alembic-migrations)
9. [Frontend Pages & Components](#9-frontend-pages--components)
10. [Frontend Hooks & Queries](#10-frontend-hooks--queries)
11. [Configuration & Environment](#11-configuration--environment)
12. [ML Infrastructure](#12-ml-infrastructure)
13. [External Integrations](#13-external-integrations)
14. [Test Coverage](#14-test-coverage)

**Part B — Expert Board Strategic Review**
15. [First Principles Review](#15-first-principles-review)
16. [Customer Truth Analysis](#16-customer-truth-analysis)
17. [Behavioral Psychology Review](#17-behavioral-psychology-review)
18. [Mathematical Analysis](#18-mathematical-analysis)
19. [Product Analysis](#19-product-analysis)
20. [Competitive Analysis](#20-competitive-analysis)
21. [Financial Analysis](#21-financial-analysis)
22. [Legal & Compliance Review](#22-legal--compliance-review)
23. [Technology Review](#23-technology-review)
24. [Investor Review](#24-investor-review)
25. [Strategic Review — What Would the Legends Do?](#25-strategic-review--what-would-the-legends-do)
26. [Brutal Conclusion & Scorecard](#26-brutal-conclusion--scorecard)

---

# PART A — COMPLETE BUILD DOCUMENTATION

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js 14)                    │
│  App Router · TypeScript · TanStack Query · Tailwind CSS        │
│  Zustand (auth state) · Axios (API client)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / REST
┌──────────────────────────▼──────────────────────────────────────┐
│                    BACKEND (FastAPI + Python 3.12)               │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  API Layer   │  │ Service Layer│  │   Background Workers   │ │
│  │  /api/v1/    │  │  Business    │  │   Celery + Redis       │ │
│  │  /api/admin/ │  │  Logic       │  │   Beat Scheduler       │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘ │
│         │                 │                                      │
│  ┌──────▼─────────────────▼──────────────────────────────────┐  │
│  │              SQLAlchemy 2.0 (Async ORM)                   │  │
│  └──────┬───────────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────────────┘
          │
┌─────────▼──────────┐    ┌───────────┐    ┌────────────────────┐
│   PostgreSQL 16     │    │  Redis 7  │    │  Cloudflare R2     │
│   Primary DB        │    │  Cache    │    │  Media Storage     │
│   pgvector (S2)     │    │  Sessions │    │  CDN               │
│   GIN indexes       │    │  Rate Lim │    └────────────────────┘
└────────────────────┘    └───────────┘
```

### Tech Stack Summary

| Layer | Technology |
|---|---|
| **Backend Framework** | FastAPI (async) + Python 3.12 |
| **ORM** | SQLAlchemy 2.0 async + Alembic migrations |
| **Database** | PostgreSQL 16 (GIN index for FTS, JSONB) |
| **Cache / Queue** | Redis 7 (rate limiting, feed cache, Celery broker) |
| **Background Jobs** | Celery + Celery Beat |
| **Auth** | RS256 JWT (access 15min) + Refresh tokens (30d, HTTP-only cookie) |
| **Payments** | Razorpay (orders + webhooks + reconciliation) |
| **SMS / OTP** | Twilio SMS |
| **Logistics** | Shiprocket (AWB generation) |
| **Messaging** | WhatsApp Business API |
| **Media Storage** | Cloudflare R2 (presigned upload URLs) |
| **Frontend** | Next.js 14 (App Router) + TypeScript |
| **State Management** | Zustand (auth) + TanStack Query (server state) |
| **Styling** | Tailwind CSS |
| **Monitoring** | Sentry |
| **ML (Sprint 1)** | JSONB embeddings + RFM feature engineering |
| **ML (Sprint 2+)** | pgvector, MLflow, Feast, sentence-transformers |

---

## 2. Database Models & Schema

### 2.1 User Management

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `phone` | String(15) | unique, indexed |
| `name` | String(255) | optional |
| `email` | String(255) | optional |
| `role` | Enum | `user` / `admin` / `operations` / `finance` |
| `deleted_at` | DateTime | soft-delete |
| `created_at` / `updated_at` | DateTime | auto-managed |

#### `refresh_tokens`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users, CASCADE) | |
| `jti` | String(36) | unique token identifier |
| `token_hash` | String(255) | bcrypt hash |
| `expires_at` | DateTime | 30-day TTL |
| `revoked` | Boolean | |
| `revoked_at` | DateTime | optional |

#### `addresses`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK, indexed) | |
| `line1` | String(255) | |
| `line2` | String(255) | optional |
| `city` | String(100) | |
| `state` | String(100) | |
| `pincode` | String(20) | |
| `is_default` | Boolean | |

---

### 2.2 Catalog

#### `categories`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `name` | String(255) | unique |
| `slug` | String(255) | unique, URL-safe |
| `image_url` | String(1024) | optional |
| `description` | Text | optional |
| `is_active` | Boolean | |

#### `products`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `name` | String(255) | |
| `description` | Text | optional |
| `base_price` | Integer | **paise** |
| `category_id` | UUID (FK) | optional |
| `vendor_id` | String(255) | optional |
| `is_active` | Boolean | |
| `deleted_at` | DateTime | soft-delete |
| `avg_rating` | Float | default 0.0, auto-updated on review approval |
| `review_count` | Integer | auto-updated on review approval |
| `search_vector` | TSVector | GIN indexed, PostgreSQL full-text search |

#### `product_variants`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `product_id` | UUID (FK, indexed) | |
| `sku` | String(100) | unique, indexed |
| `size` | String(50) | optional |
| `color` | String(50) | optional |
| `stock` | Integer | |
| `price_delta` | Integer | paise added to base_price |
| `version` | Integer | optimistic locking |
| `is_active` | Boolean | |

#### `product_media`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `product_id` | UUID (FK, CASCADE) | |
| `url` | String(1024) | original URL |
| `cdn_url` | String(1024) | Cloudflare R2 CDN URL |
| `type` | Enum | `IMAGE` / `VIDEO` |
| `display_order` | Integer | |

---

### 2.3 Shopping & Checkout

#### `carts`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK, unique) | one cart per user |

#### `cart_items`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `cart_id` | UUID (FK, indexed) | |
| `product_variant_id` | UUID (FK) | |
| `quantity` | Integer | |

#### `orders`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK, indexed) | |
| `status` | Enum | `CREATED` → `PAYMENT_PENDING` → `PAID` → `PACKED` → `SHIPPED` → `DELIVERED` → `CANCELLED` / `RETURNED` |
| `total_amount` | Integer | paise (after discount) |
| `address_id` | UUID (FK) | |
| `razorpay_order_id` | String(100) | unique, optional (null for COD) |
| `payment_method` | Enum | `RAZORPAY` / `COD` |
| `cod_amount_due` | Integer | paise, optional |
| `coupon_id` | UUID (FK → coupons) | optional |
| `discount_amount` | Integer | paise |
| `region` | String(100) | optional |

#### `order_items`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `order_id` | UUID (FK, indexed) | |
| `product_variant_id` | UUID (FK) | |
| `quantity` | Integer | |
| `unit_price` | Integer | **snapshot price** in paise at time of purchase |

#### `payments`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `order_id` | UUID (FK) | |
| `gateway` | String(50) | default: `razorpay` |
| `payment_gateway_id` | String(255) | unique, Razorpay payment ID |
| `status` | Enum | `PENDING` / `CAPTURED` / `FAILED` / `REFUNDED` |
| `amount` | Integer | paise |
| `processed_at` | DateTime | optional |

#### `inventory_locks`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `product_variant_id` | UUID (FK) | |
| `order_id` | UUID (FK, indexed) | |
| `reserved_qty` | Integer | |
| `status` | Enum | `ACTIVE` / `RELEASED` / `EXPIRED` |
| `expires_at` | DateTime | 30-minute TTL, indexed |

#### `fulfillments`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `order_id` | UUID (FK) | |
| `carrier` | String(100) | default: `shiprocket` |
| `awb_number` | String(100) | unique, indexed |
| `status` | String(50) | |
| `external_ref` | String(100) | unique, indexed |

---

### 2.4 Coupons

#### `coupons`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `code` | String(50) | unique, indexed, uppercase |
| `type` | Enum | `FLAT` (paise) / `PERCENT` (integer, e.g. 10 = 10%) |
| `value` | Integer | discount amount |
| `min_order_value` | Integer | paise minimum |
| `max_discount` | Integer | paise cap (for PERCENT type) |
| `usage_limit` | Integer | global limit, optional |
| `per_user_limit` | Integer | default 1 |
| `expires_at` | DateTime | optional |
| `is_active` | Boolean | |
| `is_referral` | Boolean | marks referral coupons |

#### `coupon_usages`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `coupon_id` | UUID (FK, indexed) | |
| `user_id` | UUID (FK, indexed) | |
| `order_id` | UUID (FK, indexed) | |

---

### 2.5 Reviews

#### `reviews`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK, indexed) | |
| `product_id` | UUID (FK, indexed) | |
| `order_id` | UUID (FK, indexed) | |
| `rating` | Integer | 1–5 (CHECK constraint) |
| `title` | String(200) | optional |
| `body` | Text | optional |
| `is_verified_purchase` | Boolean | default true |
| `media_urls` | JSONB | optional image/video attachments |
| `status` | Enum | `PENDING` / `APPROVED` / `REJECTED` (indexed) |

**Constraints**: Unique on `(user_id, product_id, order_id)` — one review per user per product per order.

---

### 2.6 Wishlist

#### `wishlists`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK, unique, CASCADE) | one wishlist per user |

#### `wishlist_items`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `wishlist_id` | UUID (FK, CASCADE, indexed) | |
| `product_variant_id` | UUID (FK) | |

**Constraint**: Unique on `(wishlist_id, product_variant_id)`.

---

### 2.7 Content (Editorial)

#### `content_cards`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `type` | Enum | `IMAGE` / `VIDEO` |
| `media_url` | String(512) | |
| `thumbnail_url` | String(512) | optional |
| `caption` | String(500) | optional |
| `status` | Enum | `DRAFT` / `PUBLISHED` (indexed) |
| `published_at` | DateTime | optional |
| `created_by` | UUID (FK) | optional |

#### `content_tags`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `content_card_id` | UUID (FK, CASCADE, indexed) | |
| `tag_name` | String(100) | |
| `tag_type` | Enum | `occasion` / `season` / `price_band` / `category` |

#### `content_products`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `content_card_id` | UUID (FK, CASCADE, indexed) | |
| `product_id` | UUID (FK, CASCADE) | |
| `display_order` | Integer | |
| `position_x` / `position_y` | Float | optional, for product tag overlays |

---

### 2.8 Analytics & Event Sourcing

#### `analytics_events`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `event_type` | String(100) | indexed |
| `session_id` | String(255) | indexed, optional |
| `user_id` | UUID (FK, SET NULL) | optional |
| `properties` | JSON | arbitrary event data |

#### `outbox_events`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `aggregate_type` | String(100) | e.g. `order` |
| `aggregate_id` | String(255) | |
| `event_type` | String(100) | e.g. `ORDER_PAID` |
| `payload` | JSONB | |
| `published_at` | DateTime | null = unpublished, indexed |

---

### 2.9 ML Infrastructure (Sprint 1)

#### `product_embeddings`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `product_id` | UUID (FK, unique, CASCADE) | |
| `text_embedding` | JSONB | Sprint 1: float array; Sprint 2: `vector(384)` |
| `image_embedding` | JSONB | Sprint 1: float array; Sprint 2: `vector(1280)` |
| `model_version` | String(100) | default `v1` |

#### `search_queries`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `query_text` | String(500) | indexed |
| `result_count` | Integer | |
| `clicked_product_ids` | JSONB | optional click data |
| `session_id` | String(255) | indexed, optional |
| `user_id` | UUID (FK) | optional |

---

## 3. API Endpoints — Public

**Base URL**: `/api/v1/`

### Auth (`/auth`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/auth/send-otp` | Generate 6-digit OTP, send via Twilio SMS | None |
| `POST` | `/auth/verify-otp` | Verify OTP, issue JWT access token + refresh token (HTTP-only cookie) | None |
| `POST` | `/auth/refresh` | Rotate refresh token | Cookie |
| `POST` | `/auth/logout` | Revoke refresh token, clear cookie | Cookie |

**Rate limits**: OTP send: 5/hour per phone; OTP verify: 5 failed attempts → 1-hour lockout.

---

### Catalog (`/catalog`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/catalog/categories` | List active categories with product counts | None |
| `GET` | `/catalog/categories/{slug}` | Category detail with active products | None |
| `GET` | `/catalog/products` | Paginated products (page, limit, category_id, sort_by) | None |
| `GET` | `/catalog/products/{product_id}` | Product detail with variants and media | None |
| `GET` | `/catalog/search` | Full-text search (tsvector + ILIKE fallback) | None |
| `GET` | `/catalog/feed` | Curated editorial feed (Redis cached, 5-min TTL) | None |

**Sort options**: `newest`, `price_asc`, `price_desc`

---

### Cart (`/cart`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/cart/` | Get user's cart with line items and total | Required |
| `POST` | `/cart/items` | Add variant to cart (validates stock) | Required |
| `DELETE` | `/cart/items/{variant_id}` | Remove item from cart | Required |
| `PUT` | `/cart/items/{item_id}` | Update item quantity (0 removes) | Required |
| `POST` | `/cart/checkout/initiate` | Initiate checkout (idempotency key header required) | Required |

**Checkout request body**:
```json
{
  "address_id": "uuid",
  "payment_method": "RAZORPAY | COD",
  "coupon_code": "SAVE10"
}
```

**Checkout response**:
```json
{
  "order_id": "uuid",
  "razorpay_order_id": "order_xxx | null",
  "amount": 80000,
  "discount_amount": 10000,
  "currency": "INR",
  "payment_method": "RAZORPAY",
  "is_cod": false
}
```

**COD limit**: ₹5,000 maximum order value (500,000 paise). Orders above this must use Razorpay.

---

### Orders (`/orders`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/orders/` | List user's orders (paginated) | Required |
| `GET` | `/orders/{order_id}` | Order detail (items, payment, fulfillment, address) | Required |
| `POST` | `/orders/webhooks/razorpay` | Razorpay payment webhook (HMAC verified) | Webhook Sig |

**Webhook events handled**: `payment.captured` → mark PAID, release locks, create OutboxEvent; `payment.failed` → mark FAILED_PAYMENT, release locks.

---

### Coupons (`/coupons`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/coupons/apply` | Validate coupon code + preview discount (no DB commit) | Required |

**Request**: `{ "code": "SAVE10", "order_total": 100000 }`
**Response**: `{ "code": "SAVE10", "discount_amount": 10000, "final_total": 90000, "message": "..." }`

---

### Reviews (`/reviews`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/reviews/` | Submit review (requires DELIVERED order containing product) | Required |
| `GET` | `/reviews/products/{product_id}` | Get approved reviews with avg rating and distribution | None |

**Constraints**: One review per user + product + order. Reviews start as `PENDING` and require admin approval before being publicly visible.

---

### Addresses (`/addresses`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/addresses/` | List user's addresses (default first) | Required |
| `POST` | `/addresses/` | Create address (auto-default if first) | Required |
| `PUT` | `/addresses/{address_id}` | Update address | Required |
| `DELETE` | `/addresses/{address_id}` | Delete address | Required |
| `POST` | `/addresses/{address_id}/set-default` | Set as default delivery address | Required |

---

### Wishlist (`/wishlist`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/wishlist/` | Get user's wishlist | Required |
| `POST` | `/wishlist/items` | Add variant to wishlist | Required |
| `DELETE` | `/wishlist/items/{variant_id}` | Remove from wishlist | Required |

---

### System

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/health` | Check DB, Redis, Celery heartbeat status | None |
| `POST` | `/analytics/events` | Batch ingest analytics events (fire-and-forget, 202) | Optional |
| `GET` | `/webhooks/whatsapp` | WhatsApp webhook verification handshake | None |
| `POST` | `/webhooks/whatsapp` | Inbound WhatsApp messages (HMAC verified) | Webhook Sig |

---

## 4. API Endpoints — Admin

**Base URL**: `/api/admin/v1/`  
**Auth**: JWT required. Role-based access: `admin`, `operations`, `finance`.

### Products (`/products`)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/products/` | admin/ops | List products (paginate, include_inactive, search by name/SKU) |
| `POST` | `/products/` | admin | Create product with variants |
| `PUT` | `/products/{product_id}` | admin | Update product |
| `DELETE` | `/products/{product_id}` | admin | Soft-delete (blocked if PAID/PACKED orders exist) |
| `POST` | `/products/{product_id}/variants/` | admin | Add variant |
| `PUT` | `/products/{product_id}/variants/{variant_id}` | admin | Update variant |
| `DELETE` | `/products/{product_id}/variants/{variant_id}` | admin | Deactivate variant |
| `GET` | `/products/{product_id}/media/upload-url` | admin | Get presigned Cloudflare R2 upload URL |
| `POST` | `/products/{product_id}/media/confirm` | admin | Save ProductMedia after upload |
| `DELETE` | `/products/{product_id}/media/{media_id}` | admin | Delete media |
| `PATCH` | `/products/{product_id}/media/reorder` | admin | Reorder media display_order |
| `POST` | `/products/{product_id}/variants/{variant_id}/stock` | admin/ops | Update variant stock |
| `POST` | `/products/bulk-stock` | admin/ops | Bulk stock update (JSON array) |
| `POST` | `/products/bulk-stock-csv` | admin/ops | Bulk stock update (CSV file upload) |

---

### Categories (`/categories`)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/categories/` | admin/ops | List categories with product counts |
| `POST` | `/categories/` | admin | Create category (auto-generate slug) |
| `PUT` | `/categories/{category_id}` | admin | Update category |
| `DELETE` | `/categories/{category_id}` | admin | Deactivate category |

---

### Orders (`/orders`)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/orders/` | admin/ops | List orders (filter by status, search by order_id/phone) |
| `GET` | `/orders/{order_id}` | admin/ops | Order detail |
| `POST` | `/orders/{order_id}/status` | admin/ops | Update order status (state machine validated) |
| `POST` | `/orders/{order_id}/refund` | admin/finance | Initiate Razorpay refund |

**Order State Machine**:
```
CREATED → PAYMENT_PENDING → PAID → PACKED (triggers Shiprocket AWB) → SHIPPED → DELIVERED
                          ↘ FAILED_PAYMENT
                          CANCELLED (from CREATED/PAYMENT_PENDING/PAID)
                          RETURNED (from DELIVERED)
```

---

### Coupons (`/coupons`)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/coupons/` | admin | List coupons (active_only filter) |
| `POST` | `/coupons/` | admin | Create coupon |
| `PUT` | `/coupons/{coupon_id}` | admin | Update coupon (is_active, usage_limit, expires_at) |
| `DELETE` | `/coupons/{coupon_id}` | admin | Deactivate coupon |
| `GET` | `/coupons/{code}/usage-stats` | admin | Get total usage count for coupon |

---

### Content (`/content`)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/content/` | admin | List content cards (DRAFT/PUBLISHED filter) |
| `POST` | `/content/` | admin | Create content card with tags |
| `GET` | `/content/{card_id}` | admin | Card detail |
| `PUT` | `/content/{card_id}` | admin | Update card |
| `DELETE` | `/content/{card_id}` | admin | Delete card |
| `PATCH` | `/content/{card_id}/publish` | admin | Publish card (invalidate Redis feed cache) |
| `PATCH` | `/content/{card_id}/unpublish` | admin | Unpublish card |
| `POST` | `/content/{card_id}/products` | admin | Link product to card (with position overlay) |
| `DELETE` | `/content/{card_id}/products/{product_id}` | admin | Unlink product |

---

### Reviews (`/reviews`)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/reviews/` | admin | List reviews (filter by PENDING/APPROVED/REJECTED) |
| `PATCH` | `/reviews/{review_id}/status` | admin | Moderate review (approve/reject) — triggers rating recalculation |

---

## 5. Services & Business Logic

### AuthService
- **`send_otp(phone)`** — Generates 6-digit OTP, bcrypt-hashes it, stores in Redis (5-min TTL), sends via Twilio SMS
- **`verify_otp(phone, otp)`** — Validates hash, creates user if new, returns user record
- **`create_and_store_refresh_token(user_id)`** — Issues opaque token, stores bcrypt hash in DB
- **`rotate_refresh_token(raw_token)`** — Validates, atomically revokes old, issues new (prevents replay)
- **`revoke_refresh_token(raw_token)`** — Best-effort logout, marks token revoked

### CatalogService
- Full-text search using PostgreSQL `tsvector` with GIN index; falls back to ILIKE
- Feed endpoint Redis-cached with 5-minute TTL; invalidated on content publish/unpublish
- Presigned Cloudflare R2 upload URLs for media (direct browser-to-R2 upload)

### CheckoutService
Key flow in `initiate_checkout`:
1. Recalculate `gross_total` from live DB prices (never trust client totals)
2. Validate coupon → compute `discount_amount` (atomic)
3. Check COD limit (₹5,000 max)
4. Acquire optimistic-lock inventory (`version` column CAS)
5. Create `Order` with payment_method, discount_amount, coupon_id
6. For COD: set `cod_amount_due = net_total`, skip Razorpay
7. For Razorpay: create Razorpay order, store `razorpay_order_id`
8. Record `CouponUsage` in same transaction
9. Commit atomically

### CouponService
**`validate_coupon(code, user_id, order_total)`**:
1. Fetch coupon (404 if not found)
2. Check `is_active`
3. Check `expires_at`
4. Check `min_order_value`
5. If `usage_limit is not None`: check global usage count
6. Check per-user usage count
7. Compute discount: `FLAT` → `min(value, total)`; `PERCENT` → `(total × pct) // 100`, capped by `max_discount`

### ReviewService
**`create_review`** flow:
1. Check for duplicate (409 if exists)
2. Verify purchase: order must be `DELIVERED`, belong to user, contain a variant of the product
3. Create `Review` with `status=PENDING`

**`moderate_review(review_id, status)`**:
- If `APPROVED`: trigger `_recalculate_product_rating(product_id)`
- Rating = `AVG(rating)` over all `APPROVED` reviews for that product
- Updates `products.avg_rating` and `products.review_count` atomically

### OrderStateMachine
Validates state transitions before applying:
```
Allowed forward transitions:
CREATED → PAYMENT_PENDING, CANCELLED
PAYMENT_PENDING → PAID, FAILED_PAYMENT, CANCELLED
PAID → PACKED, CANCELLED
PACKED → SHIPPED
SHIPPED → DELIVERED
DELIVERED → RETURNED
```

---

## 6. Celery Background Tasks

**Scheduler**: Celery Beat with periodic tasks.

| Task | Frequency | What it does |
|---|---|---|
| `cleanup_zombie_orders` | Every 5 min | Cancel `PAYMENT_PENDING` orders older than 30 min, release inventory locks |
| `release_expired_locks` | Every 5 min | Release `ACTIVE` locks past `expires_at`, restore `stock` |
| `process_outbox` | Every 30 sec | Process `OutboxEvent` records — `ORDER_PAID` → WhatsApp delivery notification |
| `razorpay_daily_reconciliation` | Daily 02:00 | Compare Razorpay settlements with internal `payments` table, flag discrepancies |

---

## 7. Middleware & Security

### RateLimitMiddleware (Redis sliding window)
- **Auth routes** (`/auth/*`): 10 requests/minute per IP
- **Global**: 100 requests/minute per IP
- Graceful degradation if Redis is unavailable (pass-through)
- Returns `429 Too Many Requests` with `Retry-After` header

### RequestIDMiddleware
- Attaches unique `X-Request-ID` to every request and response for distributed tracing

### SecurityHeadersMiddleware
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' https://checkout.razorpay.com; ...
```

### JWT Security
- **Access tokens**: RS256, 15-minute expiry, stateless
- **Refresh tokens**: Opaque random bytes, bcrypt-hashed in DB, HTTP-only Secure cookie, 30-day expiry
- **Token rotation**: Old refresh token revoked on each rotation (prevents replay attacks)
- **OTP lockout**: 5 failed attempts → 1-hour lockout per phone number

---

## 8. Alembic Migrations

| Revision | Name | What it creates |
|---|---|---|
| `0001` | `initial_schema` | All core tables: users, refresh_tokens, addresses, categories, products, product_variants, product_media, carts, cart_items, orders, order_items, payments, inventory_locks, fulfillments, wishlists, wishlist_items, outbox_events |
| `0002` | `phase2_catalog` | `addresses.line2`, `categories.description/is_active`, `products.is_active/search_vector` (GIN index), `product_variants.is_active` |
| `0003` | `phase3_commerce` | `orders.razorpay_order_id` (unique, indexed); JSONB outbox payload; UUID FK corrections |
| `0004` | `phase4_content` | `content_cards`, `content_tags`, `content_products` tables; ENUMs: `contentstatus`, `contenttype`, `tagtype` — all idempotent (DO/EXCEPTION blocks) |
| `0005` | `sprint1_commerce_ml` | `coupons`, `coupon_usages`, `reviews`, `product_embeddings`, `search_queries`; alters `orders` (payment_method, cod_amount_due, coupon_id, discount_amount); alters `products` (avg_rating, review_count); ENUMs: `paymentmethod`, `coupontype`, `reviewstatus` — all idempotent |

**Migration safety pattern**: All `CREATE TYPE` statements wrapped in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`. All `ALTER TABLE ADD COLUMN` statements use `IF NOT EXISTS`. Migrations are fully reversible (downgrade supported).

---

## 9. Frontend Pages & Components

### Pages

| Route | Description |
|---|---|
| `/` | Home: hero banner, trust badges, category grid, editorial feed |
| `/shop` | Product listing with category filter and sort (newest/price asc/desc) |
| `/category/[slug]` | Category landing with filtered product grid |
| `/product/[id]` | Product detail: images, variants, size selector, reviews, add-to-cart |
| `/checkout` | 4-step checkout: (1) address select/create, (2) coupon + payment method, (3) Razorpay modal or COD confirm, (4) order confirmation |
| `/orders` | User order history (paginated) |
| `/orders/[id]` | Order detail: status timeline, items, tracking, payment info |
| `/wishlist` | User wishlist |
| `/profile` | User profile (name, email, phone) |
| `/search` | Search results page |
| `/(auth)/login` | Phone number entry |
| `/(auth)/login/verify` | OTP verification |

### Admin Pages

| Route | Description |
|---|---|
| `/admin` | Dashboard |
| `/admin/products` | Product list + quick actions |
| `/admin/products/new` | Create product form with variants |
| `/admin/products/[id]/edit` | Edit product/variants/media |
| `/admin/categories` | Category management (create, edit, toggle active) |
| `/admin/orders` | Order list with status filter and search |
| `/admin/inventory` | Stock management + bulk CSV upload |
| `/admin/content` | Content card management (draft/publish workflow) |
| `/admin/reconciliation` | Razorpay daily reconciliation view |

### Components

| Component | Purpose |
|---|---|
| `ProductCard` | Product tile for listing/grid views |
| `ProductForm` | Product create/edit with variant management |
| `VariantEditor` | Add/edit/delete product variants |
| `VariantSelector` | Size and color selection with stock indicator |
| `CartDrawer` | Slide-out cart with quantity controls |
| `CategoryCard` | Category browsing tile |
| `FeedCard` | Editorial content card with product tag overlays |
| `SearchBar` | Debounced search with results dropdown |
| `BottomSheet` | Mobile-friendly modal sheet |
| `ErrorBoundary` | React error boundary |
| `Toast` | Toast notification system |
| `OfflineBanner` | Offline/connection lost indicator |

---

## 10. Frontend Hooks & Queries

### Catalog (`lib/queries/catalog.ts`)

| Hook | Purpose |
|---|---|
| `useCategories()` | Fetch all active categories |
| `useCategory(slug)` | Fetch category detail with products |
| `useProducts(params)` | Paginated product list with filters |
| `useProduct(id)` | Single product with variants and media |
| `useSearch(q, page)` | Full-text product search |
| `useFeed(page)` | Editorial content feed |

**Utilities**: `formatPrice(paise) → "₹800"`, `productImageUrl(product) → cdn_url || url`

### Cart (`lib/queries/cart.ts`)

| Hook | Purpose |
|---|---|
| `useCart()` | Fetch cart (enabled only when authenticated) |
| `useAddToCart()` | Mutation: add variant |
| `useRemoveFromCart()` | Mutation: remove variant |
| `useUpdateCartQuantity()` | Mutation: update quantity |
| `useInitiateCheckout()` | Mutation: initiate checkout (with X-Idempotency-Key header) |
| `useApplyCoupon()` | Mutation: preview coupon discount |
| `useVerifyPayment()` | Mutation: verify Razorpay payment signature |

### Orders (`lib/queries/orders.ts`)

| Hook | Purpose |
|---|---|
| `useOrders()` | Paginated order list |
| `useOrder(id)` | Order detail (polls every 5s for non-terminal statuses) |

### Other Hooks

| Hook | File | Purpose |
|---|---|---|
| `useWishlist()` / `useAddToWishlist()` / `useRemoveFromWishlist()` | `wishlist.ts` | Wishlist management |
| `useAddresses()` / `useCreateAddress()` / `useSetDefaultAddress()` / `useDeleteAddress()` | `address.ts` | Address management |
| `trackEvent(type, props)` | `analytics.ts` | Batched analytics ingestion (fires every 10s or on page unload) |

---

## 11. Configuration & Environment

### Environment Variables

| Category | Variable | Description |
|---|---|---|
| **App** | `ENVIRONMENT` | `development` / `production` |
| **Database** | `POSTGRES_SERVER`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Connection details |
| **Database** | `DB_POOL_SIZE` (10), `DB_MAX_OVERFLOW` (20) | Connection pool |
| **Redis** | `REDIS_URL` | Redis connection string |
| **JWT** | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | RS256 key pair (generate with `scripts/generate_keys.py`) |
| **JWT** | `ACCESS_TOKEN_EXPIRE_MINUTES` (15), `REFRESH_TOKEN_EXPIRE_DAYS` (30) | Token TTLs |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | OTP SMS |
| **WhatsApp** | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp Business API |
| **Razorpay** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payments |
| **Cloudflare R2** | `R2_ENDPOINT_URL`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET_NAME`, `CLOUDFLARE_CDN_BASE_URL` | Media storage |
| **Shiprocket** | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` | Logistics |
| **Sentry** | `SENTRY_DSN` | Error monitoring |
| **Rate Limits** | `RATE_LIMIT_GLOBAL_PER_MINUTE` (100), `RATE_LIMIT_AUTH_PER_MINUTE` (10) | |
| **OTP** | `OTP_MAX_GENERATIONS_PER_HOUR` (5), `OTP_MAX_FAILED_ATTEMPTS` (5), `OTP_LOCKOUT_SECONDS` (3600) | |

---

## 12. ML Infrastructure

### Sprint 1 Foundation (Current)

**Feature Engineering Script** (`backend/scripts/ml/feature_engineering.py`):

**User Features** (RFM model):
- `recency_days` — days since last order
- `frequency` — total order count (90-day window)
- `monetary_paise` — total spend
- `last_category_id` — most recently purchased category

**Product Features**:
- `units_sold_7d` / `units_sold_30d` — demand signals
- `avg_rating` / `review_count` — quality signals
- `base_price_paise` — price tier signal

**Storage**: Sprint 1 uses JSONB for embedding vectors. Sprint 2 upgrades to `pgvector` `vector(384)` (text) and `vector(1280)` (image).

### Sprint 2+ ML Roadmap (`requirements_ml.txt`)

| Library | Purpose | Sprint |
|---|---|---|
| `sentence-transformers` (MiniLM-L12) | Text embeddings | S2 |
| `timm` + EfficientNet-B4 | Image embeddings | S2 |
| `implicit` (ALS) | Collaborative filtering | S3 |
| `lightfm` | Hybrid recommendations | S3 |
| `mlflow` | Experiment tracking | S3 |
| `feast` | Feature store (Redis online) | S2 |
| `onnxruntime` + `optimum` | Model serving (DistilBERT ONNX) | S4 |
| `prophet` + LSTM | Demand forecasting | S5 |
| `xgboost` + `lightgbm` | Fraud detection | S5 |
| `scikit-learn` (IsoForest) | Anomaly detection | S5 |

---

## 13. External Integrations

| Service | Purpose | Implementation |
|---|---|---|
| **Razorpay** | Payments, orders, refunds, webhooks, daily reconciliation | `razorpay` SDK + webhook HMAC verification |
| **Twilio SMS** | OTP delivery | REST API via `twilio` SDK |
| **WhatsApp Business API** | Order notifications (ORDER_PAID) | Meta Graph API via Outbox pattern |
| **Cloudflare R2** | Media storage (presigned upload URLs, CDN delivery) | `boto3` S3-compatible client |
| **Shiprocket** | AWB generation on order PACKED | REST API with JWT token caching |
| **Sentry** | Error monitoring, performance tracing | `sentry-sdk[fastapi]` |

---

## 14. Test Coverage

**Current state**: 241 tests passing, 70.99% coverage (threshold: 65%)

### Test Files

| File | Tests | What's covered |
|---|---|---|
| `test_50_scenarios.py` | 207 | Auth, catalog, cart, checkout (Razorpay), orders, addresses, wishlist, content, analytics, admin flows |
| `test_sprint1_features.py` | 34 | COD checkout, coupons (model + API + admin CRUD), reviews (API + moderation), ML model imports |

### Sprint 1 Test Classes

| Class | Tests | Coverage |
|---|---|---|
| `TestCouponModel` | 6 | `_compute_discount` (FLAT, PERCENT, caps, edge cases) |
| `TestCouponAPI` | 5 | Valid, invalid, min_order, expired, per_user_limit |
| `TestAdminCouponCRUD` | 2 | Create, list |
| `TestReviewModel` | 2 | `ReviewStatus` enum, `Review` model |
| `TestReviewAPI` | 4 | Submit verified, unverified purchase rejection, duplicate, get list |
| `TestAdminReviewModeration` | 3 | Approve (recalculates rating), not_found, list_pending |
| `TestCODCheckout` | 6 | `PaymentMethod` enum, schema validation, checkout flow |
| `TestMLModels` | 4 | `ProductEmbedding`, `SearchQuery` model importability |
| `TestCheckoutSchemaBackwardCompat` | 2 | Optional `razorpay_order_id`, COD fields |

---

# PART B — EXPERT BOARD STRATEGIC REVIEW

> **Board Disclaimer**: This is not a celebration. This is an autopsy before the patient dies. The goal is to find every flaw before the market does.

---

## 15. First Principles Review

### Mukesh Ambani — Ecosystem Strategy

The assumption: *Decision-making is the new commerce frontier.*

What is actually true: In India, the commerce rails are controlled by **Reliance (JioMart + AJIO), Amazon, and Flipkart**. Reliance collects behavioral data from 450 million Jio users across retail, financial services, and telecom — before a customer opens AJIO. You are planning to build intelligence on top of commerce. Ambani builds commerce on top of intelligence. That sequence matters enormously.

**The assumption likely wrong**: That users will trust a new platform for identity-level decisions. Trust is earned through repeated successful transactions, not UI design or AI claims.

**Critical question before building anything**: Can you acquire customers at a cost that allows profitability before a Reliance-backed competitor clones your core differentiation in 18 months?

---

### Jeff Bezos — Customer Obsession

The actual customer problems that exist in India:
- Price sensitivity (will I get a better deal elsewhere?)
- Return anxiety (will it fit? will it look the same?)
- Delivery reliability (will it actually arrive?)
- Trust deficit (is this genuine or a fake?)

You are solving a **Tier-1 urban problem** (too many choices, identity confusion) for what is mostly a **Tier-2/Tier-3 market** (price, trust, delivery).

**Evidence that would invalidate the thesis**: If CAC from Tier-2 cities is 3× Tier-1, and recommendation-to-purchase conversion is below 4%, your cognitive commerce thesis is demographically misaligned.

---

### Warren Buffett — Economic Moat

**Moat checklist for ZISUN**:

| Moat Type | Status | Notes |
|---|---|---|
| Cost Advantage | ❌ | Wholesaler model = commodity margins |
| Network Effects | ❌ | Not present in V1 |
| Switching Costs | ❌ | Zero — users shop 5 apps simultaneously |
| Intangible Assets | ⚠️ | Potential via behavioral data (years away) |
| Efficient Scale | ❌ | Too small for this to matter |

**Brutal fact**: Myntra's AI styling "MyFashionGPT" launched 2023. They have 50M users. Your recommendation engine needs data to work. They have the data. You don't. The moat you want to build requires users. The users require the moat. **This is a classic cold-start paradox with no elegant solution identified.**

---

### McKinsey Partner — Structural Analysis

**The three dangerous assumptions**:

1. **"Decision fatigue is the core problem"** — Unvalidated. The Paradox of Choice research (Schwartz, 2004) has faced significant replication failures. A 2015 meta-analysis of 99 choice overload studies found that choice overload effects are highly context-dependent and often don't replicate in developing markets.

2. **"AI can solve identity confusion"** — Mechanistically weak. Identity in fashion is deeply social, contextual, and volatile. An algorithm trained on past purchases may lock users into a style loop rather than facilitate genuine discovery.

3. **"We will transition from inventory to platform"** — The most dangerous. Inventory and platform businesses have fundamentally incompatible DNA: different capital structures, supplier relationships, incentive systems, and team capabilities. Companies that try to do both (Jabong, FashionAndYou) often do neither well.

**Recommendation**: Choose now — **vertical commerce brand** (high margins, brand loyalty) OR **platform + AI layer** (network effects, data flywheel). Do not plan to transition. The DNA is incompatible.

---

## 16. Customer Truth Analysis

### Y Combinator — Jobs-to-be-Done

**Three candidate customers — you must pick one**:

| Customer | Job | Frequency | Pain Severity | WTP |
|---|---|---|---|---|
| Urban woman 22-32, Tier-1 | "Help me look styled without becoming an expert" | High | Medium (manages without you) | Low-medium |
| Urban man 25-35, professional | "Tell me exactly what to wear for this interview/date" | Low | **High** (acute occasion anxiety) | **Medium-high** |
| Tier-2 aspirational, first-time online buyer | "Help me look modern/sophisticated" | Medium | High (trust + aspiration gap) | Price sensitive |

**YC's brutal question**: You cannot serve all three with one product. Which one is your beachhead? If you say "all three," you will fail.

---

### Behavioral Psychologist — Problem Validity

**What behavioral science actually shows about fashion shopping**:
- Consumers want the *feeling* of unlimited choice with the *experience* of curated selection — simultaneously
- Fashion decisions are **social proof-driven**, not algorithm-driven
- The most powerful influence on purchase is **what someone they respect is wearing**
- Price anchoring and loss aversion dominate rational product matching

**You may be overestimating**: Algorithmic recommendation as a substitute for social proof.

**You may be underestimating**: Community, influencer, and peer validation in converting browse to buy.

**The key reframe**: Consumers don't want to make better decisions. They want to **feel confident about decisions they've already emotionally made**. Your AI should validate, not deliberate. Reframe from "help users decide" to "help users commit." That is a different product entirely.

---

## 17. Behavioral Psychology Review

### Consumer Neuroscientist

Fashion purchasing activates **reward circuitry** (nucleus accumbens) — it is an emotional, often impulsive decision. Post-rationalization follows. If you interrupt this emotional arc with cognitive tools (fit calculators, preference profiling, decision frameworks), you may **decrease conversion**, not increase it.

**Evidence**:
- Zara's success is built on **artificial scarcity + FOMO**, not better decision support
- Stitch Fix's US success required a monthly styling fee model — even then it lost money
- The most successful fashion UX reduces friction, not cognitive load

---

### Fashion Industry Veteran — Operational Realities

**What kills fashion startups**:

1. **Inventory risk**: Fashion has 60-90 day cycles. Unsold inventory is a balance sheet destroyer.
2. **Size complexity**: Fit is the #1 return reason in Indian fashion. Returns cost ₹80-150/item. You cannot solve fit with AI without 3D body scanning at scale.
3. **Trend half-life**: Products that sold well in March are unsellable in May. AI trained on historical data is always behind the trend curve.
4. **Supplier reliability**: Indian wholesale suppliers ghost you, give inconsistent quality, and sell to 20 competitors simultaneously.
5. **Photography cost**: Good fashion photography costs ₹800-2,000 per product. 1,000 SKUs = ₹8-20 lakh just to launch.

**What you haven't addressed**: How do you manage trend risk in an AI-recommendation model? If your AI recommends something that goes out of trend before delivery, you own that failure.

---

## 18. Mathematical Analysis

### The Recommendation Quality Problem

```
Minimum viable data for collaborative filtering:
  Users:                    ≥ 10,000 active
  Interactions per user:    ≥ 20 meaningful
  Products:                 ≥ 500 SKUs
  Collection period:        ≥ 6 months

During cold start (0 → 10,000 users):
  Your "AI" is essentially random
```

### Feasibility by Model Type

| Model | Data Required | Startup Feasibility | Time to Value |
|---|---|---|---|
| Collaborative Filtering | 50K+ interactions | Medium | 12-18 months |
| Content-Based Filtering | Structured metadata | **High** | 3-6 months |
| Hybrid (Netflix-style) | 1M+ interactions | Very Low | 24-36 months |
| **LLM-based Styling** | **Zero training data** | **High** | **Immediate** |
| Behavioral Graph | Full clickstream | Very Low | 36+ months |

**Honest recommendation**: Use **LLM API-based styling** (GPT-4o/Claude) + **content-based filtering** on product metadata for V1. Do not claim a custom recommendation engine. You have a search + styling assistant.

### CAC Math (Indian fashion market reality)

```
Paid acquisition (Meta/Google):         ₹400 – ₹800 per install
Install → first purchase conversion:    15 – 25%
CAC per paying customer:                ₹1,600 – ₹5,300

Average Order Value (fashion, Tier-1):  ₹800 – ₹2,000
Gross Margin (wholesaler model):        30 – 45%
Gross Profit per order:                 ₹240 – ₹900

To recover CAC:                         2 – 7 repeat purchases needed
Annual repeat purchase rate (new brand): 15 – 25%
```

### Unit Economics Reality

```
Cohort of 1,000 customers at ₹2,500 CAC = ₹25 lakh spent
Year 1 repeat rate (20%): 200 make 2nd purchase
Year 2 (20% of survivors): 40 customers
3-year LTV per customer: ~₹3,200
CAC: ₹2,500
LTV:CAC ratio: 1.28×

Industry minimum for venture scale: 3× LTV:CAC
```

**Mathematical failure indicator**: LTV:CAC below 2.5× after 18 months of optimization = structurally broken model.

### Wholesaler Margin Stack

```
Wholesaler cost (kurti):                ₹250
Photography + listing:                  ₹50
Packaging:                              ₹30
Logistics (forward):                    ₹80
Payment gateway (2%):                   ₹20
MRP:                                    ₹800

Gross Revenue:                          ₹800
COGS:                                   ₹430
Gross Profit:                           ₹370 (46%)

Returns (20% rate, ₹130 cost/return):
  Return cost per 100 orders:           ₹2,600
  Per-order impact:                     -₹26

Adjusted Gross Profit:                  ₹344 (43%)

Less: Marketing (₹225) + Support (₹20) + Tech (₹22) + Warehouse (₹60)
Contribution Margin:                    ₹17 per order
```

**At ₹17 contribution margin, you need 1.5M orders/year to cover a ₹2.5 crore fixed cost base.**

---

## 19. Product Analysis

### Steve Jobs — Simplicity Test

**The one-sentence pitch**: *"Amazon sells you products. We tell you what to buy."*

That is interesting. But does the product deliver on Day 1? If the recommendation is wrong or generic, trust is destroyed permanently.

**What should NOT exist in V1**:
- ❌ Behavioral profiling onboarding (users abandon)
- ❌ AI chatbot (LLM hallucinations in fashion = wrong advice)
- ❌ Style quiz with 20 questions (friction)
- ❌ "Cognitive commerce" messaging (users don't care about your thesis)
- ❌ Marketplace seller portal (premature complexity)

**What should exist in V1**:
- ✅ Brutally curated catalog (< 200 SKUs, every one exceptional)
- ✅ One-click occasion-based filtering (Office / Date / Casual / Festive)
- ✅ Human styling notes on each product ("pairs with X, avoid if Y")
- ✅ Honest size guides with model measurements
- ✅ 7-day no-questions return

**The Jobs Principle**: Be so clear and so curated that the recommendation is implicit in the selection itself.

---

### Product Manager — PMF Signals

| Signal | Poor PMF | Good PMF |
|---|---|---|
| Sean Ellis score ("Very Disappointed") | < 30% | > 40% |
| Day-30 retention | < 10% | > 25% |
| Organic referral rate | < 5% | > 15% |
| Repeat purchase within 60 days | < 15% | > 30% |
| Top support ticket topic | "Where is my order?" | "What else do you recommend?" |

**The PMF trap**: Early sales = novelty + discount. PMF = customers who return without a coupon.

---

## 20. Competitive Analysis

### Positioning Map

```
                    HIGH SELECTION
                          │
           Amazon          │        Myntra
           Flipkart        │        AJIO
                          │
PRICE-LED ────────────────────────────────── PREMIUM/ASPIRATIONAL
                          │
           Meesho          │        ← ZISUN target position
           Club Factory    │        (Stitch Fix model)
                          │
                    LOW SELECTION
```

**The brutal positioning problem**: The upper-right quadrant is already occupied by Myntra (50M users, established delivery, free returns). Entering this quadrant requires brand trust that takes 5+ years to build.

### Why users would ignore ZISUN

1. No reason to switch from Myntra (free returns, known brands, fast delivery)
2. No social proof (unknown brand)
3. No price advantage over Meesho
4. No brand selection over Amazon
5. No discovery serendipity over Instagram/Pinterest

### Why users might choose ZISUN

1. Occasion-based recommendation executed dramatically better than anyone
2. Curation so tight that "finding something to wear" takes 2 minutes, not 2 hours
3. A genuine, trust-building styling relationship (human + AI hybrid)

**The only real unfair advantage you could build**: A **community of early adopter style-conscious users** who become brand ambassadors. Not an algorithm. People.

---

## 21. Financial Analysis

### Financial Model with Highest Probability of Success

The wholesaler GMV model alone is structurally weak. Higher-probability alternatives:

| Revenue Stream | Margin | Difficulty | Timeline |
|---|---|---|---|
| **Private label** (not wholesaler) | 60-70% GM | High | 6-12 months |
| **Styling subscription** ₹199-499/month | 85%+ | Medium | 3-6 months |
| **Brand placement fee** | 100% | Low (needs traffic) | 12+ months |
| **Data licensing** (behavioral fashion data) | 100% | Very High | 36+ months |

### Break-even Estimate

```
Monthly fixed costs (lean 5-person startup):
  Salaries:                 ₹5,00,000
  Cloud + infrastructure:   ₹30,000
  Marketing (minimum):      ₹1,50,000
  Misc (legal, tools):      ₹20,000
  Total:                    ₹7,00,000/month

At ₹17 contribution margin per order:
  Orders needed to break even: 41,176 orders/month
  At ₹1,200 AOV: ₹4.9 crore GMV/month required to break even

Realistic 12-month GMV target: ₹15-50 lakh/month
Breakeven: 24-36 months (not 12)
```

---

## 22. Legal & Compliance Review

### Hidden Legal Risks

**1. AI Recommendation Liability**
If your AI recommends a product for a wedding, it arrives wrong, and the occasion is ruined — Consumer Protection Act 2019 explicitly covers e-commerce platforms. An "AI advisor" that gives wrong advice may face **unfair trade practice** claims in consumer courts.

**2. DPDP Act 2023 (Digital Personal Data Protection)**

You collect: purchase history, behavioral data (clicks, dwell time), style preferences, potentially body measurements. This requires:
- Explicit consent architecture (purpose-specific)
- Data principal rights: access, correction, deletion
- Data fiduciary registration (once rules notified)
- Cross-border transfer restrictions (if using US AI APIs)

**3. Marketplace vs. Inventory Distinction**
- Own inventory model: regulated as a **retailer**
- Third-party sellers: regulated under **IT Intermediary Guidelines 2021**
- These carry fundamentally different product liability exposure

**4. GST Complexity**
- Cotton fashion items: 5% GST
- Synthetic items: 12% GST
- Misclassification = back taxes + penalties
- Third-party seller model triggers **TCS (Tax Collected at Source)** obligations

**5. IP Risk**
AI styling recommendations referencing brand names or suggesting "looks like [Brand X]" → trademark infringement exposure.

**Highest priority legal action**: Publish Terms of Service that explicitly limit liability for recommendation outcomes before launching AI features.

---

## 23. Technology Review

### What Can Be Built vs. What Has Been Claimed

| Layer | Claim | Reality | Timeline |
|---|---|---|---|
| E-commerce infrastructure | ✅ Built | FastAPI + PostgreSQL + React | **Done** |
| Curated catalog + search | ✅ Built | FTS + ILIKE | **Done** |
| Basic analytics | ✅ Built | Event ingestion | **Done** |
| LLM-powered styling | ⚠️ | GPT/Claude API (not custom) | 1-2 months |
| Content-based filtering | ⚠️ | Metadata similarity | 3-6 months |
| Custom ML recommendation | ❌ | Needs 50K users + 500K events | 18-24 months |
| Identity-based shopping | ❌ | Needs 2+ years behavioral data | 36+ months |
| Cognitive commerce ecosystem | ❌ | Theoretical | 48+ months |

### Current Architecture Assessment

| Component | Quality | Risk |
|---|---|---|
| FastAPI async backend | Good | Low |
| SQLAlchemy 2.0 | Good | Low |
| Celery + Redis | Appropriate | Medium (ops overhead) |
| JWT RS256 + refresh rotation | Excellent | Low |
| Inventory locking (version CAS) | Good | Low |
| Outbox pattern (events) | Good | Low |
| ML pipeline in Sprint 1 | **Premature** | High (no data yet) |
| pgvector plan (Sprint 2) | Reasonable | Medium |
| Custom ML models (Sprint 3+) | **Premature** | Very High |

**CTO verdict**: The commerce backend is solid. The ML roadmap is fantasy timeline. Build the data collection infrastructure first. Start custom ML when you have 50K registered users and 500K recorded events. Not before.

**What to actually build in next 6 months**:
1. Structured product metadata (for content-based filtering)
2. Full event tracking (every click, view, add-to-cart, purchase, return reason)
3. LLM-powered styling via API (no training required)
4. A/B testing framework (measure recommendation impact)
5. Data warehouse (behavioral event storage, not ML yet)

---

## 24. Investor Review

### Pre-Seed (₹50L-1Cr) — Conditional Yes

**Yes, IF**:
- Founders have interviewed 200+ potential customers and can articulate one specific beachhead segment
- GMV traction exists (even ₹5L/month from real customers paying full price)
- AI is positioned as "LLM-powered styling" not "proprietary recommendation engine"
- Clear path to positive unit economics demonstrated per cohort

**No, because right now**:
- Problem definition is broad ("decision fatigue") without specific validation
- Competitive analysis shows no clear right to win
- Inventory → platform transition is a strategy document, not a business
- No evidence of founder-market fit in the analysis presented

### Series A Milestones

```
Month  6: ₹15L+ GMV/month, NPS > 40, 25%+ Day-30 retention
Month 12: ₹50L+ GMV/month, positive contribution margin per order
Month 18: 10,000 active customers, LTV:CAC > 2×
Month 24: Platform features live, 50+ sellers, data moat evidence
```

**The single metric that would make this immediately fundable**: Evidence that users who receive AI styling recommendations convert at **2× the rate** of users who browse without recommendations. That one metric proves the entire thesis.

---

## 25. Strategic Review — What Would the Legends Do?

| Legend | What They Would Do | Lesson for ZISUN |
|---|---|---|
| **Mukesh Ambani** | Not build this as a startup — would wait to acquire it post-proof, then integrate into JioMart AI layer | Build something worth acquiring |
| **Jeff Bezos** | Start with one category ("office wear for women"), dominate it, then expand. Obsess over return reasons before building AI. | Narrow before wide |
| **Warren Buffett** | Would not invest. No moat visible. Would wait for 3+ years of profitable operations. | Build a business that earns while you think |
| **Steve Jobs** | Would throw out the product roadmap. Would ask: "What is the one thing that makes users say wow?" and build only that. | Aesthetics IS strategy in fashion |
| **Elon Musk** | First principles: "What is the minimum viable proof that people pay for AI fashion advice?" → Run the experiment with 100 users manually before writing code | Validate the physics before building the rocket |

### Where All Four Would Agree
- Start smaller and prove faster
- Don't claim AI before you have it working
- Customer trust > technology sophistication
- Revenue > vision documents

### Greatest Disagreement
- Ambani: "Scale fast, data is everything" vs. Buffett: "Profitability first, scale when proven"
- Jobs: "One perfect product" vs. Bezos: "Everything for everyone eventually"

---

## 26. Brutal Conclusion & Scorecard

### Classification

> **Good vision, wrong execution sequence.**

The thesis — that commerce is moving from product discovery to decision support — is **directionally correct** and **well-timed**. The problem is that you're trying to build the future product before the present product works.

**You are building Layer 7 thinking while operating at Layer 1 reality.**

---

### Scorecard

| Dimension | Score | Rationale |
|---|---|---|
| **Market Opportunity** | 7/10 | Indian fashion market large and growing; AI in commerce is real and accelerating |
| **Product-Market Fit Potential** | 4/10 | Unvalidated thesis, unclear beachhead customer, generic positioning |
| **Defensibility** | 3/10 | No moat in sight; easily copied; data advantage requires years and scale |
| **Scalability** | 6/10 | Tech stack is solid; unit economics in wholesaler model are problematic |
| **Capital Efficiency** | 3/10 | Wholesale + AI + marketplace = capital-intensive triple bet |
| **Technical Feasibility** | 5/10 | Core commerce: well-built; AI claims: premature by 18-24 months |
| **Probability of Success (as currently planned)** | 3/10 | Very low as described; narrowed version could reach 5-6/10 |

---

### The One Honest Answer

**"If this were your own money, time, and career — would you build this company?"**

> **Yes — but not this version.**

The version worth building:

- **A brutally curated fashion brand for one specific customer** — say, "professional women in Tier-1 cities who need a complete work wardrobe in 20 minutes"
- **Human + LLM hybrid styling** (not "AI recommendation engine")
- **Private label, not wholesaler** — 60-70% GM vs 30-45%
- **Subscription model** — recurring revenue, high margin, relationship-building
- **24 months of behavioral data collection** before writing a single ML model
- **Let the AI roadmap emerge from real evidence**, not architectural ambition
- **Resist the marketplace transition** until the brand is trusted enough that sellers want access to your customers — not because you built infrastructure, but because your customers are loyal enough to matter

---

### The One Thing That Matters Right Now

> **Find 100 customers who would be genuinely devastated if ZISUN disappeared.**
>
> Everything else is noise.

The best founders build Step 1 with Step 7 in mind.
The worst founders build Step 7 without completing Step 1.

---

*Document compiled: June 2026 | Sprint 1 Complete*
*Board Review: Adversarial by design. Its purpose is to be survived, not agreed with.*
*Next milestone: 100 paying customers, no coupon, unprompted return within 60 days.*

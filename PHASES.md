# ZISUN — Production Roadmap: 5-Phase Plan

> **Baseline:** One-commit scaffold. Backend fully mocked (Redis dict, hardcoded JWT UUID, fake Razorpay IDs). Frontend disconnected from backend. Zero tests. UI ~20% of design scope.
> **Target:** Full production-grade platform — real payments, real inventory, real notifications, monitored, tested, and load-validated.

---

## Summary Table

| Phase | Focus | Duration | Exit Gate |
|-------|-------|----------|-----------|
| **1** | Infrastructure Foundation — replace every mock | Weeks 1–2 | User can OTP-login; JWT is real; DB persists |
| **2** | Catalog & Discovery — browse experience | Weeks 2–3 | User can browse products, categories, search |
| **3** | Commerce & Payments — full purchase flow | Weeks 3–4 | User can pay; order confirmed; WhatsApp sent |
| **4** | Content Feed, Admin & Notifications — operations | Weeks 4–5 | Ops team can manage orders/products without SQL |
| **5** | Production Hardening & Launch — ship confidently | Weeks 5–6 | All UAT pass; load test green; Sentry live |

---

## Phase 1 — Infrastructure Foundation
**Weeks 1–2 | Goal: Replace every mock. Nothing is faked at the infrastructure level.**

### 1.1 Backend

#### Database
- [ ] **B-1.1** Add missing models: `Category`, `ContentCard`, `ContentTag`, `ContentProduct`, `AnalyticsEvent`, `RefreshToken`
- [ ] **B-1.2** Generate Alembic initial migration covering ALL current models (User, Product, ProductVariant, Cart, CartItem, Order, OrderItem, Payment, InventoryLock, Fulfillment, Address, OutboxEvent)
- [ ] **B-1.3** Generate Alembic migration for new models (Category, ContentCard, ContentTag, ContentProduct, AnalyticsEvent, RefreshToken)
- [ ] **B-1.4** Add all critical indexes from REQ-07 §3: `orders(user_id, created_at DESC)`, `orders(status, created_at)`, `payments(payment_gateway_id)` UNIQUE, `product_variants(sku)` UNIQUE, `fulfillments(awb_number)` UNIQUE, `fulfillments(external_ref)` UNIQUE, `inventory_locks(product_variant_id, status)`, `inventory_locks(expires_at)`, `outbox_events(published_at, created_at)`
- [ ] **B-1.5** Add `version` column to `ProductVariants` for optimistic locking
- [ ] **B-1.6** Change all monetary columns from `NUMERIC` to `Integer` (paise) — REQ-07 §4
- [ ] **B-1.7** Configure asyncpg connection pool (min=5, max=20) in `database.py`

#### Real Redis
- [ ] **B-1.8** Wire real `aioredis` client in `core/redis.py`; expose `get_redis()` dependency
- [ ] **B-1.9** OTP storage: store `hash(OTP)` (not raw) at key `otp:{phone}`, TTL 300s
- [ ] **B-1.10** OTP attempt counter: key `otp_attempts:{phone}`, TTL 3600s; increment on each wrong attempt
- [ ] **B-1.11** OTP lockout: key `lockout:{phone}`, TTL 3600s; set after 5 failed attempts
- [ ] **B-1.12** OTP generation rate limit: key `otp_gen:{phone}`, counter, TTL 3600s; reject after 5 generations/hr
- [ ] **B-1.13** IP rate limit keys: `rate:{ip}`, TTL 60s; 10 req/min for auth routes, 100 req/min globally
- [ ] **B-1.14** Feed cache: key `feed:page:{n}`, TTL 300s

#### Real JWT (RS256)
- [ ] **B-1.15** Generate RSA-2048 key pair; store private key as env var `JWT_PRIVATE_KEY`, public key as `JWT_PUBLIC_KEY`
- [ ] **B-1.16** Update `core/security.py`: sign with RS256 using private key; verify with public key
- [ ] **B-1.17** Add `jti` (UUID) claim to access tokens for revocation support
- [ ] **B-1.18** Implement `get_current_user` dependency: decode RS256 JWT, fetch user from DB, inject into route
- [ ] **B-1.19** Implement `require_role(role)` dependency factory for RBAC (user / admin / operations / finance)
- [ ] **B-1.20** Replace ALL hardcoded `UUID("12345678...")` mock returns with real JWT middleware

#### Auth Service — Real Implementation
- [ ] **B-1.21** `send_otp`: validate `^\+91[6-9]\d{9}$`, check lockout key, check gen rate limit, generate cryptographically random 6-digit OTP via `secrets.randbelow`, hash with bcrypt, store in Redis, call Twilio
- [ ] **B-1.22** `verify_otp`: check lockout key first, increment attempt counter, compare bcrypt hash, delete OTP key on success, reset attempt counter
- [ ] **B-1.23** Twilio SMS integration: `twilio.rest.Client` initialized from env vars; send OTP message; mask phone number in logs (`+9198******10`)
- [ ] **B-1.24** Token refresh endpoint: `POST /api/v1/auth/refresh` — validate cookie refresh token hash, rotate (new refresh token, invalidate old), return new access token
- [ ] **B-1.25** Logout endpoint: `POST /api/v1/auth/logout` — delete refresh token from DB/Redis, clear cookie
- [ ] **B-1.26** Store refresh token hash in `RefreshToken` table (one-time use, 30-day expiry)

#### API Standards
- [ ] **B-1.27** Global response envelope middleware: wrap all responses in `{"success": true, "data": ...}` / `{"success": false, "error": {"code": ..., "message": ...}}`
- [ ] **B-1.28** Global exception handler: catch all unhandled exceptions → standard error envelope + Sentry capture
- [ ] **B-1.29** Rate limiting middleware: Redis-backed, 100 req/IP/min global, 10 req/IP/min for `/auth/*`; return 429 with `Retry-After` header
- [ ] **B-1.30** Request ID middleware: inject `X-Request-ID` header on every response for traceability
- [ ] **B-1.31** Structured JSON logging: replace `print()` and raw `logger.info` with structured log dict (`request_id`, `user_id`, `duration_ms`)
- [ ] **B-1.32** Admin router: mount all admin endpoints under `/api/admin/v1/` prefix with `require_role("admin")` dependency

#### Config & Environment
- [ ] **B-1.33** Extend `Settings` with all required env vars: `REDIS_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `SENTRY_DSN`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `CLOUDFLARE_CDN_BASE_URL`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- [ ] **B-1.34** On startup, validate all required env vars are set; crash fast with a descriptive error if any are missing

### 1.2 Frontend

- [ ] **F-1.1** Create `lib/api.ts`: Axios instance with `baseURL=NEXT_PUBLIC_API_URL`, `Content-Type: application/json`
- [ ] **F-1.2** Auth interceptor: attach `Authorization: Bearer <access_token>` from in-memory store on every request
- [ ] **F-1.3** Response interceptor: on 401, call refresh endpoint, update token, retry original request once; on second 401, redirect to login
- [ ] **F-1.4** `store/useAuthStore.ts`: Zustand store with `user`, `accessToken`, `setAuth()`, `clearAuth()`, `isAuthenticated`
- [ ] **F-1.5** Login page `/login`: phone number input with `+91` prefix, Indian number validation, "Send OTP" button, loading state
- [ ] **F-1.6** OTP page `/login/verify`: 6-box OTP input (auto-advance, paste support), resend countdown timer (60s), "Verify" button, error state for wrong OTP, lockout message for 5 failures
- [ ] **F-1.7** `middleware.ts` (Next.js): protect routes — redirect unauthenticated users from `/orders`, `/profile`, `/wishlist`, `/checkout` to `/login`; redirect authenticated users away from `/login`
- [ ] **F-1.8** Error boundary component: wraps all page-level content, shows friendly error UI with retry button
- [ ] **F-1.9** Toast/snackbar notification system (success, error, info variants)

### 1.3 Infrastructure

- [ ] **I-1.1** `backend/.env.example`: document all required env vars with placeholder values and descriptions
- [ ] **I-1.2** `frontend/.env.example`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_SENTRY_DSN`
- [ ] **I-1.3** `docker-compose.yml`: add health checks for `postgres` (`pg_isready`), `redis` (`redis-cli ping`), `backend` (`/health`); add depends_on with `condition: service_healthy`
- [ ] **I-1.4** `docker-compose.yml`: add `celery-worker` and `celery-beat` services
- [ ] **I-1.5** `backend/entrypoint.sh`: run `alembic upgrade head` before starting uvicorn
- [ ] **I-1.6** GitHub Actions: add `postgres` and `redis` service containers to `backend-test` job; set proper env vars for test DB; uncomment and fix pytest step
- [ ] **I-1.7** `.gitignore`: ensure `.env`, `*.pem`, `private_key.pem` are ignored

### 1.4 Exit Criteria — Phase 1
- [ ] `docker compose up` brings up all services with no manual intervention
- [ ] POST `/api/v1/auth/send-otp` sends a real SMS to a test number via Twilio
- [ ] POST `/api/v1/auth/verify-otp` returns a real RS256 JWT
- [ ] GET `/api/v1/catalog/products` returns data persisted from the database
- [ ] 5 wrong OTPs lock the phone number for 1 hour
- [ ] GitHub Actions CI passes with pytest running (even if only smoke tests)

---

## Phase 2 — Catalog & Discovery
**Weeks 2–3 | Goal: Users can browse products, categories, and product details using real API data.**

### 2.1 Backend

#### Category & Catalog
- [ ] **B-2.1** Category endpoints: `GET /api/v1/catalog/categories` (list), `GET /api/v1/catalog/categories/{slug}` (detail with products)
- [ ] **B-2.2** Product listing: add `category_id` filter, `is_active` filter, `sort_by` (price_asc, price_desc, newest) to `GET /api/v1/catalog/products`
- [ ] **B-2.3** Product detail: eager-load variants, media, and category in a single query (no N+1); include stock status per variant
- [ ] **B-2.4** `ProductMedia` model: `id`, `product_id`, `url`, `type` (IMAGE/VIDEO), `display_order`; migration
- [ ] **B-2.5** Media upload endpoint: `POST /api/admin/v1/media/upload` — generate presigned PUT URL for Cloudflare R2, return CDN URL; admin only
- [ ] **B-2.6** On media upload: trigger auto-thumbnail generation — 3 sizes (150px, 400px, 800px) via Cloudflare Image Resizing or Lambda; store URLs back on `ProductMedia`
- [ ] **B-2.7** Full-text product search: `GET /api/v1/catalog/search?q=...` using PostgreSQL `tsvector` on `name` + `description`; paginated
- [ ] **B-2.8** Feed endpoint: `GET /api/v1/feed?page=1&limit=20` — fetch ContentCards with eager-loaded products (single JOIN query); filter out cards with 0 active products; cache result in Redis for 300s
- [ ] **B-2.9** Pincode serviceability: `GET /api/v1/checkout/pincode/{pincode}/check` — call Shiprocket serviceability API; cache result in Redis for 24h

#### Wishlist & Addresses
- [ ] **B-2.10** Wishlist endpoints: `POST /api/v1/wishlist/items`, `DELETE /api/v1/wishlist/items/{variant_id}`, `GET /api/v1/wishlist` (user JWT required)
- [ ] **B-2.11** `Wishlist` and `WishlistItem` models; migration
- [ ] **B-2.12** Address endpoints: `GET /api/v1/addresses`, `POST /api/v1/addresses`, `PUT /api/v1/addresses/{id}`, `DELETE /api/v1/addresses/{id}`, `POST /api/v1/addresses/{id}/set-default`
- [ ] **B-2.13** Address validation: pincode format, Indian state enum validation

### 2.2 Frontend

#### Routing & Data Layer
- [ ] **F-2.1** Create `lib/queries/` folder: React Query (TanStack Query) setup; `queryClient` provider in layout
- [ ] **F-2.2** `queries/catalog.ts`: `useProducts()`, `useProduct(id)`, `useCategories()`, `useCategory(slug)`, `useSearch(q)`
- [ ] **F-2.3** `queries/wishlist.ts`: `useWishlist()`, `useAddToWishlist()`, `useRemoveFromWishlist()`
- [ ] **F-2.4** Replace all hardcoded `CATEGORIES` mock data in `page.tsx` with `useCategories()` hook

#### Pages
- [ ] **F-2.5** Shop page `/shop`: product grid (2-column), filter bar (category, price range, sort), pagination/infinite scroll, skeleton loading
- [ ] **F-2.6** Category page `/category/[slug]`: category header image + name, filtered product grid, breadcrumb
- [ ] **F-2.7** Product detail page `/product/[id]`: image carousel (swipeable), title, price (paise → ₹ formatted), description, variant selector (size + color chips), stock badge, "Add to Cart" / "Out of Stock" / "Add to Wishlist" buttons
- [ ] **F-2.8** Search page `/search`: search input (debounced 300ms), results grid, "No results" state, recent searches (localStorage)
- [ ] **F-2.9** Wishlist page `/wishlist`: saved products grid, remove button, "Move to Cart" button, empty state illustration
- [ ] **F-2.10** Profile page `/profile`: display name, phone (masked), "Edit Profile" form, address list, "Order History" link, "Logout" button

#### UI Components
- [ ] **F-2.11** `ProductCard` component: next/image with blur placeholder, title, price, wishlist toggle, out-of-stock overlay
- [ ] **F-2.12** `CategoryCard` component: next/image, category name, item count — replace current static implementation
- [ ] **F-2.13** `VariantSelector` component: size + color chips, selected state, disabled/out-of-stock state with strikethrough
- [ ] **F-2.14** `SearchBar` component: debounced input, suggestions dropdown, clear button
- [ ] **F-2.15** Skeleton loading components: `ProductCardSkeleton`, `CategoryCardSkeleton`, `ProductDetailSkeleton`
- [ ] **F-2.16** Replace hero `<img>` with `next/image` (explicit width/height, blur placeholder, priority flag for LCP)
- [ ] **F-2.17** Add `next/image` to all `ProductCard`, `CategoryCard`, `BottomSheet` images

### 2.3 Infrastructure
- [ ] **I-2.1** Cloudflare R2 bucket setup: CORS policy, presigned URL generation tested
- [ ] **I-2.2** CDN signed URL generation utility: `core/storage.py` — generates 1hr TTL signed URLs
- [ ] **I-2.3** Seed script: `scripts/seed.py` — insert 4 categories, 20 products with variants and media for dev/staging

### 2.4 Exit Criteria — Phase 2
- [ ] Frontend fetches real product/category data from backend (no hardcoded data)
- [ ] User can search for a product and see results
- [ ] User can add/remove items from wishlist (persisted to DB)
- [ ] Product detail page shows correct stock per variant (out-of-stock shows disabled state)
- [ ] next/image used on all image surfaces; no `<img>` tags in production paths
- [ ] No N+1 queries in feed or product listing endpoints (verified via query logging)

---

## Phase 3 — Commerce & Payments
**Weeks 3–4 | Goal: Full end-to-end purchase flow with real Razorpay, real inventory locking, and real WhatsApp confirmation.**

### 3.1 Backend

#### Cart
- [ ] **B-3.1** GET `/api/v1/cart`: return current user's cart with items, variants, prices — used to sync frontend state on load
- [ ] **B-3.2** DELETE `/api/v1/cart/items/{item_id}`: remove item from cart
- [ ] **B-3.3** PUT `/api/v1/cart/items/{item_id}`: update quantity; enforce stock limit
- [ ] **B-3.4** Cart total calculation: always computed server-side from DB prices; return as `cart_total` in response

#### Checkout & Razorpay
- [ ] **B-3.5** Real Razorpay SDK: install `razorpay` Python SDK; initialize with `key_id` + `key_secret` from env
- [ ] **B-3.6** Checkout initiation: server-side price recalculation from DB → call `razorpay.order.create(amount, currency="INR")` → return real `razorpay_order_id`; enforce `X-Idempotency-Key` header
- [ ] **B-3.7** Razorpay HMAC middleware: `app/middleware/razorpay_hmac.py` — verify `X-Razorpay-Signature` using `HMAC-SHA256(razorpay_webhook_secret, payload_body)`; reject with 400 before reaching route handler; log suspicious IPs
- [ ] **B-3.8** Razorpay webhook handler (real): handle `payment.captured` event — idempotency check via `UNIQUE(payment_gateway_id)`, update order to `PAID`, create `Payment` record, write `OutboxEvent(type=ORDER_PAID)`, commit atomically
- [ ] **B-3.9** Handle `payment.failed` event: update order to `FAILED_PAYMENT`, release inventory locks
- [ ] **B-3.10** Handle partial capture: if `captured_amount != order_amount`, set order status to `PAYMENT_MISMATCH`, alert admin via Sentry
- [ ] **B-3.11** Handle orphaned payment: if webhook arrives for a cancelled order, flag as `ORPHANED_PAYMENT`, do not change order status

#### Order State Machine
- [ ] **B-3.12** Enforce valid transitions in a `OrderStateMachine` class: `CREATED→PAYMENT_PENDING`, `PAYMENT_PENDING→PAID`, `PAYMENT_PENDING→FAILED_PAYMENT`, `PAID→PACKED`, `PACKED→SHIPPED`, `SHIPPED→DELIVERED`, `PAID→CANCELLED`, `PACKED→CANCELLED`; all other transitions raise `409 Conflict`
- [ ] **B-3.13** Inventory lock release: on `CANCELLED`, `FAILED_PAYMENT`, or lock `EXPIRED` — restore `ProductVariant.stock` within the same DB transaction
- [ ] **B-3.14** Order endpoints: `GET /api/v1/orders` (user's orders, paginated), `GET /api/v1/orders/{id}` (detail with items, payment, fulfillment status)

#### Background Workers (Celery)
- [ ] **B-3.15** Celery app: `celery_app.py` with Redis broker + Redis result backend
- [ ] **B-3.16** Task: `cleanup_zombie_orders` — runs every 5 minutes via beat; query `orders WHERE status=PAYMENT_PENDING AND created_at < NOW()-30min`; cancel each, release locks, write `OutboxEvent(type=ORDER_CANCELLED)`
- [ ] **B-3.17** Task: `release_expired_locks` — runs every 5 minutes; query `inventory_locks WHERE status=ACTIVE AND expires_at < NOW()`; mark expired, restore stock
- [ ] **B-3.18** Outbox worker task: runs every 30s; poll `outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 50`; dispatch each event to appropriate handler (WhatsApp, SMS, etc.); mark `published_at = NOW()` on success
- [ ] **B-3.19** Task: `razorpay_daily_reconciliation` — runs daily at 02:00 IST; fetch Razorpay settlement API; compare with internal `payments` table; log discrepancies to admin

#### WhatsApp & SMS Notifications
- [ ] **B-3.20** WhatsApp service: `services/whatsapp.py` — call Meta WhatsApp Business API v18+ with pre-approved template `ORDER_CONFIRMATION`; include order ID, amount, items summary
- [ ] **B-3.21** SMS fallback: if WhatsApp delivery fails or user opts out, send SMS via Twilio with same information
- [ ] **B-3.22** `ORDER_PAID` outbox handler: send WhatsApp confirmation within 60s of payment; on failure, fall back to SMS; must complete within 120s (hard limit per REQ-11)
- [ ] **B-3.23** Webhook signature verification: WhatsApp inbound `POST /webhooks/whatsapp` — verify `X-Hub-Signature-256` header

### 3.2 Frontend

#### Cart (Real Sync)
- [ ] **F-3.1** On app load (if authenticated): fetch `GET /api/v1/cart` and hydrate Zustand store
- [ ] **F-3.2** `addItem`, `removeItem`, `updateQuantity` mutations call backend API; optimistic update on success, rollback on error
- [ ] **F-3.3** Cart item count badge shows real server count on page load

#### Checkout Flow (Multi-Step)
- [ ] **F-3.4** Checkout page `/checkout`: guarded (must be authenticated)
- [ ] **F-3.5** Step 1 — Cart review: item list (editable quantity), subtotal, "Proceed" button
- [ ] **F-3.6** Step 2 — Address: address list (select existing or add new), pincode serviceability check (show "Delivery not available" if failed), address form with fields (line1, city, state, pincode)
- [ ] **F-3.7** Step 3 — Payment: order summary, "Pay ₹X" button; load Razorpay checkout script; open Razorpay modal on click
- [ ] **F-3.8** Razorpay integration: `razorpay.open({key, amount, order_id, prefill: {contact}, handler: onPaymentSuccess})`; on success, call `POST /api/v1/checkout/verify` with `razorpay_payment_id` + `razorpay_signature`
- [ ] **F-3.9** Step 4 — Confirmation: order ID, WhatsApp confirmation hint ("Check your WhatsApp"), order summary; "Track Order" link
- [ ] **F-3.10** Out-of-stock guard: before initiating checkout, validate stock via API; show error per item if stock changed since cart was filled

#### Orders
- [ ] **F-3.11** Order history page `/orders`: list of orders with status chip, date, amount, "View Details" link; empty state
- [ ] **F-3.12** Order detail page `/orders/[id]`: status timeline (stepper: Placed → Paid → Packed → Shipped → Delivered), items list, address, payment method, AWB number + track link if shipped
- [ ] **F-3.13** Real-time status polling: on `/orders/[id]`, poll order status every 30s while status is not terminal (DELIVERED, CANCELLED, RETURNED)

### 3.3 Infrastructure
- [ ] **I-3.1** Celery services in `docker-compose.yml`: `celery-worker` (concurrency=4), `celery-beat` (scheduler)
- [ ] **I-3.2** Razorpay test mode: use test key for staging; real key only in production
- [ ] **I-3.3** WhatsApp: submit and get approved 3 message templates (ORDER_CONFIRMATION, ORDER_SHIPPED, ORDER_CANCELLED) before go-live — 5 business day lead time

### 3.4 Exit Criteria — Phase 3
- [ ] End-to-end purchase: user browses → adds to cart → checks out → Razorpay modal → payment captured → order status = PAID → WhatsApp received
- [ ] Zombie order cleanup: PAYMENT_PENDING order > 30min auto-cancelled, stock restored
- [ ] 100 concurrent checkout requests with `stock=1`: exactly 1 succeeds, 99 get 409 (UAT-03)
- [ ] Duplicate Razorpay webhook: idempotent — second webhook returns 200 with no DB side effects (UAT-05)
- [ ] Invalid HMAC signature on webhook: returns 400, no business logic executed

---

## Phase 4 — Content Feed, Admin & Notifications
**Weeks 4–5 | Goal: Ops team can manage the platform. The shoppable feed is fully API-driven with real content.**

### 4.1 Backend

#### Content Feed
- [ ] **B-4.1** `ContentCard` model: `id`, `type` (IMAGE/VIDEO), `media_url`, `thumbnail_url`, `caption`, `status` (DRAFT/PUBLISHED), `published_at`, `created_by`; migration
- [ ] **B-4.2** `ContentTag` model: `id`, `content_card_id`, `tag_name`, `tag_type` (occasion/season/price_band/category); migration
- [ ] **B-4.3** `ContentProduct` join: `id`, `content_card_id`, `product_id`, `display_order`, `position_x`, `position_y`; migration
- [ ] **B-4.4** Feed API `GET /api/v1/feed`: single JOIN query across ContentCards + ContentProducts + Products + ProductVariants; filter out DRAFT cards and cards with 0 active products; cursor-based pagination; Redis cache (TTL 300s)
- [ ] **B-4.5** Content CRUD admin endpoints: `POST`, `GET`, `PUT`, `DELETE /api/admin/v1/content` (admin only); include `PATCH /api/admin/v1/content/{id}/publish`
- [ ] **B-4.6** Content ↔ Product linking: `POST /api/admin/v1/content/{id}/products` with `product_id`, `position_x`, `position_y`, `display_order`
- [ ] **B-4.7** Video upload: presigned R2 URL; store `media_url` (full video) + `thumbnail_url` (first-frame extracted by ffmpeg Celery task)
- [ ] **B-4.8** Celery task: `generate_video_thumbnail` — extract first frame at 0s via ffmpeg; generate 3 image size variants; upload to R2; update `ContentCard.thumbnail_url`

#### Admin Endpoints
- [ ] **B-4.9** `GET /api/admin/v1/orders`: paginated (50/page), server-side filters (status, date range, payment method), search by `order_id` or phone
- [ ] **B-4.10** `GET /api/admin/v1/orders/{id}`: full order detail with customer info, address, items, state history, payment, fulfillment
- [ ] **B-4.11** `POST /api/admin/v1/orders/{id}/status`: advance order to next valid state via `OrderStateMachine`; admin + operations roles; confirmation required for destructive actions (Cancel, Refund)
- [ ] **B-4.12** `POST /api/admin/v1/payments/{id}/refund`: call Razorpay Refunds API; admin role only; amount in paise; write `OutboxEvent(type=ORDER_REFUNDED)` → trigger WhatsApp notification
- [ ] **B-4.13** `GET /api/admin/v1/products`: admin product list with all variants, stock, status
- [ ] **B-4.14** `PUT /api/admin/v1/products/{id}`: edit product name, description, price, category; admin only
- [ ] **B-4.15** `DELETE /api/admin/v1/products/{id}`: soft-delete (set `deleted_at`); validate no PAID/PACKED orders reference this product
- [ ] **B-4.16** `POST /api/admin/v1/products/{id}/variants/{variant_id}/stock`: update stock for a single variant; admin + operations roles
- [ ] **B-4.17** `POST /api/admin/v1/products/bulk-stock`: accept CSV `(sku, new_stock)`; validate each row (sku exists, stock >= 0); apply all or reject all; return summary
- [ ] **B-4.18** `GET /api/admin/v1/reconciliation`: return Razorpay settlement summary vs internal payments for Finance role

#### Shiprocket
- [ ] **B-4.19** Shiprocket auth: `POST /v1/external/auth/login` to fetch JWT; cache token in Redis with TTL (24h)
- [ ] **B-4.20** AWB creation: when order moves to PACKED, call Shiprocket `POST /orders/create/adhoc`; use ZISUN `order_id` as `external_ref` for idempotency; store `awb_number` in `Fulfillment` table
- [ ] **B-4.21** Shiprocket webhook `POST /webhooks/shiprocket`: verify token header; parse tracking events; update `Fulfillment.status` and `Order.status` accordingly
- [ ] **B-4.22** Shiprocket fallback: if AWB creation fails, alert admin dashboard with "Manual AWB Entry Required" flag; do not block order flow

#### Analytics Events
- [ ] **B-4.23** `POST /api/v1/analytics/events`: accept event batch `[{event_type, session_id, user_id?, properties}]`; write to `AnalyticsEvent` table; async (non-blocking, fire-and-forget via background task)
- [ ] **B-4.24** Instrument key events on backend: `order_placed`, `payment_captured`, `order_cancelled` written automatically on state transitions

### 4.2 Frontend

#### Shoppable Feed (Real)
- [ ] **F-4.1** Replace hardcoded hero image with real `GET /api/v1/feed` data
- [ ] **F-4.2** `FeedCard` component: full-screen image/video card, caption overlay, "Shop Now" button with price
- [ ] **F-4.3** Infinite scroll feed: `IntersectionObserver` to trigger next page fetch at 80% scroll depth; prepend skeleton cards while fetching
- [ ] **F-4.4** Virtualized feed: use `@tanstack/react-virtual` to remove off-screen DOM nodes; prevent crash on low-RAM Android
- [ ] **F-4.5** Video cards: `<video autoPlay muted loop playsInline poster={thumbnailUrl}`; tap-to-toggle mute; show poster immediately while video buffers
- [ ] **F-4.6** Offline handling: PWA service worker caches last 20 feed cards; show "You're offline" banner; no blank white screen
- [ ] **F-4.7** Analytics events: fire `content_viewed` on card enter viewport (dwell > 2s), `product_viewed` on bottom sheet open, `add_to_cart`, `checkout_initiated`; batch and send every 10s or on page unload

#### Bottom Sheet (Real)
- [ ] **F-4.8** Bottom sheet: fetch real product data from `GET /api/v1/catalog/products/{id}`; show actual images, price, variants
- [ ] **F-4.9** Out-of-stock variant: disable "Add to Cart"; show "Notify Me" button (disabled placeholder for Phase 2)
- [ ] **F-4.10** Image carousel inside bottom sheet: swipeable, with dot indicators

#### Admin Dashboard (`/admin`)
- [ ] **F-4.11** Admin layout: sidebar nav (Orders, Products, Inventory, Content, Reconciliation); protected by `role=admin` check in middleware
- [ ] **F-4.12** Orders list: table with columns (Order ID, Customer, Date, Status chip, Amount, Action); server-side filters; global search by order ID / phone; pagination (50/page)
- [ ] **F-4.13** Order detail: customer info card, items table, status stepper, action buttons ("Mark Packed", "Mark Shipped", "Cancel" — each with confirmation modal for destructive actions)
- [ ] **F-4.14** Product list: table with name, SKU, category, stock, status; "Create Product" button; "Edit" / "Deactivate" per row
- [ ] **F-4.15** Product create/edit form: name, description, base price (₹), category dropdown, variant rows (SKU, size, color, stock, price delta), image upload (drag-and-drop with preview)
- [ ] **F-4.16** Inventory dashboard: variant-level stock table (product name, SKU, current stock, "Update" inline); bulk CSV upload (download template, upload, preview diff, confirm)
- [ ] **F-4.17** Content manager: list of content cards (thumbnail, caption, status badge, published date); "Create", "Edit", "Publish/Unpublish", "Delete"
- [ ] **F-4.18** Content create/edit: media upload (image or video), caption input, product linker (search + attach products), tag assignment (occasion, season, price band)
- [ ] **F-4.19** Finance reconciliation view: settlements table; highlight discrepancies in red; export to CSV

### 4.3 Infrastructure
- [ ] **I-4.1** ffmpeg installed in backend Docker image; `generate_video_thumbnail` Celery task tested
- [ ] **I-4.2** WhatsApp message templates (ORDER_CONFIRMATION, ORDER_SHIPPED, ORDER_CANCELLED, ORDER_REFUNDED) submitted to Meta; test on sandbox before production

### 4.4 Exit Criteria — Phase 4
- [ ] Ops team can: list orders, filter by status, mark an order as PACKED, view tracking AWB — without touching SQL
- [ ] Content team can: create a content card, upload an image, link 2 products, publish — card appears in feed within 5 minutes (cache TTL)
- [ ] Admin can soft-delete a product — it disappears from feed and catalog for end users
- [ ] Admin initiates refund → Razorpay refund created → user gets WhatsApp notification
- [ ] Shiprocket: AWB number appears on Order detail after Admin clicks "Mark Packed"
- [ ] Analytics events firing for `content_viewed`, `add_to_cart`, `checkout_initiated`

---

## Phase 5 — Production Hardening & Launch
**Weeks 5–6 | Goal: Pass all UAT scenarios, green load tests, Sentry live, security hardened. Ship.**

### 5.1 Backend — Security

- [ ] **B-5.1** RS256 key rotation mechanism: document quarterly key rotation procedure; implement `jti` blocklist in Redis for immediate token revocation
- [ ] **B-5.2** Security headers middleware: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy` (strict)
- [ ] **B-5.3** CORS: strict allowlist of ZISUN frontend domains only; no wildcard; `allow_credentials=True` with specific origins
- [ ] **B-5.4** OTP raw value: assert never written to application logs or Sentry payloads; add unit test to verify
- [ ] **B-5.5** Phone number masking: all log statements that include phone numbers use masking utility `mask_phone("+919876543210")` → `"+9198****3210"`
- [ ] **B-5.6** Validate all monetary inputs are integers (paise); reject floats/decimals at Pydantic schema level
- [ ] **B-5.7** SQL injection audit: confirm zero raw SQL string interpolation; grep codebase for `f"SELECT` / `f"INSERT`
- [ ] **B-5.8** Admin endpoint role check audit: verify every `/api/admin/v1/*` route has `Depends(require_role("admin"))` or `require_role("operations")`; automated test to confirm 403 for `user` role tokens

### 5.2 Backend — Observability

- [ ] **B-5.9** Sentry backend: `sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1, environment=ENV)`; attach `user_id` and `request_id` to every Sentry event; P0 alert rule for any exception in `/webhooks/razorpay` or `checkout/initiate`
- [ ] **B-5.10** Structured log fields: every log entry includes `timestamp`, `level`, `service`, `request_id`, `user_id` (nullable), `duration_ms`, `status_code`
- [ ] **B-5.11** Health check `/health`: check DB connection (`SELECT 1`), Redis ping, Celery worker heartbeat; return degraded status per component rather than binary up/down

### 5.3 Backend — Test Suite

#### Unit Tests (pytest + pytest-asyncio)
- [ ] **B-5.12** `tests/unit/test_order_state_machine.py`: assert all 8 valid transitions succeed; assert all invalid transitions (e.g., CANCELLED→SHIPPED, DELIVERED→PAID) raise `409`
- [ ] **B-5.13** `tests/unit/test_auth_service.py`: OTP generation is 6 digits and cryptographically random; 5 wrong OTPs trigger lockout; correct OTP clears lockout; rate limit triggers on 6th generation
- [ ] **B-5.14** `tests/unit/test_checkout_service.py`: `initiate_checkout` with empty cart raises 400; price is computed server-side; stock is decremented atomically; inventory lock is created
- [ ] **B-5.15** `tests/unit/test_payment_service.py`: `payment.captured` webhook creates Payment record; second identical webhook returns 200 with no new DB record (idempotency); `payment.failed` releases locks; orphaned payment (order already cancelled) is flagged
- [ ] **B-5.16** Coverage: enforce 80% branch coverage on all modules; 100% branch coverage on `services/checkout.py` and `services/payment.py` (via `--cov-fail-under`)

#### Integration Tests
- [ ] **B-5.17** `tests/integration/test_concurrency.py`: spin up 100 async tasks all calling `add_to_cart` then `initiate_checkout` for a variant with `stock=1`; assert exactly 1 succeeds (200), 99 fail (409), DB shows `stock=0`
- [ ] **B-5.18** `tests/integration/test_razorpay_webhook.py`: use real Razorpay webhook JSON fixture; verify HMAC validation passes for valid signature; verify 400 for tampered payload; verify idempotency on duplicate
- [ ] **B-5.19** `tests/integration/test_zombie_cleanup.py`: insert `PAYMENT_PENDING` order with `created_at = NOW() - 35min`; run cleanup task synchronously; assert order is `CANCELLED` and `inventory_locks.status = RELEASED`

### 5.4 Frontend — Performance & PWA

- [ ] **F-5.1** Verify `next/image` on 100% of image surfaces (CI lint rule: no `<img>` tags except in explicitly excluded components)
- [ ] **F-5.2** Feed virtualization: measure scroll FPS on a low-end Android emulator (Moto G4 equivalent); target ≥ 55 FPS
- [ ] **F-5.3** PWA: `next-pwa` plugin; `manifest.json` with icons, name, theme color (#6B3F2A), display=standalone; service worker caches feed page and assets
- [ ] **F-5.4** Offline mode: service worker serves cached feed with stale data + "You're offline" banner; cart interactions queue and retry on reconnect
- [ ] **F-5.5** CLS: all images have explicit `width` + `height` or `fill` with container; run Lighthouse CLS check; target < 0.1
- [ ] **F-5.6** LCP: hero image has `priority` prop; measure LCP on simulated 4G (Chrome DevTools throttling); target < 2s P95
- [ ] **F-5.7** Bundle size: run `next build` and check JS bundle; split admin routes into separate chunk; no admin code in user-facing bundle

### 5.5 Frontend — Accessibility & Sentry

- [ ] **F-5.8** All interactive elements have `aria-label` or visible label
- [ ] **F-5.9** Touch targets: all buttons/icons ≥ 44×44pt (CSS min-width/height)
- [ ] **F-5.10** Keyboard navigation: Tab order is logical on all pages; modal/drawer traps focus; Esc closes overlays
- [ ] **F-5.11** Sentry frontend: `@sentry/nextjs` with `NEXT_PUBLIC_SENTRY_DSN`; capture unhandled promise rejections; attach user ID post-login; P0 alert for checkout or payment failures

### 5.6 Load Testing (Locust)

- [ ] **I-5.1** `locustfile.py`: 3 scenarios
  1. **Catalog Browse** (200 VUs): GET /feed, GET /catalog/products, GET /catalog/products/{id} — pass criteria: P95 < 500ms, zero pool exhaustion
  2. **Concurrent Checkout** (50 VUs): authenticate → add to cart → initiate checkout — pass criteria: zero oversells, zero deadlocks, P95 < 800ms
  3. **Webhook Flood** (1 VU, 1000 iterations): POST /webhooks/razorpay with same payload — pass criteria: all return 200, zero duplicate Payment records
- [ ] **I-5.2** Staging DB seeded with production-scale data: 100k products, 10k past orders, 1k users

### 5.7 CI/CD Pipeline

- [ ] **I-5.3** GitHub Actions `backend-test` job: lint (flake8 E9/F63/F7/F82 hard fail) → pytest with coverage → coverage fail-under 80%
- [ ] **I-5.4** GitHub Actions `migration-check` job: run `alembic check` to detect model changes without a migration file; fail PR if migration is missing
- [ ] **I-5.5** GitHub Actions `frontend-test` job: lint → type-check → build (existing) + add Lighthouse CI score check (LCP < 2.5s, CLS < 0.1)
- [ ] **I-5.6** GitHub Actions `deploy` job (on merge to main): build Docker images → push to registry → SSH deploy to server → run `alembic upgrade head` → health check; rollback automatically if health check fails

### 5.8 Docker — Production Grade

- [ ] **I-5.7** Backend Dockerfile: multi-stage (builder: install deps; runtime: copy only site-packages + app; run as non-root user `appuser`); no `pip install` in runtime stage
- [ ] **I-5.8** Frontend Dockerfile: multi-stage (`next build` with `output: 'standalone'`; copy `.next/standalone`); run as non-root user
- [ ] **I-5.9** `docker-compose.prod.yml`: no volume mounts of source code; secrets injected via environment; resource limits (CPU, memory) per service
- [ ] **I-5.10** `backend/entrypoint.sh`: check DB is ready before running Alembic; check Redis is ready before starting uvicorn

### 5.9 UAT Checklist (REQ-15)

- [ ] **UAT-01** First-time user completes purchase end-to-end → order confirmed, WhatsApp received < 3 min
- [ ] **UAT-02** Checkout for out-of-stock item → blocked by UI, "Out of stock" shown, no order created
- [ ] **UAT-03** Two users simultaneously checkout for last unit → one succeeds, one gets "stock unavailable", zero oversell
- [ ] **UAT-04** User abandons payment → 30-min cron cancels order, stock restored, no orphaned order
- [ ] **UAT-05** Duplicate Razorpay webhook → second returns 200, no duplicate Shiprocket fulfillment
- [ ] **UAT-06** Admin cancels PAID order → Razorpay refund called, WhatsApp sent to user, stock restored
- [ ] **UAT-07** Network drop at payment submission → app handles offline gracefully, session restored on reconnect
- [ ] **UAT-08** Admin bulk CSV stock update → DB matches CSV exactly, malformed rows rejected

### 5.10 MVP Exit Criteria (PRD §12)

- [ ] 100 successful paid orders processed (test orders OK)
- [ ] Payment success rate > 96% over 50 test transactions
- [ ] Zero inventory oversell incidents in 1,000 concurrent-request load test
- [ ] Admin dashboard used successfully by a non-engineer for 48 hours straight
- [ ] Sentry has zero P0 unresolved alerts
- [ ] All 8 UAT scenarios pass in staging

---

## What Is Explicitly Out of Scope (PRD-confirmed Phase 2+)

| Item | Phase |
|------|-------|
| Cash on Delivery (COD) | Phase 2 |
| Coupon / discount engine | Phase 2 |
| Review & ratings | Phase 2 |
| Full return & refund flow (Shiprocket reverse pickup) | Phase 2 |
| WhatsApp conversational bot (intent classification) | Phase 2 |
| In-app search (beyond basic PostgreSQL FTS) | Phase 2 |
| Push notifications (FCM / OneSignal) | Phase 3 |
| ML-based personalized feed ranking | Phase 3 |
| Vendor onboarding portal | Phase 4 |
| Multi-region deployment | Phase 4 |
| AR try-on | Year 2+ |

---

## Task Count Summary

| Phase | Backend | Frontend | Infrastructure | Total |
|-------|---------|----------|----------------|-------|
| 1 — Foundation | 34 | 9 | 7 | **50** |
| 2 — Catalog & Discovery | 13 | 17 | 3 | **33** |
| 3 — Commerce & Payments | 23 | 13 | 3 | **39** |
| 4 — Content & Admin | 24 | 19 | 2 | **45** |
| 5 — Production Hardening | 19 | 11 | 10 | **40** |
| **Total** | **113** | **69** | **25** | **207** |

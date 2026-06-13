# ZISUN — Release 2 Roadmap: AI-Powered Platform
## 6-Month Plan | June 2026 – December 2026

> **Baseline:** Release 1 complete — real payments, real inventory, admin dashboard,
> WhatsApp notifications, 68% test coverage, CI green.
>
> **Target:** AI-native fashion commerce platform — personalized feeds, visual search,
> conversational WhatsApp bot, demand forecasting, fraud detection, AR try-on prototype.

---

## Executive Summary

| Sprint | Focus | Months | Exit Gate |
|--------|-------|--------|-----------|
| **S1** | Commerce Completion + ML Infrastructure | Month 1 | COD live; coupons live; pgvector + MLflow running |
| **S2** | Smart Search & Discovery | Month 2 | Semantic search P95 < 200ms; visual search live |
| **S3** | Personalization Engine | Month 3 | ML feed live; CTR ≥ 12%; A/B framework operational |
| **S4** | Conversational AI — WhatsApp Bot | Month 4 | Bot handles 80% of order queries without human |
| **S5** | Operational Intelligence | Month 5 | Demand forecast MAPE < 20%; fraud detection live |
| **S6** | Scale, Returns & AR Prototype | Month 6 | Full return flow live; 500 VU load test green; AR POC shipped |

---

## ML/AI Technology Stack

```
Models & Training      MLflow + Weights & Biases (experiment tracking)
Feature Store          Feast (offline: PostgreSQL, online: Redis)
Vector Database        pgvector (PostgreSQL extension) + HNSW index
Embeddings — Text      sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
Embeddings — Images    EfficientNet-B4 (fine-tuned on fashion datasets)
NLP                    DistilBERT (fine-tuned, 65MB) for intent classification
Forecasting            Prophet (baseline) + LSTM (PyTorch, production)
Fraud Detection        Isolation Forest + XGBoost
Recommendations        Implicit (ALS) + LightFM (content-based hybrid)
Serving                FastAPI ML endpoints + Celery async inference
Infra                  GPU: single A10G spot instance for training; CPU for serving
```

---

## Sprint 1 — Commerce Completion + ML Infrastructure
### Month 1 | Goal: Ship deferred commerce features; lay ML foundations so no sprint starts from zero.

### 1.1 Backend — Commerce

#### Cash on Delivery (COD)
- [ ] **B-S1-01** Add `PAYMENT_METHOD` enum: `RAZORPAY`, `COD`; migration
- [ ] **B-S1-02** `POST /api/v1/checkout/initiate` — accept `payment_method=COD`; skip Razorpay order creation; set order status directly to `PAYMENT_PENDING` with `cod_amount_due`
- [ ] **B-S1-03** COD confirmation: ops team calls `POST /api/admin/v1/orders/{id}/confirm-cod` when delivery agent collects; triggers `PAYMENT_PENDING → PAID` transition
- [ ] **B-S1-04** COD orders: Shiprocket AWB creation happens at order placement (not at PAID), with `payment_method=COD` flag
- [ ] **B-S1-05** COD order limits: reject COD if `order_total > ₹5000` (configurable in env `COD_MAX_ORDER_VALUE_PAISE`)

#### Coupon & Discount Engine
- [ ] **B-S1-06** Models: `Coupon` (code, type: FLAT/PERCENT, value, min_order_value, max_discount, usage_limit, per_user_limit, expires_at, is_active); `CouponUsage` (coupon_id, user_id, order_id); migration
- [ ] **B-S1-07** `POST /api/v1/checkout/apply-coupon` — validate code (active, not expired, usage limits not exceeded); return discount_amount; do NOT apply to DB yet (apply only on order creation)
- [ ] **B-S1-08** Coupon application is atomic with order creation — increment `CouponUsage` in same DB transaction as order insert
- [ ] **B-S1-09** Admin coupon CRUD: `POST/GET/PUT/DELETE /api/admin/v1/coupons`; `GET /api/admin/v1/coupons/{code}/usage-stats`
- [ ] **B-S1-10** Referral coupons: auto-generate a unique coupon on user registration (e.g., `ZISUN-{phone_last4}-{rand4}`); credited when referred user completes first order

#### Reviews & Ratings
- [ ] **B-S1-11** Model: `Review` (id, user_id, product_id, order_id, rating: 1–5, title, body, is_verified_purchase, media_urls: JSONB, status: PENDING/APPROVED/REJECTED); migration
- [ ] **B-S1-12** `POST /api/v1/reviews` — user can review only products in DELIVERED orders (verified_purchase check); one review per product per order
- [ ] **B-S1-13** `GET /api/v1/catalog/products/{id}/reviews` — paginated, sorted by recency or rating; include average_rating, rating_distribution
- [ ] **B-S1-14** Aggregate `Product.avg_rating` and `Product.review_count` — maintained via DB trigger or updated by Celery task on review approval
- [ ] **B-S1-15** Admin review moderation: `GET /api/admin/v1/reviews?status=PENDING`; `PATCH /api/admin/v1/reviews/{id}/status`
- [ ] **B-S1-16** Review media: allow up to 3 images per review using existing R2 presigned URL flow

### 1.2 Backend — ML Infrastructure

#### pgvector Setup
- [ ] **B-S1-17** Enable `pgvector` PostgreSQL extension; migration `0005_pgvector.py`: `CREATE EXTENSION IF NOT EXISTS vector`
- [ ] **B-S1-18** `ProductEmbedding` model: `product_id` (FK), `text_embedding` (VECTOR(384)), `image_embedding` (VECTOR(1280)), `model_version` (String), `created_at`; migration
- [ ] **B-S1-19** HNSW index on both embedding columns: `CREATE INDEX USING hnsw (text_embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`
- [ ] **B-S1-20** `SearchQuery` model: log every search query with `query_text`, `result_count`, `clicked_product_ids` (JSONB), `session_id` for training data collection

#### MLflow + Feature Store
- [ ] **B-S1-21** Add `mlflow` service to `docker-compose.yml` with PostgreSQL backend store; expose on port 5001 (internal only)
- [ ] **B-S1-22** `scripts/ml/feature_engineering.py`: generate and save features — user purchase history vector, product popularity scores, category affinity matrix
- [ ] **B-S1-23** Feast feature store: `feast_repo/` with `UserFeatures` (recency, frequency, monetary, last_category, avg_session_time) and `ProductFeatures` (ctr, conversion_rate, avg_rating, reorder_rate)
- [ ] **B-S1-24** Celery beat task `update_ml_features` — runs daily at 03:00 IST; recomputes and pushes features to Redis online store

### 1.3 Frontend — Commerce

- [ ] **F-S1-01** COD option in checkout Step 3 — radio toggle between "Pay Online" and "Cash on Delivery"; COD shows delivery instruction text
- [ ] **F-S1-02** Coupon input in checkout Step 2 — text field with "Apply" button; show discount breakdown in order summary; "Remove" link to clear applied coupon
- [ ] **F-S1-03** Review form on `/orders/[id]` — shown for DELIVERED items; star rating widget (5 stars), text fields for title and body, image upload (max 3)
- [ ] **F-S1-04** Product reviews section on `/product/[id]` — rating summary bar, paginated review cards with verified badge, images lightbox

### 1.4 Infrastructure

- [ ] **I-S1-01** `requirements/ml.txt`: `torch==2.3`, `transformers==4.40`, `sentence-transformers==3.0`, `implicit==0.7`, `lightfm==1.17`, `mlflow==2.13`, `feast==0.38`, `prophet==1.1`
- [ ] **I-S1-02** Separate `ml-worker` Docker service (GPU-optional) for training jobs; CPU-only for inference
- [ ] **I-S1-03** GitHub Actions: add `ml-lint` job — import-checks on `scripts/ml/` to catch missing deps before merge

### 1.5 Exit Criteria — Sprint 1
- [ ] COD checkout works end-to-end; COD order appears with `cod_amount_due` in admin
- [ ] Coupon `ZISUN10` (10% off, max ₹100) successfully applied to a test order; usage_limit enforced
- [ ] Verified-purchase user can submit a review; unverified user gets 403
- [ ] `pgvector` extension enabled; HNSW indexes created; `ProductEmbedding` table exists
- [ ] MLflow UI reachable at internal port 5001 with at least one logged experiment

---

## Sprint 2 — Smart Search & Discovery
### Month 2 | Goal: Replace PostgreSQL FTS with ML-powered semantic + visual search.

### 2.1 Backend — Semantic Search

#### Text Embedding Pipeline
- [ ] **B-S2-01** `scripts/ml/generate_text_embeddings.py` — batch-encode all active products using `paraphrase-multilingual-MiniLM-L12-v2`; input: `f"{name}. {description}. {category.name}. {tags}"`; store in `ProductEmbedding.text_embedding`; log run to MLflow
- [ ] **B-S2-02** Celery task `refresh_product_embeddings` — triggered on product create/update; re-generates embedding for that product only (incremental)
- [ ] **B-S2-03** `GET /api/v1/catalog/search?q=...` — dual mode:
  - If `q` is < 3 chars or pure numeric: fall back to ILIKE
  - Otherwise: encode query with same MiniLM model; `SELECT * FROM product_embeddings ORDER BY text_embedding <=> $query_vec LIMIT 30`; rerank top-30 by BM25 score (hybrid)
- [ ] **B-S2-04** ANN search via pgvector: `SET hnsw.ef_search = 40`; target P95 < 100ms for semantic lookup
- [ ] **B-S2-05** Hybrid reranking: `final_score = 0.6 * semantic_score + 0.4 * bm25_score + 0.1 * popularity_boost`; `popularity_boost = log(1 + product.review_count) / 10`
- [ ] **B-S2-06** Multilingual support: MiniLM model handles Hindi queries natively; no transliteration needed
- [ ] **B-S2-07** Search autocomplete `GET /api/v1/catalog/search/suggest?q=...` — prefix match against `SearchQuery` table where `result_count > 0`; return top 5 popular completions; Redis cache TTL 60s

#### Visual Similarity Search
- [ ] **B-S2-08** `scripts/ml/generate_image_embeddings.py` — download product images from R2 CDN; encode via EfficientNet-B4 (ImageNet pretrained, final pooling layer, 1280-dim); store in `ProductEmbedding.image_embedding`
- [ ] **B-S2-09** `POST /api/v1/catalog/search/visual` — accept `image` (base64 JPEG, max 2MB); encode with EfficientNet-B4; ANN search against `image_embedding`; return top 10 visually similar products; P95 < 500ms (inference on CPU)
- [ ] **B-S2-10** "Find Similar" on product detail: `GET /api/v1/catalog/products/{id}/similar` — uses pre-computed `image_embedding` for fast lookup; no runtime inference; P95 < 50ms
- [ ] **B-S2-11** Trend-aware boosting: products with `avg_rating > 4.0` AND `ordered_in_last_7_days > 10` get +0.15 score boost in visual results

### 2.2 Backend — Search Analytics

- [ ] **B-S2-12** Log every search event to `SearchQuery` with `query_text`, `result_product_ids`, `session_id`, `user_id`
- [ ] **B-S2-13** Click-through logging: `POST /api/v1/analytics/search-click` with `query_id`, `product_id`, `rank_position`; store in `SearchQuery.clicked_product_ids`
- [ ] **B-S2-14** `GET /api/admin/v1/analytics/search` — zero-result queries, low-CTR queries, top-10 queries by volume; date range filter

### 2.3 Frontend — Search UX

- [ ] **F-S2-01** Search bar: instant suggestions dropdown (debounced 200ms, `GET /suggest`); keyboard navigation; popular queries shown when input is empty
- [ ] **F-S2-02** Search results page: query pill with "X" to clear; grid of results with relevance-ranked ordering; "No results" state suggests related categories
- [ ] **F-S2-03** "Find Similar" button on every product card (camera icon); opens a full-screen visual search drawer
- [ ] **F-S2-04** Visual search: user taps camera icon → choose from gallery OR capture → shows spinner → visual results grid
- [ ] **F-S2-05** Search results analytics: fire `search_performed`, `search_result_clicked` events on each interaction

### 2.4 Infrastructure

- [ ] **I-S2-01** EfficientNet-B4 model artifact stored in MLflow Model Registry; versioned; download cached in Docker image layer
- [ ] **I-S2-02** Model serving: both models (MiniLM + EfficientNet) loaded once at FastAPI startup into `app.state.ml_models`; no per-request model load
- [ ] **I-S2-03** Benchmark script `scripts/ml/benchmark_search.py` — runs 1000 random queries; reports P50/P95/P99 latency; fail-gate: P95 > 200ms blocks merge

### 2.5 Exit Criteria — Sprint 2
- [ ] Hindi query "लाल कुर्ता" returns relevant red kurta products (top 5 accuracy manual check)
- [ ] Visual search: photo of a lehenga returns lehengas in top 3 results (manual check)
- [ ] "Find Similar" on product page responds in < 100ms (pre-computed path)
- [ ] Semantic search P95 < 200ms verified by benchmark script
- [ ] Zero-result rate < 5% on a 500-query representative test set
- [ ] Admin search analytics dashboard shows top queries and CTR

---

## Sprint 3 — Personalization Engine
### Month 3 | Goal: Replace chronological feed with ML-ranked personalized feed. A/B test it.

### 3.1 Backend — Recommendation Models

#### Collaborative Filtering (User-Item)
- [ ] **B-S3-01** Training pipeline `scripts/ml/train_collaborative_filter.py`:
  - Interaction matrix: implicit signals — purchase (weight 10), add_to_cart (5), wishlist (3), product_view_dwell_5s (1)
  - Model: ALS (Alternating Least Squares) via `implicit` library; 150 factors, regularization=0.01
  - Output: user factors (U) and item factors (V) matrices; store in Feast online store (Redis)
  - Train weekly on full interaction history; log metrics (precision@10, recall@10, NDCG@10) to MLflow
- [ ] **B-S3-02** Online serving: `GET /api/v1/recommendations/for-you?limit=20` — fetch user vector from Redis; compute top-N products via ANN on item matrix using pgvector; filter out out-of-stock, recently viewed (last 24h), already purchased
- [ ] **B-S3-03** Cold-start (new user, < 5 interactions): fall back to popularity-based feed (`order_count DESC` in last 7 days, filtered by user's stated size preferences from signup)

#### Content-Based Filtering
- [ ] **B-S3-04** User taste profile: running weighted average of embeddings of interacted products (purchase weight=10, wishlist=3, view=1); stored in `UserProfile.taste_vector` (VECTOR(384)); updated by Celery task after each interaction
- [ ] **B-S3-05** `GET /api/v1/recommendations/more-like-this?product_id=...` — ANN search in text embedding space relative to product; filter by same broad category; return 12 products
- [ ] **B-S3-06** Category affinity: `UserProfile.category_affinity` (JSONB: category_id → score); used to boost products from affinity categories in all recommendation endpoints

#### Hybrid Feed Ranking
- [ ] **B-S3-07** ML feed endpoint `GET /api/v1/feed/ranked` — replaces `/api/v1/feed` as default:
  1. Fetch candidate pool: 200 active ContentCards (chronological last 30 days)
  2. Score each card: `score = CF_score * 0.5 + content_score * 0.3 + recency_decay * 0.2`
  3. `recency_decay = exp(-hours_since_publish / 72)` (72h half-life)
  4. Return top-20 cards per page (cursor-based); personalized per user
  5. Authenticated users: personalized. Unauthenticated: popularity-ranked.
- [ ] **B-S3-08** Diversity injection: ensure top-20 results span ≥ 3 different categories (re-rank to enforce if needed); prevents filter-bubble effect
- [ ] **B-S3-09** Log all ranked impressions to `AnalyticsEvent` with `rank_position` and `score` breakdown

### 3.2 Backend — A/B Testing Framework

- [ ] **B-S3-10** Model: `Experiment` (id, name, variants: JSONB `[{name, weight}]`, start_date, end_date, metric: String); `ExperimentAssignment` (experiment_id, user_id, variant, assigned_at)
- [ ] **B-S3-11** Assignment service: deterministic hash bucketing `murmur3(user_id + experiment_id) % 100 < variant_weight` — same user always gets same variant for experiment duration
- [ ] **B-S3-12** Middleware: inject `X-Experiment-Variant` response header for each active experiment the user is enrolled in
- [ ] **B-S3-13** First live experiment: `FEED_RANKING_V1` — 50% chronological, 50% ML-ranked; primary metric: `add_to_cart` rate per feed impression
- [ ] **B-S3-14** `GET /api/admin/v1/experiments/{id}/results` — compute conversion lift between variants with 95% confidence intervals (two-proportion Z-test); flag statistical significance

### 3.3 Frontend — Personalization UX

- [ ] **F-S3-01** "For You" section on home feed — horizontal scroll row of 8 personalized products above the main feed (uses `/recommendations/for-you`)
- [ ] **F-S3-02** "More Like This" carousel on product detail — horizontal scroll row of 10 similar products
- [ ] **F-S3-03** Onboarding flow: new users see a 3-step preference screen (select 3 favourite categories from grid); preferences stored via `POST /api/v1/profile/preferences`
- [ ] **F-S3-04** Feed toggles: "For You" / "Trending" / "New Arrivals" tabs on home page — each maps to a different ranked feed endpoint
- [ ] **F-S3-05** Impression tracking: fire `content_impression` analytics event as each feed card enters viewport (IntersectionObserver, ≥50% visible for ≥1s)

### 3.4 Infrastructure

- [ ] **I-S3-01** Weekly Celery beat task `train_cf_model` — trains ALS model; if NDCG@10 improves by > 1%, auto-promote to serving; otherwise alert on Slack
- [ ] **I-S3-02** Model versioning: MLflow Model Registry with `Staging` and `Production` stages; promotion gated on offline metric threshold
- [ ] **I-S3-03** Feast materialization job: runs every 6 hours; pushes updated user features (last_purchase_category, taste_vector, session_count_7d) to Redis online store

### 3.5 Exit Criteria — Sprint 3
- [ ] A/B test live: 50% of users get ML-ranked feed; experiment assignments deterministic (same user always same variant)
- [ ] "For You" row visible on home page for logged-in users; cold-start fallback for new users
- [ ] Personalized feed endpoint P95 < 300ms (served from Redis precompute)
- [ ] NDCG@10 of CF model ≥ 0.25 on offline held-out test set (logged to MLflow)
- [ ] Admin A/B test dashboard shows variant conversion rates

---

## Sprint 4 — Conversational AI: WhatsApp Bot
### Month 4 | Goal: Bot handles order tracking, reorders, and product discovery via WhatsApp — no human needed for 80% of queries.

### 4.1 Backend — NLP Pipeline

#### Intent Classification Model
- [ ] **B-S4-01** Training data: curate 3000 labeled WhatsApp messages across 12 intents:
  - `order_status`, `cancel_order`, `return_request`, `payment_query`, `product_search`, `size_help`, `reorder`, `address_update`, `coupon_query`, `agent_handoff`, `greeting`, `out_of_scope`
  - Bilingual: English + Hinglish (Hindi in Roman script)
- [ ] **B-S4-02** Fine-tune `distilbert-base-multilingual-cased` for 3 epochs; target accuracy ≥ 92% on hold-out; export to ONNX for 4× faster CPU inference; log to MLflow
- [ ] **B-S4-03** Slot filling: rule-based extractor for entities — `ORDER_ID` (regex `ZISX-\d+`), `PHONE` (+91 pattern), `PINCODE` (6-digit), `PRODUCT_NAME` (noun phrase after keywords)
- [ ] **B-S4-04** Conversation state machine: `ConversationSession` model (session_id, user_id, current_intent, slot_values: JSONB, last_message_at, step); Redis TTL 30min
- [ ] **B-S4-05** Dialogue manager: maps `(intent, step, filled_slots)` → `(response_template, next_step, required_slots)`; fully declarative config in `config/bot_flows.yaml`

#### WhatsApp Webhook Handler
- [ ] **B-S4-06** Upgrade `POST /webhooks/whatsapp` to full message handler:
  1. Verify `X-Hub-Signature-256` (existing)
  2. Extract message text + sender phone
  3. Classify intent via ONNX model (< 80ms target)
  4. Extract slots
  5. Dispatch to intent handler
  6. Send reply via Meta WhatsApp Business API
- [ ] **B-S4-07** Intent handlers:
  - `order_status` → query DB for user's last 3 orders → format with status, AWB, delivery estimate
  - `cancel_order` → collect ORDER_ID slot → call `OrderStateMachine.transition(CANCELLED)` → confirm
  - `return_request` → collect ORDER_ID + return_reason → create `ReturnRequest` record → send instructions
  - `product_search` → call semantic search API → return top 3 products as WhatsApp product list message
  - `reorder` → show last order items → confirm quantities → create new cart + initiate checkout link
  - `agent_handoff` → tag session for human agent; send agent notification (Slack webhook)
- [ ] **B-S4-08** Rich message types: use WhatsApp interactive messages — List Messages for multi-option replies, Reply Buttons for yes/no confirmations, Product Messages for product cards (name, price, image)
- [ ] **B-S4-09** Language detection: `langdetect` library; if Hindi detected, use translated response templates from `config/bot_responses_hi.yaml`
- [ ] **B-S4-10** Human escalation: if intent confidence < 0.6 OR 3 consecutive `out_of_scope` OR user types "agent" / "human": route to human agent queue; log `AgentHandoff` event; bot stops responding until session is resolved by agent

#### Size Recommendation Model
- [ ] **B-S4-11** Training data: past orders with size + return_reason; if return_reason includes "size issue", label as mis-fit
- [ ] **B-S4-12** Feature engineering: user height (if provided), weight (if provided), last_3_purchased_sizes (per category), return_rate_by_size
- [ ] **B-S4-13** Model: Gradient Boosted classifier (LightGBM); per-category (kurta, lehenga, saree blouse); output: recommended_size + confidence; log to MLflow
- [ ] **B-S4-14** Bot integration: when `size_help` intent detected AND product context known → return recommended size with confidence ("Based on your past purchases, we recommend **M**. You have a 90% success rate with M in kurtas.")

### 4.2 Backend — Returns & Refunds

- [ ] **B-S4-15** Model: `ReturnRequest` (id, order_id, order_item_id, user_id, reason, status: REQUESTED/APPROVED/REJECTED/PICKUP_SCHEDULED/COMPLETED, images: JSONB); migration
- [ ] **B-S4-16** `POST /api/v1/orders/{id}/return` — user initiates return for DELIVERED orders within 7 days; uploads photos via R2 presigned URL
- [ ] **B-S4-17** Admin: `GET /api/admin/v1/returns` (filter by status); `PATCH /api/admin/v1/returns/{id}/status`; on APPROVED: trigger Shiprocket reverse pickup API
- [ ] **B-S4-18** On return COMPLETED: trigger Razorpay refund (existing endpoint) + WhatsApp notification

### 4.3 Frontend — WhatsApp Bot Config

- [ ] **F-S4-01** Admin bot dashboard `/admin/bot` — intent distribution chart (last 7 days), resolution rate, avg conversation turns, human escalation rate
- [ ] **F-S4-02** Bot testing console: send test message → see classified intent + response; allows ops team to test bot without WhatsApp
- [ ] **F-S4-03** Bot flow config UI: view/edit `bot_flows.yaml` entries; per-intent on/off toggle; no deploy required for response text edits

### 4.4 Infrastructure

- [ ] **I-S4-01** ONNX Runtime installed in backend Docker image; model file included in image build (not downloaded at runtime)
- [ ] **I-S4-02** Conversation session Redis keys expire after 30min of inactivity; implement session cleanup cron
- [ ] **I-S4-03** Bot integration tests: 12 test conversations (one per intent) with mock WhatsApp payloads; assert correct intent + response template; must pass in CI

### 4.5 Exit Criteria — Sprint 4
- [ ] Bot correctly handles order_status query via WhatsApp (end-to-end, real number)
- [ ] Intent classification accuracy ≥ 92% on 200-message hold-out set
- [ ] ONNX inference P95 < 80ms on CI server (CPU)
- [ ] Size recommendation for "M" user in kurta category returns "M" with ≥ 80% confidence
- [ ] Human escalation triggers correctly when confidence < 0.6
- [ ] Return request submitted via WhatsApp; admin sees it in `/admin/returns`

---

## Sprint 5 — Operational Intelligence
### Month 5 | Goal: Give ops/finance team ML-powered inventory, fraud, and customer intelligence.

### 5.1 Backend — Demand Forecasting

#### Time-Series Forecasting Pipeline
- [ ] **B-S5-01** Training data: daily sales per `(product_variant_id, category_id)` — aggregated from orders; at least 90 days history required
- [ ] **B-S5-02** Baseline model: Facebook Prophet; regressors: `is_weekend`, `is_indian_festival` (Navratri, Diwali, Eid — calendar hardcoded), `is_sale_period`
- [ ] **B-S5-03** Advanced model: LSTM (PyTorch) — sequence of 30 days → predict next 14 days; per-category shared weights; fine-tune per product if > 200 history points
- [ ] **B-S5-04** Model selection: automatic; if MAPE of LSTM < MAPE of Prophet × 0.95, use LSTM; otherwise Prophet; log both to MLflow
- [ ] **B-S5-05** Output: `DemandForecast` model (product_variant_id, forecast_date, predicted_units, confidence_interval_low, confidence_interval_high, model_version); 14-day rolling window; updated weekly
- [ ] **B-S5-06** `GET /api/admin/v1/inventory/forecast?variant_id=...&days=14` — return forecast with confidence bands; used by admin dashboard
- [ ] **B-S5-07** Restock alert: Celery task daily at 07:00 IST — compare current_stock vs forecast; if `stock < 1.5 × predicted_demand_next_7_days`, create `RestockAlert` record and send Slack notification to ops channel
- [ ] **B-S5-08** Forecast accuracy report: `GET /api/admin/v1/analytics/forecast-accuracy` — MAPE per category over last 30 days; compare predicted vs actual sales

### 5.2 Backend — Fraud Detection

#### Anomaly Detection Pipeline
- [ ] **B-S5-09** Feature vector per transaction: `(order_value_percentile, coupon_discount_rate, orders_last_24h, different_addresses_last_7d, device_fingerprint_count, payment_attempts, time_since_registration_hours, pincode_order_velocity)`
- [ ] **B-S5-10** Offline training: Isolation Forest (scikit-learn) trained on 6 months of transactions; contamination=0.02 (2% expected fraud rate); also train XGBoost on labeled fraud cases (chargebacks from Razorpay)
- [ ] **B-S5-11** Online scoring: after each order creation, run fraud score in background Celery task (non-blocking); if score > 0.8, set `Order.fraud_risk = HIGH` and create admin alert; if > 0.95, auto-hold order (status: `FRAUD_HOLD`)
- [ ] **B-S5-12** `GET /api/admin/v1/orders?fraud_risk=HIGH` — filter for fraud-flagged orders; admin reviews and releases or cancels
- [ ] **B-S5-13** Razorpay chargeback webhook: on `payment.dispute.created` event, mark order as fraudulent in training data; retrain model weekly

### 5.3 Backend — Customer Intelligence

#### Segmentation
- [ ] **B-S5-14** RFM analysis: Celery task weekly — compute Recency (days since last order), Frequency (order count), Monetary (total spend) per user; normalize; K-Means clustering (k=5)
- [ ] **B-S5-15** Segment labels: `Champions`, `Loyal`, `Potential Loyalists`, `At Risk`, `Lost`
- [ ] **B-S5-16** Store in `UserProfile.segment` (String); expose via `GET /api/admin/v1/customers/segments` with counts and avg order value per segment

#### Churn Prediction
- [ ] **B-S5-17** Features: `days_since_last_order`, `order_frequency_trend` (last 90d vs prior 90d), `avg_session_time_trend`, `email_open_rate`, `support_tickets_count`
- [ ] **B-S5-18** Model: XGBoost binary classifier; label = no order in next 30 days; train monthly on 6-month history; target AUC-ROC ≥ 0.80
- [ ] **B-S5-19** Daily Celery task: score all active users; users with churn_probability > 0.7 enter a 7-day WhatsApp re-engagement flow with personalized product + coupon
- [ ] **B-S5-20** Campaign tracking: log which re-engagement WhatsApp messages converted (user placed order within 7 days); A/B test coupon value (10% vs 15%)

### 5.4 Frontend — Intelligence Dashboards

- [ ] **F-S5-01** Inventory Intelligence page `/admin/inventory/intelligence`:
  - Demand forecast chart per variant (14-day with confidence bands, Chart.js)
  - Restock alert list (variants below safety threshold, sorted by urgency)
  - Forecast accuracy heatmap (category × week MAPE)
- [ ] **F-S5-02** Fraud risk queue `/admin/orders/fraud` — orders with HIGH fraud risk; approve / reject / escalate actions; fraud score breakdown tooltip
- [ ] **F-S5-03** Customer analytics `/admin/customers`:
  - Segment distribution donut chart
  - Churn risk list (top 50 at-risk customers, "Send Coupon" button)
  - Revenue by segment waterfall chart
  - Cohort retention heatmap (month of first order vs months retained)

### 5.5 Infrastructure

- [ ] **I-S5-01** Training jobs run on spot instances; `scripts/ml/train_all.sh` — orchestrates all training in order (features → CF → forecast → fraud → churn)
- [ ] **I-S5-02** Model monitoring: log prediction distribution daily; alert if drift score (PSI) > 0.2 on any feature
- [ ] **I-S5-03** All training scripts runnable with `--dry-run` flag (no DB writes); enables CI testing of ML pipeline

### 5.6 Exit Criteria — Sprint 5
- [ ] Demand forecast MAPE < 20% on held-out last 14 days (logged in MLflow)
- [ ] Fraud detection: 0 false positives on 100 clean test orders; catches 3 synthetic fraud cases
- [ ] Churn model AUC-ROC ≥ 0.80 on offline test set
- [ ] Admin can see 14-day demand forecast chart for any product variant
- [ ] Re-engagement WhatsApp campaign fires for at-risk users; campaign tracked end-to-end
- [ ] Customer segments visible in admin with counts and avg values

---

## Sprint 6 — Scale, AR Prototype & Advanced Features
### Month 6 | Goal: 500-VU load test green; full return flow; push notifications; AR try-on POC.

### 6.1 Backend — Scale & Reliability

#### Horizontal Scaling Prep
- [ ] **B-S6-01** Stateless services: verify all session state is in Redis (not in-process); all background tasks in Celery (not asyncio background tasks)
- [ ] **B-S6-02** Read replicas: configure SQLAlchemy to route `SELECT` queries to read replica; write queries to primary; failover via PgBouncer
- [ ] **B-S6-03** Connection pooling: PgBouncer in `transaction` mode between app and PostgreSQL; pool_size per service tuned to DB `max_connections`
- [ ] **B-S6-04** Redis Cluster: migrate from single Redis to Redis Cluster (3 primary + 3 replica shards); update aioredis connection string
- [ ] **B-S6-05** CDN for API responses: Cloudflare cache for `GET /api/v1/catalog/products` (Cache-Control: public, max-age=60); vary on `Accept-Encoding` only (not auth header for public catalog)
- [ ] **B-S6-06** Async queue for analytics: route all `POST /api/v1/analytics/events` to Kafka (or Redis Streams) instead of direct DB insert; Celery consumer writes to DB in batch
- [ ] **B-S6-07** Database partitioning: partition `analytics_events` table by month (`PARTITION BY RANGE created_at`); auto-create next month's partition via Celery beat

#### Push Notifications (FCM)
- [ ] **B-S6-08** Model: `DeviceToken` (user_id, token, platform: ios/android/web, created_at); migration
- [ ] **B-S6-09** `POST /api/v1/notifications/register-device` — store FCM token; one user can have multiple devices
- [ ] **B-S6-10** `services/push_notification.py` — Firebase Admin SDK; send to single token or topic; handle `UNREGISTERED` error (delete stale token)
- [ ] **B-S6-11** Push triggers:
  - Order status change → push to user's devices
  - Restock of wishlisted item → "Your saved item is back in stock!"
  - Re-engagement (churn risk, day 3 of WhatsApp non-response) → push fallback
  - Flash sale start → mass push to topic `all_users` (opt-in only)
- [ ] **B-S6-12** Notification preferences: `UserProfile.notification_prefs` (JSONB: `{push: bool, whatsapp: bool, sms: bool}`); respect on every dispatch

### 6.2 Backend — AR Try-On Prototype

> **Scope:** Proof-of-concept only. Full AR in Year 2. This sprint delivers a working prototype to validate feasibility and gather user feedback.

- [ ] **B-S6-13** Virtual try-on service `services/ar_tryon.py` — integrate with Replicate API (hosted ML inference): use `clothes-segmentation` model + `outfit-transfer` model pipeline
  - Input: user selfie (base64 JPEG) + product image URL
  - Output: composited try-on image (JPEG) uploaded to R2
  - Async: responds immediately with `job_id`; result available via polling `GET /api/v1/ar/jobs/{job_id}`
- [ ] **B-S6-14** `POST /api/v1/ar/try-on` — auth required; rate limit 3 tries/hr/user; store result in `ARTryOnJob` model (user_id, product_id, status, result_url)
- [ ] **B-S6-15** Usage analytics: track try-on → add_to_cart conversion rate; A/B test: show try-on button vs no try-on button; measure lift in conversion

### 6.3 Frontend — AR Try-On UI

- [ ] **F-S6-01** "Try On" button on product detail page (visible only if product has `ar_enabled = true`)
- [ ] **F-S6-02** Try-on flow: tap button → permission request for camera → capture selfie → loading state ("Creating your try-on... ~15s") → show result → "Add to Cart" / "Share" / "Try Another"
- [ ] **F-S6-03** Share try-on: Web Share API to share result image via WhatsApp/Instagram

### 6.4 Vendor Onboarding Portal

- [ ] **B-S6-16** Model: `Vendor` (id, name, gstin, bank_account_details: encrypted JSONB, status: PENDING/ACTIVE/SUSPENDED); migration
- [ ] **B-S6-17** `POST /api/vendor/v1/auth/register` — vendor self-registration with GSTIN validation (Regex + optional GST API check)
- [ ] **B-S6-18** Vendor product upload: `POST /api/vendor/v1/products` — vendor can only create products tagged to their `vendor_id`; goes to PENDING status; admin approves before going live
- [ ] **B-S6-19** Vendor dashboard API: `GET /api/vendor/v1/analytics` — sales, revenue, returns for own products only (strict `vendor_id` scoping)
- [ ] **F-S6-04** Vendor portal `/vendor` — separate Next.js app section; login, product upload form, order list (own products only), payout history

### 6.5 Load Testing — 500 VU

- [ ] **I-S6-01** Update `locustfile.py` with ML-era scenarios:
  - **Personalized Browse** (300 VU): GET /feed/ranked, GET /recommendations/for-you, GET /search?q=... (semantic) — P95 < 500ms
  - **Concurrent Checkout** (100 VU): authenticate → search → add to cart → checkout → payment — P95 < 800ms, 0 oversells
  - **Bot Flood** (100 VU): POST /webhooks/whatsapp with order_status intent — P95 < 150ms, all intents classified correctly
- [ ] **I-S6-02** Staging: seeded with 500k products, 50k users, 100k orders, 10M analytics events
- [ ] **I-S6-03** Load test exit gate: P99 < 2000ms across all endpoints; error rate < 0.1%; zero OOM kills

### 6.6 Multi-Region Preparation

- [ ] **I-S6-04** Database: enable logical replication slot on primary; provision read replica in Mumbai (ap-south-1) for disaster recovery
- [ ] **I-S6-05** CDN: all static assets (frontend build, R2 media) served via Cloudflare global CDN; purge automation on deploy
- [ ] **I-S6-06** Health checks: multi-region synthetic monitor (UptimeRobot) hitting `/health` every 60s from Singapore, Mumbai, London; alert if any region > 2s

### 6.7 Exit Criteria — Sprint 6
- [ ] 500 VU load test green: P95 < 500ms browse, P95 < 800ms checkout, 0 oversells, < 0.1% error rate
- [ ] AR try-on POC: produces visually plausible result for a test saree product (manual review)
- [ ] Push notification delivered to test device within 5s of order status change
- [ ] Vendor can register, upload a product (status=PENDING), and admin can approve it
- [ ] Full return flow: user initiates → Shiprocket reverse pickup created → refund processed → WhatsApp sent
- [ ] Read replica routing: verify SELECT queries hit replica (via pg_stat_activity on primary showing < reads)

---

## ML Model Registry & Versioning Policy

| Model | Retrain Cadence | Promotion Gate | Rollback |
|-------|----------------|----------------|---------|
| Text Embeddings (MiniLM) | On model release | Manual review | Swap MLflow alias |
| Image Embeddings (EfficientNet) | On model release | Manual review | Swap MLflow alias |
| Collaborative Filter (ALS) | Weekly | NDCG@10 ≥ 0.25 | Auto-rollback |
| Intent Classifier (DistilBERT) | Monthly | Accuracy ≥ 92% | Manual gate |
| Demand Forecast (Prophet/LSTM) | Weekly | MAPE < 20% | Auto-rollback |
| Fraud Detector (IsoForest+XGB) | Weekly | AUC-ROC ≥ 0.80, FP < 0.5% | Manual gate |
| Churn Predictor (XGBoost) | Monthly | AUC-ROC ≥ 0.80 | Manual gate |
| Size Recommender (LightGBM) | Monthly | Accuracy ≥ 80% | Manual gate |

---

## Data Privacy & ML Ethics

- [ ] **P-01** PII in ML features: phone numbers and addresses NEVER included in model features or MLflow artifacts; use `user_id` (UUID) only
- [ ] **P-02** Right to erasure: `DELETE /api/v1/account` removes user from Feast feature store and clears `UserEmbedding`; retraining pipeline excludes deleted users
- [ ] **P-03** Bias audit Sprint 3: run recommendation model on demographic splits; ensure no category has < 50% of majority-category recommendation rate
- [ ] **P-04** Fraud model fairness: ensure `time_since_registration` feature doesn't systematically disadvantage new users from specific regions; check by pincode cluster
- [ ] **P-05** Bot transparency: WhatsApp bot messages include "🤖 ZISUN Bot" prefix; "Talk to a person" is always available as an option

---

## Sprint Summary

| Sprint | Backend Tasks | Frontend Tasks | ML Tasks | Infra Tasks | Total |
|--------|--------------|----------------|----------|-------------|-------|
| S1 — Commerce + Foundation | 16 | 4 | 8 | 3 | **31** |
| S2 — Smart Search | 14 | 5 | 3 | 3 | **25** |
| S3 — Personalization | 9 | 5 | 3 | 3 | **20** |
| S4 — WhatsApp Bot | 15 | 3 | 4 | 3 | **25** |
| S5 — Operational Intelligence | 20 | 3 | — | 3 | **26** |
| S6 — Scale + AR + Vendor | 17 | 4 | — | 6 | **27** |
| **Total** | **91** | **24** | **18** | **21** | **154** |

---

## Key Metrics to Track (Release 2)

| Metric | Baseline (Release 1) | Target (6 months) |
|--------|---------------------|-------------------|
| Feed CTR (content → product view) | ~4% (chronological) | ≥ 12% (ML-ranked) |
| Search zero-result rate | ~18% (FTS) | < 5% (semantic) |
| Add-to-cart from recommendations | 0% (none) | ≥ 8% |
| Bot query resolution (no human) | 0% (all human) | ≥ 80% |
| Demand forecast MAPE | N/A | < 20% |
| Fraud catch rate | 0% (no system) | ≥ 70% (recall) |
| Churn model AUC | N/A | ≥ 0.80 |
| P95 latency (catalog browse) | < 500ms | < 500ms (maintained at 5× traffic) |
| Load test max VUs green | 200 | 500 |

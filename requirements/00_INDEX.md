# ZISUN Platform — Requirements Index

> **Document ID:** REQ-00  
> **Version:** 1.0  
> **Last Updated:** 2026-05-03  
> **Owner:** Product & Engineering Team  
> **Source of Truth:** `ZISUN_PRD_v1.docx` (Version 1.0, 2024)

---

## How to Use This Folder

This folder contains the complete, decomposed requirements for the ZISUN Content-Driven Commerce Platform. Each file is a self-contained specification that can be assigned to an engineering team, reviewed independently, and tracked for completion.

### Reading Order for New Team Members

1. Start with this file (`00_INDEX.md`) to understand the full scope and terminology.
2. Read `01_product_overview.md` to understand the business context and architectural constraints.
3. Read `02_goals_and_kpis.md` to understand what success looks like and what is measured.
4. Read `03_user_personas.md` to understand who you are building for and the device/network constraints they impose.
5. Read `07_data_model.md` before any feature file — the data model is the foundation.
6. Read feature files in `04_features/` based on your assigned domain.
7. Read `08_api_contracts.md` to understand the API envelope, conventions, and versioning rules.
8. Cross-reference your feature file with `09_integrations.md`, `10_security_compliance.md`, and `15_testing_strategy.md` to ensure full coverage.

### Rules for Modifying These Documents

- All changes require a PR with at least one reviewer from the ownership table below.
- Every change must reference a PRD section number or be tagged as `[ASSUMPTION]` with rationale.
- Feature files in `04_features/` are the canonical source for acceptance criteria and API contracts. If `08_api_contracts.md` and a feature file conflict, the feature file wins.
- Do not add features that are not in the PRD. If you believe something is missing, add it to `13_risks_assumptions.md` under "Open Questions" for founder review.

---

## Document Catalog

| # | File | Description | Priority |
|---|------|-------------|----------|
| 00 | `00_INDEX.md` | This file — index, glossary, dependency map, status tracker | — |
| 01 | `01_product_overview.md` | Vision, problem, solution, scope, architectural constraints | — |
| 02 | `02_goals_and_kpis.md` | Business goals, user goals, KPI table, alert thresholds | — |
| 03 | `03_user_personas.md` | 4 personas with device matrices, feature access, failure scenarios | — |
| 04a | `04_features/AUTH_otp_login.md` | OTP authentication, JWT, rate limiting, session management | P0 |
| 04b | `04_features/CATALOG_product_inventory.md` | Product catalog, variants, inventory atomicity, CSV bulk update | P0 |
| 04c | `04_features/CONTENT_shoppable_feed.md` | Shoppable content feed, video delivery, ranking algorithm | P0 |
| 04d | `04_features/CART_checkout_flow.md` | Cart persistence, checkout state machine, zombie order cleanup | P0 |
| 04e | `04_features/ORDER_management_tracking.md` | Order state machine, status history, notification triggers | P0 |
| 04f | `04_features/PAYMENT_razorpay_integration.md` | Webhook handler, idempotency, circuit breaker, reconciliation | P0 |
| 04g | `04_features/FULFILLMENT_shiprocket_integration.md` | Shipment creation, AWB tracking, reverse logistics | P0 |
| 04h | `04_features/WHATSAPP_commerce_agent.md` | WhatsApp bot, intent classification, template messages | P1 |
| 04i | `04_features/ADMIN_dashboard.md` | Admin views, role matrix, order/inventory/payment management | P0 |
| 05 | `05_user_flows.md` | 7 end-to-end user flows with error paths and latency targets | — |
| 06 | `06_system_requirements.md` | Functional requirements (FR-01–FR-15), non-functional requirements | — |
| 07 | `07_data_model.md` | Full schema, indexes, migration strategy, data type conventions | — |
| 08 | `08_api_contracts.md` | API envelope, endpoint catalog, pagination, rate limits, versioning | — |
| 09 | `09_integrations.md` | Razorpay, Shiprocket, WhatsApp, S3/R2, Sentry, Alembic, Twilio | — |
| 10 | `10_security_compliance.md` | Threat model, control matrix, DPDP Act 2023, PCI-DSS scope | — |
| 11 | `11_performance_targets.md` | P50/P95/hard limits per operation, load test scenarios, alerts | — |
| 12 | `12_release_plan.md` | 4 phases, exit criteria, go/no-go checklist, deployment runbook | — |
| 13 | `13_risks_assumptions.md` | Risk register, engineering risks, key assumptions, open questions | — |
| 14 | `14_analytics_events.md` | Event schema, 15 events, funnel definitions, implementation guide | — |
| 15 | `15_testing_strategy.md` | Test pyramid, coverage requirements, load test specs, CI pipeline | — |
| 16 | `16_monetization.md` | Revenue model, unit economics, breakeven analysis | — |

---

## Document Ownership

| File | Primary Owner | Reviewer | Last Updated | PRD Section |
|------|---------------|----------|--------------|-------------|
| `00_INDEX.md` | Engineering Lead | Product Lead | 2026-05-03 | All |
| `01_product_overview.md` | Product Lead | Founder | 2026-05-03 | §1 |
| `02_goals_and_kpis.md` | Product Lead | CEO / Growth | 2026-05-03 | §2 |
| `03_user_personas.md` | Product Lead | UX Designer | 2026-05-03 | §3 |
| `04_features/AUTH_otp_login.md` | Backend Lead | Security Lead | 2026-05-03 | §4.1, §11.1 |
| `04_features/CATALOG_product_inventory.md` | Backend Lead | Ops Lead | 2026-05-03 | §4.3, §7 |
| `04_features/CONTENT_shoppable_feed.md` | Frontend Lead | Backend Lead | 2026-05-03 | §4.2, §9 |
| `04_features/CART_checkout_flow.md` | Backend Lead | Product Lead | 2026-05-03 | §4.4 |
| `04_features/ORDER_management_tracking.md` | Backend Lead | Ops Lead | 2026-05-03 | §4.5 |
| `04_features/PAYMENT_razorpay_integration.md` | Backend Lead | Finance Lead | 2026-05-03 | §4.4, §8, §11.2 |
| `04_features/FULFILLMENT_shiprocket_integration.md` | Backend Lead | Ops Lead | 2026-05-03 | §8 |
| `04_features/WHATSAPP_commerce_agent.md` | Backend Lead | Product Lead | 2026-05-03 | §4.6, §8 |
| `04_features/ADMIN_dashboard.md` | Frontend Lead | Ops Lead | 2026-05-03 | §4.7 |
| `05_user_flows.md` | Product Lead | UX Designer | 2026-05-03 | §5 |
| `06_system_requirements.md` | Engineering Lead | Product Lead | 2026-05-03 | §6 |
| `07_data_model.md` | Backend Lead | Engineering Lead | 2026-05-03 | §7 |
| `08_api_contracts.md` | Backend Lead | Frontend Lead | 2026-05-03 | §4 (all), §6 |
| `09_integrations.md` | Backend Lead | Engineering Lead | 2026-05-03 | §8 |
| `10_security_compliance.md` | Security Lead | Engineering Lead | 2026-05-03 | §11 |
| `11_performance_targets.md` | Engineering Lead | Backend Lead | 2026-05-03 | §10 |
| `12_release_plan.md` | Product Lead | Engineering Lead | 2026-05-03 | §12 |
| `13_risks_assumptions.md` | Engineering Lead | Product Lead | 2026-05-03 | §13 |
| `14_analytics_events.md` | Product Lead | Data Lead | 2026-05-03 | §14 |
| `15_testing_strategy.md` | QA Lead | Engineering Lead | 2026-05-03 | §15 |
| `16_monetization.md` | Product Lead | CEO / Finance | 2026-05-03 | §16 |

---

## Dependency Map

The dependency map defines which files must be read (and ideally approved) before another file can be fully understood or implemented. An arrow (`→`) means "is a prerequisite for."

```
00_INDEX.md
  └─→ ALL FILES (provides glossary and structure)

01_product_overview.md
  └─→ ALL FILES (scope boundaries govern every feature decision)

02_goals_and_kpis.md
  └─→ 11_performance_targets.md (KPIs define alert thresholds)
  └─→ 14_analytics_events.md (events feed KPI measurement)
  └─→ 12_release_plan.md (success criteria per phase)

03_user_personas.md
  └─→ 04_features/* (personas define acceptance criteria and design constraints)
  └─→ 05_user_flows.md (flows are persona-driven)
  └─→ 11_performance_targets.md (device constraints define perf budgets)

07_data_model.md
  └─→ 04_features/CATALOG_product_inventory.md (schema defines product model)
  └─→ 04_features/CART_checkout_flow.md (InventoryLocks, Carts, Orders)
  └─→ 04_features/ORDER_management_tracking.md (order state machine depends on schema)
  └─→ 04_features/PAYMENT_razorpay_integration.md (Payments table, OutboxEvents)
  └─→ 04_features/FULFILLMENT_shiprocket_integration.md (Fulfillments table)
  └─→ 08_api_contracts.md (API shapes mirror data model DTOs)

04_features/AUTH_otp_login.md
  └─→ 04_features/CART_checkout_flow.md (auth required before checkout)
  └─→ 04_features/ADMIN_dashboard.md (admin auth flow)
  └─→ 08_api_contracts.md (auth header convention)

04_features/CART_checkout_flow.md
  └─→ 04_features/PAYMENT_razorpay_integration.md (checkout creates Razorpay order)
  └─→ 04_features/ORDER_management_tracking.md (checkout creates order record)

04_features/PAYMENT_razorpay_integration.md
  └─→ 04_features/FULFILLMENT_shiprocket_integration.md (payment.captured triggers fulfillment)
  └─→ 04_features/ORDER_management_tracking.md (webhook updates order state)

04_features/ORDER_management_tracking.md
  └─→ 04_features/WHATSAPP_commerce_agent.md (state transitions trigger notifications)
  └─→ 04_features/ADMIN_dashboard.md (admin manages order lifecycle)

09_integrations.md
  └─→ 04_features/PAYMENT_razorpay_integration.md (Razorpay details)
  └─→ 04_features/FULFILLMENT_shiprocket_integration.md (Shiprocket details)
  └─→ 04_features/WHATSAPP_commerce_agent.md (WhatsApp API details)

10_security_compliance.md
  └─→ 04_features/AUTH_otp_login.md (auth security checklist)
  └─→ 04_features/PAYMENT_razorpay_integration.md (payment security checklist)
  └─→ ALL FEATURE FILES (each feature has a security checklist)

15_testing_strategy.md
  └─→ ALL FEATURE FILES (test scenarios defined per feature)
```

### Critical Path for Implementation

The following sequence represents the minimum viable reading/approval order for an engineer starting backend implementation:

```
00_INDEX → 01_product_overview → 07_data_model → AUTH_otp_login → CATALOG →
CART_checkout → PAYMENT_razorpay → ORDER_management → FULFILLMENT → 08_api_contracts →
10_security_compliance → 15_testing_strategy
```

---

## Glossary

ZISUN-specific terms, abbreviations, and technical concepts used throughout these documents. Sorted alphabetically.

| Term | Definition | First Appears In |
|------|------------|------------------|
| **AOV** | Average Order Value. Target: ₹800+ (MVP), ₹900 (unit economics model). Calculated as total GMV ÷ total orders in a period. | `02_goals_and_kpis.md` |
| **AWB** | Air Waybill number. A unique tracking identifier generated by Shiprocket when a shipment is created. Used as the primary key for tracking and deduplication. | `FULFILLMENT_shiprocket_integration.md` |
| **BFF** | Backend For Frontend. A thin API layer in the Next.js frontend that aggregates backend API calls and shapes responses for the client. Reduces round trips and hides backend complexity. | `08_api_contracts.md` |
| **Bottom Sheet** | A UI pattern where product details slide up from the bottom of the screen as a panel, avoiding full page navigation. Critical for the shoppable feed experience. | `CONTENT_shoppable_feed.md` |
| **Circuit Breaker** | A fault-tolerance pattern that stops calling a failing external service after a threshold of consecutive failures. States: CLOSED (normal) → OPEN (blocked) → HALF_OPEN (testing). | `PAYMENT_razorpay_integration.md` |
| **CLS** | Cumulative Layout Shift. A Core Web Vital measuring visual stability. Target: < 0.1 (minimal shift). Achieved via explicit image dimensions and skeleton loading. | `11_performance_targets.md` |
| **COD** | Cash On Delivery. Explicitly OUT OF SCOPE for MVP (PRD §13.2). Deferred to Phase 2 after NDR tracking is operational. | `13_risks_assumptions.md` |
| **Content Card** | A single item in the shoppable feed. Contains media (image or video), caption, occasion/season tags, and linked products. The fundamental content unit in ZISUN. | `CONTENT_shoppable_feed.md` |
| **COGS** | Cost Of Goods Sold. Product cost before margin. MVP target: 50% of AOV (₹450 on ₹900 AOV). | `16_monetization.md` |
| **D30 Retention** | Percentage of users who return within 30 days of first purchase. Target: >25% by Month 5. | `02_goals_and_kpis.md` |
| **DPDP Act 2023** | Digital Personal Data Protection Act, 2023 (India). Governs collection, processing, and storage of personal data. ZISUN must comply from Day 1. | `10_security_compliance.md` |
| **GMV** | Gross Merchandise Value. Total value of all orders placed, before returns/refunds. Target: ₹5L/month by Month 4. | `02_goals_and_kpis.md` |
| **Idempotency Key** | A unique identifier (e.g., `payment_gateway_id`) used to ensure that retrying an operation produces the same result. Critical for webhooks and payment processing. Enforced via UNIQUE constraint at the database level. | `PAYMENT_razorpay_integration.md` |
| **InventoryLock** | A database record that temporarily reserves stock for an in-progress order. Status lifecycle: `ACTIVE` → `RELEASED` (on payment success) or `EXPIRED` (on cleanup timeout at T+30min). Prevents overselling during the payment window. | `CART_checkout_flow.md` |
| **JWT** | JSON Web Token. ZISUN uses RS256-signed JWTs. Access token: 15-min expiry. Refresh token: 30-day expiry with rotation. Claims include `sub` (user_id), `role` (user\|admin), `jti` (unique token ID). | `AUTH_otp_login.md` |
| **NDR** | Non-Delivery Ratio. Percentage of orders that fail delivery. Tracked in Phase 2 as a prerequisite for enabling COD. | `13_risks_assumptions.md` |
| **North Star Metric** | The single most important metric for the business. For ZISUN: Weekly Completed Orders from Content-Originated Sessions. Defined in `02_goals_and_kpis.md`. | `02_goals_and_kpis.md` |
| **Optimistic Locking** | A concurrency control strategy where a `version` column is checked on UPDATE. If the version has changed since the row was read, the UPDATE affects 0 rows and the operation is rejected with 409 Conflict. Used for inventory decrement. | `CATALOG_product_inventory.md` |
| **OTP** | One-Time Password. 6-digit, cryptographically random, expires in 300 seconds, stored as hash in Redis with TTL. Maximum 5 sends per phone per hour. | `AUTH_otp_login.md` |
| **Outbox Pattern** | A reliable messaging pattern where events are written to an `outbox_events` table within the same DB transaction as the business mutation. A background poller reads unpublished events and dispatches them to workers. Guarantees at-least-once delivery without distributed transactions. | `07_data_model.md` |
| **OutboxEvent** | A row in the `outbox_events` table. Fields: `aggregate_type` (e.g., 'order'), `aggregate_id`, `event_type` (e.g., 'order.paid'), `payload` (JSON snapshot), `published_at` (NULL until processed), `created_at`. | `07_data_model.md` |
| **P50 / P95 / P99** | Percentile latency measurements. P50 = median latency, P95 = 95th percentile (used for performance targets), P99 = 99th percentile (used for hard limits). | `11_performance_targets.md` |
| **PCI-DSS SAQ A** | Payment Card Industry Data Security Standard, Self-Assessment Questionnaire A. Applies when no card data touches the merchant's servers (delegated to Razorpay). Requires annual self-assessment. | `10_security_compliance.md` |
| **Persona** | A fictional user archetype representing a real user segment. ZISUN has 4: Priya (Tier 1, iPhone), Rohan (Tier 1, high-AOV), Divya (Tier 2, budget Android, WhatsApp-first), Admin/Ops (internal). | `03_user_personas.md` |
| **Price Delta** | The difference between a product variant's price and the product's base price. Stored as `price_delta` on `ProductVariants`. Final price = `base_price + price_delta`. Allows variants to be priced independently. | `CATALOG_product_inventory.md` |
| **RS256** | RSA Signature with SHA-256. An asymmetric JWT signing algorithm. The private key signs tokens; the public key verifies them. Minimum key size: 2048 bits. Keys rotated quarterly. | `AUTH_otp_login.md` |
| **SKU** | Stock Keeping Unit. A unique identifier for each product variant. Format: alphanumeric, assigned by ZISUN ops during catalog onboarding. | `CATALOG_product_inventory.md` |
| **Soft Delete** | A data pattern where records are not physically deleted from the database. Instead, a `deleted_at` timestamp is set. All queries include `WHERE deleted_at IS NULL` by default. Used for products, users, and content. | `07_data_model.md` |
| **Style Fingerprint** | A per-user embedding trained on behavioral signals (scroll patterns, dwell time, add-to-cart, purchase history). Used for personalized feed ranking. Phase 2+ feature. | `01_product_overview.md` |
| **Zombie Order** | An order stuck in `PAYMENT_PENDING` status for more than 30 minutes. Cleaned up by a scheduled job that cancels the order, releases inventory locks, and restores stock. | `CART_checkout_flow.md` |

---

## Status Tracker

| File | Status | Notes |
|------|--------|-------|
| `00_INDEX.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `01_product_overview.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `02_goals_and_kpis.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `03_user_personas.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/AUTH_otp_login.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/CATALOG_product_inventory.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/CONTENT_shoppable_feed.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/CART_checkout_flow.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/ORDER_management_tracking.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/PAYMENT_razorpay_integration.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/FULFILLMENT_shiprocket_integration.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/WHATSAPP_commerce_agent.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `04_features/ADMIN_dashboard.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `05_user_flows.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `06_system_requirements.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `07_data_model.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `08_api_contracts.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `09_integrations.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `10_security_compliance.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `11_performance_targets.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `12_release_plan.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `13_risks_assumptions.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `14_analytics_events.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `15_testing_strategy.md` | **DRAFT** | Initial creation from PRD v1.0 |
| `16_monetization.md` | **DRAFT** | Initial creation from PRD v1.0 |

**Status definitions:**
- **PENDING** — File not yet created.
- **DRAFT** — File created, content generated from PRD. Awaiting engineering review.
- **IN_REVIEW** — Under active review. Comments and change requests in progress.
- **APPROVED** — Reviewed, signed off, and ready for implementation.

---

## Cross-Reference: PRD Section → Requirements File

| PRD Section | Requirements File(s) |
|-------------|----------------------|
| §1 — Product Overview | `01_product_overview.md` |
| §2 — Goals & Success Metrics | `02_goals_and_kpis.md` |
| §3 — User Personas | `03_user_personas.md` |
| §4.1 — OTP Auth | `04_features/AUTH_otp_login.md` |
| §4.2 — Shoppable Content Feed | `04_features/CONTENT_shoppable_feed.md` |
| §4.3 — Product Catalog & Inventory | `04_features/CATALOG_product_inventory.md` |
| §4.4 — Cart & Checkout | `04_features/CART_checkout_flow.md`, `04_features/PAYMENT_razorpay_integration.md` |
| §4.5 — Order Management | `04_features/ORDER_management_tracking.md` |
| §4.6 — WhatsApp Commerce Agent | `04_features/WHATSAPP_commerce_agent.md` |
| §4.7 — Admin Dashboard | `04_features/ADMIN_dashboard.md` |
| §5 — User Flows | `05_user_flows.md` |
| §6 — System Requirements | `06_system_requirements.md` |
| §7 — Data Requirements | `07_data_model.md` |
| §8 — Integrations | `09_integrations.md` |
| §9 — UX & Design Guidelines | `03_user_personas.md`, `05_user_flows.md` |
| §10 — Performance | `11_performance_targets.md` |
| §11 — Security & Compliance | `10_security_compliance.md` |
| §12 — Release Plan | `12_release_plan.md` |
| §13 — Risks & Assumptions | `13_risks_assumptions.md` |
| §14 — Analytics | `14_analytics_events.md` |
| §15 — Testing Strategy | `15_testing_strategy.md` |
| §16 — Monetization | `16_monetization.md` |
| §17 — Future Roadmap | `01_product_overview.md` (scope boundaries), `12_release_plan.md` (Phase 3–4) |

---

## Conventions Used in This Documentation

### Assumption Tags

When a decision is made that the PRD does not explicitly specify:

```
[ASSUMPTION] <Decision statement>.
Reason: <Rationale>.
Override: <How to override if the decision is wrong>.
```

### Priority Labels

- **P0** — Must ship in MVP (Weeks 1–6). Blocking for first paid order.
- **P1** — Required by Month 2. Not blocking for MVP launch, but blocking for Phase 2.
- **P2** — Phase 2+ feature. Not in initial scope.

### Security Checklist Format

Every feature file includes a security checklist at the end:

```
## Security Checklist
- [ ] <Control description>
- [ ] <Control description>
```

All items must be verified before the feature is marked APPROVED.

### API Contract Format

```
<METHOD> <path>
  Auth:     <none | user | admin>
  Request:  { field: type, ... }
  Response: { field: type, ... }
  Errors:   <status code> (<description>), ...
```

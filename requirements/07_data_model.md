# Data Model

> **Document ID:** REQ-07  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 7 (Lines 487-536)

---

## 1. Overview

This document defines the relational database schema, critical indexing strategies, and data retention policies for the ZISUN platform. The data model is designed to support high-concurrency checkouts, optimistic locking for inventory, and reliable event-driven architecture using the Outbox pattern.

---

## 2. Core Entities & Relationships

### 2.1 User & Access
| Entity | Key Fields | Relationships | Notes |
|--------|------------|---------------|-------|
| **Users** | `id` (UUID, PK), `phone` (Unique), `name`, `email`, `role` (user/admin), `created_at`, `deleted_at` | Has many: Orders, Addresses | Soft-deletes enabled. Auth logic relies on `phone`. |
| **Addresses**| `id` (UUID, PK), `user_id` (FK), `line1`, `city`, `state`, `pincode`, `is_default` | Belongs to: User | |

### 2.2 Catalog & Inventory
| Entity | Key Fields | Relationships | Notes |
|--------|------------|---------------|-------|
| **Products** | `id` (UUID, PK), `name`, `description`, `base_price`, `category_id`, `vendor_id`, `deleted_at` | Has many: ProductVariants | `base_price` is an integer (paise/cents). Soft deletes enabled. |
| **ProductVariants**| `id` (UUID, PK), `product_id` (FK), `sku` (Unique), `size`, `color`, `stock`, `price_delta`, `version` | Belongs to: Product | `version` is used for optimistic locking during stock decrement. |

### 2.3 Commerce & Transactions
| Entity | Key Fields | Relationships | Notes |
|--------|------------|---------------|-------|
| **Orders** | `id` (UUID, PK), `user_id` (FK), `status` (Enum), `total_amount`, `address_id` (FK), `created_at` | Has many: OrderItems, one Payment, one Fulfillment | State machine logic enforced on `status`. |
| **OrderItems**| `id` (UUID, PK), `order_id` (FK), `product_variant_id` (FK), `quantity`, `unit_price` | Belongs to: Order | `unit_price` is a snapshot of the price at checkout time. |
| **Payments** | `id` (UUID, PK), `order_id` (FK), `gateway`, `payment_gateway_id` (Unique), `status`, `amount`, `processed_at` | Belongs to: Order | `UNIQUE` constraint on `payment_gateway_id` enforces idempotency. |
| **InventoryLocks**| `id` (UUID, PK), `product_variant_id` (FK), `order_id` (FK), `reserved_qty`, `status` (Enum), `expires_at` | | `status` can be active, released, or expired. Used to hold stock during payment flow. |

### 2.4 Logistics & Events
| Entity | Key Fields | Relationships | Notes |
|--------|------------|---------------|-------|
| **Fulfillments**| `id` (UUID, PK), `order_id` (FK), `carrier`, `awb_number` (Unique), `status`, `external_ref`, `created_at` | Belongs to: Order | `external_ref` maps to Shiprocket's order ID to prevent duplicates. |
| **OutboxEvents**| `id` (UUID, PK), `aggregate_type`, `aggregate_id`, `event_type`, `payload` (JSONB), `published_at`, `created_at` | | Transactional outbox. Worker polls rows where `published_at IS NULL`. |

---

## 3. Critical Indexes

To meet the NFR prohibiting sequential scans on production tables (FR-Scalability), the following indexes are mandatory:

### 3.1 Order Queries
- `orders(user_id, created_at DESC)`: Rapid loading of user order history.
- `orders(status, created_at)`: Rapid scanning by the Zombie Order Cleanup job (looking for old `PAYMENT_PENDING` orders).
- `order_items(order_id)`: Quick retrieval of items for a specific order detail view.

### 3.2 Integrity & Idempotency
- `payments(payment_gateway_id)`: **UNIQUE** index. Crucial for Razorpay webhook idempotency.
- `product_variants(sku)`: **UNIQUE** index. Crucial for CSV bulk uploads and catalog matching.
- `fulfillments(awb_number)`: **UNIQUE** index.
- `fulfillments(external_ref)`: **UNIQUE** index. Crucial for Shiprocket idempotency.

### 3.3 Catalog Lookups
- `product_variants(product_id)`: Rapid loading of variants when viewing a product bottom sheet.

### 3.4 Background Workers
- `inventory_locks(product_variant_id, status)`: Fast sum aggregation of active reserved stock for a variant.
- `inventory_locks(order_id)`: Quick lookup to release locks when an order completes.
- `inventory_locks(expires_at)`: Rapid scanning by the Zombie Order Cleanup job for expired locks.
- `outbox_events(published_at, created_at)`: Polling index for the Outbox worker. Highly optimized for `WHERE published_at IS NULL`.

---

## 4. Data Type & Schema Conventions

1. **Primary Keys:** UUID v4 preferred over auto-incrementing integers for security (prevents ID enumeration attacks).
2. **Timestamps:** All `created_at`, `updated_at`, `deleted_at` fields must be stored in UTC format.
3. **Currency/Prices:** Stored strictly as `Integer` representing the smallest unit (paise for INR). Floats or Decimals must not be used to prevent rounding errors.
4. **Soft Deletes:** Represented by a nullable `deleted_at` timestamp. Global ORM scopes must exclude these records by default unless explicitly requested.
5. **JSON payloads:** Unstructured data (like event payloads in the Outbox) must use PostgreSQL `JSONB` for optimized storage and querying.

---

## 5. Data Retention Policy

To comply with the India DPDP Act (2023) and operational constraints:

- **Financial/Order Data:** Order and Payment records are retained for **7 years** to ensure compliance with Indian GST and financial regulations.
- **User Behavioral Events:** Analytics events are retained in raw form for **2 years**. After 1 year, PII associated with these events must be anonymized, preserving the data for ML models (Style Fingerprinting) but removing direct user linkage.
- **Payment Security:** No payment card numbers or bank credentials are ever stored. Only the gateway transaction IDs (`pay_xxx`) are retained for reconciliation.
- **Logs:** 
  - General application logs retained for **90 days**.
  - Error/crash logs (e.g., Sentry) retained for **1 year**.

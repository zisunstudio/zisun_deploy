# Feature: Product Catalog & Inventory

> **Document ID:** FEAT-CAT-01  
> **Version:** 1.0  
> **Owner:** Backend Lead  
> **PRD Source:** Section 4.3 (Lines 234-258), Section 7 (Lines 487-536)

---

## 1. Feature Overview

The core catalog management system allowing the ZISUN admin team to create, update, and manage products, variants, and real-time inventory. 

**Priority:** P0 — Essential for rendering the shoppable feed and processing checkout.

### User Story
As an admin, I want to create and manage products with variants (size, color) so that customers always see accurate availability, pricing, and high-quality media.

---

## 2. Acceptance Criteria

### 2.1 Product & Variant Data Model
- **Product Basics:** Name, description, base price, sale price, category, tags.
- **Media Support:** Minimum 1 image, maximum 10 images. Optional video support.
- **Variant Handling:** Products must have at least one variant. Each variant tracks:
  - `sku` (Unique Stock Keeping Unit)
  - `size`, `color`
  - `stock` (Integer)
  - `price_delta` (added to or subtracted from the base price)

### 2.2 Inventory Management & Atomicity
- **Strict Atomicity:** Stock decrement operations must be atomic. Under high concurrent load, overselling is impossible.
- **Optimistic Locking:** Uses a `version` integer column on the `product_variants` table. Update queries must include `WHERE version = current_version` and increment the version.
- **Stock Floor:** `stock` cannot drop below `0`.

### 2.3 Product Visibility & States
- **Out of Stock:** Variants with `stock = 0` are visually disabled in the UI (but not hidden). They display a "Notify Me" Call-to-Action.
- **Soft Delete:** Products can be soft-deleted (`deleted_at` timestamp). Deleted products are hidden from the catalog and feed but remain structurally intact to preserve order history.
- **Graceful Degradation:** If a product linked to a feed content card is soft-deleted, the feed card should gracefully handle the broken link (e.g., disable the shop button).

### 2.4 Admin Operations
- **Single Edit:** Admin dashboard allows CRUD for individual products and variants.
- **Bulk CSV Update:** Admin can upload a CSV to update stock levels in bulk.
  - CSV must use `sku` as the lookup key.
  - The upload must validate all rows before committing any changes.

### 2.5 Media Handling (Phase 1 / Phase 2)
- **Storage:** Original images stored in S3/Cloudflare R2.
- **Delivery:** Served via CDN.
- **Processing:** Thumbnails auto-generated at 3 sizes on upload. (Can be implemented via Cloudflare Image Resizing or S3 Lambda trigger).

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **`products` Table:** `id`, `name`, `description`, `base_price`, `category_id`, `vendor_id`, `deleted_at`
- **`product_variants` Table:** `id`, `product_id`, `sku` (UNIQUE), `size`, `color`, `stock`, `price_delta`, `version` (optimistic locking counter).
- **Indexes:** 
  - `products`: `(deleted_at)`
  - `product_variants`: `(product_id)`, `(sku)`

---

## 4. API Contracts

*Note: Consumer APIs are read-only. Admin APIs are read-write.*

### Consumer APIs
#### `GET /catalog/products/{id}`
- **Auth:** None
- **Response:** Full product details, array of variants (including stock > 0 check), array of media URLs.

### Admin APIs
#### `POST /admin/products`
- **Auth:** Admin JWT
- **Request:** Product metadata + variant list.
- **Response:** `201 Created`, `{ "product": {...} }`

#### `PUT /admin/products/{id}`
- **Auth:** Admin JWT
- **Request:** Partial update for product or variants.
- **Response:** `200 OK`

#### `POST /admin/inventory/bulk-update`
- **Auth:** Admin JWT
- **Request:** `multipart/form-data` with CSV file.
- **Response:** `200 OK`, `{ "updated_variants": 150, "errors": [] }`

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Concurrent Checkout (Race Condition)** | Two users try to buy the last unit. Optimistic locking ensures the first commit wins. The second fails with a 409 Conflict, and the user is told the item sold out. |
| **Missing Image / CDN Failure** | Frontend must have a fallback "Image not available" placeholder. |
| **CSV Upload Errors** | If the CSV contains invalid SKUs or negative stock values, the entire upload is rejected (all-or-nothing transaction). |
| **Pricing Errors** | `base_price + price_delta` must never result in a negative total price. Database constraint `CHECK (base_price + price_delta >= 0)`. |

---

## 6. Security Checklist

- [ ] All `POST`/`PUT`/`DELETE` catalog APIs strictly protected by Admin JWT validation.
- [ ] Optimistic locking (or `SELECT FOR UPDATE`) strictly applied to all stock decrement logic.
- [ ] Image uploads scanned/restricted to valid MIME types (image/jpeg, image/png, image/webp) to prevent malicious payloads.
- [ ] File size limits enforced on image/video uploads (e.g., 5MB for images).
- [ ] Database constraints prevent negative stock and negative pricing.

# Feature: Internal Admin Dashboard

> **Document ID:** FEAT-ADMIN-01  
> **Version:** 1.0  
> **Owner:** Frontend Lead  
> **PRD Source:** Section 4.7 (Lines 346-357)

---

## 1. Feature Overview

A secure, web-based internal tool for the ZISUN operations team. It provides interfaces for order lifecycle management, product catalog curation, inventory control, and payment reconciliation. 

**Priority:** P0 — Required before accepting any live customer orders to prevent manual database manipulation.

### User Story
As an Operations team member, I need a centralized dashboard to manage orders, update inventory, and resolve customer issues so that I don't have to rely on engineering to run SQL queries for daily tasks.

---

## 2. Acceptance Criteria

### 2.1 Role-Based Access Control (RBAC)
The dashboard must enforce access based on the logged-in user's role:
- **Admin:** Full read/write access to all modules. Can create other admin users.
- **Operations:** Read/write access to Orders and Inventory. Cannot process refunds.
- **Finance:** Read-only access to Orders. Read-only access to Payment Reconciliation.

### 2.2 Order Management Module
- **List View:**
  - Table displaying recent orders with server-side pagination (50 per page).
  - Filters: Status (Dropdown), Date Range (Datepicker), Payment Method.
  - Global Search: Search by `order_id` or `phone_number`.
- **Detail View:**
  - Displays customer info, shipping address, purchased items, and full state transition history.
  - Action buttons based on current state (e.g., "Mark as Packed" only visible if state is `PAID`).
  - Destructive actions (Cancel, Initiate Refund) require a confirmation modal.

### 2.3 Catalog & Inventory Module
- **Product Management:**
  - Forms to create, edit, and soft-delete (`deactivate`) products and their variants.
  - Image upload interface with drag-and-drop support.
- **Inventory Dashboard:**
  - Table showing all active SKUs and current `stock`.
  - Configurable "Low Stock Threshold" (e.g., alert if stock < 5).
  - **Bulk Update:** Interface to upload a CSV file (`sku`, `new_stock`) to update inventory atomically.

### 2.4 Payment Reconciliation Module
- Read-only table joining the `orders` and `payments` data.
- Displays `order_id`, ZISUN `status`, `payment_gateway_id`, Razorpay `status`, and `amount`.
- Highlights discrepancies (e.g., ZISUN order is `CANCELLED` but Razorpay shows `CAPTURED`).

---

## 3. UX & Design Constraints

- **Desktop-First:** The dashboard is used by employees on laptops/desktops. Mobile responsiveness is nice-to-have but not required for MVP.
- **Performance:** Data tables with up to 1,000 rows must render without browser lag. Use virtualized lists if pagination is disabled, though server-side pagination is preferred.
- **Clear Feedback:** Every state mutation (e.g., updating stock, refunding) must show a success/error toast notification.

---

## 4. API Contracts

*Note: All endpoints require a valid JWT with an authorized `role` claim.*

### `GET /admin/orders`
- **Query Params:** `?page=1&limit=50&status=PAID&search=9876543210`
- **Response:** Paginated list of orders.

### `POST /admin/products/bulk-stock`
- **Request:** `multipart/form-data` containing `file` (CSV).
- **Response:** `200 OK`, `{ "success_count": 145, "error_count": 0, "errors": [] }`

### `POST /admin/orders/{id}/refund`
- **Auth Limit:** Role must be `Admin`.
- **Request:** `{ "amount": 100000, "reason": "Customer requested" }`
- **Response:** `200 OK`, updated order/payment status.

---

## 5. Security & Edge Cases

| Edge Case / Security Risk | Handling Strategy |
|---------------------------|-------------------|
| **Unauthorized Role Access** | API middleware must strictly check the `role` claim in the JWT. The frontend hiding a button is not sufficient security. |
| **Concurrent Admin Edits** | If two admins open the same order and both click "Mark Packed", the backend state machine validates the transition. The second click will fail gracefully with "Order is already packed". |
| **CSV Upload Formatting Error** | Validate CSV headers (`sku`, `stock`). If validation fails, reject the entire file and show exact row errors to the user. Do not process partial uploads. |
| **Cross-Site Scripting (XSS)** | Admin inputs for product descriptions/names must be sanitized before rendering on the consumer frontend. |

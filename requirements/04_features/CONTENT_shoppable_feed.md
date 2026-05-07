# Feature: Shoppable Content Feed

> **Document ID:** FEAT-CONTENT-01  
> **Version:** 1.0  
> **Owner:** Frontend Lead  
> **PRD Source:** Section 4.2 (Lines 209-232), Section 9.2 (Lines 576-581), Section 10 (Lines 596-631)

---

## 1. Feature Overview

The core discovery engine of the ZISUN platform. A vertically scrollable, story-first feed where every piece of media (image or video) is linked to a purchasable product. This replaces the traditional search-and-grid eCommerce UX with an immersive, editorial experience.

**Priority:** P0 — Core product differentiator.

### User Story
As a fashion-curious user, I want to scroll a curated feed and tap any item to instantly view and purchase it, so I can shop for occasions without actively searching for specific keywords.

---

## 2. Acceptance Criteria

### 2.1 Feed Mechanics & Layout
- **Scroll Behavior:** Vertically scrollable infinite feed.
- **Pagination:** Feed API returns 20 cards per page. The client preloads the next page automatically when the user reaches 80% scroll depth.
- **Card Elements:** Each card must display:
  - Media (High-res image or video)
  - Caption / Story text
  - "Shop Now" Call-to-Action (CTA) indicating the linked product's base price.
- **Performance State:** Skeleton loading state must be shown during initial load. First paint must occur in `< 800ms` (P50) and `< 2s` (P95) on a 4G connection.

### 2.2 Product Discovery (Bottom Sheet)
- **Interaction:** Tapping a product link/CTA on a content card opens a **Bottom Sheet**.
- **Constraint:** It must *never* navigate to a new full page (which breaks scroll context).
- **Sheet Contents:** 
  - Product carousel images
  - Title, description, price
  - Size and color variant selection
  - Add to Cart button
- **Stock States:** If the selected variant is out of stock, the button changes to "Notify Me" (disabled state, not hidden).

### 2.3 Media Handling
- **Images:** Lazy-loaded with blur-up placeholders to ensure Cumulative Layout Shift (CLS) is `< 0.1`.
- **Video:** 
  - Autoplay is muted by default. Tapping the video toggles mute/unmute.
  - Video must load within 3 seconds on a 3G network (P1).
  - The first frame of the video must be served as a static thumbnail immediately while the video buffer loads.

### 2.4 Content Tagging
- Content is tagged by `occasion`, `season`, `price_band`, and `category`. 
- *(Phase 2+ context: These tags feed the style fingerprinting and ML recommendation engine).*

---

## 3. Data Model Impact

*Reference `07_data_model.md` for full schema.*

- **`content_cards` Table (Proposed):** `id`, `type` (image/video), `media_url`, `thumbnail_url`, `caption`, `status` (published/draft), `created_at`
- **`content_tags` Table (Proposed):** `content_card_id`, `tag_name`, `tag_type` (occasion/season/etc.)
- **`content_products` Join Table (Proposed):** `content_card_id`, `product_id`

---

## 4. API Contracts

### `GET /feed`
- **Auth:** None (Public) or User JWT (for personalized sorting in Phase 3)
- **Query Params:** `?page=1&limit=20`
- **Response:** `200 OK`
  ```json
  {
    "data": [
      {
        "id": "crd_123",
        "media_type": "video",
        "media_url": "https://cdn.../video.mp4",
        "thumbnail_url": "https://cdn.../thumb.jpg",
        "caption": "Summer Goa Trip Essentials",
        "products": [
          {
            "id": "prod_456",
            "name": "Floral Resort Shirt",
            "price": 1299,
            "status": "active"
          }
        ]
      }
    ],
    "next_page": 2
  }
  ```

---

## 5. Edge Cases & Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Soft-Deleted Product** | If a product linked to a card is deleted by admin, the API should omit that product from the `products` array. If the card has 0 active products, the card itself should be hidden from the feed to prevent dead-ends. |
| **Out-of-Stock Product** | Display product in the bottom sheet, but replace "Add to Cart" with "Notify Me". |
| **Offline/Network Drop** | PWA service worker must serve cached feed data. Display an unobtrusive "You're offline" banner. Do not show a blank white screen. |
| **Unsupported Video Codec** | Fallback to displaying the high-res thumbnail with a link to view the product directly. |

---

## 6. Security & Performance Checklist

- [ ] Feed pagination implemented (prevents massive DB queries and payload size).
- [ ] No N+1 query problems in feed generation (e.g., fetching products for each card in a loop). Must use SQL `JOIN` or eager loading.
- [ ] Images served with `srcset` for adaptive resolution based on device DPI.
- [ ] Video compression pipeline in place (HLS streaming or highly compressed MP4).
- [ ] API strictly rate-limited for public (unauthenticated) access to prevent scraping.

# User Personas

> **Document ID:** REQ-03  
> **Version:** 1.0  
> **Last Updated:** 2026-05-03  
> **Owner:** Product Lead  
> **PRD Source:** Section 3 (Lines 121–183), Section 9 (Lines 568–593), Section 13 (Lines 725–728)

---

## Persona 1 — Priya (Primary Buyer)

### Profile

| Attribute | Detail |
|-----------|--------|
| **Name** | Priya |
| **Age** | 23 |
| **Location** | Mumbai / Pune (Tier 1) |
| **Occupation** | Junior marketing executive |
| **Monthly Income** | ₹35,000–₹55,000 |
| **Disposable Fashion Budget** | ₹3,000–₹6,000/month (8–11% of income) |
| **Education** | Graduate; digitally fluent |
| **Living Situation** | Lives with family or in a shared flat; minimal financial obligations |

### Device & Network Profile

| Parameter | Value | Engineering Impact |
|-----------|-------|--------------------|
| **Primary Device** | iPhone 13 or mid-range Android (Samsung Galaxy A-series) | Must support both Safari WebKit and Chrome; test on both |
| **Screen Size** | 6.1" (iPhone 13) / 6.4–6.5" (Galaxy A54) | Bottom sheet must render fully within viewport; no horizontal scroll |
| **OS** | iOS 16+ / Android 12+ | PWA install prompt differs per OS; service worker scope must handle both |
| **Network** | 5G / strong 4G (50–100 Mbps typical in Tier 1) | Can serve full-resolution images; video autoplay feasible |
| **RAM** | 4–6 GB | Feed virtualization not critical but recommended for 50+ cards |
| **Storage** | 64–128 GB | PWA cache can be generous (up to 50 MB) |
| **Payment Apps** | Google Pay, PhonePe, Paytm — all UPI-enabled | Razorpay UPI intent flow is primary; QR code secondary |

### Goals

1. Discover occasion-appropriate outfits (wedding, brunch, office party) without manual searching.
2. Feel that the platform "gets her style" — curated, not algorithmic spam.
3. Complete purchase quickly during commute or lunch break (< 90 seconds).
4. Share finds with friends via WhatsApp before buying (social validation loop).
5. Track orders without downloading another app — WhatsApp is sufficient.

### Pain Points

| Pain Point | Current Behavior | ZISUN Opportunity |
|------------|-----------------|-------------------|
| Myntra feels too clinical and transactional | Browses Instagram Reels for inspiration, then price-checks on Myntra | Content-first feed that merges inspiration with purchase |
| Meesho feels chaotic and low-quality | Avoids Meesho despite lower prices — brand perception matters | Curated, editorial quality signals premium without premium pricing |
| Checkout friction causes abandonment | Abandons 40%+ of carts due to address re-entry and payment redirects | Saved addresses + Razorpay one-tap UPI eliminates friction |
| No platform connects content to commerce | Sees an outfit on Instagram → searches Myntra → can't find exact item → gives up | Every content card links directly to purchasable products |

### Buying Psychology

- **Trigger:** Visual inspiration (a Reel showing "what to wear to a Goa trip").
- **Decision window:** 2–5 minutes. If the item isn't purchasable within that window, intent decays.
- **Price sensitivity:** Moderate. Will pay ₹500–₹2,000 per item if the story resonates. Price > ₹2,500 triggers comparison shopping.
- **Trust triggers:** High-quality product photography, clear return policy visible before checkout, reviews from similar demographics.
- **Social proof:** Shares product links on WhatsApp groups before buying. Peer approval accelerates conversion.

### Trust Triggers

1. **Visual quality** — Professional photography, not stock images. If media looks cheap, she assumes the product is cheap.
2. **Return policy visibility** — "7-day easy returns" must be visible on the product card, not buried in footer links.
3. **Price transparency** — No hidden charges at checkout. The price on the content card must match the checkout total (+ delivery).
4. **Brand narrative** — Story behind the product (occasion, styling tips) builds emotional investment.
5. **WhatsApp confirmation** — Receiving an order confirmation on WhatsApp feels more personal and trustworthy than email.

### Drop-off Reasons

1. **Slow feed load** — If feed takes > 3 seconds, she switches back to Instagram. Hard limit: 4 seconds.
2. **Payment redirect** — Being redirected to a bank page breaks immersion. UPI intent (in-app) is essential.
3. **Out-of-stock after intent** — Tapping "Add to Cart" on an out-of-stock item without prior warning destroys trust.
4. **Forced account creation before browse** — She wants to explore before committing. Auth must be deferred to checkout.
5. **No size guidance** — Unsure about fit → abandons. Size chart + "similar items" reduces this.

---

## Persona 2 — Rohan (Aspirational Urban Male)

### Profile

| Attribute | Detail |
|-----------|--------|
| **Name** | Rohan |
| **Age** | 27 |
| **Location** | Bangalore (Tier 1) |
| **Occupation** | Mid-level software engineer |
| **Monthly Income** | ₹80,000+ |
| **Disposable Fashion Budget** | ₹8,000–₹15,000/month |
| **Education** | Engineering graduate; high digital literacy |
| **Living Situation** | Independent; high discretionary income, low time |

### Device & Network Profile

| Parameter | Value | Engineering Impact |
|-----------|-------|--------------------|
| **Primary Device** | iPhone 14 Pro / OnePlus 12 | High-end device; can handle animations, video, rich UI |
| **Screen Size** | 6.1–6.7" | Full viewport utilization; support dynamic island (iPhone) |
| **OS** | iOS 17+ / Android 14+ | Latest APIs available; push notification support reliable |
| **Network** | 5G / WiFi (100+ Mbps at home/office) | Full HD video autoplay; preloading aggressive strategy works |
| **RAM** | 6–8 GB | No memory constraints; feed virtualization optional |
| **Payment Apps** | Google Pay, Apple Pay, credit cards | Razorpay supports all; card-on-file for repeat purchases |

### Goals

1. Find one high-quality outfit for a specific occasion without spending 40 minutes browsing.
2. Buy confidently — he trusts recommendations more than his own browsing.
3. Spend money when something resonates, but doesn't actively shop.
4. Minimal interaction — discover, decide, buy, done.

### Pain Points

| Pain Point | Current Behavior | ZISUN Opportunity |
|------------|-----------------|-------------------|
| Overwhelming choice on Myntra | Spends 40 minutes filtering, ends up buying nothing | Curated, occasion-tagged content eliminates decision fatigue |
| No curation for men's fashion | Male fashion sections are afterthoughts on most platforms | Dedicated male content cards with occasion context |
| Doesn't enjoy "shopping" as activity | Only buys when triggered by an event (party, date, trip) | Event-based content ("rooftop party outfit") matches his triggers |
| High AOV but low frequency | Buys 2–3 times per quarter, spends ₹2,000–₹5,000 per purchase | Each purchase is high-value; retention via quality, not volume |

### Buying Psychology

- **Trigger:** Upcoming event (party, trip, date). Rarely impulse-buys.
- **Decision window:** 10–30 minutes. Once decided, wants instant checkout.
- **Price sensitivity:** Low. Will pay ₹1,000–₹5,000 without comparison shopping if the curation is right.
- **Trust triggers:** Clean UI, fast checkout, no spam post-purchase.
- **Social proof:** Doesn't seek peer validation. Trusts editorial curation and product photography.

### Trust Triggers

1. **Speed** — Fast load, fast checkout, minimal steps. A slow platform signals "not built for professionals."
2. **No spam** — If ZISUN sends more than 2 WhatsApp messages per order, he will block the number.
3. **Premium feel** — UI must feel as polished as Apple.com, not like a discount marketplace.
4. **Clear delivery timeline** — "Delivery by Thursday" is a trust signal. "3–7 business days" is not.
5. **Easy returns** — Knowing he can return without hassle removes purchase anxiety.

### Drop-off Reasons

1. **Too many steps** — If checkout has > 3 screens, he bounces.
2. **Cluttered UI** — Banners, pop-ups, or promotional noise → immediate exit.
3. **No occasion context** — A generic catalog with no styling context doesn't help him.
4. **Post-purchase spam** — Promotional WhatsApp messages after purchase → blocks the number.

---

## Persona 3 — Divya (Tier 2 Value Shopper)

### Profile

| Attribute | Detail |
|-----------|--------|
| **Name** | Divya |
| **Age** | 26 |
| **Location** | Nagpur / Indore (Tier 2) |
| **Occupation** | School teacher |
| **Monthly Income** | ₹22,000 |
| **Disposable Fashion Budget** | ₹1,500–₹2,500/month |
| **Education** | Graduate; moderate digital literacy |
| **Living Situation** | Lives with family; contributes to household expenses |

### Device & Network Profile

| Parameter | Value | Engineering Impact |
|-----------|-------|--------------------|
| **Primary Device** | Budget Android (Redmi Note series, Realme 9) | **Critical:** 2–3 GB RAM; heavy JS causes jank; must test on low-end devices |
| **Screen Size** | 6.4–6.6" (HD+ 720p resolution) | Images must render crisp at 720p; avoid assets designed only for 1080p+ |
| **OS** | Android 11–12 | Older WebView; test PWA features on Android 11 specifically |
| **Network** | Inconsistent 4G (2–10 Mbps); drops to 3G in transit | **Critical:** Images must lazy-load; video must NOT autoplay; skeleton loading mandatory |
| **RAM** | 2–3 GB | Feed must use virtualized scrolling (only render visible cards); max DOM nodes < 500 |
| **Storage** | 32–64 GB (often 50%+ full) | PWA cache must be < 10 MB; aggressive cache eviction policy |
| **Payment Apps** | PhonePe (primary), Google Pay; no credit card | UPI is the only viable payment method; card flow is irrelevant for this persona |

### Goals

1. Buy something nice for a specific occasion (cousin's engagement, Diwali) without overspending.
2. Simple, guided experience — don't make her think about what to do next.
3. Get validation from family/friends before buying (WhatsApp sharing is essential).
4. Feel confident that the product will look like the photo.
5. Track delivery status easily — preferably via WhatsApp, not a tracking website.

### Pain Points

| Pain Point | Current Behavior | ZISUN Opportunity |
|------------|-----------------|-------------------|
| Apps feel slow on her device | Uninstalls apps that lag; keeps only essentials (WhatsApp, PhonePe, YouTube) | PWA avoids install; lightweight JS; lazy loading |
| Checkout is confusing | Gets stuck at address forms; doesn't understand pincode auto-fill | Simplified checkout with pincode-first address; large tap targets |
| Doesn't trust online payments | Has been warned about online fraud; prefers UPI over card | UPI-only payment with clear "Payment Secured by Razorpay" branding |
| Can't find products friends recommend | Friends share Instagram posts; she can't find the exact item to buy | WhatsApp share links that deep-link to exact product + size |
| Returns feel risky | Worried she won't get refund if product is wrong | Clear return policy; WhatsApp-based return initiation removes friction |

### Buying Psychology

- **Trigger:** Social event + peer recommendation ("My friend bought this for her engagement").
- **Decision window:** 1–3 days. Consults family, compares prices, then buys.
- **Price sensitivity:** High. Sweet spot: ₹400–₹1,200. Above ₹1,500 requires significant justification.
- **Trust triggers:** "Verified seller" badges, return policy, UPI payment (feels safer than card), WhatsApp confirmation.
- **Social proof:** Critical. She shares with family WhatsApp group and waits for approval before buying.

### Trust Triggers

1. **WhatsApp-native experience** — If she can order/track via WhatsApp, it feels like buying from a person, not a platform.
2. **UPI payment** — Cards feel risky. UPI (PhonePe/Google Pay) feels safe and familiar.
3. **Hindi/regional language support** — [ASSUMPTION] MVP is English-only (PRD doesn't specify localization). But UI copy should be simple, jargon-free English. Regional language support is a Phase 3+ feature. Override: If founder confirms Hindi is MVP-required, add i18n framework at scaffold.
4. **Product photos with real people** — Stock photos on white backgrounds don't build trust. Lifestyle shots do.
5. **Delivery estimate with specific date** — "Arrives by May 8" >> "5–7 business days."

### Drop-off Reasons

1. **App/page crashes or freezes** — On 2 GB RAM devices, heavy JS causes ANR (Application Not Responding). She will never return.
2. **Slow image loading** — Blank white squares while images load = she assumes the site is broken.
3. **Payment failure without clear message** — "Transaction failed" with no guidance → she assumes she's been charged and panics.
4. **No COD option** — [Note: COD is out of MVP scope per PRD §13.2]. This WILL cause drop-offs for this persona. Mitigation: clear messaging ("Pay safely via UPI — powered by Razorpay") + prominent UPI branding.
5. **Complex address form** — Multi-field address forms are intimidating. Pincode-first with auto-fill is essential.

---

## Persona 4 — Admin / Ops User (Internal)

### Profile

| Attribute | Detail |
|-----------|--------|
| **Name** | Aisha (representative) |
| **Age** | 28 |
| **Location** | Remote (any city) |
| **Role** | ZISUN Operations Team |
| **Technical Skill** | Moderate — comfortable with dashboards, spreadsheets; not comfortable with SQL or CLI |
| **Working Hours** | 10 AM – 7 PM IST; may handle urgent orders outside hours |

### Device & Network Profile

| Parameter | Value | Engineering Impact |
|-----------|-------|--------------------|
| **Primary Device** | Laptop (Windows/Mac) + secondary phone for WhatsApp alerts | Admin dashboard is desktop-first; responsive but not mobile-optimized |
| **Browser** | Chrome 120+ | Standard browser; no IE/Safari edge cases for admin |
| **Screen Size** | 13–15" laptop (1920×1080) | Data tables must be readable at 1080p without horizontal scroll |
| **Network** | WiFi / broadband (20–100 Mbps) | Network is not a constraint; can load full data tables |

### Goals

1. Process orders from PAID to PACKED to SHIPPED without touching a database.
2. Update inventory when new stock arrives — ideally via CSV bulk upload.
3. Handle customer issues (cancellations, returns, refunds) with clear audit trails.
4. Monitor payment reconciliation — flag mismatches between ZISUN records and Razorpay settlements.
5. Push new content to the feed with linked products.

### Pain Points

| Pain Point | Current Behavior (Without Dashboard) | ZISUN Opportunity |
|------------|--------------------------------------|-------------------|
| Order management via SQL | Direct DB queries for order status; error-prone, no audit trail | Dashboard with order list, filters, and action buttons |
| Inventory updates via raw DB | `UPDATE product_variants SET stock = X WHERE sku = 'Y'` — one typo causes oversell | CSV upload with validation; preview before commit |
| No payment visibility | Checks Razorpay dashboard separately; no cross-reference with ZISUN orders | Integrated payment reconciliation view |
| Customer issues handled via memory | No system for tracking who cancelled what and why | Order history with full state transition log |

### Tasks & Required Features

| Task | Feature Required | Priority |
|------|-----------------|----------|
| View and filter orders | Order list with status/date/search filters | P0 |
| Process order (mark packed) | Action button on order detail → triggers Shiprocket | P0 |
| Cancel order + refund | Cancel button with refund initiation via Razorpay API | P0 |
| Create/edit products | Product form with variant management | P0 |
| Bulk stock update | CSV upload with validation and preview | P0 |
| View payment status | Payment reconciliation view with gateway cross-reference | P0 |
| Push content to feed | Content creation form with media upload + product linking | P1 |
| View low-stock alerts | Inventory dashboard with configurable threshold alerts | P1 |

### Trust Triggers

1. **Audit trail** — Every action must be logged with timestamp and user ID.
2. **Confirmation modals** — Destructive actions (cancel, refund) require confirmation with summary.
3. **Undo/recovery** — Soft delete on products; order cancellation is reversible until fulfillment.
4. **Data validation** — CSV upload must validate before committing; show preview with error highlighting.

### Drop-off Reasons (Admin Context = Operational Failure)

1. **Dashboard is too slow** — Admin order list with 1,000 orders must load in < 1 second (PRD §10).
2. **No bulk operations** — If stock update requires editing one product at a time, ops team wastes hours.
3. **No error recovery** — If a Shiprocket API call fails and there's no retry button, orders get stuck.
4. **Ambiguous order states** — If the dashboard doesn't clearly show why an order is in a particular state, ops can't resolve issues.

---

## User Capability Matrix

Maps each persona's technical capabilities to inform feature complexity decisions.

| Capability | Priya | Rohan | Divya | Admin |
|------------|-------|-------|-------|-------|
| Can install PWA | ✅ | ✅ | ⚠️ May not understand prompt | N/A (desktop) |
| Can use UPI payment | ✅ | ✅ | ✅ (primary method) | N/A |
| Can use card payment | ✅ | ✅ | ❌ (no credit card) | N/A |
| Can navigate multi-step checkout | ✅ | ✅ (prefers fewer steps) | ⚠️ Needs large CTAs, simple forms | N/A |
| Can share via WhatsApp | ✅ | ✅ (rarely) | ✅ (primary sharing method) | N/A |
| Can read English UI | ✅ | ✅ | ⚠️ Simple English only | ✅ |
| Can handle payment failure recovery | ✅ | ✅ | ❌ Needs explicit guidance | ✅ |
| Can use CSV upload | N/A | N/A | N/A | ✅ |
| Comfortable with data tables | N/A | N/A | N/A | ✅ |

**Legend:** ✅ = Fully capable | ⚠️ = Needs UX accommodation | ❌ = Cannot do / not applicable

---

## Feature Access Matrix

Maps features to personas with access level and priority.

| Feature | Priya | Rohan | Divya | Admin |
|---------|-------|-------|-------|-------|
| Content Feed (browse) | ✅ Primary | ✅ Primary | ✅ Primary | ❌ Not applicable |
| Product Quick-View (bottom sheet) | ✅ | ✅ | ✅ (simplified) | ❌ |
| Add to Cart | ✅ | ✅ | ✅ | ❌ |
| Checkout (UPI) | ✅ | ✅ | ✅ Primary | ❌ |
| Checkout (Card) | ✅ | ✅ Primary | ❌ | ❌ |
| WhatsApp Order Updates | ✅ | ✅ (minimal) | ✅ Primary | ❌ |
| WhatsApp Order Query | ⚠️ Occasional | ❌ Prefers app | ✅ Primary | ❌ |
| Order Tracking (in-app) | ✅ Primary | ✅ Primary | ⚠️ Secondary | ❌ |
| Order Management | ❌ | ❌ | ❌ | ✅ Primary |
| Product Management | ❌ | ❌ | ❌ | ✅ Primary |
| Inventory Management | ❌ | ❌ | ❌ | ✅ Primary |
| Payment Reconciliation | ❌ | ❌ | ❌ | ✅ Primary |
| Content Publishing | ❌ | ❌ | ❌ | ✅ |

---

## Failure Scenarios

### Scenario 1: Payment Failure

| Persona | Likely Cause | Expected Behavior | Required System Response |
|---------|-------------|-------------------|------------------------|
| **Priya** | UPI app timeout; insufficient balance | Will retry once, then abandon if friction persists | Show "Payment failed — try another method" with alternative payment options pre-loaded. Do NOT force re-entry of order details. Cart and address must persist. |
| **Rohan** | Rare; usually card decline or 3DS timeout | Will try one more card, then leave if it fails again | Instant retry with same payment method. Show specific failure reason ("Card declined by bank" vs "Network timeout — try again"). |
| **Divya** | UPI app not responding; balance check fails; network drop during payment | Panics — thinks she's been charged. May call friends for help. | **Critical:** Show "No money was deducted" message immediately. Provide WhatsApp support link. Offer retry with countdown timer ("Try again in 10 seconds"). Never show technical error codes. |
| **Admin** | Razorpay webhook failure; duplicate webhook | Needs to verify if payment was actually captured | Payment reconciliation view must show gateway status alongside ZISUN status. Manual "Refresh Payment Status" button that re-checks Razorpay API. |

### Scenario 2: Slow Network / Offline

| Persona | Likely Scenario | Expected Behavior | Required System Response |
|---------|----------------|-------------------|------------------------|
| **Priya** | Rare — strong 4G/5G | Minor annoyance; will wait up to 3 seconds | Standard skeleton loading; progressive image loading (blur-up). |
| **Rohan** | Very rare — almost always on WiFi/5G | Zero tolerance for slow load; will close tab | Aggressive prefetching; CDN-served content; < 2 second first paint. |
| **Divya** | Common — drops to 3G in transit, loses signal in buildings | Thinks the app is broken if images don't load | **Critical:** Skeleton loading for all cards. Text content loads first, images lazy-load. "You're offline" banner (not a blank screen). Video must NOT autoplay — show thumbnail with play button. Cached content shown when offline. Retry button with countdown for failed requests. |
| **Admin** | Rare — on broadband | May lose connection during CSV upload | Upload progress bar with resume capability. "Upload interrupted — resume?" prompt on reconnection. Auto-save draft state for product edits. |

### Scenario 3: Out-of-Stock

| Persona | Discovery Context | Expected Behavior | Required System Response |
|---------|-------------------|-------------------|------------------------|
| **Priya** | Sees product in content feed, taps to buy | Frustrated if she tapped and it's unavailable | Content card must show "Out of Stock" badge BEFORE tap. Bottom sheet shows "Notify Me" button. Suggest similar in-stock products below. |
| **Rohan** | Found the perfect item, ready to buy immediately | Deal-breaker — leaves the platform entirely | Same as Priya, plus: "Back in stock" WhatsApp notification (opt-in). Show similar items with same occasion tag. |
| **Divya** | Friend shared a specific product link | Confused — doesn't understand "out of stock" vs "unavailable" | Use clear language: "This item is currently sold out. We'll message you on WhatsApp when it's back." Show exact same product in different available sizes/colors prominently. |
| **Admin** | Receives customer complaint about out-of-stock | Needs to update inventory or notify customer | Low-stock alert dashboard. Bulk restock via CSV. Order history shows if any orders were affected by stock-out timing. |

---

## Design Implications

### Per-Persona Design Requirements

#### For Priya (and similar Tier 1 users)

- **Feed experience:** Rich, visual, fast. Video autoplay on WiFi/5G. High-quality images.
- **Checkout:** 3-step max (cart → address → payment). Saved addresses and one-tap UPI.
- **Typography:** Modern sans-serif (Inter/Outfit). Body text 16px minimum.
- **Animations:** Smooth transitions (bottom sheet slide-up, cart badge bounce). Micro-interactions enhance the premium feel.

#### For Rohan (high-AOV, low-patience)

- **Feed experience:** Clean, minimal. No promotional banners. No "trending" noise.
- **Checkout:** Fastest possible. Pre-fill everything. Card-on-file for repeat purchases.
- **Typography:** Same as Priya — premium feel is essential.
- **Post-purchase:** Minimal communication. Order confirmation + tracking link only. No marketing follow-ups.

#### For Divya (Tier 2, low-end device)

- **Feed experience:** Lightweight. No video autoplay. Compressed images (WebP, 720p max). Virtualized scrolling.
- **Checkout:** Pincode-first address form (auto-fills city/state). Large buttons (48x48px minimum — exceeding iOS HIG 44x44pt for accessibility). Simple, jargon-free labels.
- **Typography:** 18px minimum body text. High contrast (WCAG AA: 4.5:1). Avoid light gray on white.
- **Error states:** Never show error codes. Always show human-readable message + clear next action. Payment failure MUST show "No money was deducted."
- **Performance budget:** Total JS bundle < 150 KB gzipped. First paint < 2 seconds on 4G (10 Mbps). DOM nodes < 500 for feed view.
- **[ASSUMPTION]** Divya requires UPI as the only payment method. COD is out of MVP scope (PRD §13.2). This will cause some drop-offs. Mitigation: prominent "Secured by Razorpay" badge near the payment button and clear UPI branding. Override: If COD is added to MVP scope, update `CART_checkout_flow.md` and `PAYMENT_razorpay_integration.md`.

#### For Admin (desktop-first)

- **Layout:** Sidebar navigation with collapsible menu. Data tables with sortable columns and inline search.
- **Actions:** Every destructive action requires confirmation modal with summary of what will happen.
- **Bulk operations:** CSV upload with preview, validation errors highlighted per-row before commit.
- **Responsiveness:** Desktop-first. Functional (not optimized) on tablet. Not required on mobile.
- **Performance:** Order list with 1,000 records loads in < 1 second (PRD §10). Paginated API with server-side filtering.

### Cross-Persona Design Rules

1. **Auth is deferred:** No sign-in required to browse the feed. Auth prompt appears only at "Add to Cart" (PRD §5.1, Step 3–4).
2. **Bottom sheet, not new page:** Product details open in a bottom sheet overlay. Full page navigation breaks immersion for all personas.
3. **Price visible always:** Content card shows price. Bottom sheet shows price. Cart shows price. No surprise charges at checkout.
4. **Return policy visible:** On every product detail view — not in a footer link. "7-day easy returns" as a badge.
5. **WhatsApp is a first-class channel:** Order confirmation, tracking updates, and support queries all flow through WhatsApp. This is not an afterthought.
6. **Offline-first mindset:** Every async operation has a skeleton. No white screens. Cached content shown when offline. Retry buttons on failure.

---

## Persona-to-Feature Traceability

| Feature (PRD §) | Primary Persona | Design-Critical Persona | Why |
|-----------------|----------------|------------------------|-----|
| OTP Auth (§4.1) | All | Divya | Simplest auth flow; OTP delivery on inconsistent network; clear error on failed OTP |
| Shoppable Feed (§4.2) | Priya | Divya | Must perform on 2 GB RAM / 3G; virtualized scrolling; no video autoplay on slow network |
| Product Catalog (§4.3) | Admin | Admin | CSV bulk upload; variant management; low-stock alerts |
| Cart & Checkout (§4.4) | Priya | Divya | Pincode-first address; large tap targets; UPI-only for Divya; clear payment failure messages |
| Order Management (§4.5) | Admin | Admin | State machine UI; action buttons; audit trail |
| Payment / Razorpay (§4.4) | Priya, Rohan | Divya | UPI intent flow; "No money deducted" on failure; payment method visibility |
| Fulfillment / Shiprocket (§8) | Admin | Divya | WhatsApp tracking updates; specific delivery date (not range) |
| WhatsApp Commerce (§4.6) | Divya | Divya | Primary interaction channel; order query; return initiation |
| Admin Dashboard (§4.7) | Admin | Admin | Desktop-first; bulk operations; reconciliation view |

---

## Security Checklist

- [ ] OTP rate limiting enforced: 5 OTP/hour/phone, 10 auth requests/min/IP — protects Divya from accidental lockout with clear cooldown message
- [ ] JWT tokens do not contain PII beyond `user_id` and `role` — all personas
- [ ] Admin role requires secondary confirmation step (PRD §4.1) — prevents unauthorized admin access
- [ ] Payment amount validated server-side — client-side amount ignored for all personas
- [ ] No sensitive data in WhatsApp messages — order ID only, no payment details, no full address
- [ ] CORS allows only ZISUN frontend domains — prevents cross-origin exploitation
- [ ] Rate limiting on all public endpoints: 100 req/min/IP — prevents abuse without impacting Divya on shared mobile towers

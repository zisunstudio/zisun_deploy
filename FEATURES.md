# ZISUN — feature ledger

Every feature that has shipped, where it lives, and its state. Nothing we
build is removed silently: a feature leaves this file only by moving to
**Retired**, with the reason and the commit it can be restored from.

`frontend/src/lib/__tests__/featureLedger.test.ts` checks that every file
named in backticks below still exists — deleting one without updating this
ledger fails the build.

Status: **Live** · **Needs data** (built, waiting on the founder's input) ·
**Retired** (removed on purpose; restorable).

Last audited: 2026-09-22 (full diff of every customer-visible and console
string, and every component, from `9a0585c` to `HEAD`).

---

## Storefront — home

| Feature | Where | Status |
|---|---|---|
| Hero from the featured piece, credit line | `frontend/src/app/page.tsx` | Live |
| Three promises (free shipping on prepaid, dispatch time, UPI/cards) | `frontend/src/app/page.tsx` | Live |
| The day's line (from her clock) | `frontend/src/lib/brand.ts` (`DAYPARTS`) | Live |
| Stories of the drop, full-screen viewer, seen rings | `frontend/src/components/Stories.tsx` | Live |
| Deals rail (offers, coupons) | `frontend/src/components/DealsRail.tsx` | Live |
| The drop grid, quiet cards, "Only N left" at ≤3 | `frontend/src/components/ProductCard.tsx` | Live |
| Today's pattern — drawn from the week's colours, woven by scroll, new each day (a pattern, not a claim about the fabric) | `frontend/src/components/Weave.tsx`, `frontend/src/lib/weave.ts` | Live |
| Manifesto, occasions, craft facts | `frontend/src/lib/brand.ts` | Live |
| Founder note (incl. "photographed on me, 153 cm") | `frontend/src/components/FounderNote.tsx` | Live |
| Legal footer with policy links | `frontend/src/components/LegalFooter.tsx` | Live |

## Storefront — product page

| Feature | Where | Status |
|---|---|---|
| Server-rendered page + schema.org Product/Breadcrumb | `frontend/src/app/product/[id]/page.tsx`, `frontend/src/lib/structuredData.ts` | Live |
| Swipe gallery, thumbnails, counter | `frontend/src/app/product/[id]/ProductView.tsx` | Live |
| Photo depth (tilt + light) | `frontend/src/components/DepthPhoto.tsx`, `frontend/src/lib/useTilt.ts` | Live |
| Named-for line under the name | `ProductView.tsx` (`named_for`) | Needs data |
| Price, offer badge + countdown, coupon ticket | `frontend/src/components/OfferBadge.tsx`, `frontend/src/components/CouponTicket.tsx` | Live |
| "What you get: Kurta + Palazzo · 2 pieces" | `ProductView.tsx` (`set_pieces`) | Needs data |
| Colour chips; sizes sorted, selected by label | `frontend/src/components/VariantSelector.tsx` | Live |
| A size is chosen, never defaulted (guards bag + Buy now) | `ProductView.tsx` (`sizePicked`) | Live |
| Scarcity — colour-level before a size is chosen, size-level after, batch line | `ProductView.tsx`, `frontend/src/lib/brand.ts` (`AVAILABILITY`) | Live |
| Worn by Sushmita · 153 cm / model line | `ProductView.tsx` (`worn_by_founder`, `model_size`) | Needs data |
| Size guide (chart-kind aware instructions and footnote; this piece's own fit and fabric, never the category's) | `frontend/src/components/SizeGuideModal.tsx`, `frontend/src/lib/sizeGuide.ts` | Live |
| Find my size — usual size (server rules + Claude phrasing) | `backend/app/services/fit.py`, `backend/app/api/endpoints/stylist.py` | Live |
| Find my size — kurta / measurements, private on-device; asks "across or all the way round", reads an impossible flat width as round, reads it back | `frontend/src/components/FitStylist.tsx`, `frontend/src/lib/fitMath.ts` | Live |
| Description, Ways to wear it | `frontend/src/components/WaysToWear.tsx` | Needs data |
| Assurances (free shipping online, Razorpay, COD + ₹99, help) | `frontend/src/components/ProductAssurances.tsx` | Live |
| Its ZISUN mark — generated pattern as cloth (WebGL), Mark No.; explicitly not the fabric | `frontend/src/components/PieceWeave.tsx`, `frontend/src/components/ClothWeave.tsx` | Live |
| Fabric & care | `frontend/src/components/FabricSpecs.tsx` | Live |
| The garment (fit, length, neck, sleeve, print, embroidery, pockets, dupatta…) | `frontend/src/components/GarmentDetails.tsx` | Needs data |
| Legal declarations (collapsed) | `frontend/src/components/ProductDeclarations.tsx` | Live |
| Buy now · price (primary) + Add to bag | `ProductView.tsx`, `frontend/src/lib/buyNow.ts` | Live |
| Wishlist heart, share | `ProductView.tsx` | Live |
| App-like transitions (photo morph, checkout rises) | `frontend/src/lib/viewTransition.ts`, `frontend/src/components/ViewTransitionSettler.tsx` | Live |

## Storefront — buying

| Feature | Where | Status |
|---|---|---|
| Guest checkout (no account), 3 steps | `frontend/src/app/checkout/page.tsx`, `backend/app/api/endpoints/checkout.py` | Live |
| Buy now express lane (bag untouched) | `frontend/src/lib/buyNow.ts` | Live |
| Returning buyer lands on Pay (details on device) | `frontend/src/lib/buyNow.ts` | Live |
| Saved addresses for signed-in customers | `frontend/src/app/checkout/page.tsx`, `frontend/src/lib/queries/address.ts` | Live (restored 2026-09-22) |
| Pincode serviceability, arrival date | `frontend/src/app/checkout/page.tsx` | Live |
| Prepaid first ("Free shipping" badge); COD +₹99 shipping, ₹5,000 limit, "pay online and save ₹99" | `frontend/src/lib/legal.ts` (`codMaxRupees`, `codShippingRupees`) | Live |
| Shipping line: free online, ₹99 on COD — charged by the server | `backend/app/services/pricing.py`, `backend/alembic/versions/0018_shipping_amount.py` | Live |
| Parcel-video tip on "It's yours" (moved from the size guide) | `frontend/src/app/checkout/page.tsx` | Live |
| WhatsApp fallback link | `frontend/src/lib/launchMode.ts` | Live |
| "It's yours" confirmation with the weave keepsake | `frontend/src/app/checkout/page.tsx` | Live |
| Bag drawer, bag → WhatsApp order | `frontend/src/components/CartDrawer.tsx` | Live |
| Phone sign-in / sign-out, account | `frontend/src/app/(auth)/login/page.tsx`, `frontend/src/app/profile/page.tsx` | Live |

## Found by machines

| Feature | Where | Status |
|---|---|---|
| Sitemap with every live piece | `frontend/src/app/sitemap.ts` | Live |
| Google Merchant feed `/feeds/google.xml` | `frontend/src/app/feeds/google.xml/route.ts` | Live — submit in Merchant Center |
| `/llms.txt` for AI assistants | `frontend/src/app/llms.txt/route.ts` | Live |
| robots.txt | `frontend/src/app/robots.ts` | Live |
| Home, collection and category pages rendered on the server — products in the HTML, own title/description/canonical, ItemList + breadcrumb | `frontend/src/app/page.tsx`, `frontend/src/app/shop/page.tsx`, `frontend/src/app/category/[slug]/page.tsx`, `frontend/src/lib/server/catalog.ts` | Live |
| Category pages in the sitemap | `frontend/src/app/sitemap.ts` | Live |
| IndexNow — Bing (and ChatGPT search) told on every product save; key at /indexnow.txt | `frontend/src/app/indexnow.txt/route.ts`, `backend/app/services/indexnow.py` | Live |
| Search Console / Bing verification tags from env | `frontend/src/app/layout.tsx` (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION`) | Needs data |

## Console (founder)

| Feature | Where | Status |
|---|---|---|
| Phone-first kit | `frontend/src/components/admin/ui.tsx` | Live |
| Analytics board + daily brief | `frontend/src/app/admin/page.tsx`, `backend/app/api/admin/endpoints/dashboard.py` | Live |
| Product form: AI draft, describe, fill details from description | `frontend/src/components/admin/ProductForm.tsx`, `backend/app/api/admin/endpoints/ai.py` | Live (AI needs credits) |
| What is in the set | `frontend/src/components/admin/SetPiecesEditor.tsx` | Live |
| Ways to wear it editor | `frontend/src/components/admin/StylingNotesEditor.tsx` | Live |
| Size chart editor, "What did you measure?" | `frontend/src/components/admin/SizeChartEditor.tsx` | Live |
| Variants, photos per colour | `frontend/src/components/admin/VariantEditor.tsx` | Live |
| Hang tags with the piece's ZISUN mark | `frontend/src/app/admin/products/[id]/tag/page.tsx` | Live |
| Inventory + bulk CSV | `frontend/src/app/admin/inventory/page.tsx` | Live |
| Orders, status, COD dispatch gate | `frontend/src/app/admin/orders/page.tsx` | Live |
| WhatsApp enquiries | `frontend/src/app/admin/enquiries/page.tsx` | Live |
| Shelf order | `frontend/src/app/admin/shelf/page.tsx` | Live |
| System (AI status etc.) | `frontend/src/app/admin/system/page.tsx` | Live |

## Backend safety

| Feature | Where | Status |
|---|---|---|
| COD orders never zombie-cancelled; COD locks last the COD window | `backend/app/tasks/commerce.py`, `backend/app/services/checkout.py` | Live |
| Shiprocket told COD vs prepaid, real name + phone, shipping charge | `backend/app/services/shiprocket.py` | Live (fixed 2026-09-22) |
| Worker heartbeat in /health | `backend/app/api/endpoints/health.py` | Live |
| Rate limits per shopper, not per proxy | `backend/app/core/client_ip.py` | Live |
| Admin read-back of every writable field | `backend/app/schemas/catalog.py` (`AdminProductDetail`) | Live |
| Net quantity derived; bare numbers refused and ignored | `backend/app/schemas/catalog.py` | Live |

---

## Retired (on purpose — restorable)

| What | Why | Restore from |
|---|---|---|
| Ticker (moving ribbon), Sticker, Flourish | Design pass: a label, not a market stall; nothing moves by itself | `git show d844596^:frontend/src/components/Ticker.tsx` (and Sticker, Flourish) |
| OfferStrip | Replaced by the Deals rail | `git show 5958b0b^:frontend/src/components/OfferStrip.tsx` |
| "In stock" on every healthy size | Noise; scarcity shows only when true | `git show 529c3ae:"frontend/src/app/product/[id]/page.tsx"` |
| Console "Packer address" field | Founder's safety: publish the city only | `git show d9c2021^:frontend/src/components/admin/ProductForm.tsx` |
| Published personal phone; WhatsApp falling back to it | Founder's request; contact is deliberate config | `git show cdb5023^:frontend/src/lib/legal.ts` |
| "Dimensions" row when a size chart exists | Apparel wording; chart is the measurement | `git show cdb5023^:frontend/src/components/ProductDeclarations.tsx` |
| Warm "unbleached cotton" ground | Founder chose ivory | `git show ef0ec53:frontend/tailwind.config.ts` |
| "24h exchange" in the shopping flow (home promise, product assurances, checkout, footer, size-guide alert) | Founder: a time limit before purchase makes customers panic. The policy pages (refund, terms) keep it in full. | `git show 8c72041:frontend/src/components/ProductAssurances.tsx` (and SizeGuideModal, page.tsx, LegalFooter) |
| "Free shipping across India" on every order | Free shipping is prepaid only; COD pays ₹99 | `git show 8c72041:frontend/src/app/shipping/page.tsx` |
| Weave wording that implied the pattern was the fabric ("The weave", "No other piece has this cloth", "Herringbone", "Every piece begins like this… by hand", "Woven in one small batch") | Pieces are bought in; the pattern is generated. It is the piece's ZISUN mark. | `git show 465152d:frontend/src/lib/brand.ts` |

## Data lost (not code)

| What | Cause | Recovery |
|---|---|---|
| Purple Rose garment details (colour, print, pattern, neck, sleeve, sleeve attached, dupatta) | The read-back bug (fixed `cdb5023`) blanked them on a save before 2026-09-21 01:32; no history table existed | A Supabase backup from before that time, or re-enter in the console (now safe; "Fill from the description" drafts most of them) |

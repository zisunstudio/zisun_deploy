# Collections and influencers

How ZISUN gives an influencer one link, counts what that link brings, credits
the orders, and works out what she is owed. Built 1 Nov 2026 inside the
existing site: no third-party platform, no new service, no recurring cost.

## 1. What was already there, and what was reused

| Need | Already in the site | Used as |
|---|---|---|
| Visits, sessions, visitors, returning visitors | `analytics_events` (every page sends `page_view`, `product_viewed`, `add_to_cart`, `checkout_initiated`, with a session id and a device id) | Each event now also carries the influencer whose link was last tapped. No second tracker. |
| Where a visitor came from | first-touch UTM capture (`lib/attribution.ts`), stored on the order | The short link adds `utm_source=influencer&utm_campaign=<code>`, so the existing *Where they came from* and *Which ad or post* panels show influencers too. |
| Product cards with price and sizes | `ProductCard` + `sizesLeft` (home feed) | The collection page is the same feed. |
| Discount codes | `coupons` + `CouponService` (server-checked at checkout) | An influencer's code is an ordinary coupon tagged with her id, never advertised on the site. |
| Honest money | `metrics.classify`: collected vs owed (COD) vs lost | Influencer sales use the same definitions. |
| "Payable only after delivery and the exchange window" | `referral.settle_decision` (pending → earned → paid; void; reversed) | Commission uses the same rule, unchanged. |
| Orders, stock, gateway | `/checkout/guest` | Untouched; two optional fields are read *after* the order exists. |

New: three tables (`collections` + `collection_products`, `influencers`,
`influencer_commissions`), two columns on `orders`, one on `coupons`
(migration 0031); two public endpoints; two console pages.

**Not reused, on purpose:** the existing *creator referral codes*
(`/admin/referrals`). Those pay ₹150 only for a new customer's first order
and need the creator to have a ZISUN account. Influencers need a link, a
collection, any-order commission and a percentage. Keep creator codes for
friends-of-customers; use this for influencers.

## 2. The rules (and the corrections to the brief)

**One influencer per order.** `orders.influencer_id` is a single column and
`influencer_commissions.order_id` is unique - an order can never be credited
twice, to two people or twice to one.

**Her code beats any link.** Typing a code is the clearest statement of whose
recommendation she acted on, and that influencer's code gave the discount.

**Otherwise, the last link tapped within 30 days.** The brief asked to
"define first-click or last-click". Last click: the post she acted on most
recently is the one that sold it, and it is the rule influencers expect.
(Where ZISUN was *discovered* stays first-touch in the channel panels - a
different question.) The window is `INFLUENCER_WINDOW_DAYS` on the api.

**Repeat orders count while the window is open.** After 30 days without a
new tap or her code, a returning customer is ZISUN's, not hers.

**Her own order earns nothing.** Recognised by her phone number, if entered.

**Paused influencer:** her link still opens the shop, credits nobody new;
her discount code stops working. Old orders keep their rows.

**Commission base:** what the customer paid for the goods - after discount
and store credit, *without* the ₹99 delivery charge - tax included (the
same price the customer sees). The rule (10% / ₹100 per order) is copied
onto each row, so changing her rate never rewrites old orders.

**When it is payable:** delivered, then 14 days (the exchange window).
- COD placed but not delivered: *pending* (never payable, never "revenue").
- Cancelled, payment failed, returned, RTO: *void*, with the reason.
- Returned after it was paid: *reversed* - shown as owed back.
- The founder marks payable rows *paid* with the UPI reference.

The brief's "earned / approved / paid / pending" collapse to
pending → payable → paid: approval is automatic at delivery + 14 days,
because a manual approve step is one more thing to forget.

**Clicks, visits, visitors are different numbers.**
- *Link taps*: each time someone arrives through her link. The `inf=` code
  is removed from the address after it is read, so a refresh, a back button
  or a forwarded URL is not another tap. Link-preview bots that do not run
  the page are not counted.
- *Visits*: browser sessions carrying her code.
- *Visitors*: devices. *Back*: devices that had been to the site before.
- *Visitors who ordered*: of the visitors her link brought, how many placed
  an order through it (code orders are left out - a code can be typed by
  someone the site never saw arrive).

**Brief items changed:** "Shop Now button on each product" - the whole card
opens the piece (DESIGN.md: cards carry no buttons). Influencer-facing
dashboard - not built; the founder shares numbers (CSV) until one is asked
for. "Fraudulent orders" - the system cannot tell fraud from a customer;
the founder already confirms every COD order before dispatch, and a
cancelled order voids its commission.

## 3. How the founder uses it

1. **Console → Influencers → Add influencer.** Name; her link name (e.g.
   `riya` → `zisun.in/r/riya`, cannot change later); **Her link opens**:
   - *A few pieces* - tap Add on each piece in her reel (or "+ Teal" to add
     every teal piece, "+ Co-ord Sets" for a category's pieces), put them in
     order. A page of exactly those pieces is made when you save.
   - *One piece*, *A category*, *Home page*, or a *Saved collection*.
   Then commission (% or ₹ per order), optionally her discount code and %,
   her phone (only to spot her own orders). Save.
2. **Send her `zisun.in/r/riya`** for her bio. To move her bio link to a
   new edit later, edit her and change *Her link opens*.
3. **A link for each reel:** on her card, *New link for a reel* → what the
   reel shows (the pieces, one piece, a category, the home page) → *Make the
   link* → Copy. It looks like `zisun.in/r/riya/riya-diwali-reel-261101abc`
   and credits her exactly like her main link. Links made this way stay
   listed on her card.

Link shapes (`lib/influencerLink.ts`): `/r/<code>` (her default),
`/r/<code>/<collection>`, `/r/<code>/piece/<id>`, `/r/<code>/category/<slug>`,
`/r/<code>/home`. Only shop pages can be reached; anything else lands on the
home page. Collections can still be made by hand under Console → Collections.

The pieces page is a vertical feed, not a sideways swipe: on 19 Oct the
home page's sideways rail got 14 taps on its button from 2,029 ad visits
and was replaced by a feed that scrolls the way the thumb already moves.
If the reel pages' numbers argue otherwise, it is one component to change.
4. **Read the board** with Today / Yesterday / 7 / 30 days / This month /
   Last month / Custom. CSV downloads the same table.
5. **Pay:** *Orders & payouts* → enter the UPI reference → *Mark paid*.

## 4. Infrastructure and cost

None added. It runs on the existing api, web, Postgres and analytics table.
No Redis (the metered Upstash budget is untouched): settlement happens when
the console is opened, like referrals. The short link's lookup is cached
for a minute, so a viral reel does not become a database load.

## 5. Testing

`backend/tests/e2e/test_influencers_pg.py` runs against a real Postgres
(any throwaway database migrated to head) and places orders through the
real `/checkout/guest` endpoint:

```
cd backend
export ENVIRONMENT=development POSTGRES_SERVER=127.0.0.1 POSTGRES_PORT=55432 \
       POSTGRES_USER=postgres POSTGRES_PASSWORD=test POSTGRES_DB=zisun_test
alembic upgrade head
ZISUN_PG_TESTS=1 pytest tests/e2e -s --no-cov
```

Result on 1 Nov 2026 (Postgres 16, local):

```
PASS  collection: 3 pieces, founder's order kept, hidden until published
PASS  two influencers on one collection; short link lands on it; Riya's code is not advertised
PASS  COD via Sneha's link: credited, ₹100 pending; prepaid with Riya's code over Sneha's link: Riya, 10% of the goods (delivery excluded)
PASS  tap 31 days old: credited to nobody; unknown code: nobody; her own phone: void, ₹0; repeat order in window: credited
PASS  second attribution of the same order: still one commission row
PASS  delivered + 14 days: payable; cancelled: void; COD not delivered: pending; only payable rows can be paid; returned after payment: reversed
PASS  Riya: prepaid order with her code counts only once paid - then collected, best seller named
PASS  Sneha: 3 clicks, 3 sessions, 2 visitors (1 returning) - a refresh added nothing; 2 views, 1 bag, 1 checkout; 2 COD orders counted as owed, not collected
```

A browser walk on a Pixel 7 viewport against the local api and database:
tap `/r/meera` → landed on her collection on the visitor's own address
(the first version redirected to the server's internal `localhost` - fixed
with a relative redirect) → code stored, removed from the URL → refresh
counted no second tap → opened a piece → Buy now → COD order. The database
then held: one `influencer_click` per visit, the funnel events under
`meera`, and the order (₹1,223 = ₹1,124 + ₹99 delivery) credited by link
with a pending commission of 10% of ₹1,124 = ₹112.40.

Found and fixed while testing: the grouped event query was invalid on
Postgres (fixed); conversion could exceed 100% when code orders were
included (now link-only); every first visit was recorded as "returning"
site-wide since that flag was added (fixed in `lib/attribution.ts`;
returning counts before 1 Nov 2026 are overstated).

Not tested: a live Razorpay payment (dev mode mocks the gateway; the
prepaid order was moved to PAID by hand, which is what the webhook does).
The first real influencer order on production should be checked by eye in
*Orders & payouts*.

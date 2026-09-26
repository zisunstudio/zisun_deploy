# ZISUN

Apparel e-commerce platform. FastAPI backend + Next.js storefront, deployed on
Railway. Customer base is India.

`DEPLOYMENT.md` is the authoritative deploy runbook. `DESIGN.md` is the
storefront's design thesis — read it before changing anything a customer
sees. `FEATURES.md` is the ledger of everything that has shipped: a feature
leaves the product only by moving to its **Retired** table with a reason and
a restore commit, and `featureLedger.test.ts` fails the build if a file it
names disappears. Update it in the same commit as any feature change. This
file covers what the code does not show on its face.

Deploys and status: `scripts/railway/deploy.sh [web worker beat]` and
`scripts/railway/status.sh`. They read the token from `$RAILWAY_TOKEN` or
`~/.config/zisun/railway_token`; session scratchpads are wiped on restart,
which lost the old copies three times.

## Shape

Four Railway services from this one repo. The three backend services run the
**same image**, differing only in start command:

| Service | Root | Config | Runs |
|---|---|---|---|
| `zisun-api` | `backend` | `backend/railway.json` | uvicorn |
| `zisun-worker` | `backend` | `backend/railway.worker.json` | Celery worker |
| `zisun-beat` | `backend` | `backend/railway.beat.json` | Celery beat |
| `zisun-web` | `frontend` | `frontend/railway.json` | Next.js standalone |

Stateful dependencies are all external, chosen for cost: **Supabase** Postgres,
**Upstash** Redis, **Tigris** object storage. Railway runs only containers.

Redis is both the Celery broker and the app's cache/rate-limiter, so a Redis
outage takes out background jobs *and* OTP throttling together.

## Invariants — do not break these

**Production fails closed.** `Settings` refuses to construct when required
config is absent, and `settings.dev_fallback()` raises rather than reverting to
a dev stub. This exists because the code previously: verified *any* Razorpay
signature as valid when the secret was empty, accepted unauthenticated webhooks
marking arbitrary orders PAID, wrote `mock_order_*` ids no webhook could match,
and served placeholder media URLs that got persisted to the DB. If a deploy
fails on a missing variable, **set the variable — never unset `ENVIRONMENT`.**

**`beat` stays at one replica** (`numReplicas: 1`). Two schedulers double-fire
every periodic task: duplicate customer WhatsApp messages, double stock
restoration.

**Migrations run on exactly one service.** `alembic upgrade head` is the api
service's `preDeployCommand`; all three backend services set
`SKIP_MIGRATIONS=1`. Three containers racing alembic yields a half-applied
schema.

**Commerce switches are enforced server-side, not hidden in the UI.** A client
can post anything. Two independent flags, both checked in the API:

- `LAUNCH_MODE=browse` — catalogue is public, **no order can be created at
  all**. Currently ON.
- `PAYMENTS_COD_ONLY=1` — Razorpay credentials not required to boot,
  `initiate_checkout` rejects a RAZORPAY order, COD only.

Both are one-variable round trips; no payment code is deleted or bypassed.
Unsetting them restores full fail-closed behaviour, which is why neither may
be relaxed to a UI-only change.

**Offers never touch the selling price.** `base_price` is what is charged;
`compare_at_price` is only what is struck through. Checkout, inventory locks
and gateway amounts must never read `compare_at_price` or `offer` — a
discount that changed the charged amount would be a second source of truth
for money. The API refuses a compare-at that is not above the price, and
resolves `offer.active` on every read so an expired `offer_ends_at` switches
the badge off with no write.

**Shelf order is pins, then attention.** `products.shelf_rank` is the
founder's manual order; NULL means the attention score in
`services/shelf.py` decides (recency-decayed engagement, half-life ~5 days).
Nothing about the score is stored, so it is always live and a pin always
wins. Do not add a cached "popularity" column — it would drift from the
events and the founder would see two different orders.

**Photographs outlive variants.** `product_media.variant_id` is
`ON DELETE SET NULL`, never CASCADE. Deleting a colour must leave its
photographs in place, untagged; they are the most expensive asset in the
business and re-tagging is one click.

**The gateway is the authority on money; the webhook is only a notice.**
A customer paid, her webhook was rejected at signature verification
("Invalid Razorpay webhook signature"), the order stayed PAYMENT_PENDING,
and thirty minutes later `_cleanup_zombie_orders` cancelled it and returned
the stock - because an unpaid gateway order is indistinguishable from an
abandoned one *if you only ever look at your own database*. Razorpay knew.
Nothing asked it. The sweep now calls `settle_from_gateway()` before
cancelling any order that has a `razorpay_order_id`, so a dropped webhook
costs a half-hour delay rather than a lost sale, and a failure to reach
Razorpay returns False and cancels nothing it would not have anyway.
`POST /admin/orders/reconcile-payments` (a button on Reconciliation)
re-examines recent orders and restores any the gateway says were paid - it
only ever moves an order towards PAID and never cancels. A rejected webhook
is counted in Redis and named on the dashboard, because one WARNING line in
a container log is how this went unnoticed.

**An order she cannot pack from is not an order.** The list showed id,
date, amount and status; `OrderItemResponse` carried a `product_variant_id`
and nothing else, and the detail endpoint eager-loaded the address and the
customer while its schema exposed neither. So the console could say an order
existed and not what was in it or where it went. `AdminOrderDetail` and
`OrderDetail.tsx` give the garment, size, colour, SKU, the full address, the
phone as a call and a WhatsApp link, and one tap to copy the address block
into a courier form. Fetched only when a row is opened - name, phone and
address have no business being pulled fifty at a time to draw a list.
`OrderItem.variant` is `viewonly`: an order line is a price-and-quantity
snapshot and editing the catalogue through it would rewrite history.

**Packed means a courier has been asked to come, or the console says why
not.** Shiprocket books a parcel in four calls - create the order, assign a
courier (the AWB), request the pickup, print the label - and PACKED used to
make only the first, read an AWB that call never returns, and `except: pass`
everything (the address was not even loaded, so it raised every time). A
parcel could sit packed with nobody coming, and the console could not tell.
`book_shipment()` runs all four, records each answer on the fulfilment
(migration 0026), resumes at the step that failed rather than creating a
second Shiprocket order, and writes the courier's own words to `last_error`.
The console shows the pickup day on the list and offers "Try booking again"
and "I booked it myself". `POST /admin/orders/{id}/shipment/refresh` reads
the courier and only ever moves an order forwards (PACKED -> SHIPPED ->
DELIVERED) - which is also what makes COD cash count as collected. The
pickup address must be named in `SHIPROCKET_PICKUP_LOCATION` exactly as
Shiprocket knows it ("Primary" by default). `step_for` checks "undelivered",
"RTO" and "pickup scheduled" before "delivered" and "picked": the order of
that table once told customers an undelivered parcel had arrived.

**An unconfirmed COD order must not reach PACKED.** `may_dispatch()` gates the
admin status endpoint with a 409. Asking the customer and shipping anyway
saves nothing.

**Worker/beat health cannot be read from Railway.** Railway reports SUCCESS
once a container *starts* — it has no idea the process died a second later.
Both have sat "SUCCESS" while crash-looping. Verify via `/health`, or by
confirming a task actually executed (`celery-task-meta-*` keys in Redis).
A dead worker is silent: orders reach PAID, then nothing ships, stock never
returns from expired carts, and no error appears anywhere.

**The storefront has one palette and it lives in `frontend/tailwind.config.ts`.**
Ink, porcelain, burgundy (`rani` is its old name in code and still resolves
to it), haldi, rose, moss — every button, badge and panel uses a token; there
are no raw hex colours in `src/` (a grep for `#5C3317` should stay empty).
`primary` is an alias for ink kept for old call sites. Burgundy is spent only
where memory is built — the wordmark on light grounds, primary actions,
section eyebrows, the footer, the WhatsApp button — and nowhere else; haldi
survives only on coupon tickets. Type is Instrument Serif (`font-display` /
`font-serif`), Instrument Sans (`font-sans`) and Caveat (`font-hand`, the
signature only). The hero, manifesto, occasion and craft copy are constants
in `src/lib/brand.ts` so the founder can change a line without touching JSX.
One primary action per screen; product cards carry no buttons. See
`DESIGN.md` for why.

**A brand claim is computed, never written.** The home page once said
"handloom cotton from Mangalgiri, Ilkal and Kasavu, woven by hand, never
re-run" over a catalogue of one silk piece and one Rajasthani dabu print,
neither recorded as any of it. `app/services/truth.py` now derives every
factual line from what the live pieces record (`products.craft`, `origin`,
`fabric_composition`, `batch_size`, `will_rerun`), serves it at
`GET /catalog/truth`, and `frontend/src/lib/truth.ts` turns it into the
hero eyebrow, the manifesto sentence, the craft facts, the footer line, the
meta description and llms.txt. A claim needs *every* live piece to support
it; one silk piece removes "cotton", one undecided re-run removes "never
re-run", and a partial claim is simply not said. No constant in `brand.ts`
may state a fact about the cloth again. Positioning ("Not made for
everyone") is not a fact and stays written. The console's System page shows
what the site is allowed to say and which single field would unlock more.

**The Journal is the discovery layer, and it publishes by hand.**
`/journal` and `/journal/[slug]` are server-rendered with Article JSON-LD,
in the sitemap and in llms.txt; an article names the pieces it may
recommend and their price, stock and facts are read live from those pieces,
never copied into its text. Status runs draft -> approved -> published and
only `published` is served - `POST /admin/journal/draft` writes with Claude
from the brief plus *only* the recorded facts, and returns `unknowns`
rather than inventing. Article bodies render through
`frontend/src/lib/markdown.tsx`, which has no `dangerouslySetInnerHTML` and
accepts no raw HTML: model-drafted text is never trusted as markup.

**Coupons are advertised, not just accepted.** `GET /coupons/active` is public
and returns active, unexpired, non-referral codes; the storefront renders them
as tickets on the home page and under the price on every product. A coupon
the admin wants kept quiet must be created inactive and switched on at the
moment it is announced — there is no "active but hidden" state.

**In browse mode the storefront says nothing about stock.** No "sold out"
overlay, no struck-through sizes, no "only 2 left": the counts are still
being entered and a catalogue that has never sold anything must not open
with "Sold out" on every card. The gates are `BROWSE_ONLY` in `ProductCard`,
the PDP, `VariantSelector` (`honourStock`) and `BottomSheet`. The moment
`LAUNCH_MODE` is unset every one of them tells the truth again, and the API
never stopped enforcing stock at checkout.

**Colours are picked, not typed.** `frontend/src/lib/colours.ts` is the
palette; the console's variant editor, inventory page and product form
offer it in a picker and the storefront draws swatches from it. A colour
that is not in the palette still round-trips (old rows stay selectable)
but new ones should be added to the palette, not typed.

**The console is phone-first and built from `components/admin/ui.tsx`.**
The founder runs the shop from her phone. `Page`, `Card`, `CardHeader`,
`Button`, `TableScroll`, `StockBadge`, `Sku` and friends are the only way
to lay out a console page: headers stack, actions wrap, every table either
scrolls inside its own frame or gives way to stacked rows below `sm`, and
no list is a CSS grid (an implicit grid track's minimum is its row's
min-content width, which is how the Shelf's pin buttons ended up off the
right edge). `scripts/review/console.js` renders console pages at phone
width with a faked session and exits non-zero on any horizontal overflow —
run it before calling a console change done. It lived in `scratchpad/` and
was lost three times to a wipe; it is in the repo now.

**Money has one definition, and `PAYMENT_PENDING` has two meanings.**
`app/services/metrics.py` classifies every order by status *and* payment
method, because a COD order rests in PAYMENT_PENDING by design while a
RAZORPAY one resting there is a customer who never paid. Money is reported
as **collected** (prepaid PAID, or COD actually DELIVERED - cash exists only
once the courier hands it over) and **committed** (COD placed but not yet
delivered). They are never added into one "revenue". Three definitions used
to coexist: `commerce.revenue_window_paise` summed every order whatever its
status, `week.revenue_paise` summed everything but CANCELLED, and the
console then *added a 7-day figure to a 30-day one* and threw hand-marked
WhatsApp enquiries on top. On a realistic set of eight orders that reported
₹9,310 where ₹2,580 had arrived.

**A WhatsApp tap is not a conversation, and a hand-tick is not an order.**
`recordEnquiry` fires on *click*; the site cannot know a message was ever
sent. The payload says `whatsapp_clicks` and `whatsapp_marked_ordered`
(the founder ticking an enquiry by hand) and neither may sit unlabelled
beside real orders or be added to them.

**Buy now is not an event.** The storefront sends `add_to_cart` with
`properties.via = "buy_now"`. A dashboard column counting an event named
`buy_now` was always zero, and `intent = bags + buy_now` double-counted
every buy-now shopper once the count was fixed. Per-product *orders* come
from `order_items`, never from `checkout_initiated` - that event carries an
`order_id` and no `product_id`, so per-product checkout was structurally
zero too.

**Where a visitor came from is captured once, and it is a first touch.**
`frontend/src/lib/attribution.ts` reads UTM tags and the referring domain on
the first page of a visit (one internal click and they are gone), keeps them
in localStorage, and attaches them to every event and to the order itself
(migration 0021). First touch wins - the post that introduced ZISUN gets the
credit, not the direct visit a week later. Only the referrer's *domain* is
stored, never the full URL, which can carry a search query. Orders placed
before this shipped report "not recorded", never "direct".

**The analytics board is one endpoint, computed concurrently and kept warm.**
`compute_dashboard()` runs every panel's query at once on its own session
(the database is a continent away; nine in a row cost ~20s, nine at once
cost one), and a failing panel names itself in `meta.errors` rather than
taking the page down. The result is cached in-process, served stale while
it refreshes, and computed at startup by `warm_dashboard()` from the api's
lifespan. Do not add a panel as a second request from the page, and do not
route it through Redis.

**Claude runs only behind the admin role.** `app/services/ai.py` is called
from `/admin/ai/*` and `/admin/dashboard/brief` and nowhere else, so the
Anthropic bill is bounded by the founder's own use. Every feature degrades
to a plain message when `ANTHROPIC_API_KEY` is unset or the account has no
credits; the brief falls back to rule-written sentences.

**The storefront calls a model in exactly one place, and it is fenced.**
"Ways to wear it" is stored text (drafted in the console, saved by the
founder). The one live customer-facing call is the fit stylist,
`POST /stylist/fit` (`app/api/endpoints/stylist.py`), approved by the owner
on 2026-09-22 with these fences, which are the rule now: the size is
decided by rules in `app/services/fit.py` and Claude may only phrase it (a
sentence naming another size is discarded); nothing the customer types
reaches a prompt (height, usual size, preference - all bounded); every
answer is cached in Redis for 7 days; a daily call ceiling
(`STYLIST_DAILY_CAP`) and a per-visitor hourly limit
(`STYLIST_PER_IP_HOURLY`); `STYLIST_MODEL` is a small model; after any
failure it stops asking for ten minutes. Without a key or credits it
answers from rules alone. Any further customer-facing AI needs the same
fences or the Anthropic bill is in strangers' hands.

**Every catalogue photograph goes through `components/Photo.tsx`.**
The pictures arrive as they are taken - a garden, a corridor, a street,
different light - and shown raw they read as a camera roll. Three things did
most of that damage and none was the photography: every picture faded in
from the *same grey pixel*, every one sat on the *same flat pink*, and every
one was centre-cropped, which takes the head off a full-length shot. `Photo`
fixes all three in one place: the ground is the picture itself at 64px
(~2KB, a variant next/image already makes) painted behind and softened, so
the space is never empty and never grey and the photograph resolves out of
its own colours; `focus` defaults to the upper third; the ratio is fixed so
nothing shifts. A coloured mat *around* the picture was tried and removed -
at card size it reads as a halo, an artifact rather than a frame. Add a
photograph anywhere new and use this component; do not reach for `<Image>`.
`DepthPhoto` is `absolute inset-0` and needs a sized parent, so inside it
`Photo` takes `fill` - giving `Photo` its own ratio there collapsed the
gallery to nothing and the main photograph vanished.

**The generated pattern is a mark, never the fabric.** The "weave" on a
product page, the home page's daily pattern, the tag and the "It's yours"
keepsake are drawn by code from colours. Customer-facing words call it the
piece's **ZISUN mark**; they must not say or imply it is the cloth, how the
piece was made, "by hand", "no other piece has this cloth", or a weave
structure (herringbone, twill) - ZISUN buys pieces in, and the live one is
recorded as silk. Any claim about how a piece is made (handloom, handwoven,
a weaving centre, "never re-run") needs the founder's confirmation that it
is true of that piece.

**A piece's weave is its id.** `designWeave(product.id, colours)` in
`frontend/src/lib/weave.ts` is deterministic and its number ("No. D20A") is
shown to customers. Changing the hash, the RNG, or the order in which
`designWeave` draws random numbers re-numbers and re-weaves every piece
ever shown; add new seeded choices *after* the existing ones. The canvas
redraws only while weaving or rippling - do not add a free-running loop.

**Both API clients refresh; the console's one did not.** The access token
lasts 15 minutes and `lib/api.ts` has always refreshed it silently on a 401.
`lib/adminApi.ts` had no response interceptor at all, so a save made more
than 15 minutes after sign-in failed with "token expired" and everything
typed into the form was unrecoverable. She retyped and saved again, which is
how one piece ended up with thirteen variant rows under three SKU prefixes.
`attachRefresh(instance)` is exported from `lib/api.ts` and attached to
both; a new axios instance that talks to the API must call it.

**One variant row per size and colour, whatever the SKU says.** Uniqueness
was checked on SKU alone, which is not the rule a shop has: the console
derives a SKU prefix from the piece's name, so a retried save produced
`ZS-WIN-M`, then `ZS-M`, then `RICH-WINE-WIN-M` for one medium.
`_reject_duplicate_size_colour` in `admin/endpoints/products.py` now refuses
the second row, and the inventory page marks existing repeats so they can be
deleted by hand - only the founder knows which row holds the real count.

**Anything an admin can write must be readable back.** `AdminProductDetail`
re-declares every column `ProductResponse` hides, because the editor seeds
its inputs from those fields. The seven garment attributes were left out of
that list and the omission *destroyed data*: the form read `undefined`,
rendered the inputs blank, and wrote the blanks back on the next save. The
founder entered a piece's colour, neck and sleeve, saved twice, and
concluded the storefront ignored her. Add a column to the model and you
add it in three places - the input schema, `AdminProductDetail`, and the
console form. It happened a second time with `compare_at_price` and
`offer_ends_at` (editing a piece with a live offer cleared the offer), so
`tests/unit/test_admin_readback.py` now reads the model and the schemas and
fails the build when a writable column is missing from the read-back.

**GST is extracted from the price, not added to it, and snapshotted.**
ZISUN is registered (GSTIN 29BAYPT2026A1ZH - "29" is Karnataka), so every
sale needs a tax invoice. `app/services/gst.py` works the tax out *of* the
tax-inclusive price, in integer paise, taxable first and tax as the
remainder, so the parts always add back to what was actually charged. Two
things decide the numbers: the garment rate is **per piece** (5% at or below
₹1,000, 12% above - a ₹999 and a ₹1,039 kurta in one parcel differ), and the
split follows the place of supply (Karnataka → CGST+SGST, elsewhere → IGST;
an unknown state is treated as inter-state, because wrongly charging
CGST+SGST on an out-of-state supply is the error the customer cannot fix in
her own filing). The breakdown is written onto the order and **never
recomputed** - rates move by notification and an old invoice must keep its
own numbers. The invoice *number* is taken when the order becomes real
(prepaid PAID, or COD confirmed), never at creation, so an abandoned
checkout does not burn a serial in a series meant to be consecutive.
The slab is **configuration**: `GST_SLAB_THRESHOLD_PAISE`,
`GST_RATE_AT_OR_BELOW_PCT` and `GST_RATE_ABOVE_PCT`. It moved on
2025-09-22 from ₹1,000/5%/12% to ₹2,500/5%/18%, and this code shipped with
the old numbers until the founder caught it - which is exactly why a rate
is a variable round trip and never a deploy. Both live pieces are 5%.

**`base_price` is always what the customer is charged, tax-inclusive.**
Legal Metrology requires the MRP to be inclusive of all taxes, so an ex-tax
price is something to *convert*, never to display. The console lets her type
either ("GST included" / "Add GST to this"); `gst.selling_price()` converts
once, at write time, and `base_price` keeps its meaning so checkout, locks
and the gateway are untouched. `price_entered` remembers her own figure so
the form shows it back - seeding the converted price would re-add GST to an
already-converted price on the next save. A conversion that crosses the slab
settles on the higher rate (₹2,400 ex-tax is ₹2,520, so 18%, so ₹2,832).

The rate table and the HSN default are data, not logic; a CA changes them
in one edit.

**Net quantity is derived, never typed.** `set_pieces` (["Kurta",
"Palazzo"]) produces the Legal Metrology declaration "1 set - 2 pieces".
A bare number in that box is rejected at the schema: it once read "5" on a
single co-ord set, which a customer reads as five kurtas. The customer-
facing wording lives beside the price as "What you get"; the statutory
block keeps the statutory term.

**There is no community group link, and the code has no path for one.**
A public WhatsApp group shows every member's number to every other member,
strangers included; the founder took it down on 2026-09-22. `launchMode.ts`
no longer has a `WHATSAPP_GROUP_URL`, so no variable can bring it back. The
only WhatsApp destination is ZISUN's official business number, 1:1.

**The site never publishes a personal number.** `COMPANY.phone` is
`NEXT_PUBLIC_SUPPORT_PHONE` and `LM_CONSUMER_CARE_PHONE` is empty by
default, and `launchMode`'s WhatsApp number no longer falls back to either
- that fallback is how the founder's mobile ended up behind every WhatsApp
button on the site without anyone choosing it. A published contact channel
is always deliberate configuration; every surface hides the row when it is
unset.

**A size is chosen, never defaulted.** The PDP falls back to
`product.variants[0]` so a price can render; that fallback must never reach
a bag or an order. `sizePicked` gates both Add to bag and Buy now - before
it existed, tapping Add to bag without a size put an XL in the bag.
Buy now carries its piece in session storage (`lib/buyNow.ts`), never the
URL and never the bag.

**Rate limits key on the shopper, not the proxy.** uvicorn runs without
`--proxy-headers`, so `request.client.host` is Railway's edge - one address
for every visitor. `app/core/client_ip.py` reads `X-Real-IP` (then the last
`X-Forwarded-For` hop). Until 2026-09-22 the global limiter keyed on the
proxy, so its "per IP" limits were site-wide: 100 API calls a minute and 10
sign-ins a minute for all customers together.

**The spatial layer never runs a free loop.** `useTilt` sleeps once the
tilt settles; `ClothWeave` draws only while on screen, in a visible tab,
and for six seconds after the last tilt or touch. Shaders that share a
uniform must declare its precision explicitly in both stages - the vertex
default is highp, the fragment default mediump, and a mismatch fails to
*link* on every device (it did: the cloth silently fell back to the flat
weave until `uTilt` was declared `mediump` in both).

**Body measurements never leave the device.** The "kurta" and
"measurements" paths of Find my size run in `lib/fitMath.ts` in the
browser; do not add them to an API call, an analytics event or a Claude
prompt. Only the no-numbers path (usual size) calls `/stylist/fit`. A size
chart's `measures` ("body" | "garment") changes the maths - the live chart
is garment measurements despite the old console wording - and size labels
are normalised (`XXL` = `2XL`) before any comparison.

## Traps found the hard way

Each of these produced a green build or a healthy-looking deploy:

- **Railway config path is repo-root-relative**, not relative to Root
  Directory. `railway.json` silently falls back to the Railpack builder, fails
  to detect a language at the monorepo root, and never reads the Dockerfile.
- **Railway defaults to US West.** All services pinned `asia-southeast1`.
  Wrong region puts the app a continent from its database — every *query*
  pays the crossing, not just every request.
- **`PORT` must be pinned** to match the domain's target port. Railway injects
  `8080`; both images obey it, so the container binds 8080 while the domain
  routes to 3000/8000 → every request 502s with `✓ Ready` in the logs.
- **DB passwords are percent-encoded once**, in `Settings._db_credentials`.
  Store `POSTGRES_PASSWORD` **raw**. An `@` interpolated raw makes SQLAlchemy
  parse the password as the prefix and the rest as the hostname.
  There is no `DATABASE_URL` code path in this app — discrete `POSTGRES_*` only.
- **`rediss://` needs `ssl_cert_reqs`**, added automatically in
  `app/celery_app.py`. Without it Celery raises at *import* and worker/beat
  crash-loop.
- **Twilio API keys (`SK…`) need the three-arg client.** See
  `app/core/twilio.py`. The two-arg form treats the key as the account →
  every OTP 503s. Check `settings.has_twilio_auth`, never `TWILIO_AUTH_TOKEN`
  directly — under API-key auth that token is empty and guards on it skip
  silently.
- **Supabase auto-enables RLS** on every table Alembic creates, with no
  policies. Harmless while connecting as the owning `postgres` role; a silent
  zero-rows failure the moment `POSTGRES_USER` changes.
- **Celery will eat a metered Redis quota alive.** Default config burned
  Upstash's entire 500,000-command free tier in days: beat died with
  `max requests limit exceeded`, the worker crashed, Railway exhausted its
  restart retries, and background processing stopped **silently for eight
  days**. Hence `task_ignore_result`, no task events, no broker heartbeat,
  `--without-gossip --without-mingle --without-heartbeat`, and a 120s (not
  30s) outbox sweep. Before shortening any schedule, check the command budget.
  A spent quota also rejects the **AUTH on every new connection**, so a
  fail-fast `redis.ping()` at startup made every new api container crash
  while the old one kept serving on a pre-quota connection — deploys failed
  their healthcheck with the fix in the build. Startup now logs and runs
  degraded; `/health` reports `redis: degraded` with HTTP 200.
  The worker's own reconnect loop is billed too: 100 retries per boot × ten
  restarts kept the quota pinned at its limit. Retries are capped at 3 now,
  and `CELERY_PAUSED=1` on `zisun-worker`/`zisun-beat` makes the process
  sleep instead of starting Celery at all - the switch to flip while the
  broker is dead, and to unset the moment a working Redis exists.
- **Railway's `startCommand` bypasses the Dockerfile `ENTRYPOINT`.** Worker
  and beat never run `entrypoint.sh`: no dependency wait, no migration
  guard, no `==>` lines in their logs. Anything that must happen for those
  processes has to happen inside the Python process (`app/celery_app.py`
  at import time), not in the shell wrapper. `SKIP_MIGRATIONS=1` on them is
  harmless but also meaningless.
- **Pushing to `main` deploys the api — and only the api.** Checked
  `service.repoTriggers` on all four: `zisun-api` has the GitHub trigger;
  `zisun-worker`, `zisun-beat` and `zisun-web` have none. A push never
  builds those three. They rebuild from the latest commit on `main` when one
  of their variables changes, or on a manual `serviceInstanceDeploy`. So
  after every backend push the worker and beat are running the *previous*
  commit until something redeploys them — a migration the api applied can
  be one the worker's code has never seen. Two rules follow.
  Never call `serviceInstanceDeploy` on the api after a push: it starts a
  *second* deploy of the same commit, both run `alembic upgrade head` at
  once, and the loser fails with `DuplicateColumn` while the winner is
  already serving. Always call it on the web after a push, or the site keeps
  serving the previous build with a green "SUCCESS" beside it; it is safe
  there because the web image runs no migrations. Redeploy worker and beat
  after a backend push too — safe for the same reason.
- **`serviceInstanceDeploy` rebuilds the commit Railway already knows.**
  Without a GitHub trigger the service never learns that `main` moved, so a
  bare deploy call re-runs the *old* source and reports SUCCESS: on
  2026-09-20 the storefront "deployed" three times and kept serving
  `d58691d`. Pass **`latestCommit: true`** (or an explicit `commitSha`) —
  that is the argument that makes Railway fetch the branch first. The
  scratchpad's `deploy-web.sh` does. Always check the deployment's
  `meta.commitHash` matches `git rev-parse HEAD` before believing a deploy.
- **`.astext` is JSONB-only and raises while the query is *built*.**
  `analytics_events.properties` is plain `JSON`. `.astext` throws an
  AttributeError at construction - not a SQL error a database would catch,
  and invisible to any fixture-backed screenshot - taking the whole board
  down at the first real request. Use `.op("->>")("key")`, which is valid
  for json and jsonb alike. `product_id_matches` documents it and
  `test_metrics.py` compiles every property lookup.
- **A React error boundary makes a crash look like a tidy page.** The
  boundary catches the throw, so Playwright's `pageerror` never fires and
  the screenshot shows a neat "Something went wrong" panel. The console
  harness checks the rendered text for it and treats a console error as a
  failure; without that check it reported "fits" on a board that was dead.
- **A fixture harness proves the page, not the endpoint.** The analytics
  board 500'd for a day (`NameError: by_size`) while every screenshot of it
  looked perfect, because the console review harness answered the admin API
  from fixtures. `scratchpad/verify-api/check.js` mints an admin token from
  the api's own JWT key (read from Railway) and calls the real endpoints;
  `admin-live.js` renders the console against production with that token.
  A console change is not done until both have run.
- **Firebase Phone Auth denies every SMS region by default** on new projects.
  Until India is allowed under Authentication → Settings → SMS region policy,
  `sendVerificationCode` returns `OPERATION_NOT_ALLOWED: SMS unable to be sent
  until this region enabled`. Separately, `zisun.in` and `www.zisun.in` must
  be in Authorized domains or reCAPTCHA rejects the live site. Both are
  console settings; neither is reachable from code or the REST API.
- **A `position: sticky; bottom: 0` bar covers whatever sits under it at first
  paint.** The PDP's buy bar was 202px tall because three rows of assurances
  lived inside it, and on a Pixel 7 that hid the price. Keep the sticky bar
  to the one action that must stay reachable; measure with
  `getBoundingClientRect()` on a phone viewport, not by eye.
- **A filled-in form row is not a submitted one.** VariantEditor holds a draft
  until the tick is clicked; the founder filled a row, hit Create, and was
  told she had no variants. Anything that keeps local draft state must expose
  a flush the parent calls at submit (`VariantEditorHandle.flushDraft`).
- **`next/image` silently serves the original when `sharp` is missing.**
  Next 14 needs sharp to optimize; it was in neither `package.json` nor the
  Dockerfile, so every `_next/image` request returned the source JPEG
  unresized — byte-identical at `w=256`, `w=640` and `w=1200`. The home page
  shipped **48.8MB** of images and its LCP on a Pixel 7 was **14.9s**. With
  sharp installed the same photograph is 13KB at `w=256`. `minimumCacheTTL`
  also defaults to **60 seconds**, so every optimized variant carried
  `max-age=60, must-revalidate` and returning visitors re-downloaded
  everything; it is a year now, which is safe because the URL carries the
  width and quality and a re-uploaded photograph gets a new key.
- **Changing `POSTGRES_PORT` and `DB_PGBOUNCER_MODE` together breaks the
  database mid-rollout.** Moving to the transaction pooler (`:6543`) needs
  `DB_PGBOUNCER_MODE=1` to disable statement caching, and during the rollout
  requests hit a container using `:6543` *without* the guard —
  `DuplicatePreparedStatementError` on live traffic. Set
  `DB_PGBOUNCER_MODE=1` first, wait for that deploy to finish completely,
  and only then change the port. Reverting is the same two steps backwards.
  Measured on 2026-09-23: a bare `SELECT 1` costs ~890ms because Supabase is
  in `ap-southeast-2` (Sydney) while the app is in `asia-southeast1`
  (Singapore), and `DB_POOL_SIZE=1` means concurrent requests open a fresh
  TLS connection across that ocean. `/health` reports `timings_ms` for the
  database and Redis so this is measurable rather than guessed at.
- **Supabase's direct host is IPv6-only.** Use the pooler (IPv4). The app runs
  on the transaction pooler `:6543` with `DB_PGBOUNCER_MODE=1`, which disables
  statement caching — without it asyncpg fails intermittently, under
  concurrency only.
- **Migrations cannot use the transaction pooler.** `alembic/env.py` rewrites
  `:6543` → `:5432` (session pooler, same host and credentials) when
  `DB_PGBOUNCER_MODE` is set, and disables the hstore probe. Supavisor severs
  the connection during psycopg2's hstore OID lookup, so alembic failed on
  connect with `SSL connection has been closed unexpectedly` before any DDL
  ran. DDL also needs one backend for the whole transaction.

## Local dev

```bash
docker compose up            # migrations run via entrypoint.sh; SKIP_MIGRATIONS unset
cd backend && pytest         # unit + integration
```

Without credentials the app runs in dev mode: OTPs print to stdout, media
returns placeholder URLs, Razorpay is mocked. All of that raises in production
by design.

## State as of 2026-09-20

Live on **zisun.in** (Cloudflare DNS, CNAME-flattened apex) in **browse
mode**: catalogue public, no checkout, admin console reachable only once
Firebase phone sign-in is enabled in the Firebase console (SMS region + domains).

Catalogue v2 shipped (migration 0012): offers with countdown, per-colour
photographs with swatches, per-product size charts with cm/in toggle, and a
pinned-then-attention shelf order with `/admin/shelf` and a per-product
funnel on the dashboard. The WhatsApp button on every page currently opens
the ZISUN Tales group (`NEXT_PUBLIC_WHATSAPP_GROUP_URL`); set
`NEXT_PUBLIC_WHATSAPP_NUMBER` for a direct chat instead.

The console can draft a listing from the founder's words (typed, or spoken
via the browser's speech recogniser) and writes a daily brief on the
Overview. `ANTHROPIC_API_KEY` is set on `zisun-api` but the Anthropic
account had **no credits** on 2026-09-20 — the features report exactly that
until credits are added. WhatsApp buttons open a direct chat with the
support number (`COMPANY.phone`), no longer the group.

**Redis moved to a fresh Upstash database on 2026-09-20** (`mature-gannet-288205`).
The api is on it and healthy. Worker and beat are held by `CELERY_PAUSED=1`
until the BRPOP patch in `app/celery_app.py` is deployed; with it, an idle
worker costs ~3.5k commands/day instead of 86k, which is what makes the
free tier survivable (budget ≈ 240k/month of the 500k). The old database
(`emerging-zebra-161921`) is spent and can be deleted.

**Celery is still down** — Upstash's free quota is spent and writes are
refused. Harmless while no order can be created; must be resolved (Railway
Redis, a paid tier, or the quota reset) before `LAUNCH_MODE` is unset.

Still needed to take an order: Firebase console settings above; Redis; then
unset `LAUNCH_MODE` with `PAYMENTS_COD_ONLY=1` until Razorpay KYC clears.

# ZISUN

Apparel e-commerce platform. FastAPI backend + Next.js storefront, deployed on
Railway. Customer base is India.

`DEPLOYMENT.md` is the authoritative deploy runbook. This file covers what the
code does not show on its face.

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
Ink, porcelain, rani, haldi, rose, moss — every button, badge and panel uses a
token; there are no raw hex colours in `src/` (a grep for `#5C3317` should
stay empty). `primary` is an alias for ink kept for old call sites. Type is
Fraunces (`font-display`/`font-serif`), Instrument Sans (`font-sans`) and
Caveat (`font-hand`, reserved for the founder's words and signature). The
hero's copy and the ribbon's lines are constants in `src/lib/brand.ts` so
the founder can change a headline without touching JSX.

**Coupons are advertised, not just accepted.** `GET /coupons/active` is public
and returns active, unexpired, non-referral codes; the storefront renders them
as tickets on the home page and under the price on every product. A coupon
the admin wants kept quiet must be created inactive and switched on at the
moment it is announced — there is no "active but hidden" state.

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
- **Pushing to `main` deploys the api — and only the api.** The backend
  services carry Railway's GitHub trigger; `zisun-web` has none
  (`service.repoTriggers` is empty), so a push never builds the storefront
  and every web deploy is a manual `serviceInstanceDeploy`. Two rules follow.
  Never call `serviceInstanceDeploy` on the api after a push: it starts a
  *second* deploy of the same commit, both run `alembic upgrade head` at
  once, and the loser fails with `DuplicateColumn` while the winner is
  already serving. Always call it on the web after a push, or the site keeps
  serving the previous build with a green "SUCCESS" beside it; it is safe
  there because the web image runs no migrations.
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

**Celery is still down** — Upstash's free quota is spent and writes are
refused. Harmless while no order can be created; must be resolved (Railway
Redis, a paid tier, or the quota reset) before `LAUNCH_MODE` is unset.

Still needed to take an order: Firebase console settings above; Redis; then
unset `LAUNCH_MODE` with `PAYMENTS_COD_ONLY=1` until Razorpay KYC clears.

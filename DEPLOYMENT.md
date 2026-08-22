# ZISUN — Deployment (Railway)

Four Railway services, all built from this one repo:

| Service | Root dir | Config file | What runs |
|---|---|---|---|
| `zisun-api` | `backend` | `railway.json` | FastAPI (uvicorn) |
| `zisun-worker` | `backend` | `railway.worker.json` | Celery worker |
| `zisun-beat` | `backend` | `railway.beat.json` | Celery beat scheduler |
| `zisun-web` | `frontend` | `railway.json` | Next.js standalone server |

Railway runs **only the four app containers**. Every stateful dependency is
external, chosen for cost:

| Dependency | Provider | Why not Railway |
|---|---|---|
| Postgres | **Supabase** | Free tier |
| Redis | **Upstash** | Cheaper at this volume |
| Object storage | **Tigris** | Railway has none |

Live project: **loyal-respect**, environment `production`, region
`asia-southeast1`.

| | URL |
|---|---|
| API | `https://zisun-api-production.up.railway.app` |
| Storefront | `https://zisun-web-production.up.railway.app` |
| Media | `https://zisun-media.fly.storage.tigris.dev` |

The api/worker/beat services share a single `backend/Dockerfile`. They differ
only in `startCommand`, which `entrypoint.sh` execs.

---

## 1. One-time setup

### 1.1 Create the project

Railway dashboard → **New Project** → **Deploy from GitHub repo** →
`zisunstudio/zisun_deploy`.

That creates one service. Add the other three with **New** → **GitHub Repo** →
same repo. For each service, under **Settings**:

| Setting | api | worker | beat | web |
|---|---|---|---|---|
| Root Directory | `backend` | `backend` | `backend` | `frontend` |
| Config-as-code path | `backend/railway.json` | `backend/railway.worker.json` | `backend/railway.beat.json` | `frontend/railway.json` |
| Watch Paths | `backend/**` | `backend/**` | `backend/**` | `frontend/**` |
| Region | `asia-southeast1` | `asia-southeast1` | `asia-southeast1` | `asia-southeast1` |

**The config path is relative to the repo root, not to the Root Directory.**
`railway.json` looks right and is not — Railway silently finds no config, falls
back to the Railpack builder, fails to detect a language in the monorepo root,
and the build dies with "could not determine how to build the app". The
Dockerfile is never consulted. Use `backend/railway.json`.

**Set the Watch Paths.** Without them every push rebuilds all four services —
four builds and four restarts for a CSS tweak.

**Set the Region on every service, databases included.** Railway defaults to US
West (`sfo`). Serving India from there adds a Pacific round trip to every
request, and — far worse — puts the app on a different continent from its own
Postgres, so *each individual query* pays that crossing. `asia-southeast1`
(Singapore) is the closest Railway offers; there is no India region.

### 1.2 External data stores

Both live outside Railway, so both cross the public internet. Two traps.

**Supabase — the direct host is IPv6-only.** `db.<ref>.supabase.co` publishes
an AAAA record and no A record. Railway services default to IPv4-only egress,
so you must enable **IPv6 egress** on api, worker and beat or every connection
fails. The IPv4-friendly alternative is the **session-mode pooler**
(`aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<ref>`).

> **Transaction mode on `6543` requires `DB_PGBOUNCER_MODE=1`.** asyncpg caches
> prepared statements; PgBouncer in transaction mode recycles the connection
> underneath it, producing `prepared statement "__asyncpg_stmt_1__" already
> exists` — intermittently, under load, on the checkout path. Setting
> `DB_PGBOUNCER_MODE=1` turns off both asyncpg's cache and SQLAlchemy's, which
> is what makes `6543` safe (`app/core/database.py`). Forget the variable and
> you get the failure above; there is no error at boot to warn you.
>
> Session mode (`5432`, same host, also IPv4) keeps statement caching and is
> faster, at the cost of a connection per client. Either works. What does not
> work is `6543` with `DB_PGBOUNCER_MODE=0`.

Both pooler ports use the tenant-qualified user `postgres.<project-ref>` and the
database name `postgres` — not the `zisun_db` the local compose file uses.

`scripts/check_connections.py` asserts all of this — DNS family, port/mode
agreement, user form, TLS scheme — against whatever env you hand it, before a
deploy depends on it:

```bash
cd backend && python scripts/check_connections.py
```

**Upstash — use the `rediss://` scheme.** The console shows a `redis://` URL
with a `--tls` flag; that flag is redis-cli-only and means nothing to redis-py
or Celery, which would then open a plaintext connection to a TLS-only port.
`app/celery_app.py` appends `ssl_cert_reqs=required` automatically — without it
Celery raises at import and the worker and beat containers crash-loop while
Railway still reports the deploy as SUCCESS.

### 1.3 Generate JWT keys

```bash
cd backend && python scripts/generate_keys.py    # writes the RS256 pair
```

### 1.4 Object storage (Tigris)

Media lives in an S3-compatible bucket. `app/core/storage.py` talks to it via
boto3, so any S3 provider works — the variables are named `R2_*` for historical
reasons, not because it must be Cloudflare.

The bucket must be **public-read**: `CLOUDFLARE_CDN_BASE_URL` is served straight
to customers' browsers as the product image `src`.

### 1.5 Service variables

Set these on **all three backend services** (api, worker and beat — the Celery
processes hit the same DB, Redis and gateways). Railway's *shared variables* at
project level are the least error-prone way to do it.

Connection details are literal values — the stores are external, so Railway's
`${{Postgres.*}}` reference variables do not apply:

```bash
POSTGRES_SERVER=aws-0-<region>.pooler.supabase.com   # IPv4; direct host is IPv6-only
POSTGRES_PORT=6543                       # 6543 transaction | 5432 session
POSTGRES_DB=postgres
POSTGRES_USER=postgres.<ref>             # tenant-qualified, for either pooler port
POSTGRES_PASSWORD=...
DB_PGBOUNCER_MODE=1                      # REQUIRED on 6543; leave 0 on 5432
REDIS_URL=rediss://default:...@....upstash.io:6379   # rediss, not redis
```

> The app reads discrete `POSTGRES_*` vars, **not** `DATABASE_URL` — there is no
> `DATABASE_URL` support anywhere in the codebase, and setting one has no effect.
> A password containing `@ / : #` is percent-encoded automatically
> (`Settings._db_credentials`), so **paste it raw**. Pre-encoding it here sends
> a literal `%40` as the password and authentication fails.

The rest:

```bash
ENVIRONMENT=production
LAUNCH_MODE=browse         # pre-launch only; see 1.5.1. Omit for a full storefront.
PORT=8000                  # must match the domain's target port; see 1.10
SKIP_MIGRATIONS=1          # api runs them via preDeployCommand; see 1.7
SKIP_DEPS_WAIT=1           # managed hosts behind TLS/poolers; the app validates its own connections
UVICORN_WORKERS=2
DB_POOL_SIZE=3
DB_MAX_OVERFLOW=5

JWT_PRIVATE_KEY=<contents of backend/private_key.pem>
JWT_PUBLIC_KEY=<contents of backend/public_key.pem>
BACKEND_CORS_ORIGINS=["https://zisun.in","https://www.zisun.in"]

RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...
R2_ENDPOINT_URL=https://fly.storage.tigris.dev
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
R2_BUCKET_NAME=zisun-media
CLOUDFLARE_CDN_BASE_URL=https://zisun-media.fly.storage.tigris.dev
SHIPROCKET_EMAIL=...
SHIPROCKET_PASSWORD=...
SENTRY_DSN=https://...@sentry.io/...
```

**These do not degrade silently — they stop the app from booting.**

With `ENVIRONMENT=production`, `Settings` refuses to construct if any of
`JWT_*`, `RAZORPAY_*`, `TWILIO_*`, `POSTGRES_PASSWORD`, `REDIS_URL`, `R2_*` or
`CLOUDFLARE_CDN_BASE_URL` is empty. The container exits non-zero, the
healthcheck never passes, and Railway keeps the previous deployment serving.
The deploy log names the missing variables.

`SENTRY_DSN` is **not** on that list. It logs a warning and boots. Error
tracking is how you find out the storefront is broken; it is not a reason for
the storefront to be down.

That is deliberate — the alternative was worse:

- **`R2_*`** — media uploads used to return *placeholder* URLs and appear to
  succeed. Product images would be permanently broken, and the bad `/media/...`
  path is written into the DB.
- **`RAZORPAY_*`** — checkout used to fall back to a `mock_order_*` id and the
  signature verifier returned `True` for *any* signature. Orders would be
  created and fulfilled **without payment**.

Each of those paths also fails closed at runtime (`settings.dev_fallback`), so a
variable removed *after* boot raises instead of reverting to the dev stub.

If a deploy fails on this, the fix is to set the variable — never to unset
`ENVIRONMENT`.

### 1.5.1 `LAUNCH_MODE=browse` — going live before the gateway does

Razorpay KYC gates `RAZORPAY_*`, and those are boot-required, so an unapproved
merchant account holds the *entire storefront* offline — including the
catalogue, which needs nothing from Razorpay. `LAUNCH_MODE=browse` breaks that
deadlock:

| | `LAUNCH_MODE` unset | `LAUNCH_MODE=browse` |
|---|---|---|
| `RAZORPAY_*` required to boot | yes | no |
| `TWILIO_*` required to boot | yes | no |
| Catalogue, prices, sizes, images | public | public |
| `POST /cart/checkout/initiate` | works | **503** |
| `POST /checkout/verify-payment` | works | **503** |
| `GET /checkout/payment-methods` | lists methods | `{"methods": [], "checkout_enabled": false}` |
| `R2_*`, `CLOUDFLARE_CDN_BASE_URL`, `JWT_*`, DB, Redis | required | **still required** |

It relaxes exactly the credentials whose features it switches off, and nothing
else — a browse-only launch with broken product images is not a launch.

Enforcement is server-side in two places: a route dependency
(`app/core/launch.py`) and a guard inside `CheckoutService.initiate_checkout`,
so a caller that is not an HTTP route cannot create an order either. No
Razorpay or Twilio code is deleted or stubbed — those paths are *refused*, so
there is no mock order to clean up on the way back.

**Reverting is deleting one variable.** Delete `LAUNCH_MODE`, redeploy, and the
full fail-closed behaviour returns — the deploy will then correctly refuse to
boot until `RAZORPAY_*` and `TWILIO_*` are set. Any value other than exactly
`browse` (case- and whitespace-insensitive) is treated as unset, so a typo
fails closed rather than half-opening checkout.

Confirm which mode is live without shelling into the container:

```bash
curl -s https://api.zisun.in/health | jq '{launch_mode, checkout_enabled}'
```

The storefront needs the matching `NEXT_PUBLIC_LAUNCH_MODE=browse` (see 1.9),
or it will keep offering an "Add to Cart" that 503s.

### 1.6 Supabase auto-enables RLS on every table

Supabase installs an event trigger, `ensure_rls`, that runs
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` after every `CREATE TABLE` in the
`public` schema. Alembic's migrations create their tables there, so all of them
get RLS enabled with **no policies defined**.

This is currently harmless: Alembic connects as `postgres`, so `postgres` owns
those tables, and Postgres exempts table owners from RLS unless
`FORCE ROW LEVEL SECURITY` is set. The app uses the same role.

**It stops being harmless the moment the app connects as anything else** — a
least-privilege application role, or Supabase's `anon`/`authenticated`/
`service_role`. RLS with no policies does not raise a permission error; it
returns **zero rows**. The catalogue reads as empty, orders disappear on
fetch, carts silently forget. Nothing in the logs says why.

If you ever change `POSTGRES_USER`, first add policies for that role or add a
migration that disables RLS on the application tables. Decide it deliberately.

### 1.7 Migrations run on exactly one service

`backend/railway.json` (the **api** service only) carries:

```json
"preDeployCommand": "alembic upgrade head"
```

Railway runs it in a one-off container before the new api container takes
traffic. A failed migration fails the deploy and the previous version keeps
serving.

All three backend services set `SKIP_MIGRATIONS=1` so `entrypoint.sh` does not
also migrate on boot — three containers racing `alembic upgrade head` against
one database is how you get a half-applied schema.

### 1.8 Keep beat at one replica

`railway.beat.json` pins `"numReplicas": 1`. **Do not raise it.** Two schedulers
double-fire every periodic task: duplicate WhatsApp messages to customers and
double stock restoration on lock expiry.

The api and worker services can scale horizontally; beat cannot.

### 1.9 Frontend build variables

`NEXT_PUBLIC_*` are **inlined into the client bundle at build time**. Railway
exposes service variables to the Dockerfile as build args, and
`frontend/Dockerfile` declares the matching `ARG`s.

Set on the **web** service:

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.zisun.in` — origin only; the `/api/v1` prefix is added per call |
| `NEXT_PUBLIC_LAUNCH_MODE` | `browse` while checkout is closed; empty otherwise. Must match the API's `LAUNCH_MODE`. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | `919876543210` — digits and country code, no `+`. Powers the browse-mode CTA. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_live_xxx` (publishable key only — never the secret) |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://...@sentry.io/...` |

`src/lib/apiBase.ts` normalises `NEXT_PUBLIC_API_URL`, so a value ending in
`/api/v1` is accepted too. It did not always: the storefront client assumed the
suffix was included while the admin client and the analytics beacon appended it
themselves, so one of the two was always a path segment off — which surfaces as
a catalogue that renders empty against a perfectly healthy API, with 404s only
in the browser console.

Changing one requires a **rebuild**, not a restart. A redeploy without a rebuild
keeps the old value baked in.

### 1.10 Pin PORT to match the domain's target port

Railway injects `PORT=8080` unless you set it. Both images listen on whatever
`PORT` says — `entrypoint.sh` uses `${PORT:-8000}`, and Next.js standalone reads
`process.env.PORT`. So the container happily binds 8080 while the generated
domain routes to 3000/8000, and every request returns **502 Application failed
to respond** on top of a completely green build and healthy logs.

Set `PORT` explicitly so the two cannot drift:

| Service | `PORT` | Domain target port |
|---|---|---|
| api | `8000` | 8000 |
| web | `3000` | 3000 |

Worker and beat need neither — they take no inbound traffic.

### 1.11 Domains

Per service → **Settings** → **Networking** → **Custom Domain**. Railway issues
the certificate and gives you a `CNAME` target.

- api service → `api.zisun.in`
- web service → `zisun.in`

The worker and beat services get **no** domain and no public port. They make
outbound connections only.

---

## 2. Deploying

**Normal path:** merge to `main`. Railway's GitHub integration builds and
deploys the affected services automatically (that is what Watch Paths gate).

`.github/workflows/ci.yml` still runs the test suite on every push and PR. It
does not deploy — Railway does that.

**Manual / rollback from CLI:**

```bash
npm i -g @railway/cli
railway login
railway link                    # select the project
railway up --service zisun-api  # build and deploy from local source
```

---

## 3. Post-deploy checklist

```bash
cd backend && python scripts/check_connections.py   # datastores, before blaming the app
curl https://api.zisun.in/health     # db / redis / celery per-component status
railway logs --service zisun-api
```

Under `LAUNCH_MODE=browse`, `celery` may read `no workers` and that is fine —
nothing queues work while ordering is closed. `database` and `redis` must both
be `ok`; the app will serve a degraded `/health` rather than refuse to start,
so a green container is not by itself proof the database is reachable.

Confirm in the dashboard that **api, worker and beat are all running**. A
stopped worker is silent — orders reach `PAID` and then nothing ships, no error
anywhere.

Then, once:

1. **Load the catalogue** — `/admin/products` → *Bulk Import Products (CSV)*, or
   the single-product form. Template: `backend/scripts/sample_catalog.csv`.

   Under `LAUNCH_MODE=browse` there is no admin login to use — it needs an OTP,
   which needs Twilio. Import against the database instead. It runs the admin
   endpoint's own handler, so the validation is identical:

   ```bash
   cd backend
   python scripts/import_catalog.py my_catalogue.csv --dry-run   # validate only
   python scripts/import_catalog.py my_catalogue.csv
   ```

   Product images must be on the host in `CLOUDFLARE_CDN_BASE_URL`.
   `frontend/next.config.js` allowlists that one hostname for `next/image`, so
   an `image_url` pointing anywhere else renders broken — upload to the bucket
   first, then reference the CDN URL in the CSV.
2. **Register the Razorpay webhook** → `https://api.zisun.in/api/v1/orders/webhooks/razorpay`
   (must match `RAZORPAY_WEBHOOK_SECRET`).
3. **Register the WhatsApp webhook** → `https://api.zisun.in/api/v1/webhooks/whatsapp`.
4. **Place one real ₹1 order end-to-end** and confirm it reaches `PAID` and the
   WhatsApp confirmation arrives. Nothing else proves the money path works.

---

## 4. Rollback

Dashboard → service → **Deployments** → pick a previous build → **Redeploy**.

⚠️ Rolling back **code** does not roll back a **migration**. If the bad release
migrated the schema, run `alembic downgrade -1` (all migrations here are
reversible) *before* redeploying the older build.

---

## 5. Backups

`docker-compose.prod.yml` includes a `db-backup` service (daily `pg_dump`, 7-day
rotation, optional S3 upload) — that is for self-hosted deploys only. **It does
not run on Railway.**

Backups are **Supabase's**, and on the free tier they are thinner than a paid
managed Postgres: daily snapshots with short retention and no point-in-time
recovery. Read what your plan actually provides in Supabase → Database →
Backups, and decide whether losing up to a day of orders is acceptable. If it
is not, that is the argument for a paid tier — not a reason to skip backups.

**Verify a backup exists and can be restored before launch.** This is the one
failure with no recovery path.

---

## 5.1 There is no staging database

Everything runs against one Supabase project. The browser walkthrough of the
cart and checkout path — sign in, add to cart, place a test-mode Razorpay order,
verify the signature — therefore ran against **production Supabase**, and left
32 accounts, 19 carts and 2 orders behind. They were deleted afterwards; the
catalogue was untouched.

That was tolerable exactly once, because the store had no real customers. It
stops being tolerable the moment it does:

- test accounts become indistinguishable from real ones in any count you run
- a test order is a real row in the table an accountant reconciles
- a mistaken `delete from users` is unrecoverable rather than merely annoying
- the free tier's fifteen session-mode clients are shared with the live app, so
  a local test run competes with customers for connections

The fix is a second Supabase project used as staging, with `POSTGRES_*` pointed
at it for local and CI runs. Until that exists, anything that writes rows must
be run knowingly and cleaned up, and **nothing may be tested against production
once real orders exist**.

Seeding the staging catalogue is `scripts/import_catalog.py` against the staging
credentials; `--dry-run` validates without writing.

## 6. Known gaps

| Gap | Impact |
|---|---|
| **No policy pages** | `/privacy`, `/terms`, `/refund`, `/shipping`, `/contact` do not exist in `frontend/src/app/`. All five 404. **Razorpay KYC requires them on a live domain** — this blocks the payments launch, not the browse launch |
| **No staging database** | All testing runs against production Supabase — see 5.1. Fine before real customers, not after |
| No email service | Notifications are WhatsApp + SMS only; no email receipts |
| Pincode serviceability stubbed | Always returns "deliverable" — real Shiprocket check not wired |
| No Shiprocket inbound webhook | Tracking updates don't flow back automatically |

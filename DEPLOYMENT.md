# ZISUN — Deployment (Railway)

Four Railway services, all built from this one repo:

| Service | Root dir | Config file | What runs |
|---|---|---|---|
| `zisun-api` | `backend` | `railway.json` | FastAPI (uvicorn) |
| `zisun-worker` | `backend` | `railway.worker.json` | Celery worker |
| `zisun-beat` | `backend` | `railway.beat.json` | Celery beat scheduler |
| `zisun-web` | `frontend` | `railway.json` | Next.js standalone server |

Plus two Railway plugins — **Postgres** and **Redis** — and one external
dependency, **Tigris** object storage for product media (Railway has no
object store of its own).

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

### 1.2 Add Postgres and Redis

**New** → **Database** → **Add PostgreSQL**, then again for **Redis**.

Both attach to the project's private network. Nothing is publicly exposed
unless you explicitly add a TCP proxy, which you should not.

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

Postgres and Redis use **reference variables** so a credential rotation on the
plugin propagates without edits here:

```bash
POSTGRES_SERVER=${{Postgres.PGHOST}}
POSTGRES_PORT=${{Postgres.PGPORT}}
POSTGRES_DB=${{Postgres.PGDATABASE}}
POSTGRES_USER=${{Postgres.PGUSER}}
POSTGRES_PASSWORD=${{Postgres.PGPASSWORD}}
REDIS_URL=${{Redis.REDIS_URL}}
```

> The app reads discrete `POSTGRES_*` vars, **not** `DATABASE_URL`.

The rest are literal values:

```bash
ENVIRONMENT=production
SKIP_MIGRATIONS=1          # api runs them via preDeployCommand; see 1.6
SKIP_DEPS_WAIT=1           # Railway's private DNS is IPv6-only; the app validates its own connections
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
`JWT_*`, `RAZORPAY_*`, `TWILIO_*`, `SENTRY_DSN`, `POSTGRES_PASSWORD`,
`REDIS_URL`, `R2_*` or `CLOUDFLARE_CDN_BASE_URL` is empty. The container exits
non-zero, the healthcheck never passes, and Railway keeps the previous
deployment serving. The deploy log names the missing variables.

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

### 1.6 Migrations run on exactly one service

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

### 1.7 Keep beat at one replica

`railway.beat.json` pins `"numReplicas": 1`. **Do not raise it.** Two schedulers
double-fire every periodic task: duplicate WhatsApp messages to customers and
double stock restoration on lock expiry.

The api and worker services can scale horizontally; beat cannot.

### 1.8 Frontend build variables

`NEXT_PUBLIC_*` are **inlined into the client bundle at build time**. Railway
exposes service variables to the Dockerfile as build args, and
`frontend/Dockerfile` declares the matching `ARG`s.

Set on the **web** service:

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.zisun.in` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_live_xxx` (publishable key only — never the secret) |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://...@sentry.io/...` |

Changing one requires a **rebuild**, not a restart. A redeploy without a rebuild
keeps the old value baked in.

### 1.9 Domains

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
curl https://api.zisun.in/health     # db / redis / celery per-component status
railway logs --service zisun-api
```

Confirm in the dashboard that **api, worker and beat are all running**. A
stopped worker is silent — orders reach `PAID` and then nothing ships, no error
anywhere.

Then, once:

1. **Load the catalogue** — `/admin/products` → *Bulk Import Products (CSV)*, or
   the single-product form. Template: `backend/scripts/sample_catalog.csv`.
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

Railway Postgres takes its own backups; check the plugin's **Backups** tab and
confirm the schedule and retention match what losing that data would cost you.

**Verify a backup exists and can be restored before launch.** This is the one
failure with no recovery path.

---

## 6. Known gaps

| Gap | Impact |
|---|---|
| No email service | Notifications are WhatsApp + SMS only; no email receipts |
| Pincode serviceability stubbed | Always returns "deliverable" — real Shiprocket check not wired |
| No Shiprocket inbound webhook | Tracking updates don't flow back automatically |

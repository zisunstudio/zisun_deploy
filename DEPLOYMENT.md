# ZISUN — Deployment (Fly.io)

Two Fly apps from this one repo:

| App | Config | What runs |
|---|---|---|
| `zisun-api` | `backend/fly.toml` | FastAPI (`app`) + Celery `worker` + Celery `beat` — three process groups, one image |
| `zisun-web` | `frontend/fly.toml` | Next.js standalone server |

Region `bom` (Mumbai). Every commit **builds** both images; only `main` **deploys**.

---

## 1. One-time setup

### 1.1 Create the apps

```bash
fly auth login
fly apps create zisun-api
fly apps create zisun-web
```

### 1.2 Managed Postgres and Redis

```bash
# Postgres (Fly Postgres, or use Neon/Supabase and skip to the secret below)
fly postgres create --name zisun-db --region bom
fly postgres attach zisun-db --app zisun-api   # sets DATABASE_URL

# Redis — Upstash via Fly. Note the rediss:// (TLS) URL it prints.
fly redis create --name zisun-redis --region bom
```

> The app reads discrete `POSTGRES_*` vars, **not** `DATABASE_URL`. Set them explicitly
> from your Postgres connection details (see below). `entrypoint.sh` skips the
> `redis-cli` probe automatically for `rediss://`.

### 1.3 Generate JWT keys

```bash
cd backend && python scripts/generate_keys.py    # writes the RS256 pair
```

### 1.4 Set backend secrets

```bash
fly secrets set --app zisun-api \
  POSTGRES_SERVER="..." POSTGRES_PORT="5432" POSTGRES_DB="zisun" \
  POSTGRES_USER="..." POSTGRES_PASSWORD="..." \
  REDIS_URL="rediss://default:...@...upstash.io:6379" \
  JWT_PRIVATE_KEY="$(cat backend/private_key.pem)" \
  JWT_PUBLIC_KEY="$(cat backend/public_key.pem)" \
  BACKEND_CORS_ORIGINS='["https://zisun.in","https://www.zisun.in"]' \
  RAZORPAY_KEY_ID="rzp_live_..." RAZORPAY_KEY_SECRET="..." RAZORPAY_WEBHOOK_SECRET="..." \
  TWILIO_ACCOUNT_SID="..." TWILIO_AUTH_TOKEN="..." TWILIO_FROM_NUMBER="+1..." \
  WHATSAPP_ACCESS_TOKEN="..." WHATSAPP_PHONE_NUMBER_ID="..." \
  WHATSAPP_WEBHOOK_VERIFY_TOKEN="..." WHATSAPP_APP_SECRET="..." \
  R2_ENDPOINT_URL="https://<acct>.r2.cloudflarestorage.com" \
  R2_ACCESS_KEY="..." R2_SECRET_KEY="..." R2_BUCKET_NAME="zisun-media" \
  CLOUDFLARE_CDN_BASE_URL="https://cdn.zisun.in" \
  SHIPROCKET_EMAIL="..." SHIPROCKET_PASSWORD="..." \
  SENTRY_DSN="https://...@sentry.io/..."
```

**These no longer degrade silently — they now stop the app from booting.**

With `ENVIRONMENT=production` (set in `backend/fly.toml`), `Settings` refuses to
construct if any of `JWT_*`, `RAZORPAY_*`, `TWILIO_*`, `SENTRY_DSN`,
`POSTGRES_PASSWORD`, `REDIS_URL`, `R2_*`, or `CLOUDFLARE_CDN_BASE_URL` is empty.
The machine exits, the Fly health check fails, and the rolling deploy is held —
the old release keeps serving. The startup log names the missing variables.

That is deliberate: the alternative was worse.

- **`R2_*`** — media uploads used to return *placeholder* URLs and appear to
  succeed. Product images would be permanently broken, and the bad `/media/...`
  path is written into the DB.
- **`RAZORPAY_*`** — checkout used to fall back to a `mock_order_*` id and the
  signature verifier returned `True` for *any* signature. Orders would be
  created and fulfilled **without payment**.

Each of those code paths also fails closed at runtime now (`settings.dev_fallback`),
so a secret unset *after* boot raises instead of reverting to the dev stub.

If a deploy fails on this: the fix is to set the secret, never to unset
`ENVIRONMENT`.

### 1.5 GitHub repo settings

**Secret** (Settings → Secrets → Actions):

| Secret | Value |
|---|---|
| `FLY_API_TOKEN` | `fly tokens create deploy` |

**Variables** (Settings → Variables → Actions) — these are public, build-time values:

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.zisun.in` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_live_xxx` (publishable key only) |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://...@sentry.io/...` |
| `API_HOST` | `api.zisun.in` |
| `WEB_HOST` | `zisun.in` |

> `NEXT_PUBLIC_*` are **inlined into the client bundle at build time** — they are
> build args, not runtime secrets. Changing one requires a rebuild, not a restart.

### 1.6 Scale the process groups

```bash
fly scale count app=1 worker=1 beat=1 --app zisun-api
```

**Keep `beat=1`.** Two schedulers double-fire every periodic task — duplicate
WhatsApp messages and double stock restoration.

### 1.7 Custom domains

```bash
fly certs create api.zisun.in --app zisun-api
fly certs create zisun.in     --app zisun-web
```

Then point `A`/`AAAA` (or `CNAME`) records at the Fly IPs from `fly ips list`.

---

## 2. Deploying

**Normal path:** merge to `main`. The `Fly Deploy` workflow then:

1. Builds both images (this also runs on every branch and PR)
2. Deploys the backend — `release_command` runs `alembic upgrade head` **before**
   new machines take traffic; a failed migration fails the deploy and the old
   version keeps serving
3. Polls `/health` until 200
4. Deploys the frontend, then polls `/`

**Manual:**

```bash
fly deploy --config backend/fly.toml  --dockerfile backend/Dockerfile  ./backend  --remote-only
fly deploy --config frontend/fly.toml --dockerfile frontend/Dockerfile ./frontend --remote-only \
  --build-arg NEXT_PUBLIC_API_URL="https://api.zisun.in"
```

---

## 3. Post-deploy checklist

```bash
curl https://api.zisun.in/health          # db / redis / celery per-component status
fly logs --app zisun-api
fly status --app zisun-api                # app, worker, beat all "started"
```

Then, once:

1. **Load the catalogue** — `/admin/products` → *Bulk Import Products (CSV)*, or the
   single-product form. Template: `backend/scripts/sample_catalog.csv`.
2. **Register the Razorpay webhook** → `https://api.zisun.in/api/v1/orders/webhooks/razorpay`
   (must match `RAZORPAY_WEBHOOK_SECRET`).
3. **Register the WhatsApp webhook** → `https://api.zisun.in/api/v1/webhooks/whatsapp`.
4. **Place one real ₹1 order end-to-end** and confirm it reaches `PAID` and the
   WhatsApp confirmation arrives. Nothing else proves the money path works.

---

## 4. Rollback

```bash
fly releases --app zisun-api
fly deploy --image <previous-image-ref> --app zisun-api
```

⚠️ Rolling back **code** does not roll back a **migration**. If the bad release
migrated the schema, run `alembic downgrade -1` (all migrations here are
reversible) before rolling back the image.

---

## 5. Backups

`docker-compose.prod.yml` includes a `db-backup` service (daily `pg_dump`, 7-day
rotation, optional R2 upload) — that is for self-hosted deploys.

**On Fly, that container is not running.** Use whichever applies:

```bash
fly postgres backup list --app zisun-db     # Fly Postgres: automatic daily snapshots
```

Neon/Supabase have their own PITR. **Verify backups exist before launch** — this is
the one failure with no recovery path.

---

## 6. Known gaps

| Gap | Impact |
|---|---|
| No email service | Notifications are WhatsApp + SMS only; no email receipts |
| Pincode serviceability stubbed | Always returns "deliverable" — real Shiprocket check not wired |
| No Shiprocket inbound webhook | Tracking updates don't flow back automatically |

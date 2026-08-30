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

**An unconfirmed COD order must not reach PACKED.** `may_dispatch()` gates the
admin status endpoint with a 409. Asking the customer and shipping anyway
saves nothing.

**Worker/beat health cannot be read from Railway.** Railway reports SUCCESS
once a container *starts* — it has no idea the process died a second later.
Both have sat "SUCCESS" while crash-looping. Verify via `/health`, or by
confirming a task actually executed (`celery-task-meta-*` keys in Redis).
A dead worker is silent: orders reach PAID, then nothing ships, stock never
returns from expired carts, and no error appears anywhere.

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

## State as of 2026-08-30

Both services are up. `GET /health` returns:

```json
{"status":"ok","launch_mode":"browse","checkout_enabled":false,
 "components":{"database":"ok","redis":"ok","celery":"not probed (browse mode)"}}
```

Supabase and Upstash are therefore **proven**, not merely configured.

Live in **browse mode**: the catalogue is public and no order can be created.
To open commerce, in order — set the Twilio account SID and from-number (OTP
login needs them), unset `LAUNCH_MODE`, keep `PAYMENTS_COD_ONLY=1` until
Razorpay KYC clears, then unset that too.

Celery is unverified. `/health` does not probe it in browse mode, and Railway
reporting SUCCESS proves nothing — confirm a task actually ran before trusting
the worker.

Check whether Railway's Postgres and Redis plugins still exist; they were
superseded by Supabase and Upstash and bill until deleted.

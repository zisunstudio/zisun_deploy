# Migrating ZISUN to `zisunstudio/zisun_deploy` + deploying on Fly

> **STATUS — historical. Steps 1–2 are done; Step 3 onward is superseded.**
>
> The GitHub migration completed: `zisunstudio/zisun_deploy` holds `main`, SSH
> auth is set up, and pushes work. Those steps are kept for the record.
>
> **The Fly.io sections no longer apply.** Deployment moved to Railway —
> `fly.toml` and the `Fly Deploy` workflow have been deleted from the repo.
> Mumbai (`bom`) had no Fly capacity, which is what prompted the move.
> **See `DEPLOYMENT.md` for the current, authoritative deploy process.**

Moving the codebase from `v22kumar/ZISUN` to the new **zisunstudio** GitHub account
and deploying to Fly.io from there.

Verified at time of writing: `zisunstudio/zisun_deploy` exists and is **empty**
(0 refs), so nothing will be overwritten.

---

## Step 1 — Get the code into the new repo

### Option A — push from your local clone (recommended, ~1 min)

Preserves all branches and full history.

```bash
cd /path/to/ZISUN
git remote add studio https://github.com/zisunstudio/zisun_deploy.git
git push studio --all
git push studio --tags
```

Then set `main` as the default branch in the new repo's Settings → Branches.

> `--mirror` also works but force-overwrites everything and copies remote-tracking
> refs; `--all --tags` is the safer choice into an empty repo.

### Option B — GitHub's importer (browser only)

Open <https://github.com/zisunstudio/zisun_deploy/import>, enter
`https://github.com/v22kumar/ZISUN` as the source. Works, preserves history — but
it's slower and gives you no control over which branches land.

**Either way, this copies code only.** Everything in Step 2 must be recreated by hand.

---

## Step 2 — What does NOT transfer (this is what breaks deploys)

Neither method copies any of these. The Fly workflow will fail — or worse, deploy a
broken storefront — until they're set on the **new** repo.

### 2a. Actions secret

Settings → Secrets and variables → Actions → **Secrets**

| Secret | How to get it |
|---|---|
| `FLY_API_TOKEN` | `fly tokens create deploy` (run under the Fly org that owns the apps) |

### 2b. Actions variables

Settings → Secrets and variables → Actions → **Variables**

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.zisun.in` | **Baked into the client bundle at build time** |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_live_xxx` | Publishable key only |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://…@sentry.io/…` | |
| `API_HOST` | `api.zisun.in` | Used by the post-deploy health check |
| `WEB_HOST` | `zisun.in` | Used by the post-deploy check |

⚠️ If `NEXT_PUBLIC_API_URL` is missing, the build still **succeeds** and the deployed
storefront ships with an empty API URL — every request fails at runtime. Set it before
the first deploy to `main`.

### 2c. Everything else that's repo-scoped

- Branch protection rules
- The `production` environment (GitHub auto-creates it on first run, but with **no**
  approval rules — re-add those if you had them)
- Collaborator access

---

## Step 3 — Fly apps under the new account

Fly apps belong to a **Fly organization**, which is independent of GitHub. Two cases:

**Reusing the existing Fly org** — nothing to do but generate a token for the new repo:

```bash
fly tokens create deploy
```

**New Fly org for zisunstudio** — create the apps there:

```bash
fly auth login
fly apps create zisun-api  --org zisunstudio
fly apps create zisun-web  --org zisunstudio
```

### ⚠️ App names are globally unique across all of Fly

If `zisun-api` / `zisun-web` are already taken (including by the old account), creation
fails. Pick new names and update **three** places, or the deploy will target the wrong app:

1. `app = "…"` in `backend/fly.toml`
2. `app = "…"` in `frontend/fly.toml`
3. The `API_HOST` / `WEB_HOST` / `NEXT_PUBLIC_API_URL` variables from Step 2b

Then follow `DEPLOYMENT.md` §1.2 onward for Postgres, Redis, secrets, scaling and domains.

---

## Step 4 — First deploy

Push to `main` on the new repo. The `Fly Deploy` workflow will:

1. Build both images (this also runs on every branch/PR — a broken Dockerfile fails fast)
2. Deploy the backend; `release_command` runs `alembic upgrade head` before machines
   take traffic
3. Poll `/health` until 200
4. Deploy the frontend; poll `/`

Watch it: `fly logs --app zisun-api`

---

## Step 5 — Decommission the old path

Once the new repo deploys green:

- Old repo: Settings → Actions → disable, so two repos can't deploy the same Fly apps
- Rotate any credential that existed in the old repo's secrets (`FLY_API_TOKEN`
  especially). Treat everything that lived there as exposed to the old account.

---

## Pre-launch reminders (unchanged by the move)

Two configs **degrade silently** rather than failing — from `DEPLOYMENT.md` §1.4:

- Missing `R2_*` → media uploads return **placeholder URLs** and appear to succeed;
  product images are broken.
- Missing `RAZORPAY_*` → checkout falls back to a `mock_order_*` id and **skips the
  payment modal** — orders get created without payment.

Set both on `zisun-api` before taking real orders.

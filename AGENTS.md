# AGENTS.md

Instructions for any coding agent working in this repository.

## Read `CLAUDE.md` first

**`CLAUDE.md` is the single source of truth.** It holds the invariants that
must not be broken and the traps that have already cost this project real
money and real data. It is ~630 lines and all of it earned.

This file exists because several tools look for `AGENTS.md` by name. It
deliberately does **not** restate `CLAUDE.md`: two copies of a rule is one
copy that will quietly go out of date, and a stale invariant here would be
worse than no file at all.

## The five-second version

ZISUN is a live shop. Real customers, real money, an Indian founder running
it from her phone.

- **It is in production.** Orders are being placed. A broken deploy is a
  customer who cannot buy and a founder who cannot pack.
- **Verify, do not assume.** Railway reports SUCCESS when a container
  *starts*. A green deploy has proved nothing. Check `/health`, check the
  live page, read the logs.
- **The console is phone-first.** Run `scripts/review/console.js` before
  calling any console change done.
- **Never claim what the data does not support.** Brand claims are computed
  from what the pieces record (`services/truth.py`), not written by hand.
  The same applies to photographs — see `PHOTOGRAPHY.md`.

## Where things are

| File | What it is |
|---|---|
| `CLAUDE.md` | **Invariants and traps. Read it.** |
| `DEPLOYMENT.md` | The deploy runbook |
| `DESIGN.md` | The storefront's design thesis — read before changing anything a customer sees |
| `FEATURES.md` | Ledger of everything shipped; update it in the same commit as a feature change |
| `PHOTOGRAPHY.md` | How product photographs are corrected before upload |

## Commands

```bash
# Deploy and status (token from $RAILWAY_TOKEN or ~/.config/zisun/railway_token)
scripts/railway/deploy.sh [web worker beat]
scripts/railway/status.sh

# Console at phone width — fails on overflow, page errors or an error boundary
node scripts/review/console.js /admin/orders /admin/products

# Correct a shoot
node scripts/photos/correct.js <src> <out> --sheet review.jpg

# Tests
cd frontend && npx vitest run
cd backend && pytest
```

## Deploying, in short

Pushing to `main` builds **the api only**. `web`, `worker` and `beat` have no
GitHub trigger and must be deployed by hand, or they keep serving the
previous commit behind a green SUCCESS. Never redeploy the api after a push —
two deploys race `alembic upgrade head` and the loser fails with
`DuplicateColumn`. The full reasoning is in `CLAUDE.md`.

## House style

Match the code already there. It is written to be read: comments say *why*,
usually by naming the failure that made the line necessary. A comment that
restates the code is noise; a comment that records what went wrong is the
most valuable thing in the file.

Do not delete a feature to make a problem go away. `FEATURES.md` has a
**Retired** table for that, with a reason and a restore commit.

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

## Where each language belongs

Chosen by where the time actually goes, measured, not by preference. The
honest summary is that **for every hot path in ZISUN today the compiled code
is already there and is not ours.**

**The runtime image path is already C.** `next/image` calls `sharp`, which is
a thin binding over **libvips** — C, SIMD, streaming, demand-driven. Nothing
written here in Go or C++ would beat it; it is what a rewrite would aim to
reproduce. The measured win on this path came from *installing* it (48.8MB →
13KB per photograph, LCP 14.9s → usable), not from a faster language.

**The API's bottleneck is distance, not Python.** A bare `SELECT 1` costs
**~890ms** because Supabase is in `ap-southeast-2` (Sydney) and the app is in
`asia-southeast1` (Singapore). Rewriting the API in Go would save
microseconds of interpreter overhead against a wait three orders of magnitude
larger. Moving the database to the app's region is worth more than any
rewrite, and it is a settings change. `/health` reports `timings_ms` so this
stays measured rather than argued about.

So the rule: **before proposing a faster language, produce the profile that
shows the language is the cost.** For this codebase it never has been.

**Python is the right language for the photograph batch**, and not as a
compromise — it is where the validated implementations live:
`colour-science` (CIE transforms, CIEDE2000, chromatic adaptation, tested
against the published data sets), `scikit-image` (CLAHE, local tone
operators, morphology), OpenCV (also C underneath, bound to Python). Compare
that with `scripts/photos/colour.js`, where CIEDE2000 is hand-typed from the
paper — correct as far as it is tested, but re-implementing published
formulae is where quiet bugs live, and a wrong ΔE is worse than none because
it looks like evidence.

Those libraries also carry the piece step (2) of `PHOTOGRAPHY.md` needs:
segmentation, to measure the garment instead of the frame.

It is a **one-time batch on a laptop**, run per shoot. Minutes are free
there. The constraint is correctness, and NumPy over 12MP of Float32 is
vectorised C anyway.

**Where a compiled language would genuinely earn its place**, if the shop
grows into it: a per-request transform of a photograph the customer is
waiting on. That does not exist — corrections happen once, before upload, and
resizing is libvips. If it ever does, it is a service, not a rewrite, and the
number to beat gets measured first.

## House style

Match the code already there. It is written to be read: comments say *why*,
usually by naming the failure that made the line necessary. A comment that
restates the code is noise; a comment that records what went wrong is the
most valuable thing in the file.

Do not delete a feature to make a problem go away. `FEATURES.md` has a
**Retired** table for that, with a reason and a restore commit.

# immigrate-worker Redirect Audit

Issue: https://github.com/MMD-Prive/mmd-workers/issues/109

Date recorded: 2026-06-28

## Purpose

This file records the route and redirect behavior audit for `immigrate-worker`, specifically the Phase 6A SIGIL booking routes deployed from source worktree.

It is a documentation-only record. It does not modify `immigrate-worker/src/index.ts` or any runtime code.

---

## Parity status

**Deployed runtime differs from `origin/main`.**

Phase 6A SIGIL booking behavior was deployed from:

```text
/private/tmp/mmd-workers-phase5-sigil-assets
```

That source worktree is not yet represented by a clean main-based runtime PR.

Live worker version: `819dc2b5-a47a-4347-afaf-2f755f422fcd`

---

## Phase 6A routes present in deployed runtime but absent from `origin/main`

The deployed `immigrate-worker/src/index.ts` imports route modules not present on `origin/main`:

| Route module | Purpose |
|---|---|
| `./routes/create-links` | Immigration link creation handler |
| `./routes/line-send-session-card` | LINE session card dispatch |
| `./routes/model-session` | Model session route handler |
| `./routes/payment-page` | Payment page surface |
| `./routes/sigil-renewal-page` | SIGIL renewal page surface |
| `./routes/admin-auth` | Admin authentication route |

These files exist in the source worktree but are outside the approved three-file runtime parity scope.

---

## Routes present on `origin/main` (unmodified by this PR)

Routes currently handled by `immigrate-worker/src/index.ts` on `origin/main`:

- `/ping` — health ping
- `/v1/immigrate/health` — structured health response
- `/v1/immigrate/line/preview` — LINE client preview
- `/v1/immigrate/line/intake` — LINE client intake
- `/v1/immigrate/links` — immigration link generation
- `/v1/immigrate/get` — immigration record retrieval
- `/v1/immigrate/promote` — immigration promotion
- `/v1/immigrate/sync` — Airtable sync
- `/v1/immigrate/sessions` — session list
- `/member/dashboard` — member dashboard page (HTML)
- `/sigil/admin/*` — SIGIL admin routes (login, control room, dashboard, auth)
- `/api/*` internal — internal API routes

---

## Phase 6A live smoke record

Live smoke was reportedly confirmed after Phase 6A deployment:

- `/sigil/booking` HTML page returns `200`
- Booking page submits to the existing public handler path
- `/api/sigil/models/search?q=kenji...` returns `200` with `models_found`
- Browser smoke matched Kenji and submitted a booking request
- Success copy: `Booking request received for review.`
- Live POST returned request IDs only — no Airtable storage internals exposed

Test booking labels created during smoke:

```text
Codex Phase 6A Smoke
Codex Phase 6A Smoke Final
```

---

## Wrangler deploy note

Wrangler reportedly uploaded/deployed the worker version, then exited `1` because of an existing Cloudflare routes API trigger failure.

- Upload: completed
- Worker version registered: `819dc2b5-a47a-4347-afaf-2f755f422fcd`
- Routes API trigger deployment: failed (pre-existing trigger conflict)

---

## Validation from source worktree

```text
npm --prefix immigrate-worker test
PASS

node --check immigrate-worker/src/index.ts
PASS
```

These results are from the source worktree, not from `origin/main`.

---

## Why the three-file runtime parity PR was blocked

A clean three-file runtime parity branch against `origin/main` was attempted with only:

```text
immigrate-worker/src/index.ts
immigrate-worker/test/sigil-booking-api.test.mjs
immigrate-worker/REDIRECT_AUDIT.md
```

That scope does not stand alone against current `origin/main` because the updated `immigrate-worker/src/index.ts` imports route modules that are not present on `origin/main`. Those modules exist only in the source worktree.

---

## Architecture note

The Phase 6A SIGIL booking routes are temporary compatibility under `immigrate-worker`.

Future SIGIL backend ownership should move to separate workers where applicable, with route ownership and public API contracts documented before migration.

---

## Remaining blocker for true runtime parity

True runtime parity remains blocked until one of these is approved:

1. Target a known integration base that already contains the required route modules.
2. Expand the runtime PR scope to include the missing route modules and supporting files.
3. Re-port Phase 6A behavior onto `origin/main` without importing those modules.

Until then, deployed runtime differs from `main`.

---

## Rollback note

If Phase 6A live behavior must be rolled back before runtime parity is merged to `main`, use Cloudflare Workers deployment rollback for `immigrate-worker` to the previously approved version.

Do not attempt to reconstruct rollback from this documentation-only PR. It contains no runtime code.

---

## Related documentation

- `docs/architecture/PHASE_6A_SIGIL_BOOKING_PARITY_AUDIT.md` — full parity/audit record
- `docs/architecture/ROUTES_AND_SURFACES.md` — route and surface doctrine
- `docs/architecture/WORKERS.md` — worker layer architecture

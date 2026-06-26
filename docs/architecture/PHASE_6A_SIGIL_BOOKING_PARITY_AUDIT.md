# Phase 6A SIGIL Booking Runtime Parity Audit

Issue: https://github.com/MMD-Prive/mmd-workers/issues/109

Date recorded: 2026-06-27

## Status

Phase 6A SIGIL booking runtime behavior was deployed from a local/source worktree, but it is not yet represented by a clean main-based runtime pull request.

This document is a parity/audit record only. It does not merge runtime parity, does not modify `immigrate-worker/src/index.ts`, and does not add the route modules required by the deployed source.

## Live Runtime Record

- Worker: `immigrate-worker`
- Live worker version reported: `819dc2b5-a47a-4347-afaf-2f755f422fcd`
- Wrangler reportedly uploaded/deployed the worker version, then exited `1` because of an existing Cloudflare routes API trigger failure.
- The deploy note was: upload completed, but existing routes API trigger deployment failed.

## Source Worktree Validation

Source worktree used for the deployed Phase 6A behavior:

```text
/private/tmp/mmd-workers-phase5-sigil-assets
```

Validation reported from that source worktree:

```text
npm --prefix immigrate-worker test
PASS

node --check immigrate-worker/src/index.ts
PASS
```

## Main-Based Runtime Parity Blocker

A clean three-file runtime parity branch against current `origin/main` was attempted with only:

```text
immigrate-worker/src/index.ts
immigrate-worker/test/sigil-booking-api.test.mjs
immigrate-worker/REDIRECT_AUDIT.md
```

That scope does not stand alone against current `origin/main`.

`immigrate-worker/src/index.ts` from the deployed/source worktree imports route modules that are not present on `origin/main`, including:

```text
./routes/create-links
./routes/line-send-session-card
./routes/model-session
./routes/payment-page
./routes/sigil-renewal-page
./routes/admin-auth
```

Those modules exist in the source worktree, but they are outside the approved three-file runtime parity scope. Therefore a clean runtime parity PR would either need an approved integration base that already includes those modules, or an explicitly expanded runtime scope.

This documentation-only PR intentionally does neither.

## Reported Live Smoke

Live smoke was reportedly confirmed after the Phase 6A deployment:

- `/sigil/booking` HTML page returns `200`.
- Booking page submits to the existing public handler path.
- `/api/sigil/models/search?q=kenji...` returns `200` with `models_found`.
- Browser smoke matched Kenji.
- Browser smoke submitted a booking request.
- Success copy: `Booking request received for review.`
- Live POST returned request IDs only.
- Live POST did not expose Airtable storage internals.

Test booking labels created:

```text
Codex Phase 6A Smoke
Codex Phase 6A Smoke Final
```

## Architecture Note

This is temporary compatibility under `immigrate-worker`.

It is not the future permanent ownership model for SIGIL booking APIs. Future SIGIL backend ownership should move to separate workers where applicable, with route ownership and public API contracts documented before migration.

## Rollback Note

If Phase 6A live behavior must be rolled back before runtime parity is merged to `main`, use Cloudflare Workers deployment rollback for `immigrate-worker` to the previously approved version. Do not attempt to reconstruct rollback from this documentation-only PR, because it contains no runtime code.

## Remaining Runtime Parity Decision

True runtime parity remains blocked until one of these is approved:

1. Target a known integration base that already contains the required route modules.
2. Expand the runtime PR scope to include the missing route modules and any supporting files.
3. Re-port Phase 6A behavior onto current `origin/main` without importing those modules.

Until then, deployed runtime differs from `main`.

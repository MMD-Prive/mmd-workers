# Public Access Production Acceptance — 2026-09-19

Status: DEPLOY + LIVE SMOKE AUTOMATED

Presentation owner:
- Webflow `/public/access`, root `#mmd-access-gate`.

Separate intake API owner:
- `public-access-worker`.
- `POST https://sigil.mmdbkk.com/public/api/access/intake`.

Deployment:
- `.github/workflows/deploy-public-access-worker.yml`.

Live smoke:
- `.github/workflows/public-access-production-smoke.yml`.

The smoke proves:
- apex and www Public Access presentation returns the Webflow gate;
- OPTIONS exposes the bounded allowed-origin contract;
- disallowed origins fail closed;
- an allowed-origin POST reaches the intake handler but stops at `evidence_required` before any Airtable/R2 mutation;
- unknown `/public/api/*` subpaths fail closed.

The smoke intentionally does not upload evidence, create a Public Access Request, grant access, mark payment paid, or confirm a booking.

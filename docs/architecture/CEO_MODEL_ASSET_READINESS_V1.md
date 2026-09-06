# CEO Model Asset Readiness V1

Canonical CEO surface: `/internal/ceo/models`

Backend read contract: `GET /v1/admin/models/resolve-source?q=<name|working_name|model_id>`

## Purpose

The CEO surface is a read-first asset readiness console. It must locate a model, explain what is missing, and route the operator to the correct work surface. Webflow is not a source of truth and never marks a model published.

## Six readiness checks

1. Canonical Airtable model record
2. Canonical R2 migration under `models/<model>/`
3. Public-safe primary image
4. Public profile readiness
5. Public gallery readiness
6. Compcard readiness

Verdicts:

- `Incomplete` — fewer than four checks pass
- `Needs Review` — four or five checks pass
- `Ready for Review` — all six checks pass

`Ready for Review` is not `Published`.

## Canonical flow

`Drive / Intake → Studio → R2 + Airtable → Public Asset`

## CTA routing

- Missing canonical record / new source → `/internal/admin/studio/upload`
- Asset work remains → `/internal/admin/studio/review`
- Final customer-facing inspection → `/internal/admin/studio/model-preview`
- Return to readiness / R2-record diagnosis → `/internal/ceo/models`

The model job/session console is not an asset-management destination.

## Browser auth and authority

The browser calls the same-origin admin endpoint with `credentials: include`. No Admin Token, Bearer field, Confirm-Key field, API base override, or other secret input belongs on the Webflow page.

The production admin entrypoint authenticates `/v1/admin/*` before the readiness handler runs. The readiness handler is read-only; it cannot create Airtable truth, mark an R2 migration complete, approve media, or publish a profile.

Every readiness response explicitly reports:

- `authority: backend`
- `published: false`
- `can_publish: false`
- `demo: false` for real backend results

## Public path guard

Only canonical public model assets are eligible for preview:

- `models/<model>/profile/<file>`
- `models/<model>/gallery/<file>`
- `models/<model>/compcard/<file>`

The guard rejects traversal, external URLs, noncanonical roots, and protected segments including:

- `private`
- `evidence`
- `slips`
- `line-notes`
- `sigil`

Private or evidentiary assets must never be projected into the public preview response.

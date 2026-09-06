# CEO Model Asset Readiness V1

Canonical CEO surface: `/internal/ceo/models`

Backend read contract: `GET /v1/admin/models/resolve-source?q=<name|working_name|model_id>`

CTA contract: `Canonical CTA Router V3`

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

## Canonical surfaces

- Asset Console / readiness / model lookup → `/internal/ceo/models`
- Studio home → `/internal/admin/studio`
- Source intake → `/internal/admin/studio/upload`
- Review + decision → `/internal/admin/studio/review`
- Final Preview before authority review → `/internal/admin/studio/model-preview`

The model work/session console (`/sigil/model/console`) is not an asset-management destination and must not appear in this workflow.

## CTA Router V3 behavior

The backend exposes the same route contract as the Webflow Canonical CTA Router V3.

Legacy normalization:

- `/ceo` → `/internal/ceo`
- `/ceo/models` → `/internal/ceo/models`
- `/studio` → `/internal/admin/studio`
- `/sigil/admin/studio/*` → `/internal/admin/studio/*`
- `/sigil/admin/models` → `/internal/ceo/models`
- `/sigil/admin/jobs/create-session` → `/internal/admin/jobs/create-session`
- `/internal/ceo/dashboard` → `/internal/ceo`

Workflow handoff:

- New source / missing canonical record → `Open Studio Upload`
- R2 or canonical record diagnosis → `Open Asset Console`
- Asset work remains → `Open Studio Review`
- Six checks pass → `Open Final Preview`
- Review `Needs Review` → `Back to Upload`
- Review `Approved for Preview` → `Open Preview`
- Review `Hold` → `Return to Asset Console`
- Preview → `Back to Review` + `Asset Console`
- Upload → `Asset Console`
- Studio → `Asset Console`

`Final Preview` is inspection only. It is not a publish authority and does not create production truth.

## Browser auth and authority

The browser calls the same-origin admin endpoint with `credentials: include`. No Admin Token, Bearer field, Confirm-Key field, API base override, or other secret input belongs on the Webflow page.

The production admin entrypoint authenticates `/v1/admin/*` before the readiness handler runs. The readiness handler is read-only; it cannot create Airtable truth, mark an R2 migration complete, approve media, or publish a profile.

Every readiness response explicitly reports:

- `cta_router_version: v3`
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

## Production route ownership

The readiness endpoint must be routed to `admin-worker` on both:

- `mmdbkk.com/v1/admin/models/resolve-source*`
- `www.mmdbkk.com/v1/admin/models/resolve-source*`

Production routing is a separate requirement from the Webflow page itself. Publishing the Webflow UI without the Worker route would leave Find Model unable to reach the backend.

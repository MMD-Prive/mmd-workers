# MMD Internal Admin Surface Canon — 2026-09-07

## Purpose

Lock the current operator-facing admin surface after the September cleanup. Webflow remains presentation/routing only; backend authorities remain unchanged.

## Operator canon

Primary operator flow:

```text
Client → Job Type → Model → Details → Review → Create Job
```

- `Job` is the operator-facing work object.
- `Session` remains a backend/system object and may continue to exist in compatibility/runtime paths.
- Canonical operator creation route: `/internal/admin/jobs/create-job`.
- Canonical owner map: `/internal/admin/control-room`.
- Canonical Kenji administration: `/internal/admin/kenji`.

## Active / canonical surfaces

- `/internal/admin/control-room`
- `/internal/admin/dashboard`
- `/internal/admin/jobs/create-job`
- `/internal/admin/payments`
- `/internal/admin/payments/historical-backfill`
- `/internal/admin/membership-access`
- `/internal/admin/member-intelligence`
- `/internal/admin/access/invite`
- `/internal/admin/owner/setup`
- `/internal/admin/studio`
- `/internal/admin/studio/upload`
- `/internal/admin/studio/review`
- `/internal/admin/studio/model-preview`
- `/internal/admin/studio/care-back`
- `/internal/admin/mms`

## Retired from publishing

These Webflow surfaces were never part of a dependable production workflow and do not need redirects:

- `/internal/admin/invoice`
- `/internal/admin/line-invoice`
- `/internal/admin/drive`
- `/internal/admin/jobs/prefill`
- `/internal/admin/studio/studio-design`

Webflow connector limitation: static-page deletion is not exposed. These pages are therefore staged as `draft`/unpublished; the Designer records can be permanently deleted manually later without a redirect.

## Keep, but do not treat as healthy/canonical

### `/internal/admin/customer-data`

Necessary future Customer 360 surface, but current Webflow actions/runtime are incomplete. Keep the route. Do not claim backfill or mutation actions are operational until backend wiring is proven. Primary current identity path remains Customer Index / LINE OA → Airtable index and Create Job lookup.

### `/internal/admin/console`

Legacy surface retained temporarily while old downstream links/config references migrate to `/internal/admin/control-room`. Do not add new dependencies to Console.

### `/internal/admin/kenji-client-intake`

Keep only as an identity reconciliation/manual fallback while LINE OA → Airtable canonical indexing is the primary path. Do not make it the first step of daily Job creation.

### `/internal/admin/sitemap`

Legacy route inventory view. Internal admin pages are intentionally excluded from the public sitemap. Do not use this page as an SEO/public sitemap authority; replace conceptually with route audit/registry when needed.

### `/internal/admin/jobs/create-session`

Compatibility/secondary route only. Do not place it in the primary operator navigation. Backend may still create/use Session records behind Create Job.

### `/internal/admin/kenji-knowledge`

Legacy route only. Canonical Kenji administration is `/internal/admin/kenji`.

## Theme canon

Internal admin presentation should use:

- compact, mobile-first operational layout
- dark neutral/black base with restrained MMD gold accents
- LINE Seed Sans TH / Noto Sans Thai / system sans stack
- readable contrast; no text sinking into backgrounds
- restrained heading scale; avoid giant editorial poster heroes for operator tools
- progressive disclosure for secondary/reference information

## Security / authority locks

- Never expose Bearer tokens, confirmation keys, or worker secrets in browser UI.
- Webflow must not mark payments paid, grant membership, grant protected entitlement, or infer VIP/SVIP/Black Card authority.
- `payments-worker` remains money truth.
- `my_mmd_entitlement_resolver_v1` remains entitlement truth.
- Telegram / Drive are observed state/evidence only.
- Alias / remembered LINE name is an identity discovery key only; it never infers rights.
- Private access must fail closed when canonical identity or entitlement evidence is unresolved.

## September 7 migration notes

- Public Access and SIGIL Booking internal admin handoff URLs migrate from `/internal/admin/console` to `/internal/admin/control-room`.
- Active Control Room presents `Create Job`, not `Create Session`, in operator UI.
- Webflow retained-but-legacy surfaces receive scoped compact/canonical presentation fixes without moving authority into Webflow.

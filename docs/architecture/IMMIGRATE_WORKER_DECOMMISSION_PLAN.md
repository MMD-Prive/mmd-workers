# immigrate-worker Decommission Plan

## Current status

`immigrate-worker` is deprecated migration-only legacy.

It must not receive new routes, renderers, or product features. It should be
drained and removed safely after every runtime route has a confirmed replacement
owner.

This document is inventory only. Do not delete `immigrate-worker`, remove
Cloudflare routes, remove service bindings, deploy, or change production
behavior as part of Phase 1.

## Inventory

### Cloudflare routes

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `immigrate-worker/wrangler.toml` | Worker name, assets binding, vars, `ADMIN_WORKER` service binding, and route table for `mmdbkk.com`, `www.mmdbkk.com`, and `sigil.mmdbkk.com`. | Yes. This is the current route owner for legacy internal, member API, SIGIL, and asset paths. | Split by route family: SIGIL/Core for system/auth/member/payment/session/model/job/internal flows; public page owner for public pages/assets; remove bridge-only routes after migration. |
| `immigrate-worker/wrangler.toml` routes `mmdbkk.com/internal/jobs*`, `www.mmdbkk.com/internal/jobs*` | Legacy internal jobs and create-link compatibility surface. | Yes for current internal job/create-link callers. | SIGIL/Core job/session owner, likely `admin-worker` or a core jobs/session facade. |
| `immigrate-worker/wrangler.toml` routes `mmdbkk.com/internal/admin/login*`, `www.mmdbkk.com/internal/admin/login*`, `mmdbkk.com/admin/login*`, `www.mmdbkk.com/admin/login*`, `mmdbkk.com/internal/admin/verify-access-code*`, `www.mmdbkk.com/internal/admin/verify-access-code*`, `mmdbkk.com/internal/admin/control-room*`, `www.mmdbkk.com/internal/admin/control-room*` | Legacy admin login, verification, and control-room aliases. | Yes while legacy admin links exist. | SIGIL/Core admin owner, likely `admin-worker` for backend truth plus canonical SIGIL/admin page owner. |
| `immigrate-worker/wrangler.toml` routes `mmdbkk.com/sigil/admin*`, `www.mmdbkk.com/sigil/admin*`, `mmdbkk.com/sigil/api*`, `www.mmdbkk.com/sigil/api*`, `mmdbkk.com/sigil/recovery-lv8*`, `www.mmdbkk.com/sigil/recovery-lv8*` | Legacy SIGIL aliases on apex and `www`. | Yes until traffic is proven rehomed. | `sigil-worker` fronting SIGIL/Core owners, then remove aliases after clean logs. |
| `immigrate-worker/wrangler.toml` route `sigil.mmdbkk.com/*` | Broad SIGIL catch-all still present in config. | Yes and high risk: it can shadow more specific SIGIL ownership if deployed as-is. | `sigil-worker` or other explicit SIGIL/Core owners; remove after verified route ownership and smoke tests. |
| `immigrate-worker/wrangler.toml` route `sigil.mmdbkk.com/a/*` | Legacy static asset bridge for `/a/*`. | Yes for current assets such as create-session scripts if referenced by admin pages. | Public/static asset owner or SIGIL/Core asset owner; remove after all script URLs are rehomed. |
| `immigrate-worker/wrangler.toml` routes `mmdbkk.com/member/api/invite*`, `www.mmdbkk.com/member/api/invite*`, `mmdbkk.com/member/api/renewal*`, `www.mmdbkk.com/member/api/renewal*`, `mmdbkk.com/member/api/points*`, `www.mmdbkk.com/member/api/points*`, `mmdbkk.com/member/api/recovery*`, `www.mmdbkk.com/member/api/recovery*`, `mmdbkk.com/member/api/jobs*`, `www.mmdbkk.com/member/api/jobs*` | Member invite, renewal, points, recovery, and job customer-confirm APIs. | Yes for member/payment/session flows. | SIGIL/Core member/payment/session owners, likely `admin-worker`, `payments-worker`, or a canonical member facade by endpoint. |
| `sigil-worker/wrangler.toml` route `sigil.mmdbkk.com/sigil/*` with `IMMIGRATE_WORKER_BASE_URL` | V1 SIGIL route owner that proxies to `immigrate-worker`. | Yes. It intentionally depends on `immigrate-worker` for preserved behavior. | Replace proxy targets with SIGIL/Core route implementations one group at a time. |
| `mmd-redirect-worker/wrangler.toml` routes on `mmdbkk.com/*`, `www.mmdbkk.com/*`, and selected member/login/trust paths | Front gate and route guard. It includes `IMMIGRATE_WORKER` service binding. | Yes for front-gated member dashboard and membership routes. | Keep `mmd-redirect-worker` as front gate only; move member page rendering/API truth to SIGIL/Core owners. |

### Service bindings

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `mmd-redirect-worker/wrangler.toml` `[[services]] binding = "IMMIGRATE_WORKER"` | Allows front gate to call `immigrate-worker` directly for locked member frontend routes. | Yes. `mmd-redirect-worker/src/index.js` calls this binding for `/member/dashboard` and `/member/membership`. | Remove after those member routes are served by canonical member/SIGIL/Core owner. |
| `immigrate-worker/wrangler.toml` `[[services]] binding = "ADMIN_WORKER"` | Lets `immigrate-worker` delegate selected admin/member promotion behavior to `admin-worker`. | Yes for current bridge flows. | Invert ownership: `admin-worker` or core owner should own the flow without routing through `immigrate-worker`. |

### Runtime fetches

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `mmd-redirect-worker/src/index.js` `MEMBER_DASHBOARD_UPSTREAM = "https://immigrate-worker.malemodel-bkk.workers.dev"` | Fallback upstream when `IMMIGRATE_WORKER` service binding is unavailable. | Yes for `/member/dashboard` and `/member/membership` fallback behavior. | Canonical member owner; remove URL fallback with the service binding. |
| `mmd-redirect-worker/src/index.js` `env.IMMIGRATE_WORKER.fetch(request)` | Runtime service-binding fetch for member dashboard and member membership. | Yes. Existing tests assert delegation and query preservation. | Canonical member owner, likely `admin-worker` member facade or future member app. |
| `sigil-worker/src/index.ts` `DEFAULT_UPSTREAM_BASE_URL = "https://immigrate-worker.malemodel-bkk.workers.dev"` and `env.IMMIGRATE_WORKER_BASE_URL` | SIGIL V1 proxy target for `/sigil/*`. | Yes. SIGIL V1 currently preserves behavior by proxying to `immigrate-worker`. | Replace with direct SIGIL/Core handlers or owner-specific upstreams. |
| `admin-worker/index.js` and `admin-worker/wrangler.toml` `IMMIGRATE_WORKER_BASE_URL` | Admin-side upstream reference to `immigrate-worker`. | Needs verification. It is runtime configuration and likely active for legacy handoff/bridge paths. | `admin-worker` or other core owner should own the required backend truth directly. |
| `chat-worker/README 2.md` documented `IMMIGRATE_WORKER_BASE_URL/internal/jobs/create-links` and `/internal/line/send-session-card` | Internal-only planned/bridge handoff from chat/Working Space into create-link and LINE card flows. | Needs verification because this is documented behavior and may correspond to uncommitted chat-worker code. | Core job/session/link owner plus LINE notification owner; do not expand `immigrate-worker`. |
| `immigrate-worker/src/routes/create-links.ts` `CREATE_LINKS_URL` and `JOBS_WORKER_BASE_URL` | Proxies or coordinates confirmation-link generation. | Yes for existing create-link bridge behavior. | Payments/job/session owner, likely `payments-worker` plus canonical job/session facade. |
| `immigrate-worker/src/public-renewal-bridge.ts` `PAYMENTS_WORKER_BASE_URL` and `ADMIN_WORKER_BASE_URL` calls | Bridges renewal, points, and VIP activation work to payments/admin owners. | Yes while public renewal APIs route through `immigrate-worker`. | `payments-worker` for money truth; `admin-worker` or member facade for member state. |

### Tests

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `mmd-redirect-worker/test/redirect.test.mjs` | Asserts `/member/dashboard` and `/member/membership` delegate to `IMMIGRATE_WORKER` or fallback URL while preserving query strings. | Test-critical and documents runtime-critical behavior. | Update only after replacement member owner exists. |
| `immigrate-worker/test/sigil-admin-login.test.mjs` | Asserts SIGIL admin login response headers include `x-mmd-worker: immigrate-worker`. | Test-critical for legacy behavior. | Replace with SIGIL/admin owner tests after route rehome. |
| `tmp/cloudflare-member-dashboard-chat-worker/internal-admin-alias.test.mjs` | Temporary bundle test expecting `https://immigrate-worker.malemodel-bkk.workers.dev/internal/admin/console?t=...`. | Unknown. It is under `tmp/`; verify whether this bundle is active before relying on it. | Canonical admin/SIGIL owner or delete with temp bundle cleanup. |

### Docs

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `immigrate-worker/README.md` | Documents current canonical, compatibility, migration, create-link, and operational behavior. | No direct runtime effect, but authoritative for current bridge contracts. | Archive after routes are rehomed; migrate live contracts into owner docs. |
| `docs/architecture/FRONT_GATE_TEMP_PAGE_MIGRATION_PLAN.md` | States `immigrate-worker` is deprecated and should not receive new member/hall/model console pages. | No. | Keep as front-gate migration companion doc. |
| `docs/architecture/SIGIL_ROUTE_MIGRATION_V1.md` | Documents V1 transfer of `sigil.mmdbkk.com/sigil/*` to `sigil-worker` while proxying to `immigrate-worker`. | No, but mirrors runtime strategy. | Supersede after proxy targets are replaced by SIGIL/Core handlers. |
| `sigil-worker/MIGRATION.md` and `sigil-worker/README.md` | Describe SIGIL proxy mode, canary headers, and rollback to `immigrate-worker`. | No. | Update when proxy mode drains. |
| `docs/architecture/DEPLOYMENT.md`, `ROUTES_AND_SURFACES.md`, `WORKERS.md`, `LAYERS.md`, `SYSTEM_OVERVIEW.md`, `INTERNAL_DOCTRINE.md`, `PRINCIPLES.md`, `GLOSSARY.md`, `ERROR_HANDLING.md`, `OPERATIONS.md`, `READ ME FIRST.md` | Architecture docs identify `immigrate-worker` as migration/bridge logic. | No. | Keep migration-only language; avoid expanding ownership. |
| `docs/architecture/MMD_R2_MODEL_ASSET_SETUP.md` | Notes `EVIDENCE_BUCKET` recovery/evidence upload binding in `immigrate-worker`. | No, but may reflect a real runtime asset/evidence dependency. | Move evidence upload ownership to SIGIL/Core model/recovery owner before removal. |
| `docs/architecture/SIGIL_RENEWAL_PRODUCTION_NOTE.md` | Notes live `/pay/renewal` depends on `https://sigil.mmdbkk.com/assets/inme/renewal-r6.js`. | No, but points to a runtime static asset dependency. | Rehome renewal asset under public/static or SIGIL/Core owner. |
| `docs/refactor/*`, `migration/README.md`, `ARCHITECTURE.md`, `README-FIRST.md`, `CODEX_PROMPT.md`, `shared/src/lib/field-mapping/README.md`, `docs/airtable/model-history-immigration-phase-1.md` | Refactor, migration, and shared-library references. | No direct runtime effect. | Keep as historical/refactor notes unless they guide active code. |
| Top-level `../docs/architecture/*` | Separate root-level architecture docs also mention `immigrate-worker` in SIGIL/payment/deployment context. | No direct runtime effect. | Align in a later docs cleanup if this worker repo remains the canonical source. |

### Scripts/deploy config

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `immigrate-worker/package.json` scripts `dev`, `deploy`, `test`, `typecheck` | Local lifecycle commands for the deprecated worker. | No runtime effect unless invoked. `deploy` must not be run during decommission Phase 1. | Archive/delete with worker after smoke-tested removal. |
| `scripts/check-path-move-status.mjs` | Refactor checker expects `immigrate-worker` to move to `migration/immigrate-worker`. | No runtime effect. | Keep until repository path migration is resolved, or remove after archive/delete. |
| `admin-worker/wrangler.toml` `IMMIGRATE_WORKER_BASE_URL` | Deploy-time config for admin references to `immigrate-worker`. | Potentially runtime-critical. | Remove after admin/core replacement is in place. |
| `sigil-worker/wrangler.toml` `IMMIGRATE_WORKER_BASE_URL` | Deploy-time config for SIGIL proxy mode. | Runtime-critical in current V1 proxy design. | Remove when SIGIL/Core owns routes directly. |
| `mmd-redirect-worker/wrangler.toml` `IMMIGRATE_WORKER` service binding | Deploy-time config for front-gate delegation. | Runtime-critical for member frontend delegation. | Remove after member routes are rehomed. |

### Static asset routes

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `immigrate-worker/wrangler.toml` `[assets] directory = "./public" binding = "ASSETS"` | Serves static assets bundled with `immigrate-worker`. | Yes for current pages/scripts depending on those assets. | Static/public owner or SIGIL/Core asset owner by route. |
| `immigrate-worker/public/a/create-session.js` and `immigrate-worker/public/a/create-session-loader.js` | Legacy `/a/*` create-session assets. `internal-routes.ts` special-cases these paths. | Yes if admin create-session pages still reference them. | SIGIL/Core admin/job owner static assets. |
| `immigrate-worker/public/assets/inme/inme-renewal.js` and `immigrate-worker/public/assets/inme/renewal-r6.js` | Renewal page/client assets. Existing production note names `renewal-r6.js`. | Yes if live `/pay/renewal` or renewal flows load them. | SIGIL/Core renewal/payment owner or public static asset owner. |
| `immigrate-worker/public/sigil/renewal.css` | Static CSS for `/sigil/renewal`. | Yes while `/sigil/renewal` is served by this worker. | SIGIL/Core renewal page owner. |
| `immigrate-worker/src/internal-routes.ts` `/a/*` handler | Runtime asset bridge and content-type wrapper. | Yes while `/a/*` assets remain here. | Remove after static assets are rehomed. |

### Unknown/needs verification

| Reference | Purpose | Runtime-critical | Proposed future owner |
| --- | --- | --- | --- |
| `tmp/cloudflare-member-dashboard-chat-worker/*` | Exported or temporary Cloudflare bundle with routes/settings that include `immigrate-worker`. | Unknown. It is under `tmp/` and should not be treated as canonical without deployment verification. | Delete/archive temp bundle or align with canonical owners. |
| Sibling worktrees/directories outside this worker repo, including `../mmd-workers-pr54`, `../mmd-workers-member-kenji-concierge`, `../mmd-workers-pay-renewal-clean`, `../mmd-workers-admin-prereq-clean`, `../mmd-workers-kenji-gate-pr`, `../mmd-workers-backup-20260331`, and `../mmd-workers-sync-artifacts` | Duplicate, backup, patch, or branch-copy references found by workspace-wide search. | Unknown. They may be local work copies, backups, or sync artifacts rather than deploy sources. | Verify active repository/source of truth before migration; do not change in this Phase 1 PR. |
| Top-level `../README-FIRST.md` | Mentions deleting `immigrate-worker`. | Unknown. It is outside this worker repo. | Align with this phased plan if top-level docs are canonical. |
| Top-level `../mmd-i18n/*` and member data references to "immigrate" | Text/content references to migration state, not necessarily worker dependency. | Unknown/no direct worker dependency found from this search alone. | Leave unless a route or runtime dependency is confirmed. |

## Route rehome map

### Move to SIGIL/Core

- Member system pages and APIs: `/member/dashboard`, `/member/membership`,
  `/member/api/invite*`, `/member/api/renewal*`, `/member/api/points*`,
  `/member/api/recovery*`, `/member/api/jobs*`.
- Model console and model session routes: `/sigil/model/console`,
  `/model/console`, `/v1/model/session/dashboard`, `/v1/model/session/status`,
  `/v1/model/session/gps`, `/v1/model/session/update`,
  `/v1/model/session/emergency`.
- Payment/session/job lifecycle: `/sigil/pay`, `/sigil/pay/session`,
  `/internal/jobs/create-links`, `/internal/jobs/create-job`,
  `/internal/jobs/create-invite-link`, `/internal/jobs/customer-confirm`,
  `/sigil/api/jobs/customer-confirm`, `/member/api/jobs/customer-confirm`.
- Admin/internal system pages: `/internal/admin/*`, `/admin/login*`,
  `/sigil/admin/*`, control-room pages, create-session, create-job, private
  model replay/check, and model promotion routes.
- Access/auth flows: `/sigil/admin/login`, `/sigil/admin/login/session`,
  `/sigil/admin/verify-access-code`, `/sigil/admin/auth/me`,
  `/sigil/member/account`, invite resolve, renewal status/intake, recovery ack,
  and recovery evidence routes.
- Model/private/public application API routes that write backend truth:
  `/sigil/api/private-model/*`, `/v1/private-model/*`,
  `/sigil/api/public-model/*`, `/v1/public-model/*`.

### Keep public outside SIGIL

- `/hall` and `/hall/`.
- `/promotion` and other public promotion/content pages.
- `/apply/public-model` if it remains a public recruitment/casting page and
  does not require authenticated SIGIL/Core ownership.
- Public landing, recruitment, casting, brand, and content pages.
- Static public assets that do not require verified backend truth.

Public pages can stay outside SIGIL when they are content/landing/recruitment
surfaces. They should move into SIGIL/Core only when they need auth, verified
member/session/payment truth, or system ownership.

### Remove after migration

- `/v1/immigrate/*` and `/v1/immigration/*` scaffolds after all migration data
  has been imported and audited.
- Legacy `/internal/*` aliases once callers use canonical SIGIL/Core routes.
- `mmdbkk.com/sigil/*` and `www.mmdbkk.com/sigil/*` aliases after clean logs.
- `sigil.mmdbkk.com/*` catch-all after specific owners cover all live paths.
- `sigil.mmdbkk.com/a/*` and `/a/*` asset bridge after assets are rehomed.
- `IMMIGRATE_WORKER` service binding and fallback URL in `mmd-redirect-worker`
  after member routes are owned elsewhere.
- `IMMIGRATE_WORKER_BASE_URL` proxy configuration in `sigil-worker`,
  `admin-worker`, and any chat/Working Space handoff after replacement owners
  exist.

## Decommission phases

### Phase 1: Freeze and inventory

- Mark `immigrate-worker` as deprecated migration-only legacy.
- Inventory routes, service bindings, runtime fetches, tests, docs, scripts, and
  static asset routes.
- Do not change production behavior.
- Do not add new routes, renderers, or product features.

### Phase 2: Rehome runtime routes one group at a time

- Move member system routes to canonical member/SIGIL/Core owners.
- Move model console/session routes to SIGIL/model owner.
- Move payment/session/job lifecycle routes to payments/job/session owners.
- Move admin/internal routes to admin/SIGIL/Core owners.
- Move public pages/assets to confirmed public/static owners.

### Phase 3: Remove `IMMIGRATE_WORKER` fetch usage from `mmd-redirect-worker`

- Replace `/member/dashboard` and `/member/membership` delegation only after
  replacement owners are live and smoke-tested.
- Preserve canonical `t` query behavior.

### Phase 4: Remove service binding from `mmd-redirect-worker/wrangler.toml`

- Remove `IMMIGRATE_WORKER` service binding only after no code path fetches it.
- Run redirect/front-gate tests after the code/config cleanup PR.

### Phase 5: Remove Cloudflare route config for `immigrate-worker`

- Remove route groups after logs show no dependency and replacement owners are
  deployed.
- Remove broad catch-all routes last, after specific routes are proven.

### Phase 6: Archive/delete `immigrate-worker` code after production smoke tests pass

- Keep rollback branch or tag until decommission is complete.
- Delete/archive code only after production smoke tests pass for replacement
  owners and logs show no production traffic dependency.

## Hard rules

- Do not add new routes to `immigrate-worker`.
- Do not add new renderers to `immigrate-worker`.
- Do not use `immigrate-worker` as fallback for new pages.
- Preserve canonical `t`; never introduce `token`.
- Do not move public pages into SIGIL unless they need auth/system ownership.
- Do not move system pages to Webflow if they need verified backend truth.

## First implementation candidates

Recommended first small implementation PR after this docs PR:

1. Finish known `/member/*` canonical ownership.
2. Move `/model/console` toward SIGIL/model owner.
3. Decide public owner for `/hall`, `/promotion`, and `/apply/public-model`.
4. Remove remaining `IMMIGRATE_WORKER` usage only after replacement owners exist.

The safest first implementation candidate is a narrow `/member/dashboard` and
`/member/membership` ownership PR: point the front-gate member delegation at the
canonical member owner, preserve `?t=`, and update only the corresponding
front-gate tests. Do not remove `IMMIGRATE_WORKER` binding until every member
path has a replacement and the fallback URL is no longer used.

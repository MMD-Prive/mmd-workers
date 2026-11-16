# MY CO MODEL isolated staging adapter — review only

Source is pinned to #3218 `9048f588395a21d6fb1c3a059222174757d0f806`.
No push/deploy/merge/routes/secrets changes are included in this preparation.

## Isolation and scope
Two proposed Workers reuse the original Owner Console/login, MY PARTNER dashboard, token verifier, evidence reader and service-scope checks. Build-only origin substitutions permit only the proposed staging hostnames. Original production source files remain unchanged. Internal service hostnames are retained. Source-tree changes from the pinned SHA fail build; adapter changes get a separate SHA-256 manifest.

Partner ADMIN_CO_MODEL -> mmd-co-model-admin-staging.
Admin PARTNERS_WORKER -> mmd-co-model-partner-staging.
Both configs have routes=[], workers_dev=false and preview_urls=false.
No Partner media bucket binding; no production service targets.

**Plan refinement:** this review uses immutable in-bundle fixture data implementing the R2 read contract, not a created R2 bucket. The Admin adapter owns the read-only fixture storage. This prevents fixture writes/cleanup and avoids external account dependencies, but does NOT prove a real R2 binding. A real staging R2 integration needs separate preparation and acceptance if required. No Airtable credentials/data are used; all injected network reads terminate at the fixture transport. Unknown hosts, tables, writes and external sends are rejected. No mutation or cleanup methods exist on storage.

Only Owner login/logout may use non-GET methods, solely to manage browser cookies. Login accepts only owner_login, enforces same-origin, and reuses existing credential/session logic. All business write routes are rejected. Env is allowlisted, not spread from deployment bindings. Staging-only Owner credential/session secrets are required independently on each Worker. Partner additionally requires a staging-only TOKEN_SECRET (>=32 chars). None are created here; no production secrets may be copied. Fixture Partner credentials expire at the next UTC day and are never written to logs.

## Entry points (proposed, NOT deployed)
- Admin hostname: mmd-co-model-admin-staging.malemodel-bkk.workers.dev
- Partner hostname: mmd-co-model-partner-staging.malemodel-bkk.workers.dev
- Each hostname: /internal/admin/login (Owner fixture-launch gate)
- Admin after login: /qa/owner -> original /internal/admin/console?view=edit-job&tool_view=co-model&session_id=sess_fixture_A (or B).
- Partner after Owner login: /qa/partners -> fixture A or B -> original /partner/dashboard. This staging-only launcher does not replace production Partner onboarding or LINE login.
- Partner A owns only A; Partner B owns only B. Each has 2 saved model submissions, 3 image occurrences/2 hashes, 1 customer submission visible only to Owner metadata, expired reservation and old-binding entry. LINE receipt states are transport acceptance/pending. Calls/handoff remain unknown. No raw photo viewing or raw chat included.

## Local validation
From repository root, with esbuild available:
- node co-model-staging/build.mjs
- node --test co-model-staging/bundle.test.mjs
- node co-model-staging/preflight.mjs

Tests import generated bundles, use actual Owner login and Partner token verification, and connect simulated service bindings. No browser-hosted or Cloudflare-hosted E2E is claimed. Build emits duplicate-key warnings from unchanged recovery-control.js, outside the allowed adapter paths; these were not modified.

## Before any release
Review adapter diff, source pin and bundle hashes. Verify Cloudflare account, Worker name availability, Access restricted to Per, staging-only secrets and same-environment service targets. Record existing deployments/versions if any; stop on baseline changes. Cross-bindings require both Workers to exist; new-service bootstrap must be separately approved before binding/activation. Keep workers.dev disabled until Access is verified. This local preflight cannot approve release.

After separately approved release, record Version ID/deployment/source/adapter hashes. Hosted tests must verify Owner/Partner, A-to-B denial, invalid credentials, mutation denial, Back/reload, no outbound sends and unchanged fixture evidence. If a prior baseline exists, rollback Partner then Admin; if new Workers have no baseline, disable access instead of inventing a rollback version. No DNS/routes changes.

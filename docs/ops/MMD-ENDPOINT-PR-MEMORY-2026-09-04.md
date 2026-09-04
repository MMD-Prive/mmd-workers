# MMD Endpoint + PR Memory — 2026-09-04

Status: ACTIVE / CURRENT-MAIN AUDIT
Audit refreshed: 2026-09-04 13:40 +07
Audit baseline: `main` @ `d0835bb002168534fb3f99dbcca6ad1b79ab570f`
Owner rule: **defined in source != merged != deployed != live-smoked**. Record each separately.

## 1. Canonical authority locks

- `my_mmd_entitlement_resolver_v1` remains the source of truth for current Member access.
- Telegram / Google Drive are downstream observed state only and never create, infer, widen, or promote entitlement.
- Grace does not create a new grant. blocked / suspended / revoked fail closed.
- VIP / SVIP / Black Card additions remain explicit curated approval/review.
- Presentation, Webflow and i18n copy never authorize entitlement, payment, coupon percentage, model exposure, Therapist access, or admin access.
- Public / flash model exposure remains separately gated.
- A route existing in source is not evidence that a customer can reach it in production.

## 2. My MMD / LIFF endpoint inventory on current main

Owner: `member-pages-worker/src/liff-identity-foundation.js`

Defined on current main:
- `POST /member/api/liff/start`
- `POST /member/api/liff/intent`
- `/member/api/liff/audience`
- `/member/api/liff/package`
- `/member/api/liff/payment-intent`
- `GET /member/api/liff/status`
- `/member/api/liff/profile`
- `/member/api/liff/membership-route`
- `GET /api/member/dashboard`
- `GET /member/api/mms/catalog` plus LIFF alias
- `POST /member/api/mms/match` plus LIFF alias
- `POST /member/api/mms/prebookings` plus LIFF alias
- `/member/api/liff/care-back/claim`
- `/member/api/liff/care-back/state`
- `/member/api/liff/care-back/wallet`
- `/member/api/liff/care-back/wish`
- `POST /member/api/liff/hall-token`

Closed legacy:
- `/member/api/liff/identify` is legacy-disabled (`410`) and must not be restored as identity authority.
- `/api/care-back-wish` is a closed legacy CARE BACK Wish path (`404`).

Merged/deployment history:
- PR #580 — My MMD live provider API — MERGED (`bb66b6a74247de7836a736d3ed30e418fde9b7f5`).
- member-pages-worker production deploy is recorded on main (`5e0bdf5f169c72b64637c7517a03c059feea11f7`).
- PR #582 — same-origin My MMD presentation proxy — MERGED (`1bab2d4960bc5a561d04bf6d74fbb380118ec8c8`).
- PR #436 — Telegram member-surface join cleanup — MERGED; current main head is `d0835bb002168534fb3f99dbcca6ad1b79ab570f`.

Evidence boundary:
- Route source exists and a member-pages deployment is recorded.
- A fresh browser / real-LINE trace proving the current `POST /member/api/liff/start` request reaches `member-pages-worker` was **not re-proven in this audit**.
- Preserve the historical LIFF E2E caution until a fresh production trace exists. Do not regress the newer same-origin My MMD architecture back to the older LIFF-only model.

## 3. My MMD presentation API on current main

Owner: `member-pages-worker/src/member-app-api.js`
Prefix: `/api/member/app/`
Method: GET only.

Declared routes:
- `/api/member/app/dashboard`
- `/api/member/app/profile`
- `/api/member/app/membership`
- `/api/member/app/points`
- `/api/member/app/coupons`
- `/api/member/app/history`
- `/api/member/app/care`

Provider mapping:
- dashboard / membership / points / history read from canonical `/api/member/dashboard`.
- profile reads from `/member/api/liff/profile`.
- coupons reads from `/member/api/liff/care-back/wallet`.
- care reads from `/member/api/liff/care-back/state`.

Contract lock:
- Browser presentation is bounded/sanitized.
- My MMD does not infer entitlement from tier/lifecycle. Current browser access remains `checking` unless backend authority provides a safe authorization snapshot.
- CARE BACK presentation accepts only explicit backend `approved_discount_percent`; legacy `discount_percent` / `benefit_value` must not authorize customer-visible rate.

## 4. CARE BACK V2.2 convergence

Issue #583 remains the production acceptance issue and stays OPEN.

Current `main` at this audit still contains the legacy fixed coupon implementation; therefore current production backend must not be described as V2.2 complete.

PR #584 — `fix(care-back): make coupon V2.2 backend authoritative` — OPEN / mergeable at audit time.
Current head: `9b595d9b5255c5103516c173e5755f0a86684660`.
Current changed files:
- `member-pages-worker/src/care-back-claim-store.js`
- `member-pages-worker/src/member-app-api.js`
- `member-pages-worker/test/care-back-claim-store.test.mjs`

PR #584 current direction:
- replaces 30-day validity with 2 calendar months from activation;
- turns 10% into a maximum ceiling rather than an automatic coupon value;
- introduces backend-owned `approved_discount_percent`;
- resolves rate from verified Model level x PN/VIP job format x customer eligibility;
- Standard Models: PN 5%, VIP 7%;
- Premium / EMs / GWs: PN 5%, VIP 10%;
- Public Models fail closed until a trusted backend owner supplies an exact rate inside the approved 3–5% band;
- stores / returns backend `activated_at` and `expires_at`;
- clears legacy fixed `benefit_value` when authoritative approval is written;
- bridges validated wallet rate into My MMD readback while legacy compatibility `discount_percent` remains non-authoritative.

Critical remaining gap:
- PR #584 now includes the store-level `approveCouponDiscount()` authority and My MMD readback, but this audit still finds no new bounded customer/ops invocation endpoint in the PR that supplies authoritative Model level, PN/VIP job format, and eligibility context to that approval method.
- Therefore #584 implementation presence alone still cannot close #583.

CI state at refresh:
- Node.js CI run `33845856462` for head `9b595d9b5255c5103516c173e5755f0a86684660` is **IN PROGRESS**.
- Do not merge/deploy from this snapshot until the full CI matrix is green and the invocation contract is explicitly resolved/reviewed.

Issue #583 final acceptance remains:
1. authoritative approval invocation path,
2. backend-returned `approved_discount_percent`,
3. wallet readback of the actual approved percentage,
4. backend-authoritative `activated_at` / `expires_at` = 2 calendar months from activation,
5. one fresh real LINE -> LIFF session -> My MMD -> claim -> Wish -> approval -> wallet production evidence trail,
6. synthetic/staging-only evidence is not PASS.

## 5. Admin Kenji endpoint lock

Owner: `admin-worker/src/kenji-model-admin-adapter.js`
Canonical routes on current main:
- `/v1/admin/kenji/models`
- `/v1/admin/kenji/models/draft`
- admin-only primary-media preview via `preview_model_id` query parameter on the models route.

Cloudflare ingress may keep query-safe wildcard route companions; runtime dispatch remains pathname-exact and admin-session-gated.

Workflow remains:
**Review -> QA -> Publish -> Audit Log**

MMD Model access authority remains separate from Client Level labels and separate from UI presentation.

## 6. MMS Therapist login / dedicated LIFF auth

PR #581 — `feat(mms): add dedicated Therapist LIFF auth + one-time invites` — OPEN / DRAFT / NOT PRODUCTION.
Current head: `ba8a27cb02272b61afb07d52f89678707e23aa0d`.

Dedicated MMS Therapist LINE identity in the PR:
- Published Channel ID `2011425652`
- LIFF ID `2011425652-YqK1F6y8`
- LIFF URL `https://miniapp.line.me/2011425652-YqK1F6y8`

This is intentionally separate from MY MMS and the Male Massage Messaging API channel.

Canonical Therapist auth routes implemented in the PR branch:
- `POST /male-massage/therapists/api/auth/line`
- `GET /male-massage/therapists/api/auth/me`
- `POST /male-massage/therapists/api/auth/logout`
- post-login destination `/male-massage/therapists/me`

Auth contract now exists in branch:
- LINE ID token server verification against the dedicated Therapist audience;
- explicit one-time invite for first link;
- HMAC privacy-safe LINE subject hash; no raw LINE `sub` persistence;
- 8-hour role-scoped `mms_therapist` secure session;
- Admin one-time invite issuer through the existing authenticated Therapist PATCH bridge.

Remaining activation gates:
- `MMS_THERAPIST_AUTH_ENABLED=false` remains committed.
- LINE Mini App Published Endpoint must point to `https://www.mmdbkk.com/male-massage/therapists/login`.
- same-origin `/male-massage/therapists/api/auth/*` routing must reach `mms-worker` through the canonical front gate/service binding.
- deploy must complete and persistent session/identity secrets must exist.
- then enable auth and perform the real Boss first-link smoke.
- Webflow login remains fail-closed until those gates are cleared.

CI state:
- Node.js CI run `33843363904` for current #581 head is **FAILED**.
- Prior audit identified 676 pass / 2 fail in `test/admin-mms-runtime-contract.test.mjs` and `test/repo-public-lock-audit-contract.test.mjs`.
- Do not merge, deploy, publish the login as functional, or enable auth while CI/gates remain unresolved.

## 7. MMS HENNA LINE webhook

PR #461 — OPEN / GATED / NOT PRODUCTION-ACTIVE.
Proposed endpoint: `POST /mms/webhooks/line`.

Committed safety direction:
- LINE signature verification required;
- stable intents only for automatic replies;
- price / live availability / human requests / unknown questions remain manual;
- Telegram operations handoff is metadata-minimized;
- `LINE_AUTO_REPLY_ENABLED=false` remains the safe default.

Production proof required before activation:
1. LINE Developers webhook points to the intended endpoint,
2. Verify succeeds,
3. signed production event is observed,
4. stable-intent smoke passes,
5. manual-handoff smoke reaches MMS Telegram operations.

## 8. Open PR triage snapshot

### Current high-priority / active review
- #584 CARE BACK V2.2 — active blocker; CI in progress; approval invocation + real E2E still required.
- #581 MMS Therapist dedicated LIFF auth — contract exists in branch, but CI red and activation routing/deploy/LINE endpoint gates remain.
- #574 Kenji Client Level vs Current Access — semantic/access review required; `my_mmd_entitlement_resolver_v1` lock must remain unchanged.
- #543 Create Session manual client card live lookup — currently non-mergeable; rebase/semantic review before production action.
- #577 MMD favicon — cosmetic and mergeable, but still normal CI/current-main review before merge.
- #388 nationwide MMS therapist applications / Telegram alerts — currently non-mergeable; compare against current main before deciding supersedence/rebase.

### Explicit source-only / gated / no-production families
Do not auto-merge merely because code exists:
- #536 slip extractor staging smoke — explicitly not intended to merge the temporary ops workflow.
- #461 HENNA LINE webhook.
- #399 LINE model keyword routing — draft, feature flag remains disabled.
- #398 admin resolver diagnostic trigger — draft/source-only.
- #397 member-pages resolver diagnostic RPC — draft/source-only.
- #396 auth resolver diagnostic observability — draft/source-only.
- #380 member-profile runtime trigger foundation — draft/no binding/deploy.
- #376 member-profile materialization/dashboard truth — draft/no production trigger.
- #372 Public Companion package readiness — readiness only.

### Historical / supersedence review before action
- #355 member expiry/payment contract.
- #373 LIFF semantic reconciliation.
- #374 historical spend/cancelled jobs reconciliation.
- #375 auth resolver failure diagnostics.
- #352 old Option-B dedicated Member Dashboard Mini App branch.
- #335 old LIFF baseline test repair.
- #331 Netlify LINE webhook decommission branch.
- #285 early same-site LIFF shell branch.
- #270 old member dashboard LIFF status bridge branch.

Do not close historical PRs from age alone. Compare against current main and preserve any still-required contract/evidence before closing as superseded.

## 9. i18n / Webflow reference

Canonical i18n rollout lives in `MMD-Prive/mmd-i18n`:
- #12 merged — TH/EN/ZH runtime.
- #13 merged — legacy auto-bind limited to completed routes.
- #14 merged — canonical `/member/requests` Thai copy on current runtime.

Webflow presentation changes do not prove Worker endpoint health and do not authorize backend state.

## 10. Production sequence from this audit

### CARE BACK
1. Let #584 CI complete; require full green matrix.
2. Define/review the bounded authoritative invocation path into `approveCouponDiscount()`.
3. Merge/deploy only after that contract is explicit and safe.
4. Run one fresh real-production LINE -> LIFF -> My MMD -> CARE claim -> Wish -> approval -> wallet trace.
5. Verify exact backend `approved_discount_percent`, `activated_at`, `expires_at` and fail-closed states.
6. Close #583 only after that real chain passes.

### MMS Therapist Login
1. Fix #581 CI.
2. Complete same-origin auth route ownership/front-gate wiring.
3. Set the LINE Mini App Published Endpoint to the real MMD login page.
4. Deploy with persistent auth secrets provisioned.
5. Enable Therapist auth only after deployment readiness.
6. Issue Boss a one-time invite and perform the real first-link smoke.

## 11. Memory status

This document is the MMD Memory operational snapshot for endpoint/PR status as audited on 2026-09-04 13:40 +07.
A newer verified snapshot supersedes it.

Hard rule: **source presence, merged UI, CI, synthetic staging, or documentation alone never equals production proof.**

# MMD Endpoint + PR Memory — 2026-09-04

Status: ACTIVE / CURRENT-MAIN AUDIT
Audit baseline: `main` @ `d0835bb002168534fb3f99dbcca6ad1b79ab570f`
Owner rule: **defined in source != deployed != live-smoked**. Record each separately.

## 1. Canonical authority locks

- `my_mmd_entitlement_resolver_v1` remains the source of truth for current Member access.
- Telegram / Google Drive are downstream observed state only and never create, infer, widen, or promote entitlement.
- Grace does not create a new grant. blocked / suspended / revoked fail closed.
- VIP / SVIP / Black Card additions remain explicit curated approval/review.
- Presentation, Webflow and i18n copy never authorize entitlement, payment, coupon percentage, model exposure, or admin access.
- Public / flash model exposure remains separately gated.

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
- `/api/member/dashboard`
- `/member/api/mms/catalog` and LIFF alias
- `/member/api/mms/match` and LIFF alias
- `/member/api/mms/prebookings` and LIFF alias
- `/member/api/liff/care-back/claim`
- `/member/api/liff/care-back/state`
- `/member/api/liff/care-back/wallet`
- `/member/api/liff/care-back/wish`
- `POST /member/api/liff/hall-token`

Closed legacy:
- `/member/api/liff/identify` is legacy-disabled and must not be restored as identity authority.
- `/api/care-back-wish` is a closed legacy CARE BACK Wish path.

Deployment state:
- PR #580 — My MMD live provider API — MERGED (`bb66b6a74247de7836a736d3ed30e418fde9b7f5`).
- member-pages-worker production deploy is recorded on main (`5e0bdf5f169c72b64637c7517a03c059feea11f7`).
- PR #582 — same-origin My MMD presentation proxy — MERGED (`1bab2d4960bc5a561d04bf6d74fbb380118ec8c8`).

Evidence boundary:
- Route source exists and deployment is recorded.
- A fresh browser/real-LINE trace proving `POST /member/api/liff/start` reaches `member-pages-worker` was **not re-proven in this audit**. Keep the historical LIFF E2E caution until fresh production trace evidence exists.

## 3. My MMD presentation API on current main

Owner: `member-pages-worker/src/member-app-api.js`
Prefix: `/api/member/app/`
GET-only routes currently declared:
- `/api/member/app/dashboard`
- `/api/member/app/profile`
- `/api/member/app/membership`
- `/api/member/app/points`
- `/api/member/app/coupons`
- `/api/member/app/history`
- `/api/member/app/care`

Contract lock:
- Browser presentation is bounded/sanitized.
- My MMD must not infer entitlement from tier/lifecycle; access stays neutral/checking unless backend authority provides it.

## 4. CARE BACK V2.2 convergence

Issue #583 remains the production acceptance issue.

Current `main` at this audit still contains legacy store constants:
- `COUPON_VALIDITY_DAYS = 30`
- `COUPON_DISCOUNT_PERCENT = 10`

PR #584 — `Fix/care back coupon v2 2` — OPEN at audit time.
Head: `4a5db0161e0a895f39866038c36dd35fe9b49dfa`
Changed files only:
- `member-pages-worker/src/care-back-claim-store.js`
- `member-pages-worker/test/care-back-claim-store.test.mjs`

PR #584 direction is aligned at store level:
- 2 calendar months from activation
- 10% becomes a maximum, not an automatic value
- introduces `approved_discount_percent`
- adds Model level x PN/VIP rate resolution
- wallet refuses legacy fixed-rate evidence without model/job approval context

PR #584 is **not yet sufficient to close #583** because the new `approveCouponDiscount()` authority is not wired by this PR to a bounded production endpoint/consumer carrying authoritative Model level, PN/VIP job format, and customer eligibility context.

Acceptance still requires:
1. authoritative invocation path,
2. backend-returned `approved_discount_percent`,
3. coupon wallet readback of the actual approved percentage,
4. real LINE -> My MMD -> approval -> wallet production proof,
5. synthetic/staging-only evidence is not PASS.

## 5. Admin Kenji endpoint lock

Owner: `admin-worker/src/kenji-model-admin-adapter.js`
Canonical routes on current main:
- `/v1/admin/kenji/models`
- `/v1/admin/kenji/models/draft`
- admin-only primary-media preview via `preview_model_id` query parameter on the models route

Cloudflare ingress keeps query-safe wildcard route companions; runtime dispatch remains pathname-exact and admin-session-gated.

Workflow remains:
**Review -> QA -> Publish -> Audit Log**

## 6. MMS Therapist login

PR #581 — `feat(mms): add fail-closed therapist login visual` — OPEN / NOT PRODUCTION.
Intended route: `/male-massage/therapists/login`
Post-login target: `/male-massage/therapists/me`

Hard lock:
- Therapist identity/session is separate from customer/member LIFF auth.
- Feature is fail-closed until a dedicated Therapist LINE identity/session contract and reviewed auth URL exist.
- CI run `33843363904` is red at this audit: 676 pass / 2 fail.
- failing suites: `test/admin-mms-runtime-contract.test.mjs`, `test/repo-public-lock-audit-contract.test.mjs`.
- No Webflow production publish or Worker deploy from #581 while CI/gate remains unresolved.

## 7. MMS HENNA LINE webhook

PR #461 — OPEN / GATED / NOT PRODUCTION-ACTIVE from this audit.
Proposed endpoint: `POST /mms/webhooks/line`.
Committed safety direction in PR:
- LINE signature verification required,
- stable intents only for automatic replies,
- price/live availability/human/unknown remain manual,
- Telegram operations handoff is metadata-minimized,
- `LINE_AUTO_REPLY_ENABLED=false` remains the safe default.

Required production proof remains explicit before activation: webhook verify, signed production event, stable-intent smoke, and manual-handoff smoke.

## 8. Telegram member-surface cleanup

PR #436 is now merged on current main.
Current main head at audit: `d0835bb002168534fb3f99dbcca6ad1b79ab570f` — hides Telegram join service messages on the locked member surfaces.

## 9. Open PR triage snapshot

### Active blocker / implementation review
- #584 CARE BACK V2.2 store convergence — promising but endpoint wiring + E2E still required.
- #581 MMS Therapist Login — fail-closed, CI red, dedicated auth contract pending.
- #574 Kenji Client Level vs Current Access — semantic/access review required; entitlement resolver lock must remain unchanged.
- #543 Create Session manual client card live lookup — production behavior review required.
- #577 MMD favicon — cosmetic, but still use normal CI/review gate.
- #388 nationwide MMS therapist applications / Telegram alerts — review against current main before deciding supersedence/merge.

### Explicit source-only / gated / no-production families
Do not auto-merge merely because code exists:
- #536 slip extractor staging smoke
- #461 HENNA LINE webhook
- #399 LINE model keyword routing
- #398 admin resolver diagnostic trigger
- #397 member-pages resolver diagnostic RPC
- #396 auth resolver diagnostic observability
- #380 member-profile runtime trigger foundation
- #376 member-profile materialization/dashboard truth
- #372 Public Companion package readiness

### Historical / supersedence review before action
- #355 member expiry/payment contract
- #373 LIFF semantic reconciliation
- #374 historical spend/cancelled jobs reconciliation
- #375 auth resolver failure diagnostics

Do not close historical PRs from age alone; compare against current main and preserve any still-required contract/evidence.

## 10. i18n / Webflow reference

Canonical i18n rollout lives in `MMD-Prive/mmd-i18n`:
- #12 merged — TH/EN/ZH runtime
- #13 merged — legacy auto-bind limited to completed routes
- #14 merged — canonical `/member/requests` Thai copy on current runtime

Webflow presentation changes do not prove Worker endpoint health and do not authorize backend state.

## 11. Next production sequence

1. Finish PR #584 with a bounded authoritative discount-approval invocation path.
2. Require all CI matrix jobs green.
3. Merge/deploy backend only after the endpoint contract is explicit.
4. Run real production LINE -> My MMD -> approved percentage -> coupon wallet proof.
5. Close #583 only after the real chain passes.
6. Separately resolve #581 CI + Therapist auth contract before any Therapist Login production activation.

This document is the MMD Memory operational snapshot for endpoint/PR status as audited on 2026-09-04. A newer verified snapshot supersedes it; source presence alone never supersedes production evidence.

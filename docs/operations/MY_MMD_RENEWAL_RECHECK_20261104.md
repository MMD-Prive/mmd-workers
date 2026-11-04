# MY MMD Renewal recheck — 4 November 2026

Release candidate only. No production changes or test transactions in this task.

## Current evidence

Source baseline: `8acbcc59a657aa9966e5799d79b59f364ab20d8a`.
No AGENTS.md exists in the checked-out repository or its workspace parents.
PRs 2733, 2735, 2755, 2787 and later 2816 were read again; all are merged.
PR 2816 contains the later approved 90-day policy and release receipt. Merge/old receipts were not used as current deployment proof.

Fresh Cloudflare reads:

| Worker | Active version | Deployment |
| --- | --- | --- |
| member-pages-worker | 910cc708-f246-42a9-9b5f-4d470b34b732 | 53ebec9a-b988-4d39-bd55-099f34df4506 |
| payments-worker | f05c4a1c-e4e4-4a91-8160-5ee3743cb7b9 | d06216d5-b324-426e-a3f2-f4e044c9dd28 |

Renewal flag is already `true`; Promotion purchase is `false`. PAYMENTS_WORKER binds payments-worker production.
Fresh public GET/HEAD: `/sigil/pay/renewal` returns 307 to the fixed Mini App intent=renew/view=package/world=private; unauthenticated offer returns 401 LINE_SESSION_REQUIRED, not disabled 404.
Live modules were read: signed checkout settlement requires canonical paid+verified payment and verified proof; evidence upload alone cannot grant membership. These reads prove deployed code presence, not a real settled payment.

## Policy and changes

Authoritative fixed prices remain Standard 1000 / Premium 2500. Both renewal base terms are one year, independently of signup catalog terms (Standard 1199/one year; Premium 2999/two years). Active same-tier and expired up to 90 days retain the current fixed-price gate; older expiries remain review because a bonus policy does not authorize a new price. Unknown service history is not interpreted as zero or a new customer.

The current source/production November bonus was six calendar months. The owner explicitly selected the current task's tier-specific bonus in the clarification: Premium +one year / Standard +180 days for new payments, preserving historical outcomes.
The release candidate sets an explicit paid-time boundary of **4 Nov 2026 16:00 Asia/Bangkok**. Payments before that boundary retain their old bonus even if verification/retry happens later. Existing materialized entitlements are reused unchanged. From that boundary, only renewal bonuses change; returning-signup policy and fresh signup terms remain unchanged. This boundary is candidate configuration, not evidence that a deployment happened at that time.

The Kenji personal benefit projection now applies its over-90-day review guard to every bonus unit; it previously applied only to six-month benefits. CI exposed this downstream mismatch and it is covered by a new tier-specific projection regression.

The canonical offer resolver now also rejects blocked/suspended/revoked/pending-review/under-review memberships itself; previously only its outer guard rejected them. No review guard is removed.
The stale November six-month advertising block is suppressed from the reconfirmation boundary. Personal base/bonus/expiry remain server supplied. Existing Thai text is reused; no new user-facing translation string or LINE message is introduced, so mmd-i18n has no changed copy to sync.

## Validation

- Local scope expansion after initial CI: immutable November artifact fixtures now explicitly assert historical behavior and the intentional new paid-time divergence; no historical release manifest was changed.
- Expanded Member Pages aggregate: 720 pass. Related artifact/approval contracts: 217 pass (overlap exists; do not sum suite counts). Historical October projections and immutable November release manifests retain their original behavior.
- Baseline focused suite: 242 pass.
- Candidate focused financial/policy/UI contracts and artifact tests: 249 pass, zero failures/skips.
- Chromium synthetic mobile checks: 8/8 (Standard/Premium at 320/360/390/430px), no horizontal overflow, enabled eligible CTA and normal-flow checkout. See mobile-fixture-results.json and synthetic screenshots. Reproduce with scripts/renewal-recheck-browser.mjs, Playwright and RENEWAL_BROWSER_EXECUTABLE.
- Real workerd shell/runtime tests with synthetic LINE identity and mocked payment binding: 31 pass. No real outbound payment or customer data is used.
- Wrangler configuration/types and Member Pages bundle check pass, with two pre-existing duplicate-key warnings in member-app-client-credits.js outside this patch.
- Explicit tests cover blocked guard/resolver parity, new paid-time boundary, preserved November/October outcomes, late December cutoff, concurrent duplicate payments, pending verification, price tampering, session expiry, and recovery after entitlement creation but failed renewal receipt write.
- Exact deployed policy fragments are executed in a VM and compared with the new source for new payments; historical paid-time results must match their original artifact result. Candidate reversal restores the whole active module byte-for-byte in the read-only preparation step.

## Release artifact and procedure

`release/renewal-recheck-20261104/artifact-delta.json` pins the two active module SHA-256 values, candidate values and all before/after edit hashes. `scripts/renewal-recheck-artifact.mjs` builds offline only and rejects drift, nonunique anchors and any unexpected result.

Do not full-rebuild/deploy main over these Workers: deployed November overlays differ from source. The reviewed release changes four exact Member Pages spans (policy, resolver status check, stale banner, bonus-independent 90-day personal projection guard) and one Payments policy span, preserving all other artifact bytes. No route, binding, credential, feature-flag or data change is required.

Before any approved production upload: re-read active versions/deployments, download the complete module inventory, check exact baseline hashes, build candidates, run syntax/runtime validation and the focused suites, inherit all existing configuration, compare all configuration/bindings/routes/schedules before promotion, and reject any drift. Promote Payments first, then Member Pages; read active code hashes/configuration back. Renewal=true/Promotion=false must be preserved. No Double Moment activation.

## Rollback

For an incident, disable Renewal only under production authorization. Restore the two baseline versions above while preserving other configuration and checking in-flight payments. Never delete or rewrite legitimate payment, Points or entitlement records. A release after other deployments must rebase and reapprove its exact artifact delta rather than restoring an outdated unrelated version.

## Acceptance still blocked

No designated authenticated synthetic LINE account/device is available. No live financial verification, provider callback, real QR image retrieval for a signed transaction, live entitlement write, or readback of a newly settled membership was authorized/performed. iOS/Android LINE acceptance remains untested. Public smoke, VM and workerd fixtures do not establish those outcomes.
Production release approval for this new policy/artifact has not been given. Historic approval for PR 2816 is not approval for this new candidate. No new deployment or flag change is claimed.

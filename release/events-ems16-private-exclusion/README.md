# EMs16 private-work automation exclusion: source preparation only

## Exact business scope

Owner request: `Sentinel_b9fe4d65554c8191ad31213dfaf21948`, 2026-11-12 20:59:55 ICT. Canonical model: `recbdC0waCS3qp452` / EMs16. Suppress future automatic compcard selection and pending private compcard sends only, until explicitly reenabled. Do not deactivate the catalog, delete posts, rewrite history, or restrict public work or other identities. This is not a general booking/catalog ban.

The commercial mapping is documented in Airtable Models `sales_layer` (field `fldOrRNL8PocDILk5`, table `tblI4B0bI446vp9GX`, base `appsV1ILPRfIjkaYg`): public means the MMD Prive public layer; private means the SIGIL private layer; both supports both. `can_work_private` (`fldy04CUiTUehyAVm`) describes SIGIL work permission, but the currently deployed compcard reader does not read it. Changing that boolean alone would not enforce this request.

`currentCategory` in `events-worker/src/compcard-policy.js` is the automation's actual mapping: private/both plus private tier yields exclusive/premium/standard; public plus MMD Public Category yields travel/extreme. Tests exercise these mappings. Private visibility and a Premium/Preview destination do not themselves determine private work. Public work with private visibility remains governed by its original eligibility checks. A frozen private plan cannot become a public plan simply because the current record changes category.

## Separate normal-source and exact-live changes

Authoritative source base: `0d22783f846febffcc2ba55576e184b7e4c4ff8d`. Normal source adds a canonical/card-category predicate at eligibility, selection, and pending preparation. Existing independent model exclusions, room routing and history-review policy are unchanged. A full-main deployment is not this release candidate.

The offline overlay has exactly two replacements in the deployed compcard-daily section: fresh eligibility and pending preparation before asset reads. It covers model and standard slots, every permitted destination, and static/approved-intake cards. No expiry is installed in the policy. Invalid or changed frozen plans retain existing validation failures. Promotion logic, flags, bindings, routes, cron and all unrelated runtime bytes are unchanged.

Pinned current deployment: `d9617e88-3f2f-4698-a3e5-3853fd197e06`, version `88e741df-15bd-40ba-a4ce-f88a2735822b`, module `model-eta-wrapper.js`.

- Baseline: 207,037 bytes, SHA256 `d517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee`.
- Candidate: 207,400 bytes, SHA256 `570b7a8e310aa0b6588260ece6139889e1b72c526149aa7510df3ca634a7ed3d`.
- Manifest: SHA256 `1759810194c7ca2e463670003485ac511fec3329178c7ab25b13b76671053610`.

The builder rejects drift and restores the original bytes as a scope check. It has no upload, deployment, credentials or network capability. It does not modify or replace Porto PR3173 or its candidate. If Porto deploys first, this baseline must be separately repinned/reviewed so releasing this change cannot undo Porto's guard. Conversely, Porto's pinned baseline will reject a preceding EMs16 release. Serialize releases; do not bypass a drift failure.

## Receipt and in-flight limits

Existing sent and delivery_uncertain receipts are returned unchanged, not retried. Active leases and future retry markers are respected. An expired sending marker follows the existing journal rule to delivery_uncertain, never a send retry. Once pending preparation runs, the blocked receipt records the actual private exclusion. Plans and existing confirmed/uncertain historical exposure remain intact. This cannot cancel a request already accepted or an older invocation already in flight; a deployment must wait for a separately reviewed quiet window and verify pending/in-flight state first. Tests are memory-only and never invoke deployed handlers.

## Verification

Run the normal-source tests and immutable overlay contracts:

```
node --test events-worker/ems16-private-automation.test.mjs
node --test events-worker/compcard-policy.test.mjs events-worker/compcard-journal.test.mjs events-worker/compcard-daily.test.mjs events-worker/compcard-cadence.test.mjs events-worker/compcard-intake.test.mjs
```

For exact-runtime execution, independently obtain the authorized live module and pass its local path:

```
EMS16_LIVE_BASELINE=/path/to/verified-live-module.mjs node --test events-worker/ems16-private-automation.test.mjs
```

The suite refuses the wrong baseline hash. Without that local module, CI explicitly skips two exact-live-only checks and runs normal-source and manifest tests. Do not call ordinary CI a production or exact-live proof. Exact local verification runs both normal source and transformed deployed runtime, including future dates, static/intake, private/public/category transitions, partial sent/uncertain, active/expired leases, retry holds, all affected destinations, and byte-equivalent non-target behavior.

## Unmet publication/release gates

This is a separate draft/source candidate, not a deployment workflow or permission to release. No Airtable field, post, receipt, flag, production resource or authentication state has been changed. Promotion must remain false.

Before production: independently review exact source/head/runtime/manifest hashes and tests; obtain authorization for the new PR's ready/merge/dispatch target; provide a reviewed dedicated release entry using the existing protected `mmd-production-mutation` environment and production concurrency group, with no new permissions or secrets. Preserve exact main/version/deployment/hash checks, strict inherited bindings/settings/routes/cron/subdomain, R2-read failure before upload, actual Per environment approval, quiet-window bounds checked before upload/promotion, current plans/receipts and no in-flight/lease/future retry uncertainty, and post-deploy runtime/config verification. Never use a user message ID as an approval receipt. Existing Porto's entry is pinned to a different artifact and must not be reused or weakened. There is currently no EMs16 dispatch/approval run.

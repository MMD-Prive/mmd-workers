# Canonical Porto exclusion from future automated rounds

The Porto-only runtime candidate excludes canonical Porto MJ (`recnl4Fksh6pXEwA1`) from fresh automatic selection and pending deliveries in both `model` and `standard` slots, for static and approved-intake cards across future dates. It has no calendar expiry. Re-enabling Porto requires a later explicit change. Existing sent, uncertain and in-flight evidence is not deleted or rewritten. Other people, routing, cooldown, configuration and published posts are unchanged.

PR #3172 merged this candidate and its protected release path at `0d22783f846febffcc2ba55576e184b7e4c4ff8d`; it did not deploy the candidate. The November 11 release attempt expired without dispatch. This follow-up corrects only the release window, current-round read checks, related contract tests and this documentation. It does not change the runtime overlay, normal source policy, workflow, shared transport, approval validators, environment rules, secrets or permissions, and does not bundle broad pool/history work.

## Exact runtime pins

- Live module: 207,037 bytes, SHA-256 `d517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee`.
- Candidate: 207,260 bytes, SHA-256 `d01134c376e654b38c91146993f0d008b797a64f49e184c6fb30983e314244e0`.
- Overlay manifest SHA-256: `2240fc42c9201dade551aab05aefa0a8aef8b14a0d0adc0805529a30674c82a4`.
- Baseline version: `88e741df-15bd-40ba-a4ce-f88a2735822b`.
- Baseline deployment: `d9617e88-3f2f-4698-a3e5-3853fd197e06`.

Fresh read-only November 12 inspection matched the complete live module to the pinned hash. The runtime delta remains exactly two reversible replacements inside `compcard-daily`; no full-main Worker build is deployed. The unchanged normal-source policy already excludes Porto and rechecks frozen plans before sending in both model slots.

## New bounded quiet window

The new attempt can run only on **November 12, 2026, from 21:45 inclusive to 23:45 exclusive, Asia/Bangkok** (`2026-11-12T14:45:00Z` to `2026-11-12T16:45:00Z`). It cannot roll forward via an input. An early or expired attempt stops before a mutation. Both upload and promotion repeat the clock check before and after their final read-only evidence check. This deployment window does not expire the installed exclusion.

The verified live cron is every 15 minutes. Model posting starts at 16:30 and evening posting at 20:00; each has a 90-minute catch-up interval. The last evening due tick is 21:15, the due interval ends 21:30, and delivery leases last 10 minutes with 15-minute retries and at most 3 attempts. Opening at 21:45 leaves a margin after that interval; closing at 23:45 avoids a publishing-date transition. This is not a claim that all in-flight work has stopped.

The entry therefore independently pins the current posting times, cadence start (`2026-10-23`), promotion weekdays (`2,5`), all four enable flags and the exact cron. Promotion must remain false. It inventories twelve exact November 12 keys: model/standard/promotion plans and premium/standard/preview receipts for each slot. Existing model/standard plan digests, category routes, receipt identity and attempts must validate. Preparing/sending states, active leases, future retries, orphan receipts, unexpected destinations, any promotion evidence, denied R2 reads or ambiguous inventory stop the release without cleanup. Pending/not_sent and terminal evidence are only read; accepted and uncertain receipts remain unchanged.

A newly frozen plan, receipt change, schedule drift or time expiry stops upload/promotion. The same snapshots are checked after promotion. The R2-read dependency uses only the existing GitHub Cloudflare secret; successful connected-plugin reads do not prove that secret has access. No new permission or secret may be created to make this release work without separately required approval.

## Review, approval and release

The correction changes exactly three repository files: `scripts/events-porto-exclusion-release.mjs`, its test file, and this README. Local syntax and 120 release/transport/approval/source-policy contracts pass; the unchanged 31 exact-runtime tests pass offline with network disabled and mocked sends. These are local results, not remote CI or live prevention. Exact-head remote checks and review must be completed for this correction.

Main requires a PR and `build (18.x)`, `build (20.x)` and `build (22.x)`, without bypass. The scoped contract job must also pass. Draft publication does not itself authorize a new ready/merge/dispatch target. The existing owner request and explicit PR #3172 authorization must not be represented as approval of broader changes or as an actual protected-environment receipt.

After authorized review/merge, dispatch uses the exact executing main SHA, `production_approved=true`, `approval_ref=Sentinel_7d526138545c8191b8f609294acbe26f`, and the pinned live version/deployment. The request reference identifies the underlying Porto request only. Real Per approval remains required in `mmd-production-mutation`, with main-only access, sole reviewer, allowed self-review and no administrator bypass. The workflow and `deploy-events-worker-production` concurrency group are unchanged. No credential retry or stale browser handoff is part of this correction.

The unchanged transport verifies active/latest versions, source state, inherited bindings/configuration, routes/cron/settings, uploaded annotations, exact promotion and final active bytes. Do not invoke scheduled/send handlers to test production. Report the actual receipt, final deployment/version allocation, module hash, flags and unchanged round-state evidence before claiming success.

A failure after upload may leave an unpromoted version. A failure after promotion may leave new code active. Unknown mutation outcomes stop without retry, fallback, cleanup or automatic rollback. Inspect the saved receipt and reconcile live state read-only; do not say nothing changed merely because a workflow failed. No release or prevention is claimed by this source correction.

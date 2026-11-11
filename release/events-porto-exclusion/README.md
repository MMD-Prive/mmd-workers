# Porto exclusion, November 11 Standard round only

This is a separate release candidate. It does not alter or dispatch the paused all-model history-review release. It changes only two exact expressions inside the current live `compcard-daily` module: exclude Porto MJ (`recnl4Fksh6pXEwA1`) during new Standard selection on 2026-11-11, and block any pending Porto delivery for that same slot/date before reading its asset or sending. Other people, dates, slots, routing and cooldown remain unchanged. It is not a permanent Porto ban.

Pinned live module: 207,037 bytes, SHA-256 `d517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee`.
Candidate: 207,263 bytes, SHA-256 `c7a2013edcc2502d804ffba0b083e896d3f3850e335bc7ed55c410b8bcf72387`.
Baseline version: `88e741df-15bd-40ba-a4ce-f88a2735822b`.
Baseline deployment: `d9617e88-3f2f-4698-a3e5-3853fd197e06`.

The 22 exact-candidate tests are offline and network-disabled, including both pending destinations, partial sent/uncertain receipts, retries, in-flight leases, expired sending evidence, and unchanged behavior for other models/dates/slots. The release downloads the exact pinned live bytes and runs these tests before any upload. PR contract checks do not pretend to possess live bytes or invoke a live handler. With the November 11 audited histories, the candidate has no eligible Standard model, so that round sends nothing unless relevant inputs later change. The readiness asset probe remains unchanged and is not the dispatch decision.

Local verification: syntax passed, 114 release/transport/approval contract tests passed, and all 22 exact-candidate tests passed on Node v24.22.1. The proposed workflow uses Node 22; its actual CI and the repository's required build matrix must pass separately. No passing remote CI or completed deployment is claimed by local results.

## Exact file and authority scope

Only six new repository files are proposed: this README, the Porto overlay, candidate tests, the dedicated release entry, its contract tests, and `deploy-events-porto-exclusion-code-only.yml`. Existing shared transport, approval validators, environment rules, workflow and broad artifacts are untouched. No new secret or permission is requested. The new entry reuses the existing exact-live protected transport, strict inherited bindings, exact active/latest version checks, route/cron/settings checks, post-upload configuration checks, exact promotion, and final active-byte verification. No full-main Worker build occurs.

The entry additionally reads only the exact November 11 Standard plan and two delivery objects in the existing R2 state bucket. It checks them before upload, before promotion and after promotion. A newly frozen plan or changed receipt stops the operation; no object is created, changed or deleted by release tooling. R2 read access is a capability dependency of the existing GitHub Cloudflare secret. Success through a separate connected Cloudflare plugin does not establish that this secret has that permission. An initial permission failure stops before upload; no permission or secret may be created or expanded to make this path work without separately required approval. Sent and uncertain evidence is preserved. A send already accepted or in flight cannot be undone or honestly called prevented.

## Review and release gates

The main branch requires a pull request plus `build (18.x)`, `build (20.x)` and `build (22.x)` checks, with no bypass actors. This candidate's own contract job must pass too. Draft publication is not approval to merge or deploy.

After authorized review/merge, manual dispatch must use the exact executing main SHA, `production_approved=true`, `approval_ref=Sentinel_96f4a14c0dd481919bba7618d7a0a314`, and the pinned baseline version/deployment. That request ID is a truthful audit reference, not a protected-environment approval receipt. The existing `mmd-production-mutation` environment still requires Per as sole reviewer, permits self-review and forbids administrator bypass. Main-only environment restrictions are independently verified. The same `deploy-events-worker-production` concurrency group is preserved.

Every approval checkpoint checks that it is November 11 in Asia/Bangkok and earlier than 19:55 ICT, leaving a margin before the 20:00 round. The immediate transport boundary repeats both the round-state comparison and expiry check before each upload or promotion POST. The date/slot is not an input and cannot silently roll forward. An expired candidate must not be dispatched, repurposed or treated as a continuing exclusion. Promotion must remain false and every binding is inherited unchanged.

Before claiming success, inspect the actual release receipt, deployment/version allocation, active module SHA-256, flags, and the read-only round-state snapshot. Never invoke a scheduled/send handler to test production. A failure after upload may leave an unpromoted version; a failure after promotion may leave the new code active. Neither means "nothing changed." Read the receipt's upload/deployment fields and reconcile live state read-only. Unknown mutation outcomes stop without retry, fallback, cleanup, or automatic rollback. No release or prevention is claimed by this source preparation.

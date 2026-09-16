# MMD Dirty Patch Quarantine - 2026-07-02

## Context

PR #128 merged the route governance connector lock into `main`.

- PR: #128
- Merge commit: `de8f1ebb034ffc05c29cdc2e55da034547a4dc4c`
- Connector: `tools/mmd-route-governance-connector.mjs`

This report documents the old dirty patch quarantine after the route governance lock. The patch was reviewed read-only and was not applied.

> Current override — 2026-09-13: route-role statements below are historical. `docs/locks/MMD_PAYMENT_ROUTE_BRIDGE_LOCK_20260913.md` is authoritative for membership-payment aliases and signed payment handoff. The quarantine decision itself remains valid.

Dirty patch file:

`/Users/Hiright_1/.mmd-secrets/codexmin-backups/mmd-workers-dirty-before-clean-worktree-route-lock.patch`

## Current Route Lock

- `/sigil/member/membership` is the canonical membership selection / signup / renewal / upgrade entry.
- signed `/sigil/pay?t=...` is the canonical exact payment + proof surface after a backend-owned payment intent exists.
- `/member/payments` is payment history/status/navigation only.
- `/sigil/pay/membership` and `/pay/membership` are compatibility bridges only; neither is a payment authority.
- `/sigil/pay/renewal` and `/pay/renewal` are manual legacy renewal evidence routes.
- `/sigil/pay/renew` is a compatibility alias to `/sigil/pay/renewal`.
- `/sigil/pay/payment` is a retired generic payment alias.
- Membership aliases must never be treated as renewal evidence or redirected into `/sigil/pay/renewal` by generic route logic.
- Unknown routes must never redirect to `/default`, `/autodirect`, or `/sigil/pay/renewal`.
- `payments-worker` remains the sole owner of payment amount, destination, PromptPay QR, canonical payment reference and verification.
- `mmd-redirect-worker` is currently hard-disabled and must remain transparent pass-through unless a new explicit owner directive changes that lock.

## Files Reviewed

| File | General purpose of dirty change | Route keywords | Route ownership impact | Conflict risk | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `events-worker/src/index.js` | Removes two leftover conflict-marker lines near `airtableSumPaidForStage`; unrelated to route ownership. | None of `/sigil/pay/membership`, `/sigil/pay/renewal`, `/pay/membership`, `/pay/renewal`, `/default`, `/autodirect`. | No route ownership impact. | No route-lock conflict found. | Safe to rebuild later from current `origin/main` in a separate events-worker branch if still needed. |
| `mmd-redirect-worker/src/index.js` | Edits redirect worker route guard area involving membership and renewal paths. | Mentions `/sigil/pay/membership`, `/sigil/pay/renewal`, `/pay/membership`, `/pay/renewal`; does not mention `/default` or `/autodirect`. | Yes. It attempted to restore front-door redirect behavior. | Critical. The current redirect worker is hard-disabled and the dirty patch predates both that lock and the 2026-09-13 payment bridge canon. | Do not reapply. Any future edge alias retirement must use an explicitly approved live route owner and dedicated tests. |
| `mmd-redirect-worker/test/redirect.test.mjs` | Adds redirect tests around SIGIL membership and renewal behavior. | Mentions `/sigil/pay/membership`, `/sigil/pay/renewal`, `/pay/membership`, `/pay/renewal`; does not mention `/default` or `/autodirect`. | Indirectly, by test expectations for route behavior. | Critical if they imply the disabled redirect worker should route payment aliases. | Do not reapply. Current tests must assert pass-through for the disabled worker and payment bridge behavior in the bridge-specific tests. |

## Route-Lock Conflict Summary

The `events-worker` portion appears unrelated to route governance.

The `mmd-redirect-worker` source and test portions are permanently quarantined in their old form. They mention both membership payment aliases and renewal routes and were created before the current hard-disable directive and payment bridge canon. They must not be applied directly to current `main`.

Required safeguards:

- Do not reapply the `mmd-redirect-worker` source/test dirty patch as-is.
- Do not restore routing logic inside `mmd-redirect-worker` while `REDIRECT_WORKER_DISABLED` remains true.
- Run `node tools/mmd-route-governance-connector.mjs` before and after any future route-owner change.
- Keep `/sigil/pay/membership` and `/pay/membership` out of renewal authority logic.
- Never accept browser amount/account/package parameters as payment authority while handling compatibility aliases.
- Do not create fallback/default/autodirect behavior that sends unknown routes to renewal.

## Events-Worker Safe Rebuild Plan

If the `events-worker` cleanup is still needed:

1. Create a separate fresh branch from current `origin/main`.
2. Manually re-implement only the useful `events-worker` cleanup.
3. Do not apply the old patch.
4. Run relevant `events-worker` tests or syntax checks.
5. Run `node tools/mmd-route-governance-connector.mjs` before opening a PR.
6. Do not deploy without explicit approval.

The events-worker work should stay separate from route governance and redirect-worker changes.

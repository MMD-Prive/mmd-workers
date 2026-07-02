# MMD Dirty Patch Quarantine - 2026-07-02

## Context

PR #128 merged the route governance connector lock into `main`.

- PR: #128
- Merge commit: `de8f1ebb034ffc05c29cdc2e55da034547a4dc4c`
- Connector: `tools/mmd-route-governance-connector.mjs`

This report documents the old dirty patch quarantine after the route governance lock. The patch was reviewed read-only and was not applied.

Dirty patch file:

`/Users/Hiright_1/.mmd-secrets/codexmin-backups/mmd-workers-dirty-before-clean-worktree-route-lock.patch`

## Route Lock

- `/sigil/pay/membership` is a permanent membership payment route.
- `/pay/membership` is a membership payment route.
- `/sigil/pay/renewal` is manual legacy renewal evidence only.
- `/pay/renewal` is manual legacy renewal evidence only.
- Membership routes must never redirect to `/sigil/pay/renewal`.
- Unknown routes must never redirect to `/default`, `/autodirect`, or `/sigil/pay/renewal`.
- `member-dashboard-chat-worker` must never own `/sigil/pay/membership`.

## Files Reviewed

| File | General purpose of dirty change | Route keywords | Route ownership impact | Conflict risk | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `events-worker/src/index.js` | Removes two leftover conflict-marker lines near `airtableSumPaidForStage`; unrelated to route ownership. | None of `/sigil/pay/membership`, `/sigil/pay/renewal`, `/pay/membership`, `/pay/renewal`, `/default`, `/autodirect`. | No route ownership impact. | No route-lock conflict found. | Safe to rebuild later from current `origin/main` in a separate events-worker branch if still needed. |
| `mmd-redirect-worker/src/index.js` | Edits redirect worker route guard area involving membership and renewal paths. | Mentions `/sigil/pay/membership`, `/sigil/pay/renewal`, `/pay/membership`, `/pay/renewal`; does not mention `/default` or `/autodirect`. | Yes, this file owns front-door redirect behavior. | Yes. It predates the final PR #128 governance lock and could restore stale membership-to-renewal behavior if reapplied blindly. | Unsafe to reapply as-is. Rebuild any needed redirect change manually from current `origin/main` only. |
| `mmd-redirect-worker/test/redirect.test.mjs` | Adds redirect tests around SIGIL membership and renewal behavior. | Mentions `/sigil/pay/membership`, `/sigil/pay/renewal`, `/pay/membership`, `/pay/renewal`; does not mention `/default` or `/autodirect`. | Indirectly, by test expectations for route behavior. | Yes. The stale tests could weaken or conflict with the PR #128 governance connector expectations. | Unsafe to reapply as-is. Rebuild any needed tests manually from current `origin/main` only. |

## Route-Lock Conflict Summary

The `events-worker` portion appears unrelated to route governance.

The `mmd-redirect-worker` source and test portions are quarantined. They mention both membership payment routes and renewal routes, and they were created before the final governance connector lock. They must not be applied directly to current `main`.

Required safeguards:

- Do not reapply the `mmd-redirect-worker` source/test dirty patch as-is.
- Rebuild any needed `mmd-redirect-worker` changes manually from current `origin/main` only.
- Run `node tools/mmd-route-governance-connector.mjs` before and after any future `mmd-redirect-worker` change.
- Keep `/sigil/pay/membership` and `/pay/membership` out of renewal logic.
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

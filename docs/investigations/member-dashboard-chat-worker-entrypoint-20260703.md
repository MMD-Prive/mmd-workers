# Member Dashboard Chat Worker Entrypoint Investigation — 2026-07-03

## Status

Investigation-only report. No runtime route changes and no deploy target changes.

## Trigger

After PR #131 was merged and deployed manually, Cloudflare reported that `member-dashboard-chat-worker` was uploaded but no targets were deployed. This means the code reached Cloudflare, but no route, custom domain, or workers.dev target received traffic.

## Current main state

`member-dashboard-chat-worker/src/index.js` currently contains a minimal safe shell only:

- `GET /health`
- `POST /v1/internal/line/public-menu-fallback`

The fallback endpoint has an internal authentication guard from PR #131. This is safe, but it is not enough to serve production LINE or member traffic.

`member-dashboard-chat-worker/wrangler.toml` currently identifies the worker as `member-dashboard-chat-worker`, points to `src/index.js`, and keeps `workers_dev = false`.

## Critical finding

Do not attach production LINE or member routes to the current minimal shell.

The current shell does not contain the production LINE webhook, Kenji reply, inbound logging, pricing review, model lookup, dashboard continuity, or renewal route handlers that MMD route memory and handoff documents describe.

## Evidence from repo locks

`member-dashboard-chat-worker/CODEXMIN_RENEWAL_ROUTE_HANDOFF.md` explicitly warns:

- do not create a new worker entrypoint
- do not replace the existing `member-dashboard-chat-worker` entrypoint
- do not remove or disturb existing LINE, Telegram webhook, admin, payment-review, dashboard, chat, or member continuity logic
- patch only the real production entrypoint
- if the real production entrypoint is unclear, stop and report candidate files instead of creating a new entrypoint

## Historical LINE implementation candidate

This note captured a July 2026 migration investigation. The historical implementation candidate was:

`immigrate-worker/netlify/functions/webhook.js`

The behavior has since been preserved outside the retired Netlify handler for migration/reference purposes:

`immigrate-worker/src/line-slip-intake-orchestration.mjs`

At the current architecture lock, `member-dashboard-chat-worker` is the sole production LINE webhook owner and Netlify is not an upstream, fallback, or route owner. The retired Netlify handler must return HTTP 410.

The preserved migration code covers:

- LINE request signature verification
- inbound LINE event parsing
- Console Inbox write and dedupe behavior
- user profile fetch
- LINE reply API behavior
- Kenji / Per AI trigger detection
- pricing review acknowledgement
- model availability lookup through admin worker
- optional Kenji member concierge replies

## Evidence from LINE route docs

`docs/line/kenji-line-official.md` says the LINE Official production webhook should keep using the stable public route:

`https://mmdbkk.com/webhooks/line`

That older bridge interpretation is no longer current. The current route lock is:

- `member-dashboard-chat-worker` owns the stable public LINE URL on `mmdbkk.com`.
- `mmd-redirect-worker` must fail closed if it catches LINE webhook paths.
- Netlify and `immigrate-worker/netlify/functions/webhook.js` are retired legacy evidence only.

## Route decision

No route should be added to `member-dashboard-chat-worker/wrangler.toml` yet.

Do not add a new vanity target such as `member-dashboard-chat.mmdbkk.com/*` as production. That was only a diagnostic idea and is not approved by current route ownership evidence.

Do not move LINE OA directly to a new Worker URL. The public LINE OA webhook URL should remain on `mmdbkk.com` unless a separate route-governance PR explicitly changes it.

## Required next patch options

### Option A: keep production route on existing bridge

This option is retired. Do not restore a bridge or upstream fallback.

### Option B: migrate LINE implementation into `member-dashboard-chat-worker`

Only if MMD decides to make `member-dashboard-chat-worker` the canonical LINE implementation:

1. Use provider-neutral preserved code under `immigrate-worker/src` only as migration evidence for a separately approved Cloudflare owner.
2. Preserve the PR #131 fallback endpoint and guard.
3. Add LINE signature tests.
4. Add Kenji trigger tests.
5. Add fallback guard tests.
6. Add only proven route targets.
7. Update route docs and smoke checklist.

## Conclusion

The immediate next step is not to attach routes to the current `member-dashboard-chat-worker` shell.

The safe next step is to choose between preserving the current front gate bridge or opening a dedicated migration PR that ports the real LINE/Kenji implementation into `member-dashboard-chat-worker` with tests and route governance.

# SIGIL Route Ownership Registry

Last updated: 2026-07-06

This registry records canonical owners for SIGIL public routes fronted by
Cloudflare Workers. Routes listed here must not be served by generic Webflow
pass-through or an unrelated fallback page.

| Public route | Canonical owner | Front gate behavior | Origin header | Page header |
| --- | --- | --- | --- | --- |
| `GET /sigil/apply` | `sigil-worker` | Delegate directly to `SIGIL_WORKER`. If the service binding is unavailable, fetch only `https://sigil.mmdbkk.com/sigil/apply` with the original query string. | `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` | `x-mmd-page: sigil-private-model-setup` |
| `GET /sigil/apply/` | `sigil-worker` | Same as `/sigil/apply`, preserving the trailing slash and query string. | `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` | `x-mmd-page: sigil-private-model-setup` |
| `GET /sigil/booking` | `sigil-booking-proxy-worker` | On `mmdbkk.com` and `www.mmdbkk.com`, redirect with HTTP 302 to `https://sigil.mmdbkk.com/sigil/booking`, preserving only `t`, `code`, `promo`, `model_id`, and `request_id`. On `sigil.mmdbkk.com`, proxy the live Webflow page from `https://mmdprive.webflow.io/sigil/booking`. | `x-mmd-origin: https://mmdprive.webflow.io` | `x-mmd-page: sigil-booking` |
| `GET /sigil/booking/` | `sigil-booking-proxy-worker` | Same as `/sigil/booking`, normalized to the canonical path. | `x-mmd-origin: https://mmdprive.webflow.io` | `x-mmd-page: sigil-booking` |
| `GET /sigil/board` | Webflow page surface | Visible board page remains owned by Webflow. Do not route `sigil.mmdbkk.com/sigil/board*` wholesale to a Worker, because doing so can replace the page with API JSON or a Worker 404. | `https://mmdprive.webflow.io` | `x-mmd-page: sigil-board` |
| `GET /sigil/board/runtime*` | `sigil-board-worker` | Read-only SIGIL Board V7 runtime API. Must return safe runtime JSON with `production_write: false`; no payment confirmation, SVIP approval, Black Card approval, or Airtable mutation. | `x-mmd-route-owner: sigil-board-worker` | `x-mmd-page: sigil-board-runtime` |
| `POST /sigil/board/runtime/dry-run` | `sigil-board-worker` | Controlled dry-run only. Requires server-side auth and audit. No production write. | `x-mmd-route-owner: sigil-board-worker` | `x-mmd-page: sigil-board-runtime-dry-run` |
| `POST /sigil/board/runtime/rollback` | `sigil-board-worker` | Guarded rollback plan only. Boss Per role only. Actual rollback requires explicit snapshot storage and manual confirmation. | `x-mmd-route-owner: sigil-board-worker` | `x-mmd-page: sigil-board-runtime-rollback` |
| `POST /sigil/board/actions/*` | `sigil-board-worker` | Controlled queue-action API only. Requires server-side auth and audit. No production write. | `x-mmd-route-owner: sigil-board-worker` | `x-mmd-page: sigil-board-actions` |
| `POST /sigil/board/audit*` | `sigil-board-worker` | Controlled audit-write API only. Requires server-side auth. Writes audit event to SIGIL Board KV when available. | `x-mmd-route-owner: sigil-board-worker` | `x-mmd-page: sigil-board-audit` |

Required owner headers for `/sigil/apply` responses:

- `x-mmd-route-owner: sigil-worker`
- `x-mmd-page: sigil-private-model-setup`
- `x-mmd-origin: service-binding:sigil-worker` for service binding responses
- `x-mmd-front-gate: mmd-redirect-worker`
- `x-mmd-front-version: 20260622T071500Z`

Required owner headers for `/sigil/booking` responses:

- `x-mmd-route-owner: sigil-booking-proxy-worker`
- `x-mmd-page: sigil-booking`
- `x-mmd-booking-source: webflow-live`
- `x-mmd-page-source: https://mmdprive.webflow.io/sigil/booking`
- `cache-control: no-store, no-cache, must-revalidate, max-age=0`

Required route ownership for `/sigil/board` responses:

- Visible page route `/sigil/board` must remain a Webflow page surface unless a dedicated page proxy is created.
- API route `/sigil/board/runtime*` must resolve to `sigil-board-worker`, not `sigil-worker`, `immigrate-worker`, `mmd-redirect-worker`, or LIFF workers.
- API route `/sigil/board/actions/*` must resolve to `sigil-board-worker`.
- API route `/sigil/board/audit*` must resolve to `sigil-board-worker`.
- `GET /sigil/board/runtime` must be read-only and return `production_write: false`.
- POST control routes must require `SIGIL_WORKER_SECRET` and role permission checks.

Regression guard:

- `/sigil/apply` and `/sigil/apply/` on both `mmdbkk.com` and
  `www.mmdbkk.com` must never render content from `/ceo/telegram-brief`.
- `/sigil/booking` and `/sigil/booking/` on `sigil.mmdbkk.com` must render the
  current Webflow booking page and must not render the old/default page with
  `SIGIL / BOOKING / REQUEST`, `Standard Search`, or `Assisted Request`.
- `/sigil/board/runtime` on `sigil.mmdbkk.com` must not return `401` from
  `sigil-worker` / `immigrate-worker` and must not include
  `x-mmd-sigil-owner: sigil-worker` or `x-mmd-sigil-upstream: immigrate-worker`.
- `/sigil/board/runtime` must return SIGIL Board V7 safe runtime JSON including
  `board_level: V7.0` and `production_write: false`.
- Tests must fail if the response body contains `Briefing HYPE TELEGRAMBOT`,
  `TELEGRAMBOT`, or `CEO TELEGRAM BRIEF`.
- Query strings such as `?t=abc&code=x&promo=y` must be preserved exactly when
  delegated to the owner unless the route explicitly uses a safe-param allowlist.

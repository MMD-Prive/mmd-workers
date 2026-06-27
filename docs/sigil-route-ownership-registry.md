# SIGIL Route Ownership Registry

Last updated: 2026-06-27

This registry records canonical owners for SIGIL public routes fronted by
Cloudflare Workers. Routes listed here must not be served by generic Webflow
pass-through or an unrelated fallback page.

| Public route | Canonical owner | Front gate behavior | Origin header | Page header |
| --- | --- | --- | --- | --- |
| `GET /sigil/apply` | `sigil-worker` | Delegate directly to `SIGIL_WORKER`. If the service binding is unavailable, fetch only `https://sigil.mmdbkk.com/sigil/apply` with the original query string. | `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` | `x-mmd-page: sigil-private-model-setup` |
| `GET /sigil/apply/` | `sigil-worker` | Same as `/sigil/apply`, preserving the trailing slash and query string. | `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` | `x-mmd-page: sigil-private-model-setup` |
| `GET /sigil/booking` | `sigil-booking-proxy-worker` | On `mmdbkk.com` and `www.mmdbkk.com`, redirect with HTTP 302 to `https://sigil.mmdbkk.com/sigil/booking`, preserving only `t`, `code`, `promo`, `model_id`, and `request_id`. On `sigil.mmdbkk.com`, proxy the live Webflow page from `https://mmdprive.webflow.io/sigil/booking`. | `x-mmd-origin: https://mmdprive.webflow.io` | `x-mmd-page: sigil-booking` |
| `GET /sigil/booking/` | `sigil-booking-proxy-worker` | Same as `/sigil/booking`, normalized to the canonical path. | `x-mmd-origin: https://mmdprive.webflow.io` | `x-mmd-page: sigil-booking` |

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

Regression guard:

- `/sigil/apply` and `/sigil/apply/` on both `mmdbkk.com` and
  `www.mmdbkk.com` must never render content from `/ceo/telegram-brief`.
- `/sigil/booking` and `/sigil/booking/` on `sigil.mmdbkk.com` must render the
  current Webflow booking page and must not render the old/default page with
  `SIGIL / BOOKING / REQUEST`, `Standard Search`, or `Assisted Request`.
- Tests must fail if the response body contains `Briefing HYPE TELEGRAMBOT`,
  `TELEGRAMBOT`, or `CEO TELEGRAM BRIEF`.
- Query strings such as `?t=abc&code=x&promo=y` must be preserved exactly when
  delegated to the owner unless the route explicitly uses a safe-param allowlist.

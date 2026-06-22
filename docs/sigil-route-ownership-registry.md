# SIGIL Route Ownership Registry

Last updated: 2026-06-22

This registry records canonical owners for SIGIL public routes fronted by
`mmd-redirect-worker`. Routes listed here must not be served by generic Webflow
pass-through or an unrelated fallback page.

| Public route | Canonical owner | Front gate behavior | Origin header | Page header |
| --- | --- | --- | --- | --- |
| `GET /sigil/apply` | `sigil-worker` | Delegate directly to `SIGIL_WORKER`. If the service binding is unavailable, fetch only `https://sigil.mmdbkk.com/sigil/apply` with the original query string. | `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` | `x-mmd-page: sigil-private-model-setup` |
| `GET /sigil/apply/` | `sigil-worker` | Same as `/sigil/apply`, preserving the trailing slash and query string. | `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` | `x-mmd-page: sigil-private-model-setup` |

Required owner headers for `/sigil/apply` responses:

- `x-mmd-route-owner: sigil-worker`
- `x-mmd-page: sigil-private-model-setup`
- `x-mmd-origin: service-binding:sigil-worker` for service binding responses
- `x-mmd-front-gate: mmd-redirect-worker`
- `x-mmd-front-version: 20260622T071500Z`

Regression guard:

- `/sigil/apply` and `/sigil/apply/` on both `mmdbkk.com` and
  `www.mmdbkk.com` must never render content from `/ceo/telegram-brief`.
- Tests must fail if the response body contains `Briefing HYPE TELEGRAMBOT`,
  `TELEGRAMBOT`, or `CEO TELEGRAM BRIEF`.
- Query strings such as `?t=abc&code=x&promo=y` must be preserved exactly when
  delegated to the owner.

# SIGIL Worker

`sigil-worker` is the public owner for `https://sigil.mmdbkk.com/sigil/*`.

Migration phase `SIGIL_ROUTE_MIGRATION_V1` is intentionally a transparent proxy to `immigrate-worker`.
This moves Cloudflare route ownership without changing the existing admin gate, session, invite,
renewal, and customer-confirm business logic in the same release.

Every response receives:

- `x-mmd-sigil-owner: sigil-worker`
- `x-mmd-sigil-build: SIGIL_ROUTE_MIGRATION_V1`
- `x-mmd-sigil-upstream: immigrate-worker`

Do not remove the matching `immigrate-worker` route binding until the new route is deployed and these
headers are visible on all first-wave `/sigil/*` routes.

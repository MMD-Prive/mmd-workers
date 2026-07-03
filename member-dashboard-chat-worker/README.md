# member-dashboard-chat-worker

Safe push fallback worker for member dashboard chat events.

Deploy preflight:

- Do not deploy from a folder that only contains `.wrangler/`.
- Do not use tmp `.wrangler` cache as source.
- Confirm `src/index.js`, `test/push-fallback.test.mjs`, and `wrangler.toml` exist.
- Confirm `wrangler.toml` has no route declarations and `workers_dev = false`.
- Bind `LINE_CHANNEL_ACCESS_TOKEN`, `INTERNAL_TOKEN`, and `CONFIRM_KEY` as Cloudflare secrets; never write them to `wrangler.toml`.
- Confirm `POST /v1/internal/line/public-menu-fallback` is not publicly reachable without internal auth.
- Run `node --check src/index.js`, `node --test test/*.test.mjs`, and `git diff --check`.

Safety contract:

- LINE/LIFF is an entry layer only.
- Payment proof is evidence only until official verification.
- Public menu fallback must not activate membership, payments, points, packages, or dashboard access.
- Dashboard and private actions stay gated by trusted worker state.
- `trusted_event` is only a semantic guard, never the authentication boundary.
- This worker does not mutate Airtable, Memberstack, payment state, member state, routes, or Rich Menu configuration.

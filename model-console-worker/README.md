# MMD Model Console V1

Operator-facing console gateway for MMD. This package follows `docs/architecture/ADMIN_CONSOLE_V1.md`: the console surfaces capabilities but does not become production authority.

## A. Worker skeleton

`src/index.js` provides:

- `GET /ping`
- `GET /v1/console/workers`
- `GET /v1/console/workers/health`
- `GET /v1/console/models`
- `POST /v1/console/models/upsert`
- `GET|POST|DELETE /v1/console/memory`
- `POST /v1/console/telegram/dm`
- `POST /v1/console/proxy` for explicitly allowlisted worker names

## B. UI

`public/index.html` is a dependency-free mobile-first operator UI for:

- worker health
- model lookup
- controlled model upsert
- operator memory
- adapter diagnostics

It is intentionally operational rather than decorative.

## C. Adapters

The console currently has a concrete admin-worker adapter for the existing model routes and Telegram DM route. Other workers are registered as named adapters and can be called only through `/v1/console/proxy` after their base URL is configured.

Never put business rules in this UI or this gateway. Add typed adapter routes as worker contracts become canonical.

## D. MMD console memory

KV binding: `MMD_MODEL_CONSOLE_MEMORY`

Recommended key families:

- `draft:model:<model_id>` — operator edit draft; TTL 24h–7d
- `view:model:<operator>:<model_id>` — optional UI state; TTL <=24h
- `match:<conversation_id>` — transient shortlist/cache; TTL <=24h
- `lock:model:<model_id>` — advisory console lock only; prefer Durable Object if strict serialization is required
- `audit:<timestamp>:<uuid>` — console action trace; current implementation TTL 90d

Memory is never canonical membership/model/payment truth. Airtable-backed and worker-produced state wins.

## Setup

```bash
cd model-console-worker
npm install
npx wrangler kv namespace create MMD_MODEL_CONSOLE_MEMORY
```

Add the returned namespace id to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MMD_MODEL_CONSOLE_MEMORY"
id = "..."
```

Set secrets:

```bash
npx wrangler secret put ADMIN_BEARER
npx wrangler secret put CONFIRM_KEY
npx wrangler secret put INTERNAL_TOKEN
```

Set each worker base URL in Cloudflare vars or `wrangler.toml`. Do not guess URLs. `ADMIN_WORKER_BASE_URL` is prefilled with the admin-worker hostname already documented in this repository; all other worker URLs remain blank until verified.

Then:

```bash
npm run check
npm run deploy
```

## Security notes

- Browser calls authenticate to model-console-worker; raw backend secrets should not be embedded into a production Webflow page.
- Production UI should obtain a server-issued admin session and call the console through a same-origin protected route.
- `/v1/console/proxy` is intended for diagnostics while typed adapters are completed. Before broad production use, constrain allowed paths/methods per worker.
- Every mutating console operation should be auditable and must continue to respect each downstream worker's authorization and state-machine rules.

## R2

Model images remain in Cloudflare R2. This console does not move image binary data into KV. Store only canonical R2 object keys/URLs in the model record and use a dedicated signed-upload endpoint for browser uploads.

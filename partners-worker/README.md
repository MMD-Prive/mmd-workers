# MMD SIGIL Partners Worker

Production Cloudflare Worker for the MMD SIGIL partner flow.

Layer ownership:
- Yuki = Partner Control Layer
- Ewvon = Black Card Authority Layer
- Partner Worker responses use `control_layer: "YUKI"` where partner control context is returned.

## Routes

- `GET /health`
- `POST /v1/partner/upload`
- `POST /v1/partner/request`
- `GET /v1/partner/verify?t=...`
- `GET /v1/partner/dashboard?t=...`
- `POST /v1/partner/accept-terms`
- `POST /v1/partner/approve`

## Legal terms redirect scope

- `/terms` returns `302` to `/partner/terms`.
- `/terms?t=...` preserves `t` when redirecting to `/partner/terms?t=...`.
- `/legal/terms` returns `302` to `/partner/terms`.
- `/terms-of-service` and `/terms-and-conditions` must not redirect to `/partner/terms`.
- `302` is intentional to avoid permanent browser/CDN caching while terms routing is still being finalized.

## Required Secrets

```bash
wrangler secret put AIRTABLE_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TOKEN_SECRET
```

`TOKEN_SECRET` is used for HMAC SHA-256 token signatures. The raw token is never stored in Airtable; only the SHA-256 hash is stored in `Model Partners`.

## Deploy

```bash
npm install
npm run types
npm run typecheck
npm run deploy
```

## Webflow

The published `/partner/form` currently opens its modal locally unless it includes a real submit bridge. Add `webflow-sigil-partner-form.js` to the page after the form markup. It posts to:

```txt
https://partners-worker.malemodel-bkk.workers.dev/v1/partner/request
```

The bridge also supports future file inputs by uploading each file to `/v1/partner/upload` first, then submitting the returned metadata in the final request.

## Smoke Tests

```bash
curl https://partners-worker.malemodel-bkk.workers.dev/health
```

Expected:

```json
{
  "ok": true,
  "service": "partners-worker"
}
```

No-file request test:

```bash
curl -X POST https://partners-worker.malemodel-bkk.workers.dev/v1/partner/request \
  -H 'Content-Type: application/json' \
  -d '{
    "request_id":"prq_20260427_manual01",
    "name_alias":"Ken Agency",
    "access_source":"modeling_broker",
    "value_bring":"A curated private modeling network with verified availability.",
    "why_consider":"We can bring discreet talent referrals aligned with MMD SIGIL standards.",
    "experience":"Bangkok model coordination",
    "contact":"LINE: example",
    "source_path":"/partner/form",
    "files":[]
  }'
```

Approval test:

```bash
curl -X POST https://partners-worker.malemodel-bkk.workers.dev/v1/partner/approve \
  -H 'Content-Type: application/json' \
  -d '{"partner_record_id":"recXXXXXXXXXXXXXX","action":"recognized","note":"Strong network, clean profile"}'
```

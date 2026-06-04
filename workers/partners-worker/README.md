# SĪGIL Partner Worker

Production Cloudflare Worker for the MMD SĪGIL Partner System v2.

## Endpoints

- `GET /health`
- `POST /v1/partner/upload`
- `POST /v1/partner/request`
- `GET /v1/partner/verify?t=...`
- `GET /v1/partner/dashboard?t=...`
- `POST /v1/partner/accept-terms`
- `POST /v1/partner/approve`

The public token parameter is always `t`. Requests that use `token` are rejected.

## Secrets

Configure secrets with Wrangler or the Cloudflare dashboard:

```txt
AIRTABLE_API_KEY
TELEGRAM_BOT_TOKEN
ADMIN_APPROVE_SECRET
```

Optional Telegram routing:

```txt
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_ADMIN_THREAD_ID
```

## Upload contract

`POST /v1/partner/upload` accepts `multipart/form-data`:

- `request_id`
- `file_category`
- `file`

Allowed files are `jpg`, `png`, `webp`, and `pdf`, up to 20MB. The worker stores the file in R2 under:

```txt
partner-requests/{request_id}/uploads/{timestamp}-{safe_filename}
```

The response returns metadata only; the R2 object remains private.

## Approval contract

`POST /v1/partner/approve` requires either:

- `x-mmd-admin-secret: <ADMIN_APPROVE_SECRET>`
- `Authorization: Bearer <ADMIN_APPROVE_SECRET>`

Supported actions:

- `recognized`
- `not_recognized`
- `needs_follow_up`
- `archived`

When a partner is recognized, the worker generates a private token, stores only its SHA-256 hash in Airtable, and returns a `/partner/recognized?t=...` link.

## Local checks

```sh
npm install
npm run typecheck
npm run dev
```

# LINE OFC Slip Intake Runbook

## Deployment status

Cloudflare staging implementation is prepared under `services/mmd-slip-extractor/cloudflare`. Production remains unchanged and deployment approval remains PENDING.

The production LINE webhook stays on `member-dashboard-chat-worker`. Do not set `LINE_WEBHOOK_UPSTREAM_URL`, do not create a second production webhook, and do not point LINE at the extractor workers.dev URL.

## Preview scope

- Dedicated Cloudflare staging Worker and Container only.
- Synthetic or redacted images only.
- No production LINE traffic or customer slip data.
- No production routes.
- One staging Container instance.
- Container outbound internet disabled.
- Extraction evidence remains pending/review-only.

## Prerequisites

1. Cloudflare Workers Paid plan with Containers available.
2. Wrangler v4 and Docker or a compatible container engine.
3. A new staging-only `MMD_SLIP_EXTRACTOR_TOKEN`.
4. No production, LINE, Airtable, Telegram, or internal-worker secret reused.

## Local validation

```sh
cd services/mmd-slip-extractor/cloudflare
npm ci
node --test test/*.test.mjs
node --check worker.mjs
node --check worker-core.mjs
node --check container-server.mjs
npx wrangler types --config wrangler.jsonc
npx wrangler deploy --dry-run --config wrangler.jsonc
```

The existing extraction library tests must also pass from `services/mmd-slip-extractor` before review.

## Configure the staging secret

Run from `services/mmd-slip-extractor/cloudflare`:

```sh
npx wrangler whoami
npx wrangler secret put MMD_SLIP_EXTRACTOR_TOKEN --config wrangler.jsonc
```

Wrangler prompts for the value. Do not place the secret on the command line or in shell history.

## Deploy staging

```sh
cd services/mmd-slip-extractor/cloudflare
npx wrangler deploy --config wrangler.jsonc
npx wrangler containers list
npx wrangler containers images list
```

The first Container deployment can require several minutes before it is ready. Wait for Container readiness before smoke testing.

## Synthetic smoke

1. Confirm `GET /health` returns 200 from the staging workers.dev hostname.
2. Send a generated PromptPay/EMV QR image to `POST /v1/extract/qr`.
3. Send a synthetic Thai/English slip fixture to `POST /v1/extract/ocr`.
4. Confirm the bearer token is required.
5. Confirm an oversized request fails with 413.
6. Confirm responses contain no `paid`, `verified`, membership, points, session, or entitlement field.
7. Confirm logs contain only request ID, route, and stable status.

Record the staging base URL for:

```text
LINE_SLIP_QR_EXTRACTOR_URL=<staging-base>/v1/extract/qr
LINE_SLIP_OCR_EXTRACTOR_URL=<staging-base>/v1/extract/ocr
```

Do not wire these URLs into the production LINE webhook owner. They are inputs for a later isolated staging-intake integration.

## Dev R2 and Telegram

The extractor itself intentionally has no R2 or Telegram binding. The later staging-intake layer must use a dedicated private dev R2 bucket and redacted Telegram notifications. It must never serialize private R2 keys or internal Airtable metadata to LINE or browsers.

## Rollback

If staging is unhealthy:

1. Stop using the staging URL.
2. Rotate or delete the staging extractor secret.
3. Roll back the staging Worker to a known-good version with Wrangler.
4. Preserve synthetic smoke artifacts only when they contain no customer data.
5. Do not change the production LINE route.

Production evidence, payment, membership, points, session, and entitlement records must not be changed or deleted as part of extractor rollback.

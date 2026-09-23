# Cloudflare staging extractor

This directory replaces the retired Netlify deployment path for preview work. It deploys a dedicated Cloudflare Worker in front of one Cloudflare Container instance. The Worker owns public authentication and route filtering; the Container runs the existing local QR/OCR implementation.

## Safety boundary

- Staging only: worker name `mmd-slip-extractor-staging`, `workers_dev=true`, and no custom routes.
- Synthetic or redacted images only.
- The bearer token is checked at the Worker and removed before the request reaches the Container.
- The Container has outbound internet disabled and has no LINE, Airtable, R2, Telegram, payment, membership, points, session, or entitlement binding.
- The service returns extraction evidence only. It cannot mark anything paid or verified.
- `member-dashboard-chat-worker` remains the production LINE webhook owner.
- `LINE_WEBHOOK_UPSTREAM_URL` remains retired and unset.

## Required secret

`MMD_SLIP_EXTRACTOR_TOKEN` must be a new staging-only secret. Never reuse a production, LINE, Airtable, Telegram, or internal worker token.

From this directory:

```sh
npx wrangler whoami
npx wrangler secret put MMD_SLIP_EXTRACTOR_TOKEN --config wrangler.jsonc
npm test
npm run check
npm run types
npm run deploy:dry-run
npm run deploy:staging
```

Do not place a token value in shell arguments, source files, Wrangler configuration, logs, or documentation.

## Synthetic smoke

After the Container deployment reports ready, verify:

```text
GET  /health
POST /v1/extract/qr
POST /v1/extract/ocr
```

Use only generated QR images and synthetic/redacted OCR fixtures. Record the staging base URL as the source for:

```text
LINE_SLIP_QR_EXTRACTOR_URL=<staging-base>/v1/extract/qr
LINE_SLIP_OCR_EXTRACTOR_URL=<staging-base>/v1/extract/ocr
```

Do not wire these URLs into the production LINE webhook owner. Production deployment remains separately gated.

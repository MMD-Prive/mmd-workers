# LINE OFC Slip Intake Runbook

## Deployment status

Cloudflare staging source is now split into:

- extractor: `services/mmd-slip-extractor/cloudflare`
- Queue-backed intake: `services/mmd-line-slip-intake/cloudflare`

Production remains unchanged. Production LINE integration approval is still PENDING.

The production LINE webhook stays on `member-dashboard-chat-worker` at `/webhooks/line`. Do not set `LINE_WEBHOOK_UPSTREAM_URL`, do not create a second production webhook, and do not point LINE at either staging workers.dev service.

## Preview scope

- Synthetic or redacted images only.
- No production LINE traffic or customer slips.
- No custom production routes.
- Private staging R2 only.
- Queue delivery only inside the isolated staging intake.
- Extractor remains a separate staging service/Container.
- `MMD — Payment Proofs Staging` only.
- `status=pending`, `source=synthetic_isolated` only.
- Redacted HYPE notification only.
- No paid/verified, points, membership, entitlement, booking, or session mutation.

## Required Cloudflare resources

Provision before Queue intake deploy:

```sh
npx wrangler queues create mmd-line-slip-intake-staging
npx wrangler queues create mmd-line-slip-intake-staging-dlq
npx wrangler r2 bucket create mmd-line-slip-evidence-staging
```

These commands create staging resources only. Do not reuse a production R2 evidence bucket for preview.

## Required staging secrets

### Extractor

- `MMD_SLIP_EXTRACTOR_TOKEN`

### Queue intake

- `MMD_SLIP_INTAKE_STAGING_TOKEN`
- `MMD_SLIP_EXTRACTOR_TOKEN`
- `AIRTABLE_API_KEY`
- `AUTH_SERVICE_LINE_TO_TELEGRAM` for the optional redacted HYPE validation path

Do not place secret values in Git, shell command arguments, CI output, screenshots, or GitHub issues.

No production LINE channel token is required by the isolated staging Queue intake.

## Local validation — extractor

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

The existing extraction-library tests under `services/mmd-slip-extractor` must remain green.

## Local validation — Queue intake

From repository root:

```sh
node --check services/mmd-line-slip-intake/cloudflare/worker.mjs
node --experimental-global-webcrypto --test services/mmd-line-slip-intake/cloudflare/test/*.test.mjs
npx wrangler@4 deploy --dry-run --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
```

The focused tests cover bearer enforcement, private R2 metadata, SHA-256 integrity, Queue replay idempotency, pending-only Airtable writes, redacted HYPE alerts, and corrupt-evidence retry.

## Configure extractor staging secret

```sh
cd services/mmd-slip-extractor/cloudflare
npx wrangler whoami
npx wrangler secret put MMD_SLIP_EXTRACTOR_TOKEN --config wrangler.jsonc
```

Wrangler prompts for the value. Do not put it on the command line.

## Deploy extractor staging

```sh
cd services/mmd-slip-extractor/cloudflare
npx wrangler deploy --config wrangler.jsonc
npx wrangler containers list
npx wrangler containers images list
```

Wait for Container readiness before the Queue intake smoke.

## Configure Queue intake staging secrets

From repository root:

```sh
npx wrangler secret put MMD_SLIP_INTAKE_STAGING_TOKEN --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
npx wrangler secret put MMD_SLIP_EXTRACTOR_TOKEN --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
npx wrangler secret put AIRTABLE_API_KEY --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
npx wrangler secret put AUTH_SERVICE_LINE_TO_TELEGRAM --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
```

Each command must use the interactive prompt.

## Deploy Queue intake staging

Only after the Queue, DLQ, private R2, extractor service, and secrets exist:

```sh
npx wrangler deploy --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
```

Confirm the worker remains workers.dev-only with no custom route.

## Synthetic extractor smoke

1. `GET /health` returns 200 from the extractor staging hostname.
2. A generated PromptPay/EMV QR image to `POST /v1/extract/qr` returns evidence only.
3. A synthetic Thai/English slip to `POST /v1/extract/ocr` returns evidence only.
4. Missing bearer returns 401.
5. Oversized request returns 413.
6. Response contains no `paid`, `verified`, membership, points, session, or entitlement field.
7. Logs contain no raw image, OCR text, QR payload, token, or payment data.

## Synthetic Queue intake smoke

Use only a generated or redacted fixture.

1. `GET /health` on `mmd-line-slip-intake-staging` reports `staging`.
2. Unauthenticated `POST /v1/staging/intake` returns 401.
3. Authenticated JPEG/PNG/WebP <= 4 MiB returns 202 with `state=queued`.
4. Response includes only the synthetic `proof_id` and safe `run_id`; it must not expose the private R2 key.
5. Confirm the object is stored in `mmd-line-slip-evidence-staging` with evidence SHA metadata.
6. Confirm Queue consumer verifies object size + SHA before extraction.
7. Confirm extractor receives QR first and OCR fallback when needed.
8. Confirm `MMD — Payment Proofs Staging` receives exactly one row with `status=pending` and `source=synthetic_isolated`.
9. Confirm HYPE payment topic 21 receives only redacted status; payment reference is masked.
10. Replay the same fixture and confirm no second staging proof and no second alert.
11. Corrupt the expected SHA in a synthetic Queue job and confirm retry with no Airtable proof creation.
12. Confirm no payment, membership, points, entitlement, booking, or session mutation occurred.

Record only safe `run_id`, synthetic `proof_id`, workflow/run IDs, and PASS/FAIL outcomes in GitHub. Never paste raw slips, OCR text, tokens, full payment references, LINE user IDs, or private R2 keys.

## Production integration gate

Passing synthetic staging does **not** mean production LINE slip intake is PASS.

A later separate PR may connect `member-dashboard-chat-worker` to a Cloudflare Queue producer only after explicit production approval. That integration must:

- preserve `/webhooks/line` ownership in `member-dashboard-chat-worker`;
- enqueue only after the existing LINE signature verification accepts the request;
- acknowledge LINE promptly without waiting for OCR;
- store originals only in a designated private production R2 bucket;
- create `MMD — Payment Proofs` in pending/review state only;
- keep `payments-worker` as Money Truth;
- keep Telegram/HYPE downstream notification only;
- keep Netlify and `LINE_WEBHOOK_UPSTREAM_URL` retired.

Real LINE E2E must be proven separately after that production path is deployed. Synthetic staging must never be counted as the real-LINE PASS gate.

## Rollback

If Queue staging is unhealthy:

1. Stop sending synthetic intake traffic.
2. Disable or roll back `mmd-line-slip-intake-staging`.
3. Rotate staging bearer secrets if exposure is suspected.
4. Preserve only synthetic evidence needed for debugging.
5. Do not change the production LINE webhook route.
6. Do not mutate production Payments, Membership, Points, Entitlements, Bookings, or Sessions as part of preview rollback.

If the extractor is unhealthy, stop the Queue intake smoke until the extractor staging service is healthy again. Do not bypass extraction by promoting staging evidence into payment truth.

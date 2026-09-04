# MMD LINE Slip Intake — Cloudflare Queue Staging

This is the isolated Queue-backed staging intake for LINE payment-slip evidence.

It does **not** own the production LINE webhook. Production remains owned by `member-dashboard-chat-worker` at `/webhooks/line`, and `LINE_WEBHOOK_UPSTREAM_URL` stays retired/unset.

## Staging flow

```text
synthetic/redacted image
  -> POST /v1/staging/intake
  -> private dev R2
  -> Cloudflare Queue
  -> queue consumer
  -> mmd-slip-extractor-staging (QR then OCR fallback)
  -> MMD — Payment Proofs Staging = pending
  -> redacted HYPE payment alert
```

`payments-worker` remains Money Truth. Nothing in this worker can mark a payment paid/verified, grant entitlement, award points, extend membership, or confirm a session.

## Resource names

The source expects these **staging-only** Cloudflare resources:

- Worker: `mmd-line-slip-intake-staging`
- Queue: `mmd-line-slip-intake-staging`
- DLQ: `mmd-line-slip-intake-staging-dlq`
- Private R2: `mmd-line-slip-evidence-staging`
- Extractor service binding: `mmd-slip-extractor-staging`
- Telegram service binding: `telegram-worker`

The resource names in `wrangler.jsonc` do not prove that the Cloudflare resources already exist. Provisioning and deployed smoke are separate gates.

## Secrets

Configure through Wrangler; never commit values:

- `MMD_SLIP_INTAKE_STAGING_TOKEN` — bearer for `/v1/staging/intake`
- `MMD_SLIP_EXTRACTOR_TOKEN` — staging extractor credential
- `AIRTABLE_API_KEY` — scoped to the existing staging evidence table
- `AUTH_SERVICE_LINE_TO_TELEGRAM` — optional redacted HYPE alert path

No production LINE channel token is used by this staging intake.

## Airtable boundary

This worker writes only to the existing isolated table:

- Base: `appsV1ILPRfIjkaYg`
- Table: `MMD — Payment Proofs Staging` (`tbl9Y6IMM4EWYjIBJ`)
- `status`: `pending` only
- `source`: `synthetic_isolated` only

The Airtable note stores only redacted extraction-state metadata. It does not persist a full payment reference, OCR text, payer name, or payment decision.

## Idempotency

`proof_id` is deterministic from SHA-256 of the synthetic fixture:

```text
syn_<first 24 hex chars of evidence sha256>
```

The consumer checks the staging table before extraction/write. The staging Queue is also configured with one consumer concurrency and sequential message handling so duplicate delivery does not fan out concurrent writes during preview.

R2 evidence SHA-256 and byte size are rechecked before extraction. Integrity mismatch retries and never creates a pending proof.

## Validation

```sh
node --check services/mmd-line-slip-intake/cloudflare/worker.mjs
node --experimental-global-webcrypto --test services/mmd-line-slip-intake/cloudflare/test/*.test.mjs
npx wrangler@4 deploy --dry-run --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
```

## Provisioning gate

Before staging deploy:

```sh
npx wrangler queues create mmd-line-slip-intake-staging
npx wrangler queues create mmd-line-slip-intake-staging-dlq
npx wrangler r2 bucket create mmd-line-slip-evidence-staging
```

Then configure the secrets and deploy only the staging worker. Do not add a custom domain or production LINE route.

## Synthetic smoke acceptance

1. `GET /health` reports staging.
2. Unauthenticated intake returns 401.
3. JPEG/PNG/WebP fixture <= 4 MiB returns 202 `queued`.
4. The response exposes only `proof_id` + `run_id`; never private R2 key.
5. Queue consumer verifies R2 SHA/size.
6. Extractor runs QR first, OCR fallback when QR has no transaction reference.
7. Airtable staging row is `pending` + `synthetic_isolated` only.
8. HYPE alert is redacted and goes to payment topic 21.
9. Duplicate fixture does not create a second staging proof or second alert.
10. No `paid`, `verified`, entitlement, points, membership, or session mutation occurs.

Only after this isolated staging smoke passes should a separate production integration connect the verified `member-dashboard-chat-worker` LINE webhook to a Queue producer. That later PR must enqueue only after LINE signature verification and must retain the existing webhook owner.

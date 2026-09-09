# LINE OFC Slip Intake Canonical Architecture

## Authority and current state

The production LINE route remains owned by the Cloudflare `member-dashboard-chat-worker` at `/webhooks/line`. `LINE_WEBHOOK_UPSTREAM_URL` is retired and must remain unset. Netlify functions and configuration in older commits are historical only and are not deployment targets.

`payments-worker` remains Money Truth. A slip is supporting evidence only. QR/OCR extraction cannot mark paid or verified, award points, extend membership, confirm sessions, or grant entitlements.

Current approval state:

- Technical privacy review: PASS
- Privacy/DPA for Cloudflare preview: PASS
- Cloudflare processor/DPA acceptance for the locked preview scope: APPROVED
- Preview source implementation authorization: PASS
- Production LINE integration approval: PENDING

## Preview topology

The Cloudflare preview is split into two isolated services.

### Extraction service

```text
synthetic/redacted image
  -> authenticated mmd-slip-extractor-staging Worker
  -> private Container binding
  -> local QR or OCR
  -> normalized extraction evidence only
```

The extractor source lives under `services/mmd-slip-extractor/cloudflare`. It is workers.dev-only with no custom production route. It authenticates the caller, enforces staging scope, removes the bearer token before Container forwarding, and runs the existing provider-neutral extraction library with `sharp`, `jsQR`, Tesseract.js, and packaged Thai/English language data. Container outbound internet access is disabled.

Do not infer deployment readiness from source presence. Actual Cloudflare deployment, secret readiness, Container health, and remote smoke must be proven separately.

### Queue-backed intake service

```text
synthetic/redacted image
  -> authenticated mmd-line-slip-intake-staging Worker
  -> private dev R2
  -> mmd-line-slip-intake-staging Queue
  -> sequential Queue consumer
  -> mmd-slip-extractor-staging service binding
  -> MMD — Payment Proofs Staging = pending
  -> redacted HYPE payment alert
```

The Queue intake source lives under `services/mmd-line-slip-intake/cloudflare`.

Its preview boundary is locked to:

- synthetic or redacted images only;
- workers.dev only, no custom route;
- private staging R2 only;
- `MMD — Payment Proofs Staging` only;
- staging `source=synthetic_isolated` and `status=pending` only;
- deterministic SHA-256 proof IDs and duplicate-safe replay checks;
- R2 byte-size and SHA-256 verification before extraction;
- QR first, OCR fallback when QR does not provide a transaction reference;
- redacted HYPE alert only;
- no production LINE channel token;
- no payment, membership, points, entitlement, booking, or session mutation.

## Public preview contracts

### Extractor

- `GET /health` checks service state only.
- `POST /v1/extract/qr` requires the staging extractor bearer secret and accepts JPEG, PNG, or WebP.
- `POST /v1/extract/ocr` requires the staging extractor bearer secret and accepts JPEG, PNG, or WebP.
- Binary input is capped at four MiB.
- Responses include normalized evidence fields and no payment decision field.
- Errors use stable codes and `cache-control: no-store`.

### Queue intake

- `GET /health` returns staging service state only.
- `POST /v1/staging/intake` requires its own staging bearer secret.
- JPEG, PNG, or WebP only, maximum four MiB.
- Success returns `202 queued` with a synthetic proof ID and run ID only.
- The response must never expose the private R2 key, OCR text, decoded QR payload, Airtable record ID, or payment decision.
- The Queue consumer rechecks evidence integrity before it calls extraction.
- Invalid/corrupt evidence retries and cannot create a pending proof.

## Isolation and data handling

- Raw images are persisted only in the designated private staging R2 bucket by the Queue intake layer.
- The extractor itself has no R2, LINE, Airtable, Telegram, payment, membership, points, session, or entitlement binding.
- Raw images, OCR text, decoded QR payloads, tokens, and normalized payment fields are not logged.
- The staging Airtable row stores evidence metadata and redacted extraction-state metadata only.
- HYPE/Telegram remains downstream notification and receives a masked payment reference at most.
- Queue delivery is at-least-once; the staging proof ID is deterministic from evidence SHA-256 and the consumer checks existing staging evidence before extracting/writing/alerting again.

## Production integration boundary

The Queue-backed staging worker is **not** the production LINE webhook owner and must not be pointed to by LINE Developers.

The production integration is a later, separate gate. It must preserve `member-dashboard-chat-worker` as `/webhooks/line` owner and enqueue only after the existing LINE signature-verification path accepts the request. The webhook must not wait for OCR.

The later production design is:

```text
real LINE image event
  -> member-dashboard-chat-worker verifies LINE signature
  -> payment-context detector
  -> Queue producer (minimal internal identifiers only)
  -> Queue consumer
  -> private production R2 evidence
  -> QR/OCR evidence extraction
  -> MMD — Payment Proofs = pending/review
  -> HYPE payment alert
  -> official verification / payments-worker
  -> Payment verified alert
  -> canonical downstream entitlement/points paths only after official verification
```

Production integration must never:

- re-enable Netlify;
- set `LINE_WEBHOOK_UPSTREAM_URL`;
- create a second LINE webhook owner;
- acknowledge `paid` or `verified` from a slip, QR, OCR, Telegram message, or Queue state;
- let image evidence directly mutate entitlement, points, membership, booking, or session truth.

## Gates before production integration

1. Provision the staging Queue, DLQ, and private dev R2 with the names in the Queue intake config.
2. Configure staging-only secrets without reusing browser/customer credentials.
3. Prove extractor health + QR/OCR synthetic smoke.
4. Prove synthetic intake -> dev R2 -> Queue -> extractor -> pending staging proof.
5. Prove replay idempotency and corrupt-evidence retry behavior.
6. Prove redacted HYPE payment-topic notification.
7. Record safe request/run IDs only; do not put raw slips or payment references in GitHub.
8. Obtain explicit production integration approval.
9. Implement the production Queue producer only after step 8.
10. Run a real LINE E2E only after the production path is deployed and separately approved.

No synthetic staging run counts as proof that real production LINE slip intake has passed.

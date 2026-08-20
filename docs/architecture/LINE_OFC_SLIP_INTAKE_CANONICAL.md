# LINE OFC Slip Intake Canonical Architecture

## Authority and current state

The production LINE route remains owned by the Cloudflare `member-dashboard-chat-worker` at `/webhooks/line`. Netlify functions and configuration in older commits are historical only and are not deployment targets.

`payments-worker` remains Money Truth. A slip is supporting evidence only. QR/OCR extraction cannot mark paid or verified, award points, extend membership, confirm sessions, or grant entitlements.

Current approval state:

- Technical privacy review: PASS
- Privacy/DPA for Cloudflare preview: PASS
- Cloudflare processor/DPA acceptance for the locked preview scope: APPROVED
- Preview deployment authorization: PASS
- Production deployment approval: PENDING

## Preview topology

```text
synthetic/redacted image
  -> authenticated HTTPS request
  -> mmd-slip-extractor-staging Worker
  -> private Container binding
  -> local QR or OCR
  -> normalized extraction evidence only
```

The staging Worker is deployed on its workers.dev hostname with no custom routes. It authenticates the caller, enforces the staging scope, filters routes and request metadata, removes the bearer token, and proxies to one Container instance.

The Container runs the existing `services/mmd-slip-extractor/lib/extractor.mjs` implementation with `sharp`, `jsQR`, Tesseract.js, and packaged Thai/English language data. Container outbound internet access is disabled.

## Public contract

- `GET /health` checks the Worker-to-Container path and exposes service state only.
- `POST /v1/extract/qr` requires the staging bearer secret and accepts JPEG, PNG, or WebP.
- `POST /v1/extract/ocr` requires the staging bearer secret and accepts JPEG, PNG, or WebP.
- Binary input is capped at four MiB.
- Responses include normalized evidence fields and no payment decision field.
- Errors use stable codes and `cache-control: no-store`.

## Isolation and data handling

- Synthetic or redacted preview fixtures only.
- The extractor does not persist raw images.
- The extractor has no R2 binding. Dev R2 belongs to the future isolated staging intake layer, not the extraction service.
- The extractor has no LINE, Airtable, Telegram, payment, membership, points, session, or entitlement credentials or bindings.
- Raw images, OCR text, decoded QR payloads, tokens, and normalized payment fields are not logged.
- Telegram notification payloads remain outside the extractor and must be redacted by the future staging intake layer.

## Production integration boundary

This staging extractor is not wired into `member-dashboard-chat-worker` and does not receive production LINE traffic. A later integration PR must preserve the current production webhook owner, use a Cloudflare service binding or another explicitly approved private path, store originals only in the designated private R2 bucket, and create pending/review evidence only.

Production integration requires:

1. Cloudflare staging deployment and health readiness.
2. Staging-only secret configuration.
3. Synthetic QR and OCR smoke results.
4. Dev R2 intake path and idempotency verification.
5. Redacted Telegram Ops validation.
6. Explicit production deployment approval.

There is no `paid` or `verified` transition in the extractor.

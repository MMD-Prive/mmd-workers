# LINE OFC Slip Intake Runbook

## Deployment status

Deployment is pending. This PR does not deploy, publish, merge, change routes, create an R2 bucket, or configure secrets.

## Required environment

Existing LINE/Airtable configuration:

```text
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
AIRTABLE_API_KEY (or AIRTABLE_TOKEN)
AIRTABLE_BASE_ID
AIRTABLE_SYNC_TABLE
```

P0 evidence configuration:

```text
AIRTABLE_TABLE_PAYMENT_PROOFS=MMD — Payment Proofs
AIRTABLE_TABLE_MEMBERS=Members
AIRTABLE_TABLE_SESSIONS=Sessions
AIRTABLE_TABLE_PAYMENTS=Payments
AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS=MMD — LIFF Renewal Sessions
LINE_SLIP_MAX_IMAGE_BYTES=10485760
LINE_SLIP_CONFIDENCE_THRESHOLD=0.85
```

Private R2 S3 configuration for the Netlify Function:

```text
CLOUDFLARE_ACCOUNT_ID
LINE_SLIP_R2_ACCESS_KEY_ID
LINE_SLIP_R2_SECRET_ACCESS_KEY
LINE_SLIP_R2_BUCKET
```

Use bucket-scoped credentials with object read/write limited to the private slip-evidence bucket. Do not configure a public bucket domain.

Replaceable extraction adapters:

```text
LINE_SLIP_QR_EXTRACTOR_URL
LINE_SLIP_OCR_EXTRACTOR_URL
LINE_SLIP_EXTRACTOR_TOKEN
```

QR is always attempted first. OCR runs only when QR returns no useful fields. If either adapter is missing or confidence is below the threshold, the proof remains review-only.

The MMD-controlled implementation lives at `services/mmd-slip-extractor`. Deploy it as a separate Netlify project with that directory as the project base. Configure only:

```text
MMD_SLIP_EXTRACTOR_TOKEN
MMD_SLIP_EXTRACTOR_MAX_BYTES=4194304
```

Use distinct production and preview tokens. Configure the webhook adapter URLs as the separate extractor project's `/v1/extract/qr` and `/v1/extract/ocr` routes. The service performs local QR and Thai/English OCR without runtime image persistence or third-party OCR submission. Complete the external DPA/processor acceptance recorded in its privacy review before production use.

Telegram Ops:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_OPS_CHAT_ID
```

## Pre-deployment checks

1. Confirm the LINE webhook still targets the existing authoritative Netlify function through the established route.
2. Confirm all required secret names exist without printing values.
3. Confirm the R2 bucket is private and the credentials are bucket-scoped.
4. Confirm `MMD — Payment Proofs` retains the documented fields and `pending` status choice.
   Confirm `channel` accepts the intake-source value `line_ofc`; provider and sender/receiver bank details remain inside internal `note` metadata.
5. Confirm QR/OCR adapters accept only authenticated server-side requests.
6. Confirm the extractor deploy log applies the in-code 30-request-per-minute, per-IP-and-domain rate limit.
7. Run:

```sh
node --test immigrate-worker/netlify/tests/webhook-slip-intake.test.mjs
node immigrate-worker/netlify/tests/webhook-faq-intent.test.mjs
node --check immigrate-worker/netlify/functions/webhook.js
node --check immigrate-worker/netlify/functions/line-payment-slip-intake.mjs
git diff --check
```

## Manual review

Review is mandatory when download/storage fails, extraction is unavailable or low-confidence, SHA/payment reference is duplicated, or deterministic links are absent/ambiguous. Compare the private original against official bank/payment truth. Do not use OCR text as approval evidence.

P0 writes a pending-only handoff contract inside the Payment Proof note. It does not call the paid/verified payments endpoint. A later authorized phase must define an authenticated pending-evidence endpoint or callback before automatic verification delivery is enabled.

The Payment Proof `channel` records intake source, so LINE OA evidence uses `line_ofc`. Payment provider and sender/receiver bank details remain internal `note` metadata. The entire `note` is internal-only and must never be serialized by customer-facing or frontend APIs.

## Replay behavior

- Replayed `webhookEventId` with the same image message returns the existing deterministic proof.
- Replayed `message.id` never downloads or writes the evidence again.
- Duplicate SHA or payment reference creates a separate pending evidence record flagged for review; it never patches the earlier proof/payment.

## Telegram failure

Telegram delivery is best effort. Failure is returned in the internal intake result but cannot alter pending evidence or trigger payment, membership, points, entitlement, or session changes.

## Rollback

Rollback the Netlify function to the previous known-good commit. Existing pending Payment Proof rows and private R2 objects are evidence and must not be deleted automatically. Disable automatic classification by unsetting the extraction adapter URLs while retaining the existing generic image path.

## Deployment command

After separate production approval and environment verification:

```sh
cd immigrate-worker && npx netlify deploy --prod
```

Do not run this command as part of this PR.

Deploy the extractor independently from `services/mmd-slip-extractor`; do not point the LINE webhook at a preview URL. A deploy preview must use its own bearer token and synthetic images only.

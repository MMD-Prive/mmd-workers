# LINE OFC Slip Intake Canonical Architecture

## Authority and scope

The public production route remains owned by `member-dashboard-chat-worker`. After verifying the LINE signature, that Worker delegates the unchanged signed body to the authoritative application handler at `immigrate-worker/netlify/functions/webhook.js`. P0 does not add a second public webhook or change a production route.

`payments-worker` remains Money Truth. Image extraction creates pending evidence only. It cannot mark a payment paid or verified, award points, extend membership, grant entitlements, or confirm a session.

## Flow

1. The existing handler verifies `x-line-signature` and parses the webhook body.
2. Existing intent and profile lookup behavior runs unchanged.
3. For image events only, up to 20 Console Inbox records for the same LINE identity created within the last 15 minutes are inspected. The Airtable formula uses the existing `line_user_id` field plus `CREATED_TIME()`; nested `payload_json.received_at` is used for ordering when present, with Airtable record `createdTime` as the safe fallback. No schema migration is required.
4. The production route owner (`member-dashboard-chat-worker`) verifies the LINE signature and delegates the unchanged signed body to the authoritative Netlify webhook over HTTPS when `LINE_WEBHOOK_UPSTREAM_URL` is configured. Upstream failures return a retryable error; they do not fall through to a second intake path.
5. `looksLikePaymentSlipContext()` requires explicit payment-slip language. Unclassified images continue through existing generic image/pricing behavior.
6. The original image is downloaded from LINE, with HTTP, MIME, byte-limit, and non-empty checks.
7. SHA-256 is computed before storage.
8. The original is stored privately in Cloudflare R2.
9. A replaceable adapter attempts QR extraction first, then OCR.
10. Amounts are usable only when finite, strictly positive, at most `LINE_SLIP_MAX_AMOUNT_THB`, and normalized to two-decimal currency precision. Invalid amounts become `null` and cannot clear review or enter amount-based linking.
11. Missing or low-confidence extraction remains `review_required`.
12. One pending record is created in `MMD — Payment Proofs`.
13. Exact Airtable matches are linked only when unique. Multiple matches or no deterministic link force review.
14. Telegram Ops receives a masked operational summary. Telegram failure cannot change evidence state.
15. LINE receives the normal receipt acknowledgement only after private storage and Payment Proof persistence succeed, or an existing idempotent proof is confirmed. Download, storage, or evidence-persistence failure receives the retry/manual-review message and never claims durable receipt. P0 never sends a verified reply.

## MMD-controlled extractor

`services/mmd-slip-extractor` is a separately deployed, stateless Netlify Function service. It exposes `GET /health`, `POST /v1/extract/qr`, and `POST /v1/extract/ocr`. Extraction routes require a dedicated bearer token, accept only JPEG/PNG/WebP within the configured four-megabyte binary limit, and use Netlify path rate limiting.

QR decoding uses local image decoding plus `jsQR`, followed by a narrow EMV/PromptPay parser. OCR fallback uses local Tesseract.js execution with packaged Thai and English language data. Images are not sent to an OCR vendor, stored, cached, logged, or used for training. The extractor returns normalized evidence only and has no payment, Airtable, R2, LINE, member, points, or session authority.

The implementation privacy review is documented in `services/mmd-slip-extractor/PRIVACY.md`. Netlify and Cloudflare remain infrastructure subprocessors; final organizational acceptance of the applicable service terms or DPA is an external approval gate.

## Airtable mapping

No Airtable schema mutation is performed by this PR. Existing fields are reused:

| Existing field | P0 value |
| --- | --- |
| `proof_id` | Deterministic `line_` plus SHA-256 prefix of `message.id` |
| `payer_name` | Extracted payer name when available |
| `amount_thb` | Extracted amount when available |
| `paid_at` | Extracted transfer date when valid |
| `channel` | Intake source; LINE OA evidence always uses `line_ofc` |
| `payment_ref` | Extracted provider reference |
| `note` | Internal JSON metadata described below |
| `status` | Always `pending` |
| `member`, `session`, `payment` | Unique exact record links only |
| `MMD — LIFF Renewal Sessions` | Unique exact renewal-session link only |
| `campaign_claim_id` | Extracted deterministic value when supplied |

The existing internal `note` stores the missing narrow metadata without exposing it to browsers: payment provider, sender/receiver bank, hashed LINE identity, LINE message ID, webhook event ID, private R2 key, evidence SHA-256, MIME type, byte size, extraction method/confidence/error, duplicate state, redacted event reference, deterministic-link result, and the pending-only payments handoff contract. Provider and bank values describe the payment rail; they do not replace the `line_ofc` intake-source channel.

`note` is internal-only. Customer-facing and frontend APIs must never serialize or return it.

## Idempotency and duplicates

- `proof_id` is deterministic from LINE `message.id`; webhook retries and duplicate message delivery return the existing proof without downloading or writing again.
- SHA reuse is detected by the SHA stored in the internal note.
- Payment-reference reuse is detected against other Payment Proof rows.
- Duplicate SHA/reference never overwrites an existing record and always requires review.
- Existing verified proof/payment records are never patched by this intake.
- Airtable does not enforce uniqueness; application-level checks remain required and concurrent first deliveries remain a known limitation.

## Private R2 policy

The Netlify Function cannot receive a native Cloudflare Worker binding. It uses R2's private S3-compatible endpoint with scoped credentials. Object keys are:

```text
line-ofc/payment-proofs/YYYY/MM/{proof_id}/original.{ext}
```

The R2 bucket has no public URL. The key is internal metadata only and is never returned in the webhook response or LINE/Telegram message.

## State machine

```text
image candidate
  -> download/storage/evidence-persistence failure -> retry_required
  -> stored -> QR -> OCR fallback -> pending or review_required
  -> duplicate/ambiguous/low confidence -> review_required
  -> pending handoff contract -> payments-worker verification in a later authorized phase
```

There is no `paid` or `verified` transition in P0.

If the LINE reply API fails after evidence processing, the webhook returns a retryable error and records only a redacted operational event. Tokens, raw bytes, private keys, object keys, and full payment references are never logged.

## Privacy rules

- Never log or persist LINE, Airtable, Telegram, R2, or extractor tokens.
- Hash LINE identity in Payment Proof metadata.
- Keep raw binaries private in R2.
- Telegram uses a masked payment reference and excludes the private object key.
- Never expose Airtable record IDs, internal links, or extraction payloads to the LINE user.
- Never log extractor request bodies, decoded QR payloads, OCR text, or normalized payment fields.
- Keep production and preview extractor bearer tokens distinct and stored only in their corresponding Netlify contexts.

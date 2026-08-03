# LINE OFC Slip Intake Canonical Architecture

## Authority and scope

The authoritative LINE Official Account webhook is `immigrate-worker/netlify/functions/webhook.js`. P0 extends that handler; it does not add a second webhook or change a production route.

`payments-worker` remains Money Truth. Image extraction creates pending evidence only. It cannot mark a payment paid or verified, award points, extend membership, grant entitlements, or confirm a session.

## Flow

1. The existing handler verifies `x-line-signature` and parses the webhook body.
2. Existing intent and profile lookup behavior runs unchanged.
3. For image events only, recent Console Inbox text for the same LINE identity is inspected.
4. `looksLikePaymentSlipContext()` requires explicit payment-slip language. Unclassified images continue through existing generic image/pricing behavior.
5. The original image is downloaded from LINE, with HTTP, MIME, byte-limit, and non-empty checks.
6. SHA-256 is computed before storage.
7. The original is stored privately in Cloudflare R2.
8. A replaceable adapter attempts QR extraction first, then OCR.
9. Missing or low-confidence extraction remains `review_required`.
10. One pending record is created in `MMD — Payment Proofs`.
11. Exact Airtable matches are linked only when unique. Multiple matches remove all proposed links and force review.
12. Telegram Ops receives a masked operational summary. Telegram failure cannot change evidence state.
13. LINE receives a pending-review acknowledgement. P0 never sends a verified reply.

## Airtable mapping

No Airtable schema mutation is performed by this PR. Existing fields are reused:

| Existing field | P0 value |
| --- | --- |
| `proof_id` | Deterministic `line_` plus SHA-256 prefix of `message.id` |
| `payer_name` | Extracted payer name when available |
| `amount_thb` | Extracted amount when available |
| `paid_at` | Extracted transfer date when valid |
| `channel` | Existing `promptpay` or `bank_transfer` choice |
| `payment_ref` | Extracted provider reference |
| `note` | Internal JSON metadata described below |
| `status` | Always `pending` |
| `member`, `session`, `payment` | Unique exact record links only |
| `MMD — LIFF Renewal Sessions` | Unique exact renewal-session link only |
| `campaign_claim_id` | Extracted deterministic value when supplied |

The existing internal `note` stores the missing narrow metadata without exposing it to browsers: hashed LINE identity, LINE message ID, webhook event ID, private R2 key, evidence SHA-256, MIME type, byte size, extraction method/confidence/error, duplicate state, redacted event reference, deterministic-link result, and the pending-only payments handoff contract.

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
  -> download/storage failure -> manual_review
  -> stored -> QR -> OCR fallback -> pending or review_required
  -> duplicate/ambiguous/low confidence -> review_required
  -> pending handoff contract -> payments-worker verification in a later authorized phase
```

There is no `paid` or `verified` transition in P0.

## Privacy rules

- Never log or persist LINE, Airtable, Telegram, R2, or extractor tokens.
- Hash LINE identity in Payment Proof metadata.
- Keep raw binaries private in R2.
- Telegram uses a masked payment reference and excludes the private object key.
- Never expose Airtable record IDs, internal links, or extraction payloads to the LINE user.


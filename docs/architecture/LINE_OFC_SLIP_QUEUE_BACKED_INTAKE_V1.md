# LINE OFC Slip Intake — Queue-backed Cloudflare Integration V1

Status: **source implemented for isolated staging; production rollout disabled**

Related authority: Issue #317, PR #318 (Cloudflare staging extractor), PR #578 (HYPE payment alerts).

## Canon

```text
LINE webhook
  -> member-dashboard-chat-worker verifies LINE signature and keeps normal reply path
  -> accepted image event -> minimal Queue envelope (staging only)
  -> mmd-line-slip-intake-staging consumer
  -> resolve existing MMD — Console Inbox evidence by LINE message id
  -> inspect recent payment/image context
  -> transient QR/OCR through mmd-slip-extractor-staging
  -> only classified payment evidence -> private staging R2
  -> MMD — Payment Proofs status=pending/review
  -> redacted HYPE payment alert
  -> official payment verification later
  -> payments-worker remains Money Truth
```

A slip, QR decode, OCR result, Queue message, R2 object, Airtable Payment Proof, or Telegram/HYPE message is **evidence only**. None may mark money paid/verified, award Points, extend Membership, grant entitlement, or confirm a Session.

## Production route ownership

`member-dashboard-chat-worker` remains the sole LINE production route owner at `/webhooks/line`.

`LINE_WEBHOOK_UPSTREAM_URL` remains retired and must stay unset. This design does not proxy signed LINE events to Netlify or another webhook owner.

The active front-gate entrypoint contains the Queue producer wrapper, but the production switch is committed as:

```text
LINE_SLIP_QUEUE_ENABLED=false
```

There is intentionally **no production Queue producer binding** in this version. Therefore a normal production deploy cannot start sending customer images to the Queue merely because this source is merged.

## Staging-only Queue producer

The named `member-dashboard-chat-worker` staging environment may bind:

```text
LINE_SLIP_INTAKE_QUEUE -> mmd-line-slip-intake-staging
LINE_SLIP_QUEUE_ENABLED=true
```

The producer runs only after the existing signed LINE webhook owner returns an accepted response. It emits a bounded minimal envelope:

```json
{
  "schema": "line_slip_intake_queue_v1",
  "line_event_id": "<LINE message id>",
  "message_id": "<LINE message id>",
  "webhook_event_id": "<LINE webhook event id when present>",
  "enqueued_at": "<ISO timestamp>"
}
```

The Queue payload deliberately excludes:

- raw LINE user id
- reply token
- LINE profile/display name
- message text
- image bytes
- payment amount/reference
- Membership/Points/entitlement state

The consumer resolves the already-authorized Console Inbox record using the stable LINE message id. Because the core webhook may persist Console Inbox work through `waitUntil`, a Queue delivery can race that write; `console_inbox_event_missing` is retryable and must never be interpreted as no customer/payment history.

## Staging consumer

Worker: `mmd-line-slip-intake-staging`

Staging resources:

- Queue: `mmd-line-slip-intake-staging`
- DLQ: `mmd-line-slip-intake-staging-dlq`
- private R2: `mmd-line-slip-evidence-staging`
- extractor service binding: `mmd-slip-extractor-staging`
- HYPE service binding: `telegram-worker`

The Worker has no custom production route. Queue processing is guarded by `MMD_RUNTIME_SCOPE=staging`.

### Classification and retention

Every accepted LINE image can become a Queue candidate in staging, but it is not automatically retained as a payment slip.

The consumer:

1. resolves the same LINE message in `MMD — Console Inbox`;
2. reads recent context for that LINE user;
3. immediately ignores clear model/profile-image context;
4. transiently downloads the LINE image;
5. runs QR/OCR evidence extraction;
6. requires payment context, or strong payment extraction when context is absent;
7. only then writes the original image to the dedicated private staging R2 bucket.

A clearly non-payment image is not written to slip R2 or `MMD — Payment Proofs`.

### Durable payment evidence

A classified payment image is stored under a private key shaped as:

```text
line-ofc/payment-proofs/YYYY/MM/<proof_id>/original.<ext>
```

The resulting Payment Proof remains:

```text
channel = line_ofc
status = pending
```

The internal note records a SHA-256 evidence digest, private R2 key, extraction metadata, duplicate state, hashed LINE user id, and a fail-closed `payments_worker_handoff` contract. Raw LINE user id is not copied into that note.

### Idempotency

- `proof_id` is derived deterministically from the LINE message id.
- Existing proof replay does not download/store/create the evidence again.
- Evidence SHA and payment reference are checked for duplicates.
- HYPE delivery state is stored in the proof note; Queue retry sends the alert only when it has not been recorded as sent.
- Queue failure retries; exhausted messages go to the staging DLQ.

## Extraction boundary

`mmd-slip-extractor-staging` is still an evidence extractor only. The Queue consumer calls it through a Cloudflare service binding with the staging extractor bearer credential.

QR is not sufficient merely because a PromptPay request QR contains an amount. QR-first acceptance requires transaction-reference evidence; otherwise OCR is attempted.

The extractor is never given payment authority and exposes no paid/verified decision field.

## HYPE boundary

Payment Proof alerts use the existing `telegram-worker` internal send contract and `AUTH_SERVICE_LINE_TO_TELEGRAM`, targeting the canonical payment thread.

Alert content is redacted: full payment reference and LINE user id must not be sent. Telegram/HYPE remains downstream notification only.

In the staging contract, required HYPE delivery failure causes Queue retry. Because the Payment Proof is idempotent, a retry cannot create a second proof merely to retry the alert.

## Customer acknowledgement

This staging integration intentionally does **not** add a new asynchronous LINE customer Push/Reply acknowledgement.

A future production acknowledgement must not say that MMD durably received the slip until private evidence persistence and Payment Proof creation have succeeded. Reply tokens may expire before asynchronous processing completes, so a future production design should use a separately reviewed customer Push path or another safe status surface after durable persistence.

## Required gates before production enablement

Production remains **PENDING**. Do not set the production Queue switch true or add a production Queue producer binding until all of these are proven:

1. Queue, DLQ, and private R2 staging resources exist in the approved Cloudflare account.
2. `mmd-slip-extractor-staging` is deployed/healthy with its staging-only secret.
3. Queue consumer syntax/tests and Wrangler dry-run pass.
4. Synthetic/redacted end-to-end staging smoke passes:
   `synthetic event -> Queue -> context -> extractor -> private R2 -> pending proof -> redacted HYPE`.
5. Duplicate, non-payment image, extraction failure, Airtable failure, HYPE failure, and Queue retry/DLQ behavior remain fail closed.
6. No staging path can create `paid` / `verified`, Points, Membership, entitlement, or Session confirmation.
7. A separate explicit production deployment approval is given.
8. After production approval, run a bounded real-LINE proof and confirm official verification remains the only transition to payment truth.

Synthetic staging is evidence for the staging gate only; it does not prove real-LINE production E2E.

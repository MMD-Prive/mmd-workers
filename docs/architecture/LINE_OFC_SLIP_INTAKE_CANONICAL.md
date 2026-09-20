# LINE OFC Slip Intake Canonical Architecture

## Authority and current state

The production LINE route is owned by Cloudflare `member-dashboard-chat-worker` at `/webhooks/line`. `LINE_WEBHOOK_UPSTREAM_URL` is retired and must remain unset. Older Netlify ingress and the Queue-backed staging intake are not production webhook owners.

`payments-worker` remains Money Truth.

A LINE image, extracted QR payload, OCR result, Payment Proof row, Telegram/HYPE message, or Recovery record is evidence/operational context only. None of those artifacts can independently create payment truth.

Current production state:

- production LINE webhook owner: `member-dashboard-chat-worker`
- production evidence observer: `member-dashboard-chat-worker/src/line-group-ingress-front-gate.js`
- production extractor binding: `SLIP_EXTRACTOR -> mmd-slip-extractor`
- production private evidence bucket: `LINE_SLIP_EVIDENCE -> mmd-line-slip-evidence`
- production Payment Proof store: canonical `MMD — Payment Proofs`
- production Telegram/HYPE delivery: `telegram-worker`
- production Money Truth authority: `payments-worker`

## 2026-09-20 production path lock

The production path is already live. It does not use the Queue-backed staging worker as transport.

### Canonical production sequence

```text
real LINE image event
  -> member-dashboard-chat-worker canonical /webhooks/line handler
  -> canonical LINE signature verification
  -> canonical handler returns a successful response
  -> payment observer runs asynchronously
  -> observer re-verifies x-line-signature
  -> identify eligible direct-user or allowlisted-group image
  -> download image bytes from LINE Content API
  -> QR extraction first
  -> OCR fallback when QR has no usable transaction reference
  -> classifyPaymentImageEvidence()
  -> reject / hold when transaction evidence is insufficient
  -> accepted payment evidence only:
       correlate Canonical Client / Member / Renewal / Session / Job
       persist original to private LINE_SLIP_EVIDENCE R2
       create canonical Payment Proof with status=pending
       split into Service/Job or eligible Membership settlement lane
```

The order above is authoritative. Production classification/extraction happens before the accepted image is persisted as canonical payment evidence in R2.

## Payment image gate

The production observer downloads the LINE image and uses `mmd-slip-extractor` through the `SLIP_EXTRACTOR` service binding.

Extraction order:

1. QR extraction.
2. If QR has no usable transaction reference, OCR fallback.
3. Normalize amount/reference/time/payer/bank/provider signals.
4. Classify the image.

Examples of current classification behavior:

- payment reference + amount -> accepted bank transfer evidence;
- payment reference + transfer signal -> accepted bank transfer evidence;
- amount + time + bank/payer signal -> accepted bank transfer evidence;
- payment-request QR without completed-transfer evidence -> rejected;
- ordinary image with no transaction evidence -> rejected;
- extractor unavailable or insufficient evidence -> held/uncertain.

A rejected or held image is not promoted into canonical Payment Proof truth.

## Held / uncertain evidence lane

A held image is an evidence candidate only. Being held never makes it a Payment Proof and never gives it payment authority.

Implementation: `member-dashboard-chat-worker/src/line-held-evidence-lane.mjs`.

```text
classify -> hold
  -> private held prefix in LINE_SLIP_EVIDENCE
       line-ofc/held-evidence/<proof-id>/original.<ext>
       line-ofc/held-evidence/<proof-id>/state.json
  -> bounded reprocess sweep (LINE traffic + hourly cron)
  -> re-run the SAME extractor / classifier / correlation gates
  -> accepted        -> canonical accepted-evidence gate -> exactly one Payment Proof (pending)
  -> rejected        -> discarded as non-payment evidence
  -> still uncertain -> retry with backoff until the bounded attempt limit
  -> attempts exhausted -> terminal review_required + bounded Ops notice
  -> retention elapsed  -> terminal expired, bytes deleted
```

Rules:

- promotion re-enters `persistAcceptedEvidence()`, the same gate live intake uses. There is no second, weaker classifier;
- there is deliberately no operator "force paid" or manual-promote entry point into this lane;
- promotion is idempotent by proof ID, so a replayed candidate cannot duplicate a canonical Payment Proof;
- held bytes live only in the private evidence bucket under the held prefix. There is no browser-public URL;
- reprocess inputs that identify a customer (LINE user id, the original message id, bounded payment context text) live only inside the private `state.json` body. The audit projection used for logs, receipts and Ops notices carries hashes and bounded codes only;
- retention is bounded: default 72 hours (`LINE_HELD_EVIDENCE_RETENTION_HOURS`, max 168). Terminal markers carry no image and are collected on the same window;
- reprocess attempts are bounded: default 5 (`LINE_HELD_EVIDENCE_MAX_ATTEMPTS`) with exponential backoff;
- a held item can reach `review_required`. It can never reach paid, verified, entitled or Money Truth.

## Direct chat and group behavior

### LINE OA direct chat

A direct-user image may be visually checked immediately. The customer does not always have to send the text "สลิป" first.

The observer may also use recent bounded payment context, and a later payment-related follow-up may promote a recent direct-image candidate through the same evidence gate.

### LINE payment group

Group image intake is allowed only for configured allowlisted payment groups. Group IDs are compared through configured hashes rather than being treated as unrestricted group intake.

## Canonical correlation

After extraction/classification accepts the image, production intelligence attempts to correlate only canonical records belonging to the LINE identity/context:

- Member;
- Client;
- LIFF Renewal Session;
- Session / Job.

Service-payment intelligence may classify a supported payment as:

- `deposit`;
- `final`;
- `full`;
- `tips`;
- unresolved/ambiguous.

If multiple Jobs match closely, the result is ambiguous. The system must not guess a Job.

Membership intelligence remains separate from service-payment matching. Matching a price alone cannot turn an unrelated service/MMS slip into Membership truth.

## R2 evidence persistence

Only accepted payment evidence is written to the production private bucket through `LINE_SLIP_EVIDENCE`.

Canonical object shape:

```text
line-ofc/payment-proofs/YYYY/MM/<proof-id>/original.<ext>
```

The R2 object carries bounded integrity metadata such as evidence SHA-256, proof ID, MIME type/source metadata. Private R2 storage is evidence storage, not payment authority.

## Payment Proof creation

Accepted evidence creates or reuses a canonical Payment Proof.

The first canonical write is:

```text
status = pending
channel = line_ofc
```

The proof may include bounded extracted/correlated data such as:

- amount;
- payment reference;
- paid date;
- payer display;
- linked Member / Client;
- linked Session when exact;
- linked Renewal;
- extraction/classification metadata;
- Job correlation;
- R2 evidence key.

The implementation is duplicate-safe by proof ID.

## Settlement lanes

### A. Service / Job payments

Examples:

- booking deposit;
- final balance;
- full service payment;
- tips;
- ambiguous/unresolved service payment.

These remain review-gated.

```text
Payment Proof pending
  -> HYPE/Ops Payment Confirm
  -> exact/ambiguous/unresolved Job context shown
  -> operator resolves canonical Job when needed
  -> Official Verify
  -> payments-worker
  -> Money Truth
```

HYPE/Ops must not infer paid status from the slip, message text, Job state, or extracted QR/OCR result.

### B. Eligible Membership renewal settlement

Production has an explicit Membership exception governed by owner policy `membership_slip_simple_accept_v1`.

The Payment Proof is still created as `pending` first.

If the Membership evidence has the required canonical context, the observer may call:

```text
payments-worker
POST /v1/internal/payments/reviewed-proof
source = line_ofc_payment_ingress
payment_stage = membership
```

The call is service-authenticated and restricted by `payments-worker` to the LINE OFC Membership settlement lane.

The current gate requires the bounded Membership context needed by the implementation, including positive amount and non-conflicting Membership classification plus resolvable canonical identity/package context. `payments-worker` revalidates the proof reference, amount, proof record, package and applicable canonical Member/Client/Renewal/LINE relationships before accepting Money Truth.

If canonical Membership materialization succeeds:

```text
payments-worker verifies canonical payment
  -> materialize/update entitlement as applicable
  -> update canonical renewal/member state
  -> Payment Proof status = verified
  -> HYPE/Ops receives verified/materialized status
```

If the required canonical context is incomplete or settlement fails closed:

```text
Payment Proof -> review_required
```

This exception does not give HYPE, OCR, R2, or the LINE observer independent Money Truth authority. The final authoritative write still occurs in `payments-worker`.

## HYPE / Telegram role

HYPE is operational notification and review assistance, not payment authority.

Current production routing uses `telegram-worker` and separates bounded topics, including:

- Membership payment activity -> Membership topic;
- ordinary service payment proof -> Payment Confirm topic;
- classification conflict -> Alerts topic.

The notification may include bounded canonical Job context and may distinguish exact vs ambiguous matching. It must not convert evidence into paid status.

### Durable Ops delivery

Implementation: `member-dashboard-chat-worker/src/line-ops-notification-outbox.mjs`.

Operator notification is durable, not best-effort logging:

```text
render bounded Ops message
  -> persist outbox record (pending_delivery) in the private evidence bucket
  -> attempt delivery through telegram-worker
  -> delivered
     or retryable -> exponential backoff -> retry sweep -> delivered
     or failed_terminal after the bounded attempt limit
```

Rules:

- the record is persisted **before** the first send attempt, so a Telegram outage leaves a recoverable delivery instead of a log line;
- identity is `sha256(proof/event id + destination chat/thread + notification purpose)`. R2 conditional writes provide a CAS delivery lease, suppressing concurrent duplicate observers and ordinary redelivery/replay of the same semantic event;
- the outbox stores the already-rendered message. A retry can therefore only re-send an operator notice. It can never re-run settlement, re-create a Payment Proof, call `payments-worker`, or mutate canonical truth;
- successful settlement is never rolled back because notification failed, and a failed notification never blocks the canonical pending Payment Proof;
- `telegram-worker` remains the Telegram route owner. The outbox only requests a send through the trusted service binding;
- the Service/Job review alert and the Membership settlement outcome are distinct notification purposes. Transport is intentionally **at-least-once**: the CAS lease suppresses concurrent duplicate sends, but a worker crash after Telegram accepts a message and before the delivered receipt is persisted can still produce a retry duplicate. This ambiguity never re-runs payment settlement;
- the retry sweep runs on live LINE traffic and on the existing hourly cron, so recovery still happens when LINE is quiet;
- delivery receipts carry bounded metadata only (`schema`, `status`, `purpose`, `attempts`). A delivery receipt is never payment verification.

## Privacy and fail-closed rules

Production must preserve all of the following:

- raw LINE identity is not copied into customer-facing HYPE messages;
- payment classification ambiguity stays ambiguous;
- foreign or unresolved canonical records are not guessed;
- a Payment Proof cannot become verified before the authoritative payment write succeeds;
- service/job evidence stays review-gated;
- Membership auto-settlement is restricted to the explicit owner-policy + payments-worker validation path;
- Points, Booking/Session truth, Model assignment and unrelated entitlement truth are not mutated by image extraction itself.

## Synthetic Queue staging harness

The Queue-backed intake under `services/mmd-line-slip-intake/cloudflare` remains an isolated synthetic/redacted staging harness.

Its flow is intentionally different from production:

```text
synthetic/redacted image
  -> mmd-line-slip-intake-staging
  -> private staging R2
  -> staging Queue
  -> sequential consumer
  -> mmd-slip-extractor-staging
  -> MMD — Payment Proofs Staging = pending
  -> redacted HYPE staging alert
```

Staging remains limited to:

- synthetic/redacted images;
- workers.dev-only staging endpoints;
- staging R2/Queue/DLQ;
- `MMD — Payment Proofs Staging`;
- `source=synthetic_isolated`;
- no production LINE webhook ownership;
- no production Money Truth mutation.

A synthetic staging PASS never substitutes for real production LINE acceptance.

## Production verification

Production verification must cover at minimum:

- canonical webhook owner/signature boundary;
- observer signature re-verification;
- QR-first / OCR-fallback extraction contract;
- payment image classification;
- private R2 evidence persistence after acceptance;
- pending-first Payment Proof behavior;
- Service/Job review gate;
- Membership settlement through `payments-worker` only;
- bounded HYPE/Telegram notification;
- durable Ops notification delivery, idempotent by proof/destination/purpose, with retry that never re-runs settlement;
- held/uncertain evidence stays an evidence candidate, is privately retained under a bounded window, and can only leave the lane through the canonical accepted-evidence gate, rejection, or terminal review_required;
- no direct business-truth mutation by smoke tests.

The HYPE closed-loop production receipt may report the LINE slip lane as accepted only when the production owner path and regression contracts pass.

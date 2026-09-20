# LINE OFC Slip Intake Runbook

## Deployment status

Production LINE evidence intake is LIVE under the existing `member-dashboard-chat-worker` webhook at `/webhooks/line`.

Production owners:

- LINE webhook / evidence observer: `member-dashboard-chat-worker`;
- extractor: `mmd-slip-extractor` through `SLIP_EXTRACTOR`;
- private evidence storage: `LINE_SLIP_EVIDENCE -> mmd-line-slip-evidence`;
- HYPE/Ops notification: `telegram-worker`;
- Money Truth: `payments-worker`.

The Queue-backed `mmd-line-slip-intake-staging` path is synthetic staging only and is not the production transport.

## Current production flow

Use this as the operational reference:

```text
LINE image
  -> /webhooks/line
  -> canonical LINE signature verification
  -> successful canonical webhook handling
  -> async payment observer
  -> observer re-verifies x-line-signature
  -> download image from LINE
  -> QR extraction first
  -> OCR fallback when needed
  -> classify payment evidence
  -> reject / hold if insufficient
  -> accepted:
       correlate canonical Client/Member/Renewal/Session/Job
       write original to private production R2
       create Payment Proof status=pending
       route to settlement lane
```

### Settlement lane: Service / Job

```text
pending Payment Proof
  -> HYPE/Ops Payment Confirm
  -> exact / ambiguous / unresolved Job context
  -> Official Verify
  -> payments-worker
  -> Money Truth
```

Service/Job proof remains review-gated.

### Settlement lane: eligible Membership renewal

```text
pending Payment Proof
  -> membership_slip_simple_accept_v1 gate
  -> payments-worker /v1/internal/payments/reviewed-proof
  -> payments-worker revalidates canonical proof/amount/identity/package context
  -> success: entitlement/renewal materialized + Payment Proof verified
  -> fail-closed: Payment Proof review_required
```

The observer never becomes Money Truth. The authoritative verified write remains in `payments-worker`.

### Lane: held / uncertain evidence

```text
classify -> hold
  -> private held prefix (line-ofc/held-evidence/<proof-id>/)
  -> bounded reprocess sweep (live LINE traffic + hourly cron)
  -> same extractor / classifier / correlation gates
  -> accepted -> one pending Payment Proof
  -> rejected -> discarded
  -> attempts exhausted -> terminal review_required + bounded Ops notice
  -> retention elapsed -> terminal expired, bytes deleted
```

A held item is never paid, never verified and never reaches `payments-worker` while it is held. There is no operator force-paid path out of this lane.

Bounded switches (non-secret):

- `LINE_HELD_EVIDENCE_RETENTION_HOURS` — default 72, max 168;
- `LINE_HELD_EVIDENCE_MAX_ATTEMPTS` — default 5;
- `LINE_HELD_EVIDENCE_BASE_BACKOFF_MINUTES` — default 15.

### Lane: durable Ops notification

```text
pending/verified outcome
  -> outbox record persisted first (line-ofc/ops-outbox/<id>.json)
  -> telegram-worker send
  -> delivered | retryable -> backoff -> retry sweep | failed_terminal
```

Bounded switches (non-secret):

- `LINE_OPS_OUTBOX_MAX_ATTEMPTS` — default 6, max 12;
- `LINE_OPS_OUTBOX_BASE_BACKOFF_SECONDS` — default 60;
- `LINE_OPS_OUTBOX_RETENTION_HOURS` — default 168.

If HYPE/Ops stops receiving payment alerts, check in this order: the Telegram service secret, `telegram-worker` health, then the outbox prefix for `retryable` / `failed_terminal` records. Do not resend by re-running intake; the sweep is the supported recovery path.

Delivery uses an R2 CAS lease to suppress concurrent duplicate observers. Telegram transport remains at-least-once under crash ambiguity: if Telegram accepts a message but the worker dies before persisting `delivered`, a later retry may repeat the notification. Such a retry can only resend the stored bounded message and can never rerun settlement or change Money Truth.

## Production behavior checks

When reviewing a regression, verify these in order:

1. `member-dashboard-chat-worker` still owns `/webhooks/line`.
2. The webhook rejects invalid LINE signatures.
3. The payment observer re-verifies the signature before processing events.
4. Direct-user images can be visually checked immediately.
5. Group images are accepted only from configured payment-group allowlist hashes.
6. LINE image download enforces supported MIME/size boundaries.
7. Extraction runs QR first, then OCR fallback.
8. Payment-request QR without completed-transfer evidence is rejected.
9. Ordinary non-payment images are rejected.
10. Uncertain extraction/classification is held rather than promoted.
11. Accepted evidence is written to private production R2.
12. The first Payment Proof write is `pending`.
13. Exact Service/Job correlation may be shown to Ops; ambiguous correlation remains ambiguous.
14. Service/Job payment cannot become Money Truth without Official Verify / `payments-worker`.
15. Eligible Membership settlement may call `payments-worker` only through the explicit LINE OFC Membership contract.
16. Payment Proof becomes `verified` only after authoritative settlement succeeds.
17. HYPE/Telegram is notification/operations only.
18. Duplicate evidence is idempotent by proof ID.
19. A failed Telegram send leaves a durable retryable outbox record; it never blocks the pending Payment Proof and never rolls back settlement.
20. A notification retry re-sends only the already-rendered message; it never re-runs `payments-worker` or re-creates a Payment Proof.
21. Held/uncertain evidence is retained privately under the held prefix, reprocessed through the same canonical gates, and can only end as accepted / rejected / review_required / expired.

## Focused regression tests

From repository root:

```sh
node --experimental-global-webcrypto --test member-dashboard-chat-worker/test/line-payment-proof-ingress.test.mjs
node --experimental-global-webcrypto --test member-dashboard-chat-worker/test/line-ops-notification-durability.test.mjs
node --experimental-global-webcrypto --test member-dashboard-chat-worker/test/line-held-evidence-lane.test.mjs
node --test payments-worker/reviewed-proof-line-recovery.test.mjs
node --test payments-worker/reviewed-proof-canonical-money-truth.test.mjs
node --test admin-worker/payment-approved-job-link-dispatch.test.mjs
```

The HYPE production smoke also runs the LINE payment-proof ingress regression as part of the closed-loop acceptance contract.

## HYPE/Ops routing

Production notifications are sent through `telegram-worker`.

Expected bounded routing:

- Membership proof -> Membership topic;
- generic Service/Job payment -> Payment Confirm topic;
- classification conflict -> Alerts topic.

The Ops message may show:

- Proof ID;
- customer display when canonically resolved;
- amount;
- payment purpose/tracking kind;
- exact Job context when uniquely matched;
- bounded candidate list when ambiguous;
- required next action.

Do not treat a Telegram delivery receipt as payment verification.

## Production data handling

Production evidence handling must retain these boundaries:

- originals only in the designated private evidence bucket;
- no raw slips or OCR/QR payloads in GitHub issues;
- no secret/token values in logs;
- no guessing between multiple Jobs;
- no payment truth from message wording;
- no service payment truth from extraction alone;
- Membership auto-settlement only through the explicit owner policy and `payments-worker` validation;
- no direct Points/Booking/Model-assignment mutation from the slip observer;
- held evidence bytes and their private reprocess inputs stay in the private bucket under the held prefix, within the bounded retention window, and never appear in logs, Telegram messages, receipts or GitHub;
- outbox delivery receipts carry bounded metadata only and are never treated as payment verification.

## Synthetic staging harness

Cloudflare staging remains split into:

- extractor: `services/mmd-slip-extractor/cloudflare`;
- Queue-backed intake: `services/mmd-line-slip-intake/cloudflare`.

Staging scope:

- synthetic or redacted images only;
- no production LINE traffic/customer slips;
- workers.dev-only staging surfaces;
- private staging R2 only;
- staging Queue/DLQ only;
- `MMD — Payment Proofs Staging` only;
- `status=pending`, `source=synthetic_isolated`;
- redacted HYPE staging notification only;
- no production Money Truth mutation.

### Required staging resources

```sh
npx wrangler queues create mmd-line-slip-intake-staging
npx wrangler queues create mmd-line-slip-intake-staging-dlq
npx wrangler r2 bucket create mmd-line-slip-evidence-staging
```

### Required staging secrets

Extractor:

- `MMD_SLIP_EXTRACTOR_TOKEN`

Queue intake:

- `MMD_SLIP_INTAKE_STAGING_TOKEN`
- `MMD_SLIP_EXTRACTOR_TOKEN`
- `AIRTABLE_API_KEY`
- `AUTH_SERVICE_LINE_TO_TELEGRAM` for optional redacted HYPE validation

Do not put secret values in Git, command-line arguments, CI output, screenshots, or GitHub issues.

### Local staging validation

Extractor:

```sh
cd services/mmd-slip-extractor/cloudflare
npm ci
node --test test/*.test.mjs
node --check worker.mjs
node --check worker-core.mjs
node --check container-server.mjs
npx wrangler deploy --dry-run --config wrangler.jsonc
```

Queue intake from repository root:

```sh
node --check services/mmd-line-slip-intake/cloudflare/worker.mjs
node --experimental-global-webcrypto --test services/mmd-line-slip-intake/cloudflare/test/*.test.mjs
npx wrangler@4 deploy --dry-run --config services/mmd-line-slip-intake/cloudflare/wrangler.jsonc
```

Synthetic staging proves staging only. It never substitutes for the real LINE production gate.

## Production incident / rollback guidance

If the production evidence observer is unhealthy:

1. preserve the canonical `/webhooks/line` owner;
2. keep Money Truth in `payments-worker`;
3. fail closed on evidence processing rather than bypassing verification;
4. do not promote raw/uncertain evidence directly into paid/verified state;
5. keep HYPE notification secondary to canonical payment truth;
6. investigate extractor/R2/Airtable/service-binding health without creating a second LINE webhook owner.

If staging is unhealthy, stop staging traffic or roll back the staging workers only. Do not mutate the production LINE route as part of staging rollback.

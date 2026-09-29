# Payment Notification Authority Lock — 2026-09-29

Status: OWNER LOCKED

This document records the owner decision for MMD payment/deposit notification behavior. Runtime implementations may improve delivery, presentation, and observability, but must not change the authority boundaries below without an explicit new owner decision.

## Locked authority boundaries

1. `payments-worker` remains the only Money Truth authority for payment settlement.
2. LINE OA / LINE OFC, Kenji, HYPE, Telegram, OCR, QR extraction, R2 evidence, and notification delivery are never payment authority.
3. A received slip, image, payment message, extracted amount, or matched Job must never by itself mutate a Service/Job payment to paid/verified.
4. Service / Job payment remains review-gated. Official Verify / the canonical `payments-worker` path is required before Money Truth changes.
5. Membership may use only the already-approved bounded LINE OFC Membership settlement exception. It must still settle through `payments-worker`; no notification surface may bypass that validation.

## Locked notification behavior

1. Payment evidence may create a pending Payment Proof before verification.
2. Internal Ops notification is secondary to canonical payment truth and must never block or roll back settlement.
3. HYPE / Telegram may continue to receive operational payment notifications and review context.
4. LINE OFC may also receive an owner/operator notification lane for payment/deposit events, but that lane is a mirror of canonical state only.
5. A LINE OFC notification must clearly distinguish:
   - evidence received / pending review;
   - officially verified / settled;
   - ambiguous or review-required.
6. The LINE OFC notification lane must never infer, guess, or promote payment state.
7. If a Job/Session cannot be resolved uniquely, the message must remain ambiguous and must not select a Job automatically.
8. Notification retries may resend only the already-rendered notification. They must never rerun settlement, recreate a Payment Proof, issue entitlement, or mutate Money Truth.
9. Notification failure must not erase, downgrade, or reverse a canonical Payment Proof or verified payment.

## Required owner-facing sequence for Service / Job deposits

```text
customer submits payment evidence
  -> evidence observer / payment intake
  -> Payment Proof = pending
  -> owner/operator notification may be sent
     LINE OFC and/or HYPE/Telegram
     status must say pending/review required
  -> Official Verify
  -> payments-worker
  -> Money Truth changes
  -> owner/operator verified notification may be sent
```

The owner-facing LINE OFC notification is an operational surface, not a payment confirmation authority.

## Forbidden regressions

Do not introduce any implementation that:

- marks a Service/Job payment verified from OCR/QR extraction alone;
- marks a Service/Job payment verified because a customer says they transferred;
- treats LINE message wording as Money Truth;
- treats notification delivery as payment verification;
- retries payment settlement because notification delivery failed;
- guesses between multiple candidate Jobs;
- lets Kenji or HYPE independently decide that money was received;
- lets a LINE OFC alert mutate payment, entitlement, Points, Booking/Session truth, or Model assignment.

## Change control

Any change to these authority rules requires an explicit new owner decision. Refactors, UI changes, notification redesigns, and delivery-channel additions must preserve this lock.

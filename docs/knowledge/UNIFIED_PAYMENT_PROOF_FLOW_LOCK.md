# Unified Payment + Proof Flow Lock

## Canonical customer flow

1. Create a payment intent once.
2. Reuse one `payment_ref` for the same `session_id` + payment stage.
3. Use `/sigil/pay` as the canonical customer surface for payment details and proof upload.
4. After proof is received, show `pending verification` and do not prompt the customer to upload the same proof again.
5. Official Verify remains authoritative for payment, membership, access, booking, points, and entitlement state.
6. `/member/payments` is a list/status/navigation surface, not a second proof intake.
7. `/confirm/payment-proof` is legacy/manual evidence compatibility only. When a `payment_ref` already exists, it must never mint a replacement reference.

## Duplicate prevention

- Payment intent uses the existing `payment_ref` when supplied.
- Otherwise the worker derives a stable reference from `session_id` + payment stage.
- Web membership checkout persists its session identifier for the same package/email retry.
- Proof intake checks `Payment Proofs` for the same `payment_ref` before writing.
- An already received proof returns an idempotent response and leaves the existing review state intact.
- Proof evidence is supporting evidence only; it never grants `paid`, `verified`, `approved`, or entitlement state by itself.

## Membership term lock

- Standard: base term 1 year.
- Premium: base term 2 years.
- Premium reviewed-payment entitlement writes must use `2_years_from_verified_payment`.
- CARE BACK extensions are separate policy adjustments and must not be collapsed into the base membership term.

## Surfaces

- Canonical payment + proof: `/sigil/pay`
- Payment history/status: `/member/payments`
- Membership checkout: `/pay/membership`
- Legacy/manual proof compatibility: `/confirm/payment-proof`
- Admin truth/review: `/v1/admin/payments/review-queue` and `/v1/admin/payments/review`

## Safety

Customer-facing copy after proof submission should say that MMD received the evidence and is reviewing it. Do not represent a proof upload, OCR result, or customer statement as final payment verification.
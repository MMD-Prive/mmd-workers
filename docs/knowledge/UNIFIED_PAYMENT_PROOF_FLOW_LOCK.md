# Unified Payment + Proof Flow Lock

> Canonical route override — 2026-09-19: Public Membership and TMIB purchases use signed `/pay/checkout?t=...`; Private Membership / Black Card / service payments use signed `/sigil/pay?t=...`. `/pay/membership` is now the canonical Public Membership entry, not a compatibility bridge. `/sigil/pay/membership` remains a private compatibility bridge. `payments-worker` remains the single money authority. See `docs/locks/MMD_PAYMENT_ROUTE_BRIDGE_LOCK_20260913.md` and `docs/architecture/MMD_PUBLIC_PAYMENT_SURFACE_V1.md`.

> Canonical route override — 2026-09-13: this document is governed by `docs/locks/MMD_PAYMENT_ROUTE_BRIDGE_LOCK_20260913.md` for membership-payment route aliases. `/pay/membership` and `/sigil/pay/membership` are compatibility bridges only and are not payment authorities.

## Canonical customer flow

1. Create a payment intent once from a backend-owned membership/session decision.
2. Reuse one `payment_ref` for the same `session_id` + payment stage.
3. Use signed `/sigil/pay?t=...` as the canonical customer surface for payment details and proof upload.
4. After proof is received, show `pending verification` and do not prompt the customer to upload the same proof again.
5. Official Verify remains authoritative for payment, membership, access, booking, points, and entitlement state.
6. `/member/payments` is a list/status/navigation surface, not a second proof intake.
7. `/confirm/payment-proof` is legacy/manual evidence compatibility only. When a `payment_ref` already exists, it must never mint a replacement reference.
8. Membership selection, signup, renewal and upgrade entry use `/sigil/member/membership`; that page may request a canonical backend payment intent but must not invent amount, destination, reference or verified state in the browser.

## Duplicate prevention

- Payment intent uses the existing `payment_ref` when supplied.
- Otherwise the worker derives a stable reference from `session_id` + payment stage.
- Membership selection state is not payment truth. Browser/Webflow state may preserve non-authoritative display context only.
- Proof intake checks `Payment Proofs` for the same `payment_ref` before writing.
- An already received proof returns an idempotent response and leaves the existing review state intact.
- Proof evidence is supporting evidence only; it never grants `paid`, `verified`, `approved`, or entitlement state by itself.

## Membership term lock

- Standard: base term 1 year.
- Premium: base term 2 years.
- Premium reviewed-payment entitlement writes must use `2_years_from_verified_payment`.
- CARE BACK extensions are separate policy adjustments and must not be collapsed into the base membership term.

## Surfaces

- Membership selection / signup / renewal / upgrade entry: `/sigil/member/membership`
- Canonical exact payment + proof: signed `/sigil/pay?t=...`
- Payment history/status/navigation: `/member/payments`
- Legacy membership-payment aliases: `/pay/membership` and `/sigil/pay/membership` -> compatibility bridge only
- Legacy renewal alias: `/sigil/pay/renew` -> `/sigil/pay/renewal`
- Legacy generic payment alias: `/sigil/pay/payment` -> signed `/sigil/pay?t=...` when a valid token exists, otherwise `/member/payments`
- Legacy/manual proof compatibility: `/confirm/payment-proof`
- Admin truth/review: `/v1/admin/payments/review-queue` and `/v1/admin/payments/review`

## Authority lock

- `payments-worker` owns amount due, payment destination, PromptPay QR, canonical `payment_ref`, signed payment session and payment verification.
- No Webflow page, membership selector, Telegram button, LIFF browser payload or legacy route may become a second payment authority.
- A signed `/sigil/pay?t=...` URL must contain only the signed `t` payment token as payment authority context.

## Safety

Customer-facing copy after proof submission should say that MMD received the evidence and is reviewing it. Do not represent a proof upload, OCR result, or customer statement as final payment verification.

# SIGIL Pay

Canonical customer payment page: `/sigil/pay`.

## v21 — Mobile-first rebuild (2026-09-20)

Source files:
- `sigil-pay-v21.html` — customer-facing markup
- `sigil-pay-v21.css` — mobile-first SIGIL payment UI
- `sigil-pay-v21.js` — runtime and canonical API binding

Webflow:
- Site: MMD Prive
- Page: `/sigil/pay`
- Page ID: `69f2193223b35063f90a101e`

Canonical APIs:
- `POST https://sigil.mmdbkk.com/v1/confirm/details`
- `POST https://sigil.mmdbkk.com/v1/confirm/payment-instructions`
- `POST https://sigil.mmdbkk.com/v1/pay/slip/evidence`

Payment destinations are never hard-coded in Webflow or this directory. The three customer payment methods are projected only from the server-owned Payment Instructions record after signed confirmation validation:

1. PromptPay QR
2. Bank transfer
3. Credit / debit card via PayPal

The page is fail-closed. Missing or invalid signed confirmation data must not be replaced by guessed customer, model, schedule, location, amount, bank, QR, or PayPal information.

Payment proof submission is evidence intake only. Payment remains unverified until Payment Truth confirms it.

## UI rules

- Mobile-first; compact utility flow rather than promotional hero.
- Customer checks Model, date/time, location, and amount before payment.
- Account number is hidden until the customer explicitly reveals it.
- Payment reference/session reference are secondary and collapsed.
- After proof submission, the customer is directed to My MMD for status.
- Keep the final contrast safety layer at the end of the CSS.

## Promo / CARE BACK code entry (deposit stage)

Card 01 shows a collapsed "มีรหัสส่วนลด / รหัสโปรโมชั่น 6 หลัก?" field only while the session is a fresh **deposit** payment with no discount.

- API: `POST https://sigil.mmdbkk.com/v1/confirm/apply-promo` with `{ t, code }` only. The browser never sends a percent or amount (the server rejects them).
- payments-worker verifies the signed customer token, then asks member-pages-worker (`/__internal/care-back/redeem-code`, service binding `MEMBER_PAGES_WORKER`) to validate and consume the coupon. The percent comes from Model level x job format (Standard PN 5 / VIP 7, Premium/EM/GW PN 5 / VIP 10).
- On success the session price line (`[SIGIL Pricing v1]`) and `amount_thb` are rewritten in place; the deposit amount does not change (deposit is based on the full price), the balance does. The page then re-reads `/v1/confirm/details`.
- Refused server-side: another discount already on the job, payment verified, non-deposit stage (issued QR/PayPal amounts would go stale), service date > 90 days out, coupon used/expired/not ready.
- Same-session retries are idempotent. A different session cannot reuse a consumed coupon.

Deploy order: member-pages-worker -> payments-worker (needs the `MEMBER_PAGES_WORKER` binding and the same 32+ char `AUTH_SERVICE_PAYMENTS_TO_MEMBER_PAGES` secret on both) -> publish the three Webflow files.

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

# /sigil/pay — SIGIL Pay v20

Mobile-first rebuild for the canonical signed Private / Service payment surface.

## Route
- Canonical: `/sigil/pay?t=<signed customer token>`
- Payment authority: `payments-worker`
- Detail contract: `POST /v1/confirm/details`
- Payment methods: `POST /v1/confirm/payment-instructions`
- Proof intake: `POST /v1/pay/slip/evidence`

## UI contract
- Job details are shown before payment.
- Enabled payment methods are visible directly; there is no extra “show payment methods” gate.
- Supported server-enabled methods:
  1. QR PromptPay
  2. Bank Transfer
  3. Credit / Debit Card via PayPal
- Bank destination is revealed only on customer action.
- Card fee and destination come only from Payment Instructions.
- Proof upload remains evidence only until Payment Truth / Official Verify confirms it.
- Mobile has one compact bottom action bar; desktop removes it.

## Files
- `head.html` — scoped CSS only.
- `body.html` — semantic page markup and runtime configuration.
- `footer.html` — defensive runtime only.

## Safety
No amount, bank account, PromptPay ref, PayPal URL, payment status or entitlement is browser-authoritative.

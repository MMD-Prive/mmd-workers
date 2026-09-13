# `/sigil/pay/membership` — Payment Instructions v1 migration

This Webflow route remains UI-owned, but it must not be a payment authority.

## Canonical owner

- Payment amount / destination / QR authority: `payments-worker`
- Endpoint: `POST https://sigil.mmdbkk.com/v1/confirm/payment-instructions`
- Required response markers:
  - `ok: true`
  - `authority: "payments-worker"`
  - `schema: "mmd_payment_instructions_v1"`

## Browser adapter

Use `payment-instructions-v1.js` on the Webflow membership payment page.

The adapter:

- extracts only signed `t` from the current route (including LIFF state fallback);
- ignores package-price tables for canonical amount truth;
- renders `amount_due_thb` from payments-worker;
- renders only server-returned PromptPay / bank / card destinations;
- never constructs PromptPay QR URLs in the browser;
- disables proof/payment controls when the contract cannot be validated;
- stores canonical `payment_ref` and `session_id` on the page root for downstream proof submission.

## DOM hooks

Preferred page root:

```html
<div data-mmd-membership-payment></div>
```

Supported display hooks:

```text
[data-payment-instructions-status]
[data-payment-instructions-amount]
[data-payment-instructions-bank]
[data-payment-instructions-account]
[data-payment-instructions-account-name]
[data-payment-instructions-qr]
[data-payment-instructions-copy]
[data-payment-instructions-card]
[data-payment-proof-submit]
```

The adapter also falls back to the existing `.mmd6` root during migration.

## Forbidden legacy behavior

Do not restore browser-side constants such as membership amount tables, PromptPay IDs, account numbers, or locally generated payment references as payment truth. Package cards may remain as pre-payment UI context, but a customer must enter the canonical signed payment flow before any destination is shown.

## Proof intake

New proof integrations should use the canonical payments-worker proof route:

```text
POST /v1/pay/slip/evidence
```

with the canonical `payment_ref` generated for the signed session. Do not trust amount fields supplied by browser forms.

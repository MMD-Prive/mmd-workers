# `/sigil/pay/membership` — canonical bridge

As of 2026-09-13 this Webflow route is no longer a payment UI or payment authority. It is a compatibility bridge into the canonical membership/payment flow.

## Routing

- Signed request (`?t=<signed token>`) -> `/sigil/pay?t=<signed token>`.
- Unsigned request -> `/sigil/member/membership`.
- Only non-authoritative membership-entry context may be forwarded on the unsigned path: `plan`, `package`, `tier`, `code`, `promo`, `src`, `campaign`, `from`.
- Browser-supplied `amount`, `payment_ref`, `session_id`, payment destination fields, bank fields, and other money-authority parameters are not forwarded into the signed payment page.

The shared Webflow source is `webflow/payment/legacy-payment-route-bridge-v1.js`.

## Canonical payment owner

`payments-worker` remains the sole owner of amount due, payment destinations, dynamic PromptPay QR, payment references, verification, and Payment Instructions v1.

Canonical signed payment route:

```text
/sigil/pay?t=<signed token>
```

Canonical payment-instructions endpoint:

```text
POST https://sigil.mmdbkk.com/v1/confirm/payment-instructions
```

## Retired behavior

Do not restore a Webflow membership checkout on this route that:

- contains package-price tables as amount truth;
- creates payment sessions or payment references in the browser;
- sends browser-calculated amounts to `/v1/pay/verify`;
- hard-codes PromptPay IDs, bank account details, card destinations, or QR URLs;
- marks payment or membership state from browser state.

`payment-instructions-v1.js` remains in the repository as migration history/reference but is not the active page runtime after the bridge cutover.

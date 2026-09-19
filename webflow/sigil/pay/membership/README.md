# `/sigil/pay/membership` — canonical compatibility bridge

Last reconciled with Webflow: **2026-09-19**

Webflow page ID: `696b3174afaafbea2e92c4e9`

This route is **not** a membership checkout, payment UI, or payment authority. It exists only so legacy links continue to land safely in the current MMD membership/payment flow.

## Canonical routing

- Signed request (`?t=<token>`) -> `/sigil/pay?t=<token>`.
- Unsigned request -> `/sigil/member/membership`.
- The signed payment surface validates the token server-side and fails closed when the token is invalid.

Only non-authoritative membership-entry context may be forwarded on the unsigned path:

`plan`, `package`, `tier`, `code`, `promo`, `src`, `campaign`, `from`.

Browser-supplied `amount`, `payment_ref`, `session_id`, payment destinations, bank fields, QR values, PayPal URLs, and other money-authority parameters must not cross the bridge.

The shared runtime source is:

`webflow/payment/legacy-payment-route-bridge-v1.js`

The exact Webflow page head/footer snapshot is stored beside this README.

## Canonical owners

- Private Membership selection / signup / renewal / upgrade entry: `/sigil/member/membership`
- Private signed payment surface: `/sigil/pay?t=<token>`
- Public Membership entry is separate: `/pay/membership`
- Public signed payment surface is separate: `/pay/checkout?t=<token>`
- Payment authority: `payments-worker`
- Payment Instructions: `POST /v1/confirm/payment-instructions`

`payments-worker` remains the sole owner of amount due, payment references, payment destinations, dynamic PromptPay QR, PayPal/Card processing fee, verification, and official payment confirmation.

## Webflow lock

- No checkout UI on this route.
- No package-price tables as payment truth.
- No bank/PromptPay/PayPal destination hard-coding.
- No browser-created payment sessions or payment references.
- No browser-side membership activation.
- No legacy payment HtmlEmbed or footer payment runtime.
- Keep excluded from sitemap.
- Keep `noindex,nofollow`.
- Keep the route live only as a **private** compatibility bridge.
- Never intercept or redirect the real Public Membership page `/pay/membership`.

`payment-instructions-v1.js` in this directory is migration history/reference only and is not active runtime.

## Related canon

- `docs/locks/MMD_PAYMENT_ROUTE_BRIDGE_LOCK_20260913.md`
- `webflow/payment/legacy-payment-route-bridge-v1.js`
- Webflow rule: `rules/sigil-pay-membership-bridge.md`

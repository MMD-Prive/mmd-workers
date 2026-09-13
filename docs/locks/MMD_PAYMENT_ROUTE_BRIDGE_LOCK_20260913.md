# MMD Payment Route Bridge Lock — 2026-09-13

## Decision

Customer payment truth is owned by `payments-worker`. Legacy Webflow payment pages are compatibility bridges only and must not contain production payment authority.

## Route behavior

| Legacy route | Canonical behavior |
| --- | --- |
| `/sigil/pay/renew` | Bridge to `/sigil/pay/renewal`, preserving query/hash so the canonical renewal renderer can validate or ignore context server-side. |
| `/sigil/pay/membership` | With signed `t`: `/sigil/pay?t=...`. Without signed `t`: `/sigil/member/membership` with safe membership-entry context only. |
| `/pay/membership` | Same bridge behavior as `/sigil/pay/membership`. |
| `/sigil/pay/payment` | With signed `t`: `/sigil/pay?t=...`. Without signed `t`: `/member/payments`. The old generic payment UI is retired. |

## Authority lock

The bridge must never:

- forward browser `amount` as payment truth;
- hard-code PromptPay IDs, bank accounts, card destinations, or QR URLs;
- call legacy browser verification endpoints;
- generate a payment reference/session in browser code;
- mark money, membership, entitlement, or Points state.

The canonical signed customer payment route is `/sigil/pay?t=<signed token>`. Payment Instructions v1 remains owned by `payments-worker`.

## Webflow implementation

The active bridge source is:

```text
webflow/payment/legacy-payment-route-bridge-v1.js
```

Webflow page-level head code mirrors this source. Legacy page-level footer payment scripts and legacy payment HtmlEmbeds are removed from the four routes above.

## Historical lock supersession

Older route-lock documents that describe `/sigil/pay/membership` or `/pay/membership` as permanent browser-rendered payment pages describe the pre-2026-09-13 architecture. They must not be used to restore browser-owned payment logic.

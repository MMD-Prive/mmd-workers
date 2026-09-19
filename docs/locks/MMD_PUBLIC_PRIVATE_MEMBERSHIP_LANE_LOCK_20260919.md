# MMD Public / Private Membership Lane Lock

Status: Active production route contract  
Updated: 2026-09-19

## Public lane

- `/pay/membership` = canonical Public Membership selection for **MMD Member / Elite / Red Card**.
- This page is selection/presentation only. Browser values never become payment truth.
- Backend-issued Public payment intent -> signed `/pay/checkout?t=<token>`.
- Public/TMIB payment amount, destination, QR, payment reference and verification remain backend / `payments-worker` authority.

## Private lane

- `/sigil/member/membership` = canonical Private Membership selection / signup / renewal / upgrade for **Standard / Premium / private access**.
- Renewal entry from LINE or compatibility aliases should use `/sigil/member/membership?intent=renew` and preserve only safe source context.
- Backend-issued Private / Black Card / service payment intent -> signed `/sigil/pay?t=<token>`.

## Payment status

- `/member/payments` = payment history / status / navigation.
- LINE Rich Menu payment/status actions must go here, not to `/pay/membership`.

## Compatibility routes

- `/sigil/pay/membership` = Private legacy compatibility bridge only.
  - unsigned -> `/sigil/member/membership`
  - signed `t` -> `/sigil/pay?t=<same token>`
  - it must never capture or redirect canonical Public `/pay/membership`.
- `/sigil/pay/renew` = compatibility alias -> `/sigil/member/membership?intent=renew`.
- `/sigil/pay/renewal` and `/pay/renewal` = redirect-only compatibility.
  - signed `t` -> `/sigil/pay?t=<same token>`
  - unsigned -> `/sigil/member/membership?intent=renew`
  - no visible fallback page, Renewal Payment Review, bank/QR, proof uploader, or browser-calculated payment state.
- `/sigil/pay/payment` = retired generic payment alias.
  - signed `t` -> `/sigil/pay?t=<same token>`
  - unsigned -> `/member/payments`.

## LINE routing lock

- Public Membership CTA -> `/pay/membership?source=line`.
- Private renewal -> `/sigil/member/membership?source=line&intent=renew`.
- Payment/status -> `/member/payments?source=line`.
- Booking remains a separate request flow.
- Rich Menu navigation cannot grant membership, payment, entitlement, booking, Black Card, VIP or SVIP truth.

## Webflow boundary

- Webflow owns presentation and compatibility snippets only.
- Webflow payment/membership bridges must never invent amount, destination, payment reference, membership state or entitlement.
- Payment authority remains server-side.

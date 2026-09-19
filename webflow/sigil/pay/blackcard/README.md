# /sigil/pay/blackcard — SIGIL Pay v18 restore

Restored: 2026-09-19

This route is the Black Card entry surface for the canonical signed payment flow.

## Canonical behavior
- Requires a signed `?t=` payment link.
- Payment truth and destinations are owned by `payments-worker`.
- Uses Payment Instructions v1.
- Supports only server-enabled methods:
  1. QR PromptPay
  2. Bank Transfer (collapsed by default; account number hidden until opened)
  3. Credit / Debit Card via PayPal (server-calculated processing fee; canonical default 4%)
- QR, bank details, PayPal URL and card fee are never hard-coded as payment authority in Webflow.
- QR/Bank proof goes to `/v1/pay/slip/evidence`.
- A submitted proof remains pending until Official Verify.
- No browser state may activate Black Card membership.

## Visual contract
- Same SIGIL Pay / SIGIL Confirm family.
- LINE Seed Sans TH / Noto Sans Thai.
- Warm black / restrained champagne gold.
- Small SIGIL mark.
- 28px glass cards and pill CTA.
- Mobile-first.
- Black Card labeling only changes presentation; payment authority stays identical to canonical `/sigil/pay`.

## Webflow
- Site: `68f879d546d2f4e2ab186e90`
- Page: `691d54538af99d96072dfbaf`
- Route: `/sigil/pay/blackcard`

Files in this folder are a source snapshot of the Webflow page after the v18 restore.

## Visual assets · 2026-09-19
- Hero: `Sigil Black 01.webp`
- Payment summary image: `Sigil Black 02.webp`
- MMD note image: `Sigil Black 03.webp`
- Payment proof card background: `Sigil Black 04.webp`
- All four assets are presentation-only. Signed-token validation, payment instructions, payment destinations, proof upload, and verification authority remain unchanged.

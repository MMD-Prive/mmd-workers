# `/pay/membership` — Public Membership entry

Rebuilt: **2026-09-19**
UI revision: **TMIB × Red Card · mobile-first Per Voice v7**

Webflow page ID: `6a70c99f1b2b686c83001271`

This is the canonical customer entry for MMD Public Membership:
- MMD Member — 690 THB / 1 year
- Elite — 4,990 THB / 2 years
- Red Card — 11,499 THB / 1 year

## Webflow source of truth

The staged Webflow implementation is mirrored here as three independent files:
- `membership.html` — active scoped HtmlEmbed
- `membership.css` — page Head styles
- `membership.js` — guarded Footer runtime

Root authority remains `#mmd-public-membership`.

## UX lock — v7

- Mobile-first before tablet/desktop.
- MMD Privé logo remains at top-left.
- Hero copy is smaller on desktop, keeps CTA inside the first viewport, and preserves TMIB / Red Card imagery.
- Customer copy uses Per Voice and avoids internal implementation jargon such as `SERVER PRICE`, `LINE VERIFIED`, and `OFFICIAL VERIFY` as customer-facing labels.
- Customer-safe trust language is:
  - ยืนยันผ่าน LINE
  - เช็กยอดก่อนจ่าย
  - MMD ตรวจรายการ
- Member / Elite / Red Card cards explain who each level is for, the visible catalog price/term, three concise benefits, and one primary CTA.
- Button transition copy confirms the selected package before auth/payment handoff.
- Mobile Branch Navigation is kept and uses customer-facing Thai labels.
- Critical text colors are explicitly scoped and protected by the final contrast safety layer.

## Runtime contract

The Webflow page reads:
- `GET /member/api/liff/public-membership/catalog`

Purchase sends only:
- `POST /member/api/liff/public-membership/purchase`
- body: `{"package_code":"..."}`

The page never submits amount, payment destination, payment reference, entitlement or verified state as authority.

When LINE/MY MMD session is missing, the page sends the customer to the existing MMD LINE Mini App and returns to the same Public Membership route with the selected package preserved.

The browser accepts only a backend-issued signed:
- `https://mmdbkk.com/pay/checkout?t=...`

The runtime includes guarded initialization, request timeout handling, fail-closed catalog behavior, duplicate-click prevention, preserved source query parameters, and reduced-motion-safe scrolling.

## Authority

- Public package catalog: `shared/payment-intelligence.mjs`
- Public membership intent: `member-pages-worker/src/public-membership-payment.js`
- Money truth: `payments-worker`
- Entitlement materialization: reviewed payment flow after MMD verification

The displayed price is informational. The Worker resolves the authoritative package and amount again before creating the payment intent.

## Webflow lock

- Public/MMD presentation; do not add SIGIL/private framing.
- Do not add browser-owned amount fields.
- Do not embed bank/PromptPay/PayPal destination.
- Do not mark membership active after returning from payment or proof upload.
- Keep proof/review language explicit without exposing internal system terms to customers.

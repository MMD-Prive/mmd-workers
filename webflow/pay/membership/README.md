# `/pay/membership` — Public Membership entry

Rebuilt: **2026-09-19**

Webflow page ID: `6a70c99f1b2b686c83001271`

This is the canonical customer entry for MMD Public Membership:
- MMD Member — 690 THB / 1 year
- Elite — 4,990 THB / 2 years
- Red Card — 11,499 THB / 1 year

## Runtime contract

The Webflow page reads:
- `GET /member/api/liff/public-membership/catalog`

Purchase sends only:
- `POST /member/api/liff/public-membership/purchase`
- body: `{"package_code":"..."}`

The page never submits amount, payment destination, payment reference, entitlement or verified state as authority.

When LINE/MY MMD session is missing, the page sends the customer to the existing MMD LINE Mini App and returns to this page.

The browser accepts only a backend-issued signed:
- `https://mmdbkk.com/pay/checkout?t=...`

## Authority

- Public package catalog: `shared/payment-intelligence.mjs`
- Public membership intent: `member-pages-worker/src/public-membership-payment.js`
- Money truth: `payments-worker`
- Entitlement materialization: reviewed payment flow after Official Verify

The displayed price is informational. The Worker resolves the authoritative package and amount again before creating the payment intent.

## Webflow lock

- Public/MMD presentation; do not add SIGIL/private framing.
- Mobile-first.
- Do not add browser-owned amount fields.
- Do not embed bank/PromptPay/PayPal destination.
- Do not mark membership active after returning from payment or proof upload.
- Keep proof/Official Verify language explicit.

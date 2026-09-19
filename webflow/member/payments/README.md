# Webflow /member/payments · Owner Boundary

Updated: 2026-09-19  
Webflow page id: `69dfd6c51dd636056fdb35ea`  
Root: `#mmd-payments-maxx`

## Role

Canonical customer-facing payment status / history / navigation surface.

Root ownership markers:
- `data-presentation-owner="webflow"`
- `data-status-bff-owner="member-pages-worker"`
- `data-money-authority="payments-worker"`
- `data-surface-role="status-history-navigation"`

Current page contract:
- `data-payments-endpoint="/v1/member/payments"`

Source implementation is now defined as:
`member-dashboard-chat-worker exact ingress -> MEMBER_PAGES_WORKER service binding -> member-pages-worker/src/member-payments-bff.js`.

Production acceptance is still required before legacy/admin delegation is retired.

## Authority

Webflow may render safe records and expose an exact backend-issued signed payment action.

Webflow must not:
- calculate amount;
- mint or replace payment_ref;
- generate QR/bank/card destination;
- verify payment;
- activate membership;
- expose admin review controls.

Money truth remains `payments-worker`; Official Verify is final.

See:
- `docs/locks/MMD_MEMBER_PAYMENTS_OWNER_LOCK_20260919.md`


## BFF response contract

`GET /v1/member/payments` (and HEAD) uses the signed LIFF/member session only.

Response:
- `schema = mmd_member_payments_v1`
- `authority = member-pages-worker`
- `money_authority = payments-worker`
- `member` contains display-only member context
- `records` contains customer-safe current intent + verified historical payments only

Current intent:
- comes only from a backend-created payment intent remembered in the short-lived LIFF session;
- may expose only the exact backend-issued `/pay/checkout?t=...` or `/sigil/pay?t=...` URL;
- never accepts browser-selected member/payment context.

Verified history:
- comes from the safe member profile / Customer 360 projection;
- never exposes admin review fields, raw Airtable IDs, risk/fraud fields, bank destination, QR authority or internal notes.

Production status: source ready in the feature change; route/deploy + authenticated live acceptance remain pending until merged and verified.

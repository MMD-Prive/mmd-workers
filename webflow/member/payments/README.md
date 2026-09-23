# Webflow /member/payments · Compatibility Boundary

Updated: 2026-09-22  
Webflow page id: `69dfd6c51dd636056fdb35ea`  
Root: `#mmd-payments-maxx`

## Role

This page is now a **compatibility presentation** for payment status/history/navigation.

The canonical My MMD Payment Center is:
`/my-mmd/payments`

Fresh My MMD navigation and LIFF `continue_payment` use the canonical My MMD route.

The shared read contract remains:
`GET /v1/member/payments`

Source chain:
`My MMD / compatibility presentation -> member-dashboard-chat-worker -> MEMBER_PAGES_WORKER -> member-pages-worker/src/member-payments-bff.js -> payments-worker money truth`.

## Authority

Neither Webflow nor the My MMD presentation may:
- calculate amount;
- mint or replace `payment_ref`;
- generate QR/bank/card destination;
- verify payment;
- activate membership;
- expose admin review controls;
- infer entitlement.

Money truth remains `payments-worker`; Official Verify is final.

## BFF response contract

`GET /v1/member/payments` uses the signed LIFF/member session only.

Response:
- `schema = mmd_member_payments_v1`;
- `authority = member-pages-worker`;
- `money_authority = payments-worker`;
- `member` contains display-only member context;
- `records` contains customer-safe current intent + verified historical payments only.

A current record may expose only the exact backend-issued `/pay/checkout?t=...` or `/sigil/pay?t=...` URL. `pending_review` must suppress payment/resubmit actions.

## Production status

Production acceptance passed on 2026-09-22 at source SHA `d29f81c84d71e891e31ebdf8bfa451417166e9b8`.

See:
- `docs/locks/MMD_MEMBER_PAYMENTS_OWNER_LOCK_20260919.md`
- `docs/ops/MMD_MEMBER_PAYMENTS_PRODUCTION_ACCEPTANCE_20260919.md`

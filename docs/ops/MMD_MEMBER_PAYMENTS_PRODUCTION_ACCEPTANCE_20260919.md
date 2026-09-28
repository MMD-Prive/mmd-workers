# MMD Member Payments Production Acceptance — 2026-09-22

Status: **PRODUCTION ACCEPTED · REAL MEMBER VERIFIED**

Canonical chain:

`LIFF continue_payment -> /my-mmd/payments -> GET /v1/member/payments -> member-dashboard-chat-worker -> MEMBER_PAGES_WORKER -> member-pages-worker -> payments-worker money truth`

Compatibility presentation `/member/payments` may remain available during migration, but fresh My MMD navigation and LIFF `continue_payment` use `/my-mmd/payments`.

## Production receipt

Accepted source SHA: `d29f81c84d71e891e31ebdf8bfa451417166e9b8`  
Accepted: 2026-09-22T09:05Z  
Production Worker version: `27e97393-7698-47a0-9575-95990b300f71`  
Operations receipt: issue #325 comment `5773905945`.

The production deploy completed Worker version promotion, route sync and production smoke before a later unrelated Kenji recommendation shadow-smoke failure.

## Acceptance evidence

Unauthenticated production ingress proved:

- HTTP 401 without a valid member session;
- `x-mmd-route-owner: member-dashboard-chat-worker`;
- `x-mmd-upstream-service: member-pages-worker`;
- `x-mmd-member-payments-bff: v1`;
- `x-mmd-payment-authority: payments-worker`;
- `/my-mmd/payments` is served by the Lovable My MMD presentation through the MMD Worker;
- LIFF `continue_payment` returns to `/my-mmd/payments` in auth-bridge-only mode.

Authenticated production acceptance proved with repository secret `MY_MMD_E2E_ID_TOKEN`:

- a real server-verified LINE LIFF session;
- a real backend-created/reused pending Public Membership payment intent on the dedicated E2E account;
- `official_verification_required=true` and `entitlement_granted=false`;
- BFF schema `mmd_member_payments_v1`;
- customer-safe payment records only;
- browser-selected payment context rejected with `BROWSER_PAYMENT_CONTEXT_REJECTED`;
- pending-review records cannot expose a payment action;
- the exact backend-issued signed `/pay/checkout?t=...` handoff is preserved;
- money authority remains `payments-worker`.

No synthetic member session or browser-created payment truth was used.

## Ongoing regression gate

`.github/workflows/deploy-member-dashboard-chat-worker.yml` now repeats the Payment Center presentation, LIFF return-target, unauthenticated BFF and real-member authenticated acceptance after production deploy.

`.github/workflows/member-payments-authenticated-production-e2e.yml` remains available as the focused payment E2E workflow.

## Legacy rule

The legacy Webflow `/member/payments` presentation is compatibility-only and is not payment authority. It may be removed only after its remaining inbound references are migrated; removing it is no longer blocked by missing BFF production acceptance.

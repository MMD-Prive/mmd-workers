# MMD Member Payments Production Acceptance — 2026-09-19

Status: AUTOMATED GATE ADDED · REAL MEMBER ACCEPTANCE REQUIRED

Canonical chain:

`Webflow /member/payments -> /v1/member/payments -> member-dashboard-chat-worker -> MEMBER_PAGES_WORKER -> member-pages-worker -> payments-worker money truth`

## Acceptance evidence

Unauthenticated production ingress is already required to prove:

- HTTP 401 without a valid member session.
- `x-mmd-route-owner: member-dashboard-chat-worker`.
- `x-mmd-upstream-service: member-pages-worker`.
- `x-mmd-member-payments-bff: v1`.
- `x-mmd-payment-authority: payments-worker`.

Authenticated acceptance is owned by:

`.github/workflows/member-payments-authenticated-production-e2e.yml`

It requires repository secret `MY_MMD_E2E_ID_TOKEN`, containing a real current LINE LIFF ID token for an approved production E2E member account. The workflow deliberately fails when that secret is absent; a synthetic session is not acceptable evidence.

The authenticated gate checks:

- a real server-verified LIFF session is established;
- the member payments BFF returns only customer-safe fields;
- browser-selected payment context is rejected;
- `pending_review` suppresses the pay action;
- any resume URL is an exact backend-issued `/pay/checkout?t=...` or `/sigil/pay?t=...` handoff;
- money authority remains `payments-worker`.

## Retirement rule

Do not mark the legacy member-payment bridge retired until this authenticated workflow passes against a real member session and the required signed handoff lane. Runtime or documentation cleanup must remain fail-closed until that receipt exists.

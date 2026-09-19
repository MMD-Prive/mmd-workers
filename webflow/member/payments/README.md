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

The endpoint must be served through a member-safe authenticated BFF before legacy admin/front-gate delegation is retired.

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

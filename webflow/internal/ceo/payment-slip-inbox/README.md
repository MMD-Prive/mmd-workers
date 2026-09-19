# /internal/ceo/payment-slip-inbox — Official Verification V3

Canonical owner payment-proof decision desk.

## Role

This is Per's normal daily payment approval surface.

Per makes the human Official Verification decision. The browser submits that decision to the canonical admin payment-review contract. `payments-worker` validates canonical proof/payment context and owns money truth.

## Contracts

- `GET /v1/admin/payments/review-queue?limit=30`
- `POST /v1/admin/payments/review`
- credentials: include
- unique `Idempotency-Key`
- request body: `decision`, `proof_id`, `admin_reason`, `idempotency_key`

Supported decisions remain:

- `approve`
- `issue`
- `reject`

## UI wording lock

Approve CTA:

`ยืนยันยอด · Official Verify`

Do not label approve as "send to Worker to decide". Per already made the decision. The Worker validates and records canonical truth.

Expected sequence:

```text
Per Official Verify decision
-> admin payment review contract
-> payments-worker validates canonical context
-> money truth changes only when valid
-> downstream renewal/session/points/access flows continue from canonical backend state
```

Webflow/browser must not directly mark paid, renew membership, award Points, or grant Telegram/Drive access.

## Related routes

- `/internal/ceo`
- `/internal/admin/payments`
- `/internal/admin/membership-access`
- `/internal/admin/payments/historical-backfill`

## Current Webflow page

Page ID: `6a280c9911da77693c8a06a6`
Route: `/internal/ceo/payment-slip-inbox`

Updated 2026-09-07 to Official Verification V3 wording.

# Promotion integration contract

Campaign: `mmd_6th_anniversary_2026`

This document is the route and authorization contract for completing PR #210. Secrets, LIFF tokens, raw LINE user IDs, and admin cookies must never cross into Airtable payload fields.

## Service ownership

| Caller | Callee | Route | Purpose |
|---|---|---|---|
| member-pages-worker | promotion-worker | `POST /v1/internal/promotions/claims/open` | Open or resume a Claim after server-side LIFF verification |
| admin-worker | promotion-worker | `GET /v1/internal/promotions/claims/:claimId` | Read review data |
| admin-worker | promotion-worker | `POST /v1/internal/promotions/claims/:claimId/transition` | Review-state transition after admin authorization |
| admin-worker | promotion-worker | `POST /v1/internal/promotions/apply` | Explicit confirmed Apply |
| promotion-worker | payments-worker | `POST /v1/internal/campaign-benefits/apply` | Apply one benefit using an idempotency key |
| member-dashboard-chat-worker | promotion-worker | `GET /v1/internal/promotions/claims/:claimId` | Read customer-safe applied result |

All calls use Cloudflare service bindings. Internal HTTP fallback requires `x-mmd-internal-secret` and must be disabled when the secret is absent or shorter than 24 characters.

## Admin authorization

The admin-worker verifies the real Admin Session before proxying. Client-provided role names are ignored.

- reviewer: read, identity review, evidence review, open manual review
- admin: normal adjustment, approval, Apply, partial retry
- special approver: VIP/SVIP/Black Card approval, reversal

Required audit context on every write:

`requestId`, `actorId`, `adminSessionId`, `eventType`, before/after JSON, reason code, Claim ID, and idempotency key when present.

Approve and Apply are separate requests and separate audit events.

## Payments apply response

The Payments Worker applies one benefit per call.

```json
{
  "claimId": "MMD6-2026-…",
  "benefitType": "membership_extension",
  "idempotencyKey": "mmd_6th_anniversary_2026:MMD6-2026-…:membership_extension",
  "status": "applied",
  "resultReference": "entitlement-or-ledger-record-id"
}
```

Allowed statuses: `applied`, `already_applied`, `retry_required`, `failed`.

The Worker must create/read the Benefit Application record before mutating membership or Points. A repeated key returns the stored result. Membership and Points use separate keys. Retry selects only missing, failed, or retry-required components.

## Effective membership date

- active member: extend from the stored membership end snapshot
- expired member: start from confirmed effective date
- special case: start from the approved effective date

Month arithmetic uses calendar months and preserves the intended end-of-month rule. The resulting date is stored on the Claim, Entitlement, and Benefit Application record.

## LIFF boundary

LIFF verifies LINE identity server-side, hashes the LINE user ID, and sends only the hash plus matched internal IDs and server-read membership snapshots. It cannot approve, choose months, set points, or call Apply.

Customer states are limited to: checking, additional review, payment required, approved awaiting processing, completed, and support required.

## Dashboard readback

Only a `benefit_applied` Claim may display:

- new membership expiry
- months added
- Anniversary Bonus 66 Points
- Claim Reference
- completion timestamp

Never expose classification, risk/manual-review reasons, admin notes, hidden tier, actor, or admin session.

## Release tests

Deployment remains blocked until repository integration tests prove:

1. LIFF opens and resumes the same Claim.
2. campaign reference date and membership snapshots are immutable.
3. admin permissions are verified server-side.
4. approval cannot mutate membership or Points.
5. Apply cannot run before approval.
6. repeated benefit keys do not duplicate writes.
7. partial failure retries only the failed component.
8. every write produces an immutable Activity Log event.
9. dashboard exposes only the customer-safe projection.
10. no public route accepts the internal service secret.

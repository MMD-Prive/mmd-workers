# promotion-worker

Owner of MMD campaign Claim and eligibility state. This worker is intentionally not deployed by this PR.

## Locked campaign policy

- campaign: `mmd_6th_anniversary_2026`
- active member: 4 months
- expired 0–90 calendar days at first Claim: 2 months
- expired more than 90 days: 3 months
- normal approved Claim: 66 Points once
- VIP / SVIP / Black Card: manual review
- `campaign_reference_date` is immutable after first Claim
- Approve and Apply are separate states
- Membership extension and Points use separate idempotency keys

## Boundaries

- LIFF/member pages call internal Claim endpoints through a service binding; browsers never receive the internal secret.
- admin-worker authenticates reviewers and approvers before it requests a Claim transition.
- payments-worker performs the final membership/Points mutation through an internal-only endpoint.
- promotion-worker owns Claim state and eligibility.
- Airtable is audit/storage truth; raw LIFF or admin tokens must never be stored.

## Implemented endpoints

- `GET /health`
- `POST /v1/promotions/eligibility/preview` — calculation only
- `POST /v1/internal/promotions/claims/open` — create or resume by campaign + LINE identity hash
- `GET /v1/internal/promotions/claims/:claimId` — internal Claim read
- `POST /v1/internal/promotions/claims/:claimId/transition` — validated state transition
- `POST /v1/internal/promotions/apply` — approved-Claim proxy; requires secret and Payments Worker binding

The Claim adapter uses Airtable table and field IDs from the production `MMD — Campaign Claims` schema. It stores an immutable first-Claim reference timestamp, membership snapshots, eligibility output, and customer-safe status data.

## Before deployment

1. Add admin session verification and role-specific approve/adjust routes through admin-worker.
2. Implement the idempotent Payments Worker apply endpoint and Benefit Applications ledger.
3. Bind member-pages-worker, admin-worker, and Payments Worker; configure secrets outside git.
4. Add integration tests for Airtable create/resume, partial failure, retry, reversal, and duplicate requests.
5. Add Activity Logs audit writes for every state change.
6. Add Dashboard readback, route ownership, and smoke tests.

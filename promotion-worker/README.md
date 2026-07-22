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

- LIFF/member pages may open and display a Claim but never apply benefits.
- admin-worker authenticates reviewers and approvers.
- payments-worker performs the final membership/Points mutation through an internal-only endpoint.
- promotion-worker owns Claim state and eligibility.
- Airtable is audit/storage truth; raw LIFF or admin tokens must never be stored.

## Initial endpoints

- `GET /health`
- `POST /v1/promotions/eligibility/preview` — calculation only
- `POST /v1/internal/promotions/apply` — internal proxy; requires secret and Payments Worker binding

## Before deployment

1. Add Airtable field-ID configuration and durable Claim CRUD.
2. Implement admin session verification through admin-worker.
3. Implement the idempotent Payments Worker apply endpoint.
4. Bind Payments Worker and configure secrets.
5. Add integration tests for partial failure, retry, reversal, and duplicate requests.
6. Add route ownership and smoke tests.

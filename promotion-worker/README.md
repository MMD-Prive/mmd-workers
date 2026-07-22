# promotion-worker

Owner of MMD campaign Claim, eligibility state, and benefit-application coordination. This worker is intentionally not deployed by this PR.

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
- admin-worker authenticates reviewers and approvers before requesting a Claim transition.
- payments-worker performs the final membership/Points mutation through an internal-only endpoint.
- promotion-worker owns Claim state, eligibility, the two-benefit plan, partial-retry selection, and customer-safe result projection.
- Airtable is audit/storage truth; raw LIFF or admin tokens must never be stored.

## Implemented foundation

- `GET /health`
- `POST /v1/promotions/eligibility/preview` — calculation only
- `POST /v1/internal/promotions/claims/open` — create or resume by campaign + LINE identity hash
- `GET /v1/internal/promotions/claims/:claimId` — internal Claim read
- `POST /v1/internal/promotions/claims/:claimId/transition` — validated state transition
- `POST /v1/internal/promotions/apply` — approved-Claim proxy; requires secret and Payments Worker binding
- deterministic two-benefit Apply plan
- partial-failure retry selection
- application-status aggregation
- mandatory audit-event shape
- customer-safe Dashboard projection

The Claim adapter uses production Airtable table and field IDs for `MMD — Campaign Claims`. It stores the immutable first-Claim reference timestamp, membership snapshots, eligibility output, and customer-safe status data.

The cross-worker route, authorization, response, and release-test contract is in `docs/promotions/mmd-6th-anniversary-integration-contract.md`.

## Remaining release gates

1. Wire verified admin-session routes in admin-worker.
2. Wire the Benefit Applications ledger and idempotent mutation endpoint in payments-worker.
3. Wire server-side LIFF open/resume in member-pages-worker.
4. Wire applied-result readback in member-dashboard-chat-worker.
5. Add integration tests using the real Worker bindings and Airtable test records.
6. Configure production bindings and secrets outside git.
7. Deploy only after all release tests pass.

No production balance, Points ledger, membership date, route, or Worker deployment is changed by this branch.

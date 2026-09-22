# Customer 360 LIVE V1 — Owner Decision

Status: LIVE CANONICAL DECISION
Date: 2026-09-10 +07
Owner / final authority: Per
Canonical route: `/internal/admin/customer-data`

## Decision

`/internal/admin/customer-data` is **Customer 360**, a real owner operating surface. It is not a HOLD page and it is not downgraded to a read-only bridge.

The previous `customer_data_hold` AI Ops description is superseded for production behavior. Compatibility code may still exist below the canonical entry decorator, but production AI Ops context for this route must report `customer_360` with `status=live_v1` and must not emit `surface_hold`.

## Live workflow

```text
Console Inbox
  -> bounded/idempotent backfill
  -> Customer Data staging queue
  -> operator identity review
  -> Canonical Client link / Keep Candidate / Keep Review / Ignore
  -> Client Intelligence read
  -> Customer 360 context
  -> handoff to Create Job / Member Intelligence / Money Control / Access Intelligence
```

Live identity runtime:

- `POST /v1/admin/customer-data/backfill/start`
- `POST /v1/admin/customer-data/backfill/continue`
- `GET /v1/admin/customer-data/backfill/:job_id`
- `GET /v1/admin/customer-data/queue`
- `POST /v1/admin/customer-data/queue/:record_id/action`
- `POST /v1/admin/clients/lineage-lookup`

After a reviewed Canonical Client is available, Customer 360 may read:

- `GET /v1/admin/clients/intelligence?client_id=rec...`

That facade is read-only advisory/context data. Missing downstream truth remains unknown/review; the browser must not invent it.

## Authority boundaries

Customer 360 may:

- import bounded identity evidence into staging
- review and link identity to an existing Canonical Client
- keep a staging candidate or review case
- ignore a staging case
- read safe Customer/Client Intelligence after canonical resolution
- route Per to the correct authority workspace

Customer 360 may not:

- mark a payment paid
- create payment truth from evidence
- grant or widen membership/access
- create points
- infer entitlement from Telegram/Drive
- send customer messages automatically
- expose raw private LINE notes in the browser queue

Authority remains:

- identity -> reviewed Canonical Client match
- payment -> payments-worker
- membership/access -> `my_mmd_entitlement_resolver_v1`
- AI -> advisory only
- policy / exception -> Per

## Browser privacy boundary

The live ingress strips raw summary/note fields from Customer Data queue responses before they reach browser UI. Raw source evidence remains server-scoped for the review runtime.

## Backfill UX

The Customer 360 client supports Start, Pause and Resume for bounded backfill. Pause/Resume state is intentionally in-memory for the current owner session; it is not a durable job scheduler and it does not claim background execution. A safety cap prevents an unbounded browser loop.

## Canonical next actions

Once a Canonical Client is linked, Customer 360 should surface live read-only relationship, membership/access snapshot, session context, evidence-backed notices and next-best-action from Client Intelligence, then hand off to:

- `/internal/admin/jobs/create-job`
- `/internal/admin/member-intelligence`
- `/internal/admin/payments`
- `/internal/admin/membership-access`

Do not direct normal Customer 360 identity work back to a separate Customer Index as the primary path.

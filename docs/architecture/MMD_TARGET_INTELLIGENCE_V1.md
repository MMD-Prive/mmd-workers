# MMD Target Intelligence V1

Status: TARGET ARCHITECTURE / IMPLEMENTATION TRACK
Owner: MMD Privé
Final authority: Boss Per
Updated: 2026-09-07 +07

## Goal

Upgrade MMD as one connected operating system instead of increasing individual page levels one by one.

Target flow:

```text
Customer 360
  -> MMD Operating System
  -> Money Control
  -> Model Supply Intelligence
  -> Entitlement Intelligence
  -> My MMD Retention Engine
```

The product rule is `Signal -> Diagnose -> Recommend -> CTA -> Follow-up`.

Webflow/Lovable own presentation and interaction only. Canonical backend owners keep truth and authorization.

## 1. Customer 360

Canonical route: `/internal/admin/customer-data`

Purpose: answer, in one operator surface:

1. Who is this customer?
2. What verified identity/evidence is attached?
3. What service/history context is available?
4. What payment/access references exist?
5. What needs review?
6. What is the safest next action?

Target display order:

```text
Who
-> Identity evidence
-> Current membership/access context
-> Service history candidates
-> Payment evidence references
-> Private context summary
-> Downstream observed state
-> Next action
```

Existing V1 endpoints remain valid:

- `POST /v1/admin/customer-data/backfill/start`
- `POST /v1/admin/customer-data/backfill/continue`
- `GET /v1/admin/customer-data/backfill/:job_id`
- `GET /v1/admin/customer-data/queue?status=review_required`
- `POST /v1/admin/customer-data/queue/:record_id/action`

Target read projection should be additive and may expose a safe `customer_360` object only after reviewed canonical-client resolution. It must not expose raw private notes, internal record IDs not needed by the operator, or secret assets.

Customer 360 never grants membership, points, access, or payment truth.

## 2. MMD Operating System

Canonical route: `/internal/admin/control-room`

This is no longer a route directory. It is the daily operator home.

Views:

- Today
- Queues
- Systems
- AI Workers

Today should show only verified queue counts / alerts / incidents from authenticated backend reads. Missing data remains `WAITING` / `—`.

Primary workspaces:

- Customer 360
- Money Control
- Model Supply Intelligence
- Entitlement Intelligence
- MMS Partner Operations
- Studio
- CEO Dashboard
- Kenji Control

## 3. Money Control

Canonical route: `/internal/admin/payments`

Existing authority-safe payment review contract is already suitable:

- `GET /v1/admin/payments/review-queue`
- `POST /v1/admin/payments/review`

Browser review remains credential-bound admin-session only.

`Approve` may change money truth only after payments-worker validates canonical payment context.

`Issue` and `Reject` never mark a payment paid.

Money Control may show:

- review queue size
- context issues / unmatched evidence
- evidence amount total labelled explicitly as evidence, never revenue
- evidence preview
- match flags
- inline review reason
- links to historical backfill and CEO exception desk

It must never infer revenue from payment proofs.

## 4. Model Supply Intelligence

Canonical route: `/internal/ceo/models`

Existing model source/readiness contracts remain useful, but asset readiness is only one layer.

Target layers:

```text
Inventory
-> Explicit work families / capabilities
-> Multi-lane overlap
-> Availability/readiness evidence
-> Asset readiness
-> Demand gap
-> Recruitment / curation recommendation
```

Canonical customer-memory families:

- `A` = Straight
- `B` = Gay
- `C` = Travel Models
- `D` = Extreme Models
- `E` = Foreigner Models
- `GWs` = Model / Super Models
- `EMs` = Actor / Artist on Mass Media

Rules:

- A/B/E are explicit-evidence only. Never infer them from Standard/Premium/private access tiers.
- Travel and Extreme can be recognized only from explicit category/capability evidence.
- One model may support more than one work family when they explicitly opted in.
- Asset readiness is not availability and is not permission to book.
- Customer-facing compcards never explain the family color legend.

Current compatible reads:

- `GET /v1/admin/models/list`
- `GET /v1/admin/models/resolve-source?q=...`
- `GET /v1/admin/audience/brief` for optional verified `supply_gaps` / `model_gaps`

## 5. Entitlement Intelligence

Canonical route: `/internal/admin/membership-access`

Authority:

`my_mmd_entitlement_resolver_v1` is the only current access authority.

The operator interface must answer:

```text
Who
-> Membership/evidence
-> Expected Access
-> Observed Telegram / Drive
-> Difference
-> Add / Remove / Review recommendation
```

`Add / Remove / Review` are reconciliation outcomes, not browser-side entitlement controls.

Downstream state can never create or widen entitlement.

Grace creates no new protected grant. Blocked/suspended/revoked/unknown fails closed.

## 6. My MMD Retention Engine

Canonical route: `/my-mmd/`

Current read BFF remains:

- `GET /api/member/app/dashboard`
- `GET /api/member/app/profile`
- `GET /api/member/app/membership`
- `GET /api/member/app/points`
- `GET /api/member/app/coupons`
- `GET /api/member/app/history`
- `GET /api/member/app/care`

Target customer experience:

```text
My status
-> My actual access
-> My requests / verified history
-> What I can use now
-> Customer-safe next best action
```

Allowed recommendation classes when backed by verified context:

- renew membership
- book a service
- continue a pending request
- use available Public Services as a verified Public Member
- use a verified coupon / care benefit
- open a customer-safe model/preview route when entitled

AI may recommend but may not grant or infer entitlement, points, membership, discounts, payment truth, private model visibility, or booking confirmation.

## AI decision-support boundary

Kenji / AI Workers may:

- summarize
- detect verified mismatch / anomaly
- compare options
- recommend
- route
- follow up

They may not:

- approve payment
- create or widen membership/access
- merge identity without reviewed evidence
- publish models
- approve VIP/SVIP/Black Card exception
- write customer-facing fabricated metrics

Boss Per remains final authority for policy and exceptions.

## UI canon

Internal surfaces:

- SF-first local font stack
- near-black neutral background
- warm ivory text
- restrained gold
- strong contrast
- compact hierarchy
- mobile one-column
- no giant presentation hero
- no raw JSON unless explicitly opened for diagnostics
- no technical implementation prose in the first viewport

## Release strategy

Do not require the owner to approve cosmetic levels one by one.

Implement by target surface while preserving authority gates:

1. Build/read against existing verified contracts.
2. Add only missing read projections.
3. Keep mutation authority in existing canonical workers.
4. Test fail-closed / 401 / missing-data states.
5. Stage UI.
6. Publish only after the surface can work without fake data.

## Current implementation notes

Existing backend contracts already cover substantial parts of Money Control, Model Asset Readiness, My MMD reads, customer-data queue/backfill, and entitlement resolution.

Missing target-level projections should be added as additive read models rather than by duplicating canonical truth into Webflow or browser storage.

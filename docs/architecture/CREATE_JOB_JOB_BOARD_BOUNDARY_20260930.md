# Create Job / Job Board Boundary — Owner Canon

Status: CANONICAL
Owner: Boss Per
Effective: 2026-09-30 Asia/Bangkok

## Decision

Create Job and Job Board are separate owner surfaces.

### Create Job

Canonical route: `/internal/admin/jobs/create-job`

Purpose: confirmed operational work where MMD is creating a real Job/Session.

Create Job keeps:
- Canonical Client lookup
- Client recent/search
- Model lookup
- Public / Private scope
- Job details and price
- payment-first creation flow
- Official Verify gated customer/model URLs

Job Board controls must not be embedded into Create Job. Recruitment UI changes must not modify or replace Client lookup, Model lookup, canonical selection, or Create Job state.

### Job Board

Canonical route: `/internal/admin/job-board`

Compatibility alias: `/internal/admin/jobs/job-board` -> 308 to canonical route.

Purpose: recruitment / open opportunity before a Model is selected.

Job Board:
- does not require Client lookup
- does not select Canonical Client
- does not call Client lineage search
- does not call Model search
- publishes through `POST /v1/admin/job-board/publish`
- returns the canonical Model LIFF broadcast link
- may include only public-safe customer context

### Handoff

A Job Board post may later become input to a confirmed operational job, but the two surfaces do not share browser state.

The safe handoff is:
`Job Board post -> Model interest/application -> owner selection -> Create Job`

Any future handoff must use durable backend identifiers, never hidden browser state or a shared front-end store.

## Non-regression

- Do not put Job Board form controls back inside Create Job.
- Do not make Create Job conditional on Job Board.
- Do not make Job Board dependent on Client lookup.
- Payment, entitlement, model identity, and job truth remain backend authorities.

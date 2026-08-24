# Member Dashboard Route Owner Lock — 2026-08-24

Status: OWNER LOCK

This document prevents the retired member-dashboard routing model from being reintroduced.

## Forbidden ownership

The member-facing dashboard API MUST NOT be owned by `admin-worker`.

The following historical chain is invalid and MUST NOT be restored:

`/api/member/dashboard -> mmd-redirect-worker -> ADMIN_WORKER -> /v1/member/dashboard`

`mmd-redirect-worker` is retired/hard-disabled and is not a routing authority, proxy, compatibility bridge, or service-binding owner for member traffic.

`admin-worker/src/dashboard-worker.js` remains an internal admin dashboard surface only (`/v1/admin/dashboard`). It must not expose `/api/member/dashboard` or `/v1/member/dashboard`.

## Current member authority direction

Member-facing dashboard data belongs in the active member runtime stack:

`Webflow / LIFF member shell -> active member runtime -> MEMBER_STATUS_RESOLVER / mmd-auth-worker -> verified production data`

Current source evidence places member runtime ownership in `member-pages-worker`, optionally fronted by `member-dashboard-chat-worker` where an explicit active public route/service binding is required.

No public `/api/member/dashboard` route is considered canonical until it is explicitly implemented and tested in an active member worker. Do not infer ownership from historical redirect-worker documentation or tests.

## Phase 1 contract constraints

Allowed member-dashboard output:
- verified Tier / membership status
- verified Points ledger value
- verified customer-safe history for the last 365 days
- payment history only
- neutral checking/partial states for unknown data

Explicitly excluded until separately approved:
- membership expiry
- current/realtime payment status
- payment references
- model access grants
- SVIP output or points-based SVIP logic

## Test doctrine

Passing `mmd-redirect-worker` tests is not proof of member-dashboard production readiness.

Member dashboard route/contract tests must live in and exercise the active member worker stack. Regression guards must fail if:
- `admin-worker` adds a member dashboard API route,
- `mmd-redirect-worker` regains routes/service bindings or member API ownership,
- docs or implementation treat redirect-worker as the bridge to `ADMIN_WORKER` for member dashboard traffic.

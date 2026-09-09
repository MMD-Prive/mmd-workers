# MMD Memory — My MMD Lovable App Live Verification — 2026-09-05

Status: LIVE ROUTE / APP OWNERSHIP VERIFIED · AUTHENTICATED POINTS RENDER STILL PENDING

Canonical decision remains:

```text
Lovable = presentation app
MMD Workers = behavior, identity, data and authority
Canonical customer route = /my-mmd/
```

## Source receipts

- Lovable source commit: `93fe7aa8b82c6629f3a74384eec04797176ba7dd`
- Worker PR: `#635 — feat(member): make Lovable app canonical My MMD surface`
- Worker merge commit: `b652d2d9c182243e52e9cd08a346d0974c36a981`

## Production receipts

### Worker deployment

GitHub Actions run `33941974658` — `Deploy member-dashboard-chat-worker`

Result: SUCCESS

The deployment completed validation, Cloudflare version upload/deploy, production route ownership smoke and live receipt recording.

### Canonical My MMD route sync and smoke

GitHub Actions run `33941974768` — `Sync My MMD production routes`

Result: SUCCESS

The run completed:

- bounded Cloudflare route sync
- canonical `/my-mmd/` Lovable app ownership smoke
- live receipt recording

The canonical smoke requires:

```text
GET /my-mmd/
-> HTTP 200
-> x-mmd-route-owner = member-dashboard-chat-worker
-> x-mmd-ui-source = lovable-app-proxy
-> x-mmd-presentation-owner = lovable
-> x-mmd-behavior-owner = mmd-workers
-> /my-mmd-assets/* present
-> Webflow fallback absent
-> lovable-single-file-v1 absent

GET /member/my-mmd
-> HTTP 308
-> redirects to /my-mmd/

GET /api/member/app/dashboard
-> Worker-owned bounded 200/401/403 state
```

Because the production smoke job completed successfully, this route / ownership boundary is now live-verified.

## Points proof gate remains separate

This verification does **not** prove that a real member's Points are correct or visible. The production smoke is unauthenticated / bounded and cannot prove a specific member balance or ledger.

The remaining Points acceptance test is:

```text
real verified member session
-> GET /api/member/app/points
-> backend returns canonical summary + ledger
-> Lovable /my-mmd/points renders those exact values
-> no mock/demo fallback on mmdbkk.com
```

If Points fail after this architecture change, diagnosis is intentionally limited to two layers:

1. Worker/API/backend response, or
2. Lovable query/rendering.

Webflow and the historical single-file shell are no longer valid third runtime owners for My MMD.

## Authority lock

No membership, entitlement, points, coupon, payment or `approved_discount_percent` authority moved into Lovable. The browser remains presentation-only and must fail closed on unresolved backend data.

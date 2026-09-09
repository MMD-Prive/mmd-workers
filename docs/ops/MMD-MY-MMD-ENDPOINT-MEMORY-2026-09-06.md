# MMD Memory — My MMD Endpoint Canon — 2026-09-06

Status: CANONICAL

## Browser routes

- Canonical My MMD home: `/my-mmd/`
- Child routes: `/my-mmd/profile`, `/my-mmd/membership`, `/my-mmd/points`, `/my-mmd/coupons`, `/my-mmd/history`
- Legacy `/member/my-mmd*` must `308` to the matching `/my-mmd/*` route.
- `/member/my-mmd` is not a second UI owner.

## Presentation ownership

```text
Lovable = presentation / pixels / interaction
member-dashboard-chat-worker = mmdbkk.com route + presentation proxy + API ingress
member-pages-worker = member session + member data authority
my_mmd_entitlement_resolver_v1 = Actual Access authority
```

Current presentation origin expected by the Worker:

`https://my-mmd-member-profile.lovable.app`

My MMD assets are exposed same-origin at `/my-mmd-assets/*`.

If the Lovable presentation origin is unavailable or invalid, Worker recovery UI must fail closed. Never replace unresolved member data with mock/demo values.

## Canonical same-origin API endpoints

The new `/my-mmd/` presentation still uses the existing BFF namespace. Do not invent `/my-mmd/api/*`.

All V1 reads are `GET`:

- `/api/member/app/dashboard`
- `/api/member/app/profile`
- `/api/member/app/membership`
- `/api/member/app/points`
- `/api/member/app/coupons`
- `/api/member/app/history`
- `/api/member/app/care`

Provider mapping:

- Dashboard -> `/api/member/app/dashboard`
- Profile -> `/api/member/app/profile`
- Membership -> `/api/member/app/membership`
- Points -> `/api/member/app/points`
- Coupons -> `/api/member/app/coupons`
- History -> `/api/member/app/history`
- CARE state -> `/api/member/app/care`

## Session / LIFF infrastructure kept separate

- `POST /member/api/liff/start`
- `POST /member/api/liff/intent`
- `GET /member/api/liff/status`
- `GET /member/api/liff/profile`
- `POST /member/api/liff/hall-token`

These are identity/session infrastructure. They are not My MMD presentation routes.

## Hard boundaries

- Same-origin fetch with browser credentials only.
- No secret/token in Lovable/frontend code.
- Browser never supplies authoritative tier, points, member ID, coupon %, entitlement or access.
- Membership Level != lifecycle status != Actual Access.
- Actual Access is backend resolver only.
- Unverified backend state stays Checking / unavailable.
- `approved_discount_percent` is the only authoritative actual CARE BACK coupon rate shown to customer.

## Canonical flow

```text
LINE / verified member session
-> https://mmdbkk.com/my-mmd/
-> /api/member/app/*
-> member-dashboard-chat-worker
-> MEMBER_PAGES_WORKER
-> member-pages-worker
-> canonical member reads / resolver-backed truth
```

This memory supersedes older My MMD endpoint references that treat `/member/my-mmd` as canonical or describe the Lovable app as preview-only.

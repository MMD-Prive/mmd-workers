# My MMD Member App API V1

Status: implementation PR / not production-proven
Owner: `member-pages-worker` behind `member-dashboard-chat-worker`

## Purpose

Provide a bounded, customer-safe, same-origin read API for the My MMD member app UI without creating a second browser authentication system.

The API reuses the verified LIFF/member session and delegates to existing canonical member reads:

```text
My MMD UI on mmdbkk.com
-> /api/member/app/*
-> member-dashboard-chat-worker
-> MEMBER_PAGES_WORKER service binding
-> member-pages-worker
-> existing LIFF/member session
-> existing member profile / dashboard / CARE reads
```

The Lovable-hosted preview is a visual prototype only. A browser on `*.lovable.app` must not become a parallel auth/session owner. The live provider is intended for the My MMD UI once hosted or adapted under the canonical MMD same-origin member runtime.

## Routes

All routes are `GET` only and return `cache-control: no-store`.

- `/api/member/app/dashboard`
- `/api/member/app/profile`
- `/api/member/app/membership`
- `/api/member/app/points`
- `/api/member/app/coupons`
- `/api/member/app/history`
- `/api/member/app/care`

Production public ingress is claimed on both `mmdbkk.com` and `www.mmdbkk.com` by `member-dashboard-chat-worker`, which forwards only to the `MEMBER_PAGES_WORKER` service binding.

## Security and truth boundaries

- Existing LIFF/member session is the only browser identity authority.
- No browser-supplied tier, member ID, points, entitlement, access or discount values are accepted.
- Membership Level, lifecycle status and Actual Access remain separate concepts.
- Actual Access is **not** inferred from tier/status. Until an explicit bounded entitlement snapshot is exposed by the canonical backend resolver, the adapter returns `access: "checking"`.
- Missing or unverified data stays neutral/checking.
- Internal Airtable IDs, internal notes, payment refs, proof IDs, model grants, allowlists and secrets are not returned.
- Membership expiry/renewal date is not exposed by this V1 adapter.

## CARE BACK discount rule

The canonical customer-visible actual rate is `approved_discount_percent` only.

The adapter deliberately ignores legacy fields such as:

- `discount_percent`
- `benefit_value`

because current legacy CARE BACK storage still contains historical fixed-10-percent logic. Until the backend produces explicit verified `approved_discount_percent`, the member UI must display only generic pre-verification copy such as `สูงสุด 10% / UP TO 10% OFF`.

`completed` Wish state without `approved_discount_percent` maps to `wish_saved`, not `approved`.

## Live provider contract

The My MMD UI data models map directly to these routes:

- `getDashboard()` -> `/api/member/app/dashboard`
- `getProfile()` -> `/api/member/app/profile`
- `getMembership()` -> `/api/member/app/membership`
- `getPoints()` -> `/api/member/app/points`
- `getCoupons()` -> `/api/member/app/coupons`
- `getHistory()` -> `/api/member/app/history`
- `getCareState()` -> `/api/member/app/care`

Requests must use same-origin credentials. No token or secret belongs in frontend code.

## Production gate

This implementation does **not** prove the real-LINE path.

Before describing the member app as production-connected, prove a fresh production run:

```text
real LINE
-> LIFF start
-> verified member session
-> /api/member/app/profile
-> /api/member/app/dashboard
-> CARE claim
-> Wish saved
-> coupon wallet
-> explicit approved_discount_percent
```

The canonical `real-LINE -> claim -> coupon -> approved_discount_percent` smoke remains **UNPROVEN** until that run is observed and correlated end-to-end.

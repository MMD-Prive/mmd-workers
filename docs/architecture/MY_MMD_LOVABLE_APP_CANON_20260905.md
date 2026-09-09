# MMD Memory — My MMD Lovable App Canon — 2026-09-05

Status: CANONICAL DECISION LOCKED · SOURCE ROLLOUT IN PROGRESS
Decision owner: Per

## Decision

My MMD is one customer application with a strict split of responsibilities:

- **Lovable owns presentation.**
- **MMD Workers own behavior and truth.**

Canonical customer route:

```text
/my-mmd/
```

Canonical nested presentation routes:

```text
/my-mmd/profile
/my-mmd/membership
/my-mmd/points
/my-mmd/coupons
/my-mmd/history
```

Legacy compatibility only:

```text
/member/my-mmd* -> 308 -> /my-mmd/*
```

The old `/member/my-mmd` address is not a second app and must never regain independent behavior.

## Lovable ownership

Lovable owns:

- React/TanStack application shell
- visual layout and navigation
- Points, Membership, Coupons, History and Profile screens
- loading / empty / error / checking states
- TH / EN / ZH presentation
- responsive and interaction behavior

The React/TanStack project is the canonical presentation source. The historical `public/my-mmd-shell.html` / `front-gate-single-file-shell.js` path is reference/rollback material only and is not the production presentation runtime.

## MMD Worker ownership

MMD Workers own:

- LINE / LIFF identity and same-site session
- member profile data
- points balance and ledger
- membership level and status
- entitlement and actual access
- coupons and CARE BACK state
- history
- approved discount percentage
- all authoritative calculations and policy decisions

Canonical browser API namespace remains:

```text
/api/member/app/*
```

The front gate delegates that namespace to `member-pages-worker` through the existing private service binding.

## Hard boundary

The Lovable app MUST NOT call any of these directly:

- Airtable
- LINE APIs
- Cloudflare internal APIs / service bindings
- Supabase
- entitlement resolver storage
- coupon or points storage

The browser MUST NOT calculate or infer:

- points
- membership level
- membership status
- entitlement
- actual access
- coupon percentage
- `approved_discount_percent`

Missing or unresolved backend data remains Checking / fail-closed. No mock or demo values may substitute for live member data on `mmdbkk.com` or `www.mmdbkk.com`.

## Hosting / routing model

Production customer request:

```text
https://www.mmdbkk.com/my-mmd/
  -> Cloudflare route
  -> member-dashboard-chat-worker
  -> credential-stripped fetch of Lovable presentation
  -> same-origin rewritten app assets under /my-mmd-assets/*
```

Presentation requests never forward MMD cookies or Authorization headers to Lovable.

Data request:

```text
Lovable app
  -> same-origin /api/member/app/*
  -> member-dashboard-chat-worker
  -> member-pages-worker
  -> canonical backend truth
```

Thus Lovable remains the app UI while all behavior still runs through MMD Workers.

## LINE verification flow

```text
/my-mmd/
-> explicit tap "ยืนยันผ่าน LINE"
-> canonical MINI App permanent link
-> /member/liff?intent=status
-> same-site LIFF/session verification
-> /member/api/liff/profile returns ok=true
-> return to /my-mmd/
-> Lovable app reads /api/member/app/*
```

The browser never redirects back merely because LINE opened; the existing server/session proof gate remains required.

## Why this replaces the single-file shell

The single-file shell duplicated presentation/runtime responsibility and increased the chance that a static or stale UI path could diverge from live member data, including Points.

The canonical split now removes that ambiguity:

```text
Lovable = pixels + app state
Worker = identity + data + authority
```

Points not appearing in the UI must therefore be diagnosed as either:

1. Worker/API contract/data response problem, or
2. Lovable rendering/query problem,

not as a third competing Webflow/single-file member runtime.

## Production proof gate

Do not call the migration complete until all of these are observed after merge/deploy:

```text
GET /my-mmd/
-> HTTP 200
-> x-mmd-route-owner = member-dashboard-chat-worker
-> x-mmd-ui-source = lovable-app-proxy
-> x-mmd-presentation-owner = lovable
-> x-mmd-behavior-owner = mmd-workers
-> /my-mmd-assets/* loads
-> no Webflow fallback copy
-> no lovable-single-file-v1 marker

GET /member/my-mmd
-> HTTP 308
-> Location: /my-mmd/

GET /api/member/app/dashboard
-> Worker-owned bounded 200/401/403 state
```

A separate authenticated real-member smoke must prove Profile/Dashboard/Points render the values returned by `/api/member/app/*`. The broader real-LINE -> CARE claim -> Wish -> coupon wallet -> `approved_discount_percent` proof remains a separate gate.

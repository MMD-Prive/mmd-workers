# My MMD Member App API V1

Status: CANONICAL ROUTE + API CONTRACT
Refreshed: 2026-09-06 +07

## Ownership

```text
Presentation: Lovable
Canonical browser route: https://mmdbkk.com/my-mmd/
Route / API ingress: member-dashboard-chat-worker
Member data / LIFF session authority: member-pages-worker
Entitlement authority: my_mmd_entitlement_resolver_v1
Operational records: canonical MMD backend / Airtable adapters
```

Lovable owns pixels and interaction only. It must not become a second auth, membership, points, coupon, access or entitlement authority.

## Canonical My MMD browser routes

```text
GET /my-mmd/
GET /my-mmd/profile
GET /my-mmd/membership
GET /my-mmd/points
GET /my-mmd/coupons
GET /my-mmd/history
```

Legacy browser route:

```text
GET /member/my-mmd*
-> 308 to /my-mmd/*
```

Do not restore `/member/my-mmd` as a second presentation owner.

Current presentation origin used by the MMD proxy:

```text
https://my-mmd-member-profile.lovable.app
```

The browser still sees `mmdbkk.com`; executable assets are rewritten to same-origin `/my-mmd-assets/*` by `member-dashboard-chat-worker`.

If the presentation origin is unavailable or returns an invalid build, the Worker must fail closed and show the My MMD recovery screen. That recovery screen is not member-data loss.

## Canonical member app API namespace

The My MMD UI does **not** call `/my-mmd/api/*`.

The canonical same-origin BFF namespace remains:

```text
/api/member/app/*
```

All V1 routes are read-only `GET` and return `cache-control: no-store`.

### Read endpoints

```text
GET /api/member/app/dashboard
GET /api/member/app/profile
GET /api/member/app/membership
GET /api/member/app/points
GET /api/member/app/coupons
GET /api/member/app/history
GET /api/member/app/care
```

### UI provider mapping

```text
getDashboard()  -> /api/member/app/dashboard
getProfile()    -> /api/member/app/profile
getMembership() -> /api/member/app/membership
getPoints()     -> /api/member/app/points
getCoupons()    -> /api/member/app/coupons
getHistory()    -> /api/member/app/history
getCareState()  -> /api/member/app/care
```

Requests must remain same-origin and credentialed. No token, tier, member ID, entitlement, points value, coupon value or secret belongs in frontend code.

## Request flow

```text
Browser at mmdbkk.com/my-mmd/*
-> GET /api/member/app/*
-> member-dashboard-chat-worker
-> MEMBER_PAGES_WORKER service binding
-> member-pages-worker
-> verified MMD member / LIFF session
-> bounded canonical member read
```

A direct browser session on `*.lovable.app` is presentation preview only and must not become a parallel member-session owner.

## Existing LIFF / member identity endpoints

These remain separate from the presentation BFF and are backend/session infrastructure, not replacement UI routes:

```text
POST /member/api/liff/start
POST /member/api/liff/intent
GET  /member/api/liff/status
GET  /member/api/liff/profile
POST /member/api/liff/hall-token
```

CARE BACK backend reads/writes remain under the existing LIFF/member backend contract; My MMD consumes only the customer-safe BFF views above.

## Security and truth boundaries

- Existing verified member / LIFF session is browser identity authority.
- `my_mmd_entitlement_resolver_v1` remains the authority for Actual Access.
- Membership Level, lifecycle status and Actual Access are separate concepts.
- Browser code must never infer access from tier or status.
- Missing or unverified backend state must render `checking` / recovery, not guessed values.
- Internal Airtable IDs, notes, payment refs, proof IDs, allowlists, model grants and secrets must not be exposed.
- Presentation failures do not authorize fallback demo/member data.

## CARE BACK discount lock

The only authoritative customer-visible actual coupon rate is:

```text
approved_discount_percent
```

Legacy fields such as `discount_percent` or `benefit_value` do not authorize the displayed actual percentage.

Until the backend returns an explicit verified `approved_discount_percent`, UI copy may say only generic pre-verification language such as `สูงสุด 10% / UP TO 10% OFF`.

## Production evidence boundary

The route ownership and My MMD BFF contract are canonical. This does **not** by itself prove every real member record, Points ledger, entitlement or CARE BACK approval is correct for a specific account.

The full acceptance chain remains:

```text
real LINE
-> LIFF start
-> verified member session
-> /my-mmd/
-> /api/member/app/profile
-> /api/member/app/dashboard
-> /api/member/app/points
-> CARE claim / Wish
-> coupon wallet
-> explicit approved_discount_percent
```

A specific member-data claim is production-proven only when that member/session path is observed successfully end-to-end.

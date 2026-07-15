# Member Dashboard API

`/sigil/member/dashboard` is a member-facing status hub. The Webflow page may
render Kenji AI copy, but the worker API is the source of truth for dashboard
state, member status, access, points, payment, renewal, and session details.

Frontend code must never unlock membership, dashboard access, points, packages,
model access, VIP/SVIP, or payment state locally. The page reads:

- `GET https://www.mmdbkk.com/api/member/dashboard?t=...`

The public route is bridged by `mmd-redirect-worker` to:

- `GET /v1/member/dashboard?t=...`

Only these query parameters are preserved into dashboard action URLs:

- `t`
- `code`
- `promo`
- `source`
- `invite`

Payment/member/session/entitlement truth comes from worker-resolved
Airtable/Core data only:

- `MMD — Auth Sessions`
- `MMD — Auth Identities`
- `Members`
- `MMD — Member Entitlements`
- `Payments`
- `Sessions`
- `MMD — Points Ledger`
- `MMD — LIFF Renewal Sessions`

Uploaded payment proof is evidence/review state only. Dashboard access becomes
active only from official verification/access/entitlement status. SVIP remains a
private Per-only decision and must not be inferred from `SVIP Eligible` fields or
points rules.

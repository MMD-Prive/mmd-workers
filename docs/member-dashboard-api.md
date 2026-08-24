# Member Dashboard API

`/member/dashboard` is a Webflow presentation shell. Webflow must not hardcode
member values, infer membership locally, or unlock private access from frontend
state.

Canonical read flow:

```txt
Webflow /member/dashboard
-> GET /api/member/dashboard
-> member-dashboard-chat-worker
-> MEMBER_PAGES_WORKER service binding
-> member-pages-worker
-> existing LIFF/member session
-> MEMBER_STATUS_RESOLVER service binding
-> mmd-auth-worker verified member profile
```

`mmd-redirect-worker`, `ADMIN_WORKER`, and `admin-worker` are not part of this
member dashboard route.

## Routes

Public route:

- `GET https://www.mmdbkk.com/api/member/dashboard`
- `GET https://mmdbkk.com/api/member/dashboard`

Implementation route:

- `member-pages-worker` handles `/api/member/dashboard` through the active
  member runtime.

`member-dashboard-chat-worker` fronts the public route only because
`member-pages-worker` is service-only in production.

Only these query parameters are preserved into dashboard action URLs:

- `t`
- `code`
- `promo`
- `source`
- `invite`

## Phase 1 Response

```json
{
  "ok": true,
  "data": {
    "dashboard_state": "ready|partial|checking",
    "data_status": "complete|partial|checking",
    "member": {
      "display_name": "สมาชิก MMD",
      "tier": {
        "value": "Premium",
        "status": "verified|checking",
        "source": "member_profile_resolver"
      },
      "membership_status": {
        "value": "active|expired|pending|null",
        "status": "verified|checking",
        "source": "member_profile_resolver"
      }
    },
    "points": {
      "value": 120,
      "status": "verified|checking",
      "source": "points_ledger",
      "records_count": 2
    },
    "history": {
      "status": "verified|empty|checking",
      "range_days": 365,
      "events": [],
      "payment_history_status": "verified_history|empty|checking"
    },
    "payment_history": {
      "status": "verified_history|empty|checking",
      "records": [],
      "note": "Payment records are historical only and do not represent current payment status."
    },
    "actions": {
      "dashboard_url": "/member/dashboard?t=...",
      "requests_url": "/sigil/booking?t=...",
      "membership_url": "/sigil/member/membership?t=...",
      "payments_url": "/member/payments?t=..."
    },
    "messages": []
  }
}
```

## Authoritative Sources

Identity/session:

- Current LIFF/member session in `member-pages-worker`
- `MEMBER_STATUS_RESOLVER` service binding to `mmd-auth-worker`

Tier and membership status:

- Verified bounded member profile from `mmd-auth-worker`
- Member/profile fields exposed by the resolver only

Points:

- Posted points ledger records from `MMD — Points Ledger`

365-day history:

- Verified customer-safe service/package/points history returned by
  `mmd-auth-worker`
- Same resolved LINE/member identity only

Payment history:

- Verified historical payment records only
- Not current payment status

## Exclusions

The dashboard response must not expose:

- membership expiry date
- current or realtime payment status
- payment refs or proof IDs
- model access grants
- SVIP output or points-based SVIP logic
- internal ops notes
- raw Airtable internals
- secrets

Unknown values remain `checking` or `partial`; they must not become `0`,
`inactive`, `expired`, or `unpaid` unless verified by the active member runtime.

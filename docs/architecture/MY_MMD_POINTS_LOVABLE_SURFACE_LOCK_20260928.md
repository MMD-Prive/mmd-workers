# MY MMD Digital / Lovable data split — 2026-09-28

Status: OWNER DIRECTION — FINAL BOUNDARY

## Decision

MY MMD remains a **Worker-rendered Digital LIFF Home** for the default member journey.

Do not hand the whole Digital Home to Lovable.

Lovable is still an approved customer presentation surface and **all customer data shown by Lovable must be obtained through the verified LIFF/member session and same-origin MMD member APIs**.

The immediate UI exception is **Points**: Points opens the Lovable Points presentation at `/my-mmd/points`.

## Data path for Lovable

```text
LINE / LIFF verification
  -> verified same-site member session
  -> /api/member/app/*
  -> member-dashboard-chat-worker
  -> MEMBER_PAGES_WORKER
  -> member-pages-worker
  -> canonical MMD backend data
  -> Lovable presentation
```

Lovable may display customer-safe profile, membership, Points, coupons, history and other approved member data only through this path.

Lovable/browser is **not** an auth, history-recovery, membership, entitlement, payment, Points-ledger or reconciliation authority.

## Points route

```text
/member/liff?intent=status
  -> Worker-rendered Digital Home

Digital Home Points
  -> /my-mmd/points
  -> Lovable presentation
  -> /api/member/app/points
  -> verified LIFF/member session
  -> canonical MMD Points backend
```

Points policy remains 365-day expiring lots from entry/posting date.

## Customer history — existing system only

The system that **finds, reconstructs and reconciles** historical customer activity remains the existing MMD backend flow. It does not move to Lovable.

```text
LINE OFC / existing MMD historical sources
  -> member-history-recovery
  -> member-history-preload / reconciliation
  -> canonical MMD backend projection
  -> /member/api/liff/* and /api/member/app/history
```

Rules:
- keep automatic recovery from the verified LIFF/member session
- keep LINE OFC / existing MMD historical sources as the recovery inputs
- do not require old slip proof before historical reconstruction
- Lovable must not crawl LINE OFC, infer history, reconcile history or create historical truth
- Lovable may **display the recovered customer-safe history** only after it is exposed by the canonical MMD backend API
- the Digital LIFF History panel remains on the existing Worker/backend path and does not need to redirect to Lovable

## Ownership summary

| Layer | Owner |
| --- | --- |
| LINE identity / LIFF verification | MMD backend |
| Same-site member session | MMD backend |
| Historical source scan / recovery | Existing MMD history system |
| History reconciliation / canonical projection | MMD backend |
| Points ledger / expiry / balance | MMD backend |
| Digital Home | Worker-rendered LIFF |
| Lovable customer data access | Through verified LIFF/member APIs only |
| Points presentation | Lovable |
| Browser-side truth calculation | Not allowed |

## Acceptance

A valid implementation must prove:
- direct LIFF status stays in the Worker-rendered Digital Home
- Points buttons/Quick Access open `/my-mmd/points`
- `/my-mmd/points` is Lovable presentation only
- Lovable customer data is read through the verified LIFF/member session and same-origin `/api/member/app/*`
- History reconstruction stays on the existing MMD backend system
- Digital LIFF History continues to use the existing backend projection
- neither Lovable nor browser code becomes a second source of truth

# MY MMD LIFF Digital History V2 — 2026-09-28

Status: OWNER DIRECTION — SOURCE IMPLEMENTED, NOT YET PRODUCTION-ACCEPTED
Owner: Per
Timezone: Asia/Bangkok

## Decision

MY MMD customer runtime for this phase is the **Worker-rendered LINE LIFF Digital Home**.

Do not automatically hand a normal `/member/liff?intent=status` launch to Lovable.

Canonical current path:

```text
Rich Menu / LINE
  -> /member/liff
  -> POST /member/api/liff/start
  -> verified same-site LIFF session
  -> Worker-rendered MY MMD Digital Home
  -> same-origin MMD APIs
```

Lovable remains a separate/future presentation surface at `/my-mmd/*`. It is not the default direct-LIFF dashboard during this phase.

## Latest source composition

This V2 combines the current main branch after:
- PR #1898 — rolling Points expiry / oldest-expiring-lot-first accounting;
- PR #1911 — Worker-rendered MY MMD LIFF Digital Home.

No rollback to an older member dashboard is intended.

## Customer history authority

Native LIFF history must read explicitly from:

`GET /api/member/app/history`

Truth chain:

```text
verified LINE / LIFF session
  -> same-origin /api/member/app/history
  -> member-dashboard-chat-worker
  -> MEMBER_PAGES_WORKER service binding
  -> member-pages-worker
  -> canonical customer/session/payment/history sources
```

The browser does not select the customer and does not submit a Client ID, LINE user id, member id, payment ref, or history owner.

If history is unresolved/incomplete, UI stays in a neutral checking state. It must not infer an empty history.

## History recovery

Recovery status remains Worker-owned:

- `GET /api/member/app/history/recovery`
- `POST /api/member/app/history/refresh` only as an explicit bounded retry where supported.

A LIFF login may trigger server-side recovery scheduling under the existing recovery contract. The UI observes/readbacks; it does not promote raw evidence into canonical history.

## Points

The Points system keeps the PR #1898 policy:

- each new or approved historical Points lot expires 365 days from its own entry date;
- spending/redeeming consumes the lot expiring first;
- reserve / capture / release / refund remain idempotent backend operations;
- UI shows backend-owned active balance, `expiring_points`, `nearest_expiry`, and per-history-item `expires_at` where supplied;
- browser code must never calculate membership or Points authority.

## Native LIFF Digital V2

Primary dock:
- Home
- History
- Wallet
- Kenji

Other verified screens remain available as native panels / Quick Access:
- Member / Package
- Points
- Jobs
- Coupons
- CARE
- Customer Requests

Design:
- mobile-first;
- charcoal + champagne gold + ivory;
- compact;
- no oversized marketing hero after verification;
- one screen / one job;
- no horizontal-swipe dependency for the active digital state.

## Lovable contract

Lovable is not connected as the default runtime in this phase.

If/when the Lovable MY MMD presentation is opened, customer history must use the exact same same-origin authority:

`/api/member/app/history`

It must never:
- read customer history from Lovable storage;
- invent local/mock history on canonical MMD hosts;
- fall back to a browser-selected customer id;
- use a separate history database or auth model.

History recovery in Lovable must use only:
- `/api/member/app/history/recovery`
- `/api/member/app/history/refresh`

The current My MMD Lovable live provider already maps `getHistory` to `/api/member/app/history`; this contract is now locked as the required future behavior.

## Compatibility intents

Explicit specialized routes may still bridge after LIFF verification where their current product flow requires it, for example:
- `private_teaser`
- `continue_payment`

These exceptions do not make Lovable the default member dashboard.

## Acceptance

Do not call the authenticated customer UI production-accepted until a real LINE account proves:

1. Rich Menu / LIFF opens the native Digital Home.
2. Session is established by `/member/api/liff/start`.
3. Direct `intent=status` does not redirect to Lovable.
4. `/api/member/app/history` resolves the same signed-in customer.
5. Historical customer records appear or stay checking without false empty-state claims.
6. Points active balance, expiring Points and nearest expiry match backend truth.
7. No raw LINE ID, Client ID, payment ref or internal evidence leaks to browser-visible history.
8. Explicit compatibility intents still reach only their bounded destination.

# MY MMD Points Lovable Surface Lock — 2026-09-28

Status: OWNER DIRECTION

## Decision

MY MMD V1 remains the Worker-rendered compact Digital LIFF Home for the default member status journey.

Do not reconnect the whole default LIFF status journey to Lovable in this phase.

Exception: **Points must use the Lovable MY MMD Points surface**.

## Route split

```text
/member/liff?intent=status
  -> member-pages-worker LIFF shell
  -> LINE / same-site session verification
  -> Worker-rendered MY MMD Digital Home

Points entry inside Digital Home
  -> /my-mmd/points
  -> member-dashboard-chat-worker Lovable proxy
  -> Lovable Points presentation
  -> same-origin MMD member APIs for data truth
```

## Boundaries

Lovable owns the Points presentation/pixels for this phase.

MMD workers remain authoritative for:
- LINE/session identity
- customer-history recovery
- Points ledger and balance
- 365-day lot expiry policy
- membership and entitlement
- payment truth

Lovable/browser must not calculate, grant, adjust, extend, or redeem Points.

## History recovery

Customer history recovery continues to use MMD-owned backend sources, especially LINE OFC history, and does not require old slip proof before reconstructing historical customer activity.

Recovered Points still follow the active Points policy: each eligible lot expires 365 days from its entry/posting date.

## Acceptance

A valid implementation must prove:
- direct LIFF status remains Digital Home, not full Lovable handoff
- Points buttons/links route to `/my-mmd/points`
- `/my-mmd/points` is served by the Lovable proxy route owner
- Points data is still fetched through same-origin MMD APIs
- no browser-side Points authority is introduced

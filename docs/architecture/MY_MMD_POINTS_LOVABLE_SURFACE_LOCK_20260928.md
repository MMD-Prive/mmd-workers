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

## History recovery — existing system only

Customer-history reconstruction stays on the existing MMD backend flow. It must **not** be routed through Lovable.

Canonical path:

```text
LINE OFC / existing historical sources
  -> member-history-recovery
  -> member-history-preload / reconciliation
  -> canonical MMD backend projection
  -> Worker-rendered LIFF History / member APIs
```

Rules:
- keep the existing automatic recovery started from the verified LIFF/member session
- keep LINE OFC as the historical source path already used by the recovery worker
- do not require old slip proof before reconstructing historical customer activity
- do not redirect History to `/my-mmd/history`
- do not let Lovable fetch, infer, reconcile, or become authority for customer history
- Lovable receives only the Points presentation role described above

Recovered Points still follow the active Points policy: each eligible lot expires 365 days from its entry/posting date.

## Acceptance

A valid implementation must prove:
- direct LIFF status remains Digital Home, not full Lovable handoff
- Points buttons/links route to `/my-mmd/points`
- `/my-mmd/points` is served by the Lovable proxy route owner
- Points data is still fetched through same-origin MMD APIs
- History remains on the existing Worker/backend recovery path
- History does not redirect to Lovable or `/my-mmd/history`
- no browser-side Points or History authority is introduced

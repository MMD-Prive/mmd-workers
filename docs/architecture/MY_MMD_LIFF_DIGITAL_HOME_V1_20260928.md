# MY MMD LIFF Digital Home V1 — 2026-09-28

Status: OWNER DIRECTION — CANONICAL FINAL BOUNDARY

## Decision

The default MY MMD member experience remains a **Worker-rendered Digital LIFF Home**.

This is the final owner correction for the current architecture:
- do **not** hand normal `intent=status` traffic to Lovable;
- do **not** make Lovable the default Member Console;
- Lovable remains an approved secondary presentation surface and the current exception for **Points** at `/my-mmd/points`;
- customer-history scan/reconstruction/reconciliation remains on the existing MMD backend;
- Lovable may read customer-safe data only through the verified LIFF/member session and same-origin MMD APIs.

PRs #1915–#1918 attempted a whole-app Lovable handoff and are superseded by this owner correction.

Current split:

```text
/member/liff?intent=status
  -> member-pages-worker LIFF shell
  -> LINE / same-site session verification
  -> Worker-rendered compact Digital Home
  -> same-origin MMD APIs only

/my-mmd/
  -> separate Lovable presentation route remains available
  -> not the automatic destination of direct LIFF status

/my-mmd/points
  -> Lovable Points presentation
  -> same-origin /api/member/app/points
  -> verified LIFF/member session
  -> MMD backend Points authority
```

Explicit safe `return_to` intents may still use LIFF as an identity bridge and continue to their strict allowlisted destination.

## Visual source

The V1 layout follows the approved compact digital preview direction:
- dark charcoal / champagne gold / ivory
- mobile-first, max-width phone app shell
- compact greeting
- verified member snapshot
- small Kenji AI module
- backend-backed NEEDS YOU only
- MMD NEWS
- compact Quick Access
- fixed bottom dock
- no oversized marketing hero after verification

## Data authority

The LIFF UI is presentation only.

Authoritative data remains:
- `/member/api/liff/*`
- `/api/member/app/*`
- entitlement resolver / owning workers
- stable member updates API

The browser must not calculate:
- membership
- entitlement
- Points
- payment truth
- access
- booking truth

## Direct status behavior

Direct status:
```text
Rich Menu MY MMD
-> LIFF status
-> verify LINE / session
-> stay in Worker-rendered LIFF Digital Home
```

No automatic redirect to `/my-mmd/`.

## Explicit return behavior

For a bounded explicit `return_to`:
```text
Rich Menu CTA
-> LIFF identity bridge
-> verified session
-> allowlisted destination
```

Unsafe, privileged, mismatched or malformed return targets fail closed **inside LIFF**.

## V1 Digital Home modules

1. Compact app header / LINE verified state
2. Greeting
3. Verified Member snapshot
4. Kenji AI compact entry
5. NEEDS YOU from bounded backend action
6. MMD NEWS from stable Updates API
7. Quick Access
8. LIFF-native member detail panels
9. Bottom dock: Home / Jobs / Wallet / Kenji

## Lovable boundary

This change does not remove the existing Lovable app or its route.

It only changes the default LIFF status journey so that the member can use a compact digital dashboard in LINE first.

Lovable must not become a second identity, history-recovery, entitlement, payment, booking, or Points authority.

Any future switch of the whole Member Console to Lovable requires a new explicit owner decision.

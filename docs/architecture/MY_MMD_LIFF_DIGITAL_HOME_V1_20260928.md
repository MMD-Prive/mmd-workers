# MY MMD LIFF Digital Home V1 — 2026-09-28

Status: OWNER DIRECTION — IMPLEMENTED IN SOURCE, NOT YET MERGED/DEPLOYED

## Decision

During this phase, the member dashboard inside LINE remains a **Worker-rendered LIFF application**.

Do **not** automatically hand direct `intent=status` traffic to Lovable yet.

Current split:

```text
/member/liff?intent=status
  -> member-pages-worker LIFF shell
  -> LINE / same-site session verification
  -> Worker-rendered compact Digital Home
  -> same-origin MMD APIs only

/my-mmd/
  -> existing Lovable presentation remains a separate live route
  -> not the automatic destination of direct LIFF status during this phase
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

A future owner-approved phase may reconnect:
```text
LIFF identity/session
-> Lovable MY MMD presentation
```

That future switch requires route ownership smoke, authenticated real-member acceptance and rollback evidence.

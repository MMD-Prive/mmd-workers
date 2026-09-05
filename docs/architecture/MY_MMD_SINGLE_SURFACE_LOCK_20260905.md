# MMD Memory — My MMD Single Surface Lock

Date: 2026-09-05
Status: Canonical

## Customer-facing rule

My MMD has ONE customer-facing dashboard surface only:

`/my-mmd/`

The LINE Mini App status flow is identity/session transport only. It must not present a second dashboard, second navigation system, or an alternate member profile that competes with `/my-mmd/`.

Canonical flow:

```text
LINE Mini App permanent link
-> /member/liff?intent=status
-> minimal HYPE verification bridge only
-> LIFF/session verification
-> /member/api/liff/profile returns ok=true
-> window.location.replace("/my-mmd/")
-> My MMD is the only member dashboard UI
```

`/member/my-mmd*` remains compatibility-only and 308 redirects to `/my-mmd/*`.

## HYPE loading lock

Use the official HYPE asset supplied by Per:

`https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a36fa9c99c7e95731eeca5d_HYPE.webp`

The Worker republishes it same-origin as `/my-mmd-assets/hype.webp`.

HYPE is the visible loading mark for:

- LINE status verification bridge;
- My MMD boot/loading state;
- bounded fail-closed recovery page.

Normal loading may rotate HYPE slowly. `prefers-reduced-motion` must stop rotation. Error/recovery may show HYPE without motion.

## Ownership

Lovable owns My MMD pixels and interaction.

MMD Workers own identity, LIFF/session, membership, Points, entitlement, CARE BACK, coupons, history, and all authoritative calculations.

The status LIFF shell may retain its internal implementation DOM for compatibility, but the customer must see only the minimal verification bridge for `intent=status`. Specialized non-status LIFF intents, such as campaign flows, are unaffected by this lock unless separately migrated.

## Anti-duplication rule

Do not create or re-enable a separate member dashboard inside the `intent=status` LIFF shell. If My MMD presentation changes in the future, change `/my-mmd/`; keep LINE status as a short verification transition into that one surface.

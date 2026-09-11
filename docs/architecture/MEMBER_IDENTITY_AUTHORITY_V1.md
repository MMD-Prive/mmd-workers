# MMD Member Identity & Entitlement Authority V1

Status: CANONICAL · 2026-09-11
Owner / final authority: Per

## Decision

Memberstack is retired from MMD. It must not be used as an identity provider, member key, authentication layer, lookup fallback, membership authority, entitlement authority, Points key, payment key, job/session identity key, or downstream access authority.

Historical Memberstack values may remain temporarily in Airtable only as audit evidence while migration completes. Active runtime code must not read, write, match, infer, or grant from those values.

## Canonical member identity

Use these identifiers by responsibility:

- `member_id` — MMD/SIGIL-owned stable internal member key.
- `line_user_id` — verified LINE identity key for LINE/LIFF flows.
- MMD Auth session — authenticated browser identity/session.
- Canonical Client linkage — reviewed customer identity relationship used by Customer 360 and operational history.

Never infer a member identity from display name alone.

## Membership / access authority

`MMD — Member Entitlements` -> `my_mmd_entitlement_resolver_v1` is the decision authority for membership/access.

`Members` is identity/profile mapping and bounded readback only. It may support verified expiry readback where the resolver contract explicitly allows it, but it must never override tier/status/access.

Telegram and Drive are downstream observations/grants. They are reconciled from the canonical entitlement snapshot and never create entitlements.

## Expiry read order

For renewal expiry only:

`explicit verified context -> MMD Member Entitlements / Resolver expire_at -> verified canonical Members readback -> latest matched Session -> blank/fail-closed`

Fallback reads may resolve `expire_at` only. They must not mutate or infer tier, status, access, Points, or membership grants.

## Active Airtable field contract

New writes should use:

- `Members.member_id`
- `Members.line_id` / canonical LINE mapping
- `MMD — Member Entitlements.member_id`
- `MMD — Member Entitlements.line_user_id`
- `member_packages.member_id`
- `Sessions.member_id` where a canonical member is resolved
- `MMD — Console Inbox.member_id` only after/with canonical resolution; unresolved intake remains evidence until reviewed

Any field named `memberstack_id` or `Memberstack ID` is retired legacy audit data only and must not participate in active runtime decisions.

## Fail-closed rules

- Missing canonical identity -> do not guess.
- Conflicting `member_id` / LINE / Client evidence -> review required.
- Missing entitlement snapshot -> no private access grant.
- Blocked / suspended / revoked -> fail closed.
- Browser-provided tier/status/Points/member identity claims are never authoritative.

## Migration rule

Do not blank or destroy historical Memberstack values merely to remove runtime compatibility. First stop all runtime reads/writes and backfill canonical `member_id` where confidence is deterministic. Historical fields can then be archived or removed in a separately reviewed data-retention step.

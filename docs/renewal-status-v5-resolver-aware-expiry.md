# Renewal status v5 — resolver-aware expiry fallback

## Authority

Membership entitlement decisions remain owned by `my_mmd_entitlement_resolver_v1` over `MMD — Member Entitlements`. The Members table and Session rows are readback/fallback sources for `expire_at` only. They must never grant or widen tier, status, access, Points, or private visibility.

## Expiry resolution order

1. explicit `expire_at` already supplied by verified server context
2. `MMD — Member Entitlements` evaluated through `my_mmd_entitlement_resolver_v1`
3. verified canonical `Members` row matched only by exact `line_user_id` or canonical MMD `member_id`
4. latest already-matched Session `expire_at`
5. blank / fail-closed

## Safety locks

- No display-name matching for entitlement or canonical Member expiry readback.
- No profile fallback may set `current_tier`, `status`, access, Points, or capability.
- Ambiguous multiple canonical expiry values resolve to blank.
- Blocked entitlement snapshots resolve to blank.
- Public renewal status does not accept a browser-provided authoritative expiry; explicit expiry is for verified server context only.
- Existing Session matching behavior is retained as the last compatibility fallback.

## Why v4 is superseded

The v4 patch allowed profile rows to resolve tier/status and allowed display-name/email profile matching. That predates the current My MMD entitlement authority model. V5 keeps only the useful expiry fallback while preserving Resolver governance and fail-closed behavior.

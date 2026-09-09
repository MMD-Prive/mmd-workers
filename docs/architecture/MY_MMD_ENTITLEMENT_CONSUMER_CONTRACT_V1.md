# My MMD Entitlement Consumer Contract V1

Status: implementation contract
Owner: auth-worker / My MMD

## Canonical flow

`Airtable MMD — Member Entitlements -> My MMD Resolver -> auth-worker profile -> member dashboard / Kenji / booking consumers`

## Airtable canonical fields

Each entitlement is an independent capability record. The resolver must prefer:

- `capability`: `public_member | red_card | guest_pass | private_standard | private_premium | vip | svip | black_card`
- `member_lifecycle_status`: `active | grace | expired | pending_review | suspended | blocked | revoked`
- `access_status`, `start_at`, `expire_at`, `grace_until` remain lifecycle evidence.
- Legacy `member_status`, `entitlement_level`, and `package_code` remain compatibility evidence only.

A member may hold multiple capabilities concurrently. Consumers must not authorize from one scalar tier.

## Auth profile contract

The canonical resolver output is `entitlement_snapshot` with schema `my_mmd_entitlement_resolver_v1`.

Compatibility `tier`, `status`, and legacy grants may remain during migration, but consumers must prefer `entitlement_snapshot.access` for authorization.

## Consumer rules

### Member dashboard

Display safe capability/lifecycle state from `entitlement_snapshot`; never infer private access from a scalar tier.

### Kenji

Kenji may route based on safe capability state but is never a final approver. Protected VIP/SVIP/Black Card content remains explicit allowlist / review gated.

### Booking

- Public booking requires `public_service_access=true` when an entitlement is required by the route.
- Private model scope requires `private_visibility_envelope != none` plus any model-specific/protected approval gate.
- Red Card request lane requires `red_card_request_lane=true`.
- Grace must not create new protected, Drive, or Telegram grants.
- blocked/suspended/revoked/unknown fail closed.

## Safety

Identity, membership, entitlement, points, payment, campaign benefit, and model visibility are separate domains. This resolver does not mutate payment, points, booking confirmation, model approvals, or campaign benefits.

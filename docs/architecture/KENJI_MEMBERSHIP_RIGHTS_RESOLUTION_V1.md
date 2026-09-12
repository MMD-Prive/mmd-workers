# Kenji Membership Rights Resolution V1

Status: implementation canon
Owner: Per / Kenji
Effective: 2026-09-04

## Purpose

Kenji and admin surfaces must resolve membership in two independent layers:

1. **Client Level** — relationship / historical classification from reviewed LINE OA Rename + Tags.
2. **Current Access** — authorization state from `my_mmd_entitlement_resolver_v1`.

Never collapse these two layers into one scalar tier.

## Client Level authority

Authority: canonical LINE OA Rename/Tag parser.

Order from lowest to highest:

`guest/public -> 7_days -> standard -> premium -> vip -> blackcard -> svip`

Marker mapping:

- `Guest`, `Visitor`, `No membership`, `Non-member` -> Guest / Public
- `7 Days`, `7D`, `Trial`, `7 วัน` -> 7 Days
- `Lite`, `Standard` -> Standard
- `Premium` -> Premium
- `VIP`, `-VIP-`, `#VIP` -> VIP
- `Black Card`, `#BlackCard` -> Black Card
- `SVIP`, `-SVIP-`, `#SVIP` -> SVIP

If multiple explicit markers exist, use the highest-ranked marker.

Valid `#memYYYY`, `#memMonYYYY`, or `#client` is a member signal. Under the current canonical parser, a member signal with no other explicit level marker resolves **Client Level = Premium** and records `inferred_premium_from_member_signal`.

Ambiguous labels such as `maybe VIP`, `VIP?`, `unknown`, or `review` must resolve `review_required`; never guess.

Client Level is not a current access grant.

## Current Access authority

Authority: `my_mmd_entitlement_resolver_v1` only.

Consumers read:

- lifecycle: `active | expiring_soon | grace | expired | blocked/revoked`
- `public_service_access`
- `guest_pass_access`
- `private_visibility_envelope`
- protected capability / allowlist state
- model reveal eligibility

Rules:

- No valid resolver snapshot -> fail closed / human review.
- `blocked`, `suspended`, `revoked` -> no new private grants.
- Grace never creates or widens grants.
- Historical tier, LINE tags, spend, points, Telegram state, Drive state, or manual UI fields must never create current authorization.
- VIP / SVIP / Black Card protected access requires current resolver capability plus explicit allowlist/review where required.

## Required display contract

Kenji, Create Session, and admin UI should show both values distinctly:

- `Client Level: Premium`
- `Current Access: Active / Grace / Expired / Review Required`

Client Level must remain visible even if entitlement expired or resolver evidence is unavailable.

## Authority chain

`Canonical Client identity -> LINE OA Rename/Tags parser -> Client Level`

`Canonical Client identity -> MMD Member Entitlements -> my_mmd_entitlement_resolver_v1 -> Current Access`

`VIP/SVIP/Black Card -> Current capability -> explicit protected allowlist/review`

## Example

LINE OA evidence:

`หนุ่ย` + `#client #mem2024 #memMay2024 #mem2026 #memFeb26`

No Lite / VIP / Black Card / SVIP marker.

Result:

- **Client Level = Premium** by current parser.
- **Current Access** must still be resolved independently from `my_mmd_entitlement_resolver_v1`.
- Premium history alone does not grant current private access.

# My MMD Fast Trust Tier v1

Status: canonical MMD policy
Effective: 2026-09-06
Scope: My MMD / LINE OA identity resolution / VIP-SVIP-Black Card access

## Purpose

MMD has long used operator-controlled LINE OA renamed names to mark a small set of exceptional customer tiers. For these three tiers only, that operator-controlled rename is sufficient to grant the tier immediately so the customer does not wait for historical identity reconstruction.

This is intentionally different from generic legacy evidence. It is a narrow trusted-marker rule.

## Trusted source

Only the MMD-controlled LINE OA renamed name field from the canonical contact staging projection is authoritative for this fast path:

- canonical table: `MMD — LINE OFC Client Import Staging`
- verified LINE identity field: `LINE User ID`
- MMD-controlled rename field: `Current LINE Rename`
- canonical Client link field: `Canonical Client`

The legacy `LINE OFC Client Import Staging` table may contain webhook/import history and is **not** the default Fast Trust authority. It remains available only to legacy identity-recovery paths that explicitly depend on its older review schema.

The table name and field names above are one schema contract. Runtime code must consume them through the shared `shared/my-mmd-fast-trust-source.mjs` adapter. A table migration without matching field migration is invalid and deployment must fail before production.

The customer-editable LINE display name is never authoritative for this rule.

Do not grant from:

- `line_display_name`
- browser/query/localStorage values
- free-form email input
- unreviewed notes
- arbitrary hashtags
- guessed similarity

## Trusted suffixes

Case-insensitive, whitespace-tolerant terminal suffixes:

```text
VIP
SVIP
Black Card
BlackCard
```

Canonical mapping:

```text
<name> VIP        -> VIP immediately
<name> SVIP       -> SVIP immediately
<name> Black Card -> Black Card immediately
<name> BlackCard  -> Black Card immediately
```

The marker must come from `Current LINE Rename` supplied by MMD's LINE OA/customer-management evidence, not from a customer-controlled profile field.

## Resolution precedence

For a verified LINE identity:

```text
verified LINE
-> lookup MMD-controlled `Current LINE Rename`
-> trusted suffix present?
   -> yes: grant mapped Fast Trust tier now
   -> no: continue normal canonical Member / entitlement / recovery flow
```

Fast Trust precedence overrides the temporary UI states `new`, `checking`, or `no canonical member link` for tier display/access.

### Anti-false-Guest invariant

A verified LINE identity must never be classified as a new Guest merely because historical Member/entitlement reconstruction is incomplete.

- exact canonical Client link present + member truth unresolved -> show `checking / recovery`, never signup;
- Fast Trust source unavailable or schema lookup failed + member truth unresolved -> show `checking / recovery`, never signup;
- only a successful canonical lookup that proves no protected marker and no canonical Client link may continue as a genuine Guest/new-member state.

This rule prevents storage/schema incidents from being converted into customer-facing membership decisions.

A trusted marker holder must not be shown:

- `สมัครสมาชิกใหม่`
- `ไม่เคยเป็นสมาชิก`
- a lower tier caused only by missing historical reconstruction
- an indefinite checking state caused only by missing Member-row linkage

## Immediate tier, deferred history

Fast Trust grants the trusted tier first. Historical reconstruction happens afterwards.

```text
trusted LINE OA marker
-> immediate VIP / SVIP / Black Card tier
-> My MMD access appropriate to that tier
-> asynchronously/reviewably recover old identity/history
-> enrich Points / expiry / Sessions / Payments / Coupons / Member history later
```

History recovery is enrichment/backfill for these three tiers, not an access gate.

## What may remain pending

Even after Fast Trust tier is active, these fields may remain `checking` or `กำลังดึงประวัติเดิม` until canonical history is reconstructed:

- Points
- historical expiry dates
- old Sessions / Jobs
- Payments / slips
- coupons issued historically
- prior package cycles
- legacy Member IDs

Do not fabricate missing values.

## Email recovery interaction

Old-email / Member ID recovery remains useful for linking historical records, but it must not block Fast Trust tier holders.

For VIP / SVIP / Black Card trusted markers:

```text
Fast Trust tier first
-> email / Member ID recovery later
-> canonical historical link
-> rerun `my_mmd_entitlement_resolver_v1` for enriched current state
```

If the resolver later contains stronger current canonical data, reconcile deliberately; do not silently demote a Fast Trust marker because history is incomplete.

## Security boundary

This policy is safe only because `Current LINE Rename` is treated as MMD-operated evidence.

Required safeguards:

- never read a trusted tier from browser-supplied rename/display name
- never let Lovable or Webflow compute or grant this tier
- Worker/backend owns parsing, normalization and authority
- log the trusted source and matched marker
- ambiguous/conflicting MMD-controlled rename evidence fails closed to review
- do not extend this fast-trust rule to Standard, Premium, Red Card, Points, payment truth, booking truth, or arbitrary entitlements

## Presentation contract

Lovable/My MMD may display a Fast Trust tier only when backend returns it as trusted/verified.

Suggested safe response metadata:

```json
{
  "tier": "svip",
  "tier_verified": true,
  "tier_source": "line_oa_renamed_name_fast_trust",
  "history_state": "recovery_pending"
}
```

Presentation must not infer the tier directly from names.

## Examples

```text
โจ SVIP
-> SVIP immediately
-> history/Points may still show "กำลังดึงประวัติเดิม"
```

```text
แมค VIP
-> VIP immediately
-> no forced new-member signup
```

```text
โป้ BlackCard
-> Black Card immediately
-> old email/history can be linked later
```

## One-line canon

```text
MMD-controlled `Current LINE Rename` ending in VIP / SVIP / Black Card = grant that tier immediately; recover historical details afterwards.
```


## Deployment schema guard

Both `mmd-auth-worker` and `member-pages-worker` deployments must run
`scripts/validate-my-mmd-fast-trust-airtable-schema.mjs` against the production Airtable base before deploy.

The preflight must prove that:
- the canonical table is readable;
- `LINE User ID`, `Current LINE Rename`, and `Canonical Client` exist;
- the exact LINE lookup formula is accepted by Airtable.

If any of these checks fail, deployment fails closed. It must not ship a Worker that can silently degrade known members into Guest/signup.

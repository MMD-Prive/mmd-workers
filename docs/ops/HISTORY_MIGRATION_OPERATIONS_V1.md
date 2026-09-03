# Historical Migration Operations v1

This runbook operationalizes reviewed LINE OA / Crew history without turning archive evidence into current entitlement truth.

## Canonical flow

```text
LINE OA / Crew evidence
  -> LINE OFC Client Import Staging
  -> manual identity commit
  -> MMD — Customer History Reviews
       -> service-history decision
       -> payment decision + coverage decision
       -> points decision
  -> History Materializer
       -> Sessions
       -> Payments
       -> MMD — Points Ledger
  -> my_mmd_entitlement_resolver_v1 readback
```

`my_mmd_entitlement_resolver_v1` remains the only current-rights authority in this flow. The history tools do not write `MMD — Member Entitlements`.

## Payment coverage gate

Identity approval, service approval, payment approval, and points approval are separate decisions.

Before v1 can create a historical `Paid` payment, `MMD — Customer History Reviews` must contain:

- `payment_review_status = approved`
- `payment_coverage_status = complete`
- positive `approved_payment_amount_thb`
- `approved_payment_amount_thb == approved_service_amount_thb`

`partial` or `unknown` coverage fails closed with:

```text
HISTORY_PAYMENT_COVERAGE_INCOMPLETE
```

The service amount is never silently reduced to the amount of the one slip that happens to be available, and the service amount is never promoted into payment truth.

`approved_payment_events_json` may preserve the explicitly reviewed source events for future multi-payment support. V1 still requires complete aggregate coverage before materialization.

## Real production-shaped safety case: Mac / EMs19 Sprite

Accessible archive evidence currently shows:

- LINE Rename/profile: `แมค VIP`, secondary display `(Meem 🍃)`, with historical customer/purchase/member tags.
- MMD Confirmation: EMs19 Sprite, 2 Sep 2026, displayed service total 25,000 THB. The discount/settlement interpretation is not yet proven.
- Crew slip: 3 Sep 2026, 15,000 THB, note `Ems19 Sprite แมค`.

The currently accessible payment evidence covers only 15,000 of a displayed 25,000 service amount. Therefore the correct Full E2E result is a safe stop at `HISTORY_PAYMENT_COVERAGE_INCOMPLETE` with zero Session, Payment, Points, or Entitlement writes. This is a valid E2E safety proof; the system must not invent the missing 10,000 THB.

## History Materializer

Dry-run is default:

```sh
node scripts/line-official-legacy/history-materializer.js --import-id <import_id>
```

Apply only after explicit identity + service + payment coverage + points review:

```sh
node scripts/line-official-legacy/history-materializer.js --import-id <import_id> --apply
```

Historical Payments use imported-history markers and do not impersonate live payment verification.

## Chronological base-points wallet rebuild

Historical service points join the canonical `base_phase1` wallet. If an older history event would precede an already-posted newer event, the materializer stops with:

```text
HISTORY_POINTS_OUT_OF_ORDER_REBUILD_REQUIRED
```

Inspect the wallet rebuild first:

```sh
node scripts/line-official-legacy/points-wallet-rebuild.js --member-id <canonical_member_id>
```

Apply the reviewed chronological remainder rebuild:

```sh
node scripts/line-official-legacy/points-wallet-rebuild.js --member-id <canonical_member_id> --apply
```

The rebuild:

- touches only `base_phase1` ledger math fields;
- orders by `posted_at` then stable payment/idempotency identity;
- recomputes `prior_remainder_thb`, `pool_thb`, `points`, and `remainder_after_thb` at 100 THB = 1 point;
- never changes payment identity, member identity, source, bucket, or entitlement;
- is dry-run by default and idempotent.

## Bounded batch historical migration

Batch migration consumes **already-approved** Customer History Reviews only. It never approves evidence.

Dry-run first:

```sh
node scripts/line-official-legacy/history-batch-migrate.js --limit 25
```

Apply a bounded batch:

```sh
node scripts/line-official-legacy/history-batch-migrate.js --limit 25 --apply
```

Resume from the returned deterministic cursor:

```sh
node scripts/line-official-legacy/history-batch-migrate.js --after-history-review-id <history_review_id> --limit 25 --apply
```

Per-record blockers are isolated and classified. Payment coverage gaps remain blocked; out-of-order points are reported as `wallet_rebuild_required`; missing canonical Member wallet IDs remain blocked. Batch failure never authorizes a fallback entitlement or auto-approval.

## Safety invariants

- Rename/tags/VIP/SVIP/Black Card history is context, not current entitlement.
- Payment evidence is not entitlement truth.
- Service history does not automatically create points; points require separate approval.
- Historical points require a canonical `Members.member_id`.
- No history tool writes `MMD — Member Entitlements`.
- Resolver before/after ordinary service-history materialization must remain unchanged.
- Missing or partial evidence is recorded as incomplete; it is never completed by inference.
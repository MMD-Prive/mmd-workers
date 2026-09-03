# History Materializer v1

## Purpose

`history-materializer.js` is the controlled bridge from reviewed LINE OA / Crew historical evidence into canonical operational history.

Flow:

```text
LINE OA / Crew archive
  -> History Intake Staging
  -> manual identity/history review
  -> canonical Client link committed
  -> History Materializer
     -> Sessions
     -> Payments
     -> Points Ledger
  -> my_mmd_entitlement_resolver_v1 readback
```

The resolver step is a **non-mutation safety verification** for ordinary service history. Service-history backfill must not change current entitlement.

## Review gate

The materializer refuses to run unless the staging row is already:

- `review_status = committed`
- `decision = link_existing_client`
- `decision_source = manual_review`
- reviewed by a named reviewer with a valid review timestamp
- linked to exactly one canonical Client
- no longer `dry_run_only`

V1 also requires exactly one unambiguous service event and one parseable service date per materialization unit. Multiple service events/dates, unknown amounts, or `points_review_required=true` fail closed.

## Writes

### Sessions

A deterministic `hist_sess_*` session is created as reviewed historical service history. Re-running the same import is idempotent.

### Payments

A deterministic internal `hist_pay_*` payment reference is used as the canonical idempotency key. The original bank/payment reference, when present, stays in source evidence/notes.

Historical payment review is distinguished from live slip verification:

- `Payment Status = paid`
- `Verification Status = historical_reviewed`
- `Payment Method = historical_review`

### Points Ledger

Only reviewed MMD service spend is eligible.

- rate: `100 THB = 1 point`
- bucket: `historical_backfill_v1`
- THB remainder carries forward inside that bucket
- backfill must be appended chronologically; inserting an older event after a newer historical ledger event fails with `HISTORY_POINTS_OUT_OF_ORDER_REBUILD_REQUIRED`
- tips, membership fees, renewal fees, ambiguous amounts, referral bonuses, and promotion bonuses are not silently awarded

## Resolver boundary

Before canonical history writes, the materializer reads `MMD — Member Entitlements` and evaluates `my_mmd_entitlement_resolver_v1`.

After Session/Payment/Points writes it reads the same entitlement source and evaluates the resolver again using the same evaluation timestamp.

For ordinary service history, the stable resolver snapshot must be identical. If it changes, the run fails with:

```text
HISTORY_RESOLVER_CHANGED_ROLLBACK_REQUIRED
```

The materializer itself has **no entitlement write path**.

## Membership / renewal history

Historical membership/renewal evidence may be recorded and surfaced as `membership_handoff_required`, but it is not converted to current rights here.

Protected or current entitlement changes must continue through the existing admin/payment approval path and ultimately be accepted by `my_mmd_entitlement_resolver_v1`.

Rename/tag/VIP/SVIP/Black Card history remains recognition/history evidence until that protected path approves a present-day entitlement.

## CLI

Dry-run is the default:

```sh
node scripts/line-official-legacy/history-materializer.js --import-id <import_id>
```

Apply reviewed canonical history:

```sh
node scripts/line-official-legacy/history-materializer.js --import-id <import_id> --apply
```

`--apply` may write only Sessions, Payments and Points Ledger. It must never write Member Entitlements.

# History Materializer v1

## Purpose

`history-materializer.js` is the controlled bridge from reviewed LINE OA / Crew historical evidence into canonical operational history.

Canonical flow:

```text
LINE OA / Crew archive
  -> History Intake Staging
  -> manual identity review
  -> canonical Client link committed
  -> MMD — Customer History Reviews
       pending candidate evidence
       -> explicit service-history approval
       -> explicit points decision
  -> History Materializer
       -> Sessions
       -> Payments
       -> MMD — Points Ledger
  -> my_mmd_entitlement_resolver_v1 readback
```

Identity review and history approval are intentionally separate. Linking a LINE identity to a Client does **not** mean MMD has approved a historical service amount, payment, or points award.

## Review queue

Prepare pending review rows from already committed identity evidence:

```sh
node scripts/line-official-legacy/history-review-queue.js --import-id <import_id>
node scripts/line-official-legacy/history-review-queue.js --import-id <import_id> --apply
```

Batch modes:

```sh
node scripts/line-official-legacy/history-review-queue.js --batch-id <batch_id> --apply
node scripts/line-official-legacy/history-review-queue.js --all-committed --apply
```

The queue may write only `MMD — Customer History Reviews`. Candidate fields are evidence only and are kept separate from approved fields.

Candidate fields:

- `candidate_service_date`
- `candidate_service_amount_thb`
- `candidate_payment_ref`
- `candidate_points_eligible_amount_thb`

The queue never fills `approved_*` fields and never writes Sessions, Payments, Points Ledger, or Member Entitlements.

## Explicit history approval gate

Before materialization, the review row must:

- link exactly one `LINE OFC Import Row` matching the staged import
- link exactly one canonical `Client` matching the committed identity decision
- have `review_status = approved` or an idempotent re-run state of `materialized`
- have `decision = approve_service_history`
- contain `approved_service_date`
- contain positive `approved_service_amount_thb`
- record `reviewed_by` and `reviewed_at`
- contain an explicit `points_review_status`

Points are separate from service-history approval:

- `approved`: `approved_points_eligible_amount_thb` must be positive and match the approved service amount in v1
- `rejected`: Session/Payment history may materialize, but no Points Ledger entry is created
- `not_applicable`: same as rejected for the ledger
- `pending`: materialization fails closed

Approved points additionally require a unique canonical `Members.member_id` wallet. A Client record id is never used as a member wallet id.

## Canonical writes

### Sessions

A deterministic `hist_sess_*` record is created with the canonical Client link and real writable Airtable fields. Historical sessions use:

- `Session Status = Completed`
- `payment_status = paid`
- `import_review_status = approved`
- `imported_source_ref = history_review_id`

Re-running the same review is idempotent.

### Payments

A deterministic internal `hist_pay_*` `Payment Reference` is the idempotency key. The original source/bank reference remains preserved as review/source evidence rather than replacing the canonical key.

Historical payment records use the real writable Payments fields and are marked as imported history:

- `Payment Status = Paid`
- `Payment Method = Other`
- `payment_stage = full`
- `payment_type = full`
- `payment_evidence_source = imported_history`
- `import_review_status = approved`

The materializer deliberately does **not** set live `Verification Status = verified` or official verification fields. Historical review must not masquerade as the live payment-verification pipeline.

### MMD — Points Ledger

Only separately approved historical MMD service spend is eligible.

- canonical table: `MMD — Points Ledger`
- rate: `100 THB = 1 point`
- bucket: `base_phase1`
- source: `line_ofc_history`
- THB remainder follows the same canonical base-points wallet
- canonical `Members.member_id` is required
- tips, membership fees, renewal fees, ambiguous amounts, referral bonuses, and promotion bonuses are never silently awarded

Because historical points join the canonical base wallet, a historical event cannot simply be inserted before a newer existing `base_phase1` event. Such a case fails with:

```text
HISTORY_POINTS_OUT_OF_ORDER_REBUILD_REQUIRED
```

That case requires a chronological wallet rebuild/reconciliation instead of corrupting the carried THB remainder.

## Resolver boundary

Before Session/Payment/Points writes, the materializer reads `MMD — Member Entitlements` and evaluates `my_mmd_entitlement_resolver_v1`.

After the history writes, it evaluates the same entitlement source again using the same evaluation timestamp.

For ordinary service-history backfill, the stable resolver snapshot must be identical. If it changes, the run fails with:

```text
HISTORY_RESOLVER_CHANGED_ROLLBACK_REQUIRED
```

The materializer has **no Member Entitlements write path**.

After a successful unchanged Resolver readback, the Customer History Review row is closed as `materialized` with a bounded audit summary containing only materialization record ids and safety state.

## Membership / renewal history

Historical membership or renewal evidence may set `membership_handoff_required`, but this materializer does not convert it into present-day rights.

Protected/current entitlement changes continue through the existing admin/payment approval path and only become current rights when accepted by `my_mmd_entitlement_resolver_v1`.

Rename/tag/VIP/SVIP/Black Card history remains recognition/history evidence until that protected path approves a present-day entitlement.

## Materializer CLI

Dry-run is the default:

```sh
node scripts/line-official-legacy/history-materializer.js --import-id <import_id>
```

The default review id is deterministically derived from the import id. An explicit review id may also be supplied:

```sh
node scripts/line-official-legacy/history-materializer.js --import-id <import_id> --history-review-id <history_review_id>
```

Apply approved canonical history:

```sh
node scripts/line-official-legacy/history-materializer.js --import-id <import_id> --apply
```

`--apply` may write Sessions, Payments, Points Ledger (when separately approved), and the Customer History Review audit closure. It must never write Member Entitlements.

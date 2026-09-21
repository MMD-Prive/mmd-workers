# Partner Control Room acceptance — HOLD

This is a draft extension of #1427 and #1429 after #1500. It is **not a complete Partner handoff**. Keep Lovable paused and do not invite or notify the pilot Partner from this work. Passing fixture tests is not production acceptance.

## Scope and current evidence

| Scope | Implemented in this draft | Acceptance still required |
| --- | --- | --- |
| Home / calendar | Bangkok agenda, model/date/status filters, encrypted private locks/travel/external jobs, overlap detection, archive/restore, CSV | Real mobile/desktop layout; cross-device behavior; complete history pagination |
| Models | Own roster, search, model detail, shared profile proposals, owner approve/reject/add/remove, no hard deletion or automatic sales activation | Approved extended profile/news/portfolio data must reach canonical MMD consumers; proposed vs approved profile display must remain explicit |
| Photos | Scoped image preview, cover/archive/restore requests, owner decisions, approved cover in Partner roster | Owner must be able to inspect actual shared image before approval; connect approved media to canonical customer profile pipeline |
| Sales | Explicit sharing, source/sell-rate proposals, audiences, dates, separately labeled approved policy | Wire actual availability to the canonical per-customer/time sales resolver; an approved policy alone does not prove customer visibility |
| Agreements | Systems 1/2/3, review queue, version history, current approved agreement, Terms status/handoff | Historical effective-date and concurrent owner-decision acceptance |
| Private Vault | Browser encryption, PIN kept client-side, private contacts/notes/external finances, optimistic R2 revisions, encrypted export | Backup import/recovery UX; concurrent private edits and failed-save recovery; browser acceptance |
| Console | Own-job shared coordination requests, owner replies, private model contact links | Verify owner team workflow; this is a request queue, not automatic MY MMD customer-message delivery |
| Earnings | Frozen-snapshot consumer, exact verified full-payment matching, approved net costs for Profit Share, payout reference persistence, completion/payout-hold checks | Canonical snapshot producer is not integrated; existing financial records need reconciliation; notification delivery and concurrency gates remain open |
| Performance / exports | Per-model job and own-ledger summaries, CSV, browser print/PDF | Historical pagination, lifecycle/refund/void treatment, actual PDF layout |
| Identity / confirmation | Existing LINE identity and Telegram binding; Dashboard and Telegram recheck Official Verify; closed sessions denied | Genuine account binding and verified-payment pilot acceptance without fabricating records or dispatching test messages to real people |

## Release blockers

1. Integrate the canonical commission snapshot producer. Repository audit found consumers and schema fields, but no producer that reliably freezes the agreement for each Session. The new strict consumer deliberately rejects missing/incompatible snapshots. Do not backfill historical rates from today's referral or treat this rejection as a completed Earnings feature.
2. Review the settlement contract below against the real canonical producer and historical records before deployment. This draft only accepts one verified **full** payment. Deposit/final/balance settlement policy is not inferred. Do not change real payment truth or invent cost approvals to make the gate pass.
3. Resolve concurrent mutations for owner intake/decisions and ledger materialization. Airtable read-then-create is not transactional; repeated sequential requests are tested, competing concurrent requests are not yet guaranteed exactly-once.
4. Finish the approved-profile/media consumer path and owner visual review. Extended profile fields and links currently persist in approved Partner change requests; that does not automatically publish them in all MMD customer surfaces.
5. Complete pagination and status accounting before presenting totals as all-time totals. Existing lookups have bounded record windows. Add lifecycle/refund/void acceptance and define the visible reporting period.
6. Complete browser acceptance on a permitted preview surface at mobile and desktop sizes, including modal forms, encrypted-vault restore, image review, and PDF output. The supported browser rejected localhost and `file:` preview access in this session. No alternate browser surface or network workaround was used. Local DOM tests are not visual browser acceptance.
7. After code acceptance, deploy both Workers, verify route ownership/authentication, and run an authorized real account journey. No real Telegram notification, payout, identity binding, or pilot payment mutation was performed by these fixture tests.

## Draft settlement consumer contract

The **existing** Session `commission_snapshot_json` and `commission_snapshot_locked` fields must hold an approved immutable object, and `partner_referral_id_snapshot` must match it. No new database or authentication system is introduced.

```json
{
  "contract": "partner_commission_v1",
  "session_id": "canonical-session-id",
  "partner_record_id": "canonical-partner-record-id",
  "model_record_id": "canonical-model-record-id",
  "referral_record_id": "canonical-referral-record-id",
  "agreement_version": 1,
  "system": "profit_share",
  "basis_rule": "full_payment_only",
  "payment_ref": "canonical-payment-reference",
  "payment_amount_thb": 10000,
  "partner_share_percent": 40,
  "costs_total_thb": 3000,
  "costs_approved_by": "canonical-owner-id",
  "costs_approved_at": "2026-09-25T00:00:00Z",
  "approved_by": "canonical-owner-id",
  "approved_at": "2026-09-01T00:00:00Z"
}
```

The amounts and identifiers above are illustrative, not pilot facts. Bridge uses `commission_percent` (5–10 percentage points); Co-Partner uses `source_rate_thb`. Profit Share uses net full receipts less explicitly approved costs. Airtable percent columns are written as fractions. The ledger stores the snapshot and durable payout reference in existing fields. Current referrals never substitute for historical financial terms.

## Verification receipt

- `npm test` in `partners-worker`: 52 tests passed, including runtime fixture tests and two DOM interaction tests.
- `npm run typecheck` in `partners-worker`: passed.
- `node --test admin-worker/partner-owner-console.test.mjs`: two tests passed; existing credential-bound session, exact-origin write checks, fixed service destinations, no browser-controlled owner identity.
- `git diff --check`: passed.
- No visual browser sign-off, production deployment of this draft, or genuine pilot end-to-end acceptance is claimed.

Final handoff requires every release blocker to have evidence. Do not equate the earlier narrow P1/P2 completion with the complete Partner Control Room scope.

# Points readiness audit — 2026-10-28

This privacy-safe matrix uses local audit labels only; it stores no LINE IDs,
hashes, Airtable record IDs, raw member IDs, or customer names. D1/KV and
Airtable reads were read-only.

| Account | Recovery evidence | Direct linkage readback | Safe disposition |
| --- | --- | --- | --- |
| A01 | `in_progress` (stale) | Member, Client, Entitlement present; links and canonical IDs present | Do not reconcile; owner decision required |
| A02 | `not_started` (KV key absent) | Member, Client, Entitlement present; links and canonical IDs present | Keep unavailable pending supported recovery |
| A03 | `not_started` (KV key absent) | Member, Client, Entitlement present; links and canonical IDs present | Keep unavailable pending supported recovery |
| A04 | `not_started` (KV key absent) | Entitlement has no raw canonical `member_id` | Do not repair or refresh; owner must resolve ID |
| A05 | `not_started` (KV key absent) | Entitlement has no raw canonical `member_id` | Do not repair or refresh; owner must resolve ID |
| A06 | `not_started` (KV key absent) | Member↔Client links missing; Entitlement expired | Preserve unavailable/expired state; owner decision |
| A07 | `not_started` (KV key absent) | Entitlement has no raw canonical `member_id` | Do not repair or refresh; owner must resolve ID |
| A08 | `not_started` (KV key absent) | Member, Client, Entitlement links and IDs present | Keep unavailable pending supported recovery |
| A09 | `review_required` (`batch_preload_review_required`) | No Member; Entitlement→Member absent | Preserve review; identity owner decision required |
| A10 | `review_required` (`points_ready_history_details_pending`) | Entitlement has no raw canonical `member_id` | Preserve review; no automatic recovery |
| A11 | `not_started` (KV key absent) | Member lacks raw canonical `member_id` | Do not repair or refresh; owner must resolve ID |
| A12 | `not_started` (KV key absent) | Entitlement→Client link absent | Do not repair or refresh; owner decision required |
| A13 | `not_started` (KV key absent) | Member lacks raw canonical `member_id` | Do not repair or refresh; owner must resolve ID |
| A14 | `in_progress` (stale) | Entitlement is `pending_review`; other links present | Do not reconcile; preserve pending review |
| A15 | `reconciled` with `source_notes_pending` | No Member, Client, or Entitlement record | Treat as unresolved; owner must resolve identity |

Additional readback:

- Production D1 has 15 queue rows and 15 snapshots; all snapshot Points values
  remain unavailable/NULL, never confirmed zero. Queue rows are at attempts=1.
- Ledger evidence remains 12 rows: 7 posted historical rows with `member_id`,
  5 rows without status and ownership; three payment-backed rows are expired.
  No ledger, balance, expiry, entitlement, or recovery state was changed.
- The new D1 observability columns are absent in production, so the migration
  and five-minute drain are code-only proposals pending review/deploy. No
  bounded snapshot refresh was safe because no account passed all recovery,
  identity, and ledger gates.

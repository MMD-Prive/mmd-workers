# LINE OFC Client Import

This importer stages LINE Official rename/tag and historical-note evidence before any Client, entitlement, payment, or points update.

## Source Of Truth

- LINE OFC rename/tag is the source of truth for canonical `parsed_client_level`, legacy `membership_status`, `membership_tier`, `membership_package`, `member_since`, and purchased flags.
- Canonical client levels are `guest`, `7_days`, `standard`, `premium`, `vip`, `blackcard`, `svip`, `unknown`, and `review_required`.
- Legacy `parsed_membership_tier` and `parsed_membership_package` remain staged for backward compatibility, but `parsed_client_level` is the canonical review field.
- Gmail must not write membership fields.
- Dry-run writes only to `LINE OFC Client Import Staging`.
- Dry-run does not patch `Clients`, create Clients, merge Clients, or overwrite manual Airtable fields.

## Airtable

Base:

```sh
AIRTABLE_BASE_ID=appsV1ILPRfIjkaYg
```

Tables:

```sh
AIRTABLE_CLIENTS_TABLE_ID=tblVv58TCbwh5j1fS
AIRTABLE_MEMBER_ENTITLEMENTS_TABLE_ID=tblNImdF9PKAxhXGi
AIRTABLE_ACTIVITY_LOGS_TABLE_ID=tblbUWRoFL6OI6QMJ
AIRTABLE_CONSOLE_INBOX_TABLE_ID=tblFHmfpB2TTrzO2e
AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID=tbl1u0foFBvgFpT9G
```

The dry-run importer uses only `Clients` for read-only matching and `LINE OFC Client Import Staging` for writes.

Staging schema notes:

- `parsed_client_level`: canonical single-select level parsed from LINE OFC rename/tag evidence.
- `membership_parse_json.client_level`, `client_level_raw`, and `client_level_tokens`: evidence payload for review UI and audit.
- `parsed_membership_tier` / `parsed_membership_package`: legacy compatibility fields, not the canonical level.
- `reconciled_service_amount`: review-safe historical service spend proposal after payment reconciliation.
- `reconciliation_basis`: explains whether the amount came from explicit final total, deposit plus balance, a single service amount, cancellation, or review-required ambiguity.
- `historical_service_status`: `completed`, `cancelled`, `unknown`, or `review_required`.
- `cancellation_evidence`: normalized cancellation wording while `raw_note` remains preserved separately.

Historical notes are parsed into staged service-history and points reconstruction evidence on the same staging table only. The importer does not write `MMD — Points Ledger`, `Payments`, `Members`, `Clients`, or `MMD — Member Entitlements`.

## Historical Service Reconciliation

The importer must not add every monetary token in a confirmation note together.

Priority:

1. Explicit final/net total such as `ยอดรวม`, `ยอดสุทธิ`, `final total`, or `net total`.
2. If no final total exists, one deposit plus one remaining balance may form the reconciled total.
3. A single clear service amount may be used when there is no conflicting payment breakdown.
4. Gross/original price, final total, deposit, balance, and internal MMD outstanding amounts must never be counted as separate customer spend for the same job.
5. Conflicting or multiple unresolved totals become `review_required` rather than creating points.

Example:

```text
ยอดรวม 22,500
Discount 10% From 25,000
มัดจำ 6,750
ชำระหน้างาน 15,750
```

The reconciled service spend is `22,500`, not the sum of all four numbers.

## Cancelled Jobs

Cancellation language such as:

```text
ยกเลิกงาน
งานยกเลิก
ขอยกเลิกงานค่ะ
ลูกค้ายกเลิก
ไม่ได้เกิดงาน
งานไม่เกิด
ไม่ได้ไปงาน
ไม่ได้รับงาน
cancelled / canceled
```

must be staged as:

```text
historical_service_status = cancelled
reconciliation_basis = cancelled_zero
reconciled_service_amount = 0
points_eligible_amount = 0
proposed_points = 0
```

Cancellation status wins even if an old note also contains price, deposit, or balance figures. Those figures remain audit evidence only and do not generate service spend or points unless a later human review explicitly creates a separate approved fee policy.

## Points Policy

- Locked rate: `100 THB = 1 point`.
- Only reconciled completed service purchase through MMD can generate `proposed_points`.
- Cancelled jobs generate zero service points.
- Tips through MMD are stored as customer detail/generosity signal and do not generate points.
- Direct hand tips never count as points.
- Membership fees and renewal fees are review-required and do not auto-count.
- Referral and promotion bonuses are review-required unless explicit campaign rules exist.
- Ambiguous amounts are staged as `unknown_amount` and require review.

## Command

```sh
npm run line-ofc:dry-run -- --file <path>
```

Until the LINE OFC CSV export is available, Console Inbox can be used as a dry-run source:

```sh
npm run line-ofc:dry-run -- --source console-inbox
```

Console Inbox maps `inbox_id` to a stable `line_ofc_console_<inbox_id>` import id, `member_name` to display/rename fallback, `legacy_tags` to raw tags, `line_user_id` to exact LINE matching, and `member_phone`/`member_email` to exact identity candidates. `raw_row_json` is redacted before staging.

Optional stable batch id:

```sh
npm run line-ofc:dry-run -- --file <path> --batch-id line_ofc_2026_06_01
npm run line-ofc:dry-run -- --source console-inbox --batch-id line_ofc_console_2026_06_01
```

Set `AIRTABLE_API_KEY` as an environment variable or shell secret before running.

## Historical evidence intake

For historical material coming from LINE OA 1:1, Per's Crew group, or LINE group albums, use `history-evidence-intake.js` instead of pretending Airtable is the historical source.

Dry-run is the default:

```sh
node scripts/line-official-legacy/history-evidence-intake.js \
  --file ./history.json \
  --source line_ofc \
  --batch-id history_20260903
```

Evidence-only apply is explicit:

```sh
node scripts/line-official-legacy/history-evidence-intake.js \
  --file ./history.json \
  --source line_crew \
  --batch-id history_20260903_crew \
  --apply-evidence
```

History Intake v1 may write only `LINE OFC Client Import Staging` and `MMD — Payment Proofs` (`pending` evidence only). It never writes current entitlement, Points Ledger, Payments truth, Sessions, or Bookings. Current access remains authoritative only through `my_mmd_entitlement_resolver_v1`.

See `docs/ops/HISTORY_INTAKE_V1.md` for the full contract and input example.

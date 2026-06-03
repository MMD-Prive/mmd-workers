# LINE OFC Client Import

This importer stages LINE Official rename/tag evidence before any Client or entitlement update.

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

Historical notes are parsed into staged points reconstruction evidence on the same staging table only. The importer does not write `MMD — Points Ledger`, `Payments`, `Members`, `Clients`, or `MMD — Member Entitlements`.

Points policy:

- Locked rate: `100 THB = 1 point`.
- Service purchase through MMD can generate `proposed_points`.
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

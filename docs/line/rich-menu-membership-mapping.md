# LINE Rich Menu Membership Mapping

Status: audit/prep only. No deploy, no LINE Rich Menu publish, no Webflow publish, and no merge.

This document records the safe LINE Rich Menu to LIFF/member-route mapping for MMD Privé membership flows.

## Ownership

Rich Menu configuration is not repo-owned at this time. No rich menu JSON/config/publish script was found in the repository during audit.

The Rich Menu should be configured manually in LINE OA Manager unless a future repo-owned LINE Rich Menu publishing workflow is intentionally added.

Repo-owned pieces currently confirmed:

- `POST /member/api/liff/identify`
- safe query handling for `t`, `code`, and `promo`
- pre-dashboard holding behavior

## Product Rule

LINE Rich Menu is navigation only.

LINE and LIFF must not become the source of truth for:

- membership activation
- payment verification
- points awarding
- package materialization
- entitlement/access materialization
- dashboard unlock

Dashboard access remains locked until first real job/session evidence exists.

No Rich Menu button should point directly to `/member/dashboard`.

## Exact URL Mapping

| LINE Rich Menu Button | URL |
| --- | --- |
| สมัครสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=public_membership` |
| ตรวจสอบสถานะสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=member_status` |
| ต่ออายุสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=renewal` |
| ขอจอง/เลือกโมเดล | `https://mmdbkk.com/sigil/booking?source=line&entry_route=booking_request` |

## LIFF Identity Flow

Expected flow:

```text
LINE Rich Menu
-> member-facing URL
-> LIFF frontend wrapper
-> POST /member/api/liff/identify
-> safe next route response
```

Required LIFF identity behavior:

- `member-pages-worker` requires `POST` for `/member/api/liff/identify`.
- `mmd-redirect-worker` should route `/member/api/liff/identify` to `member-pages-worker`.
- Only `t`, `code`, and `promo` are preserved in safe next routes.
- `safe_next.dashboard` stays `null` until first real job/session evidence exists.
- LIFF identity alone does not activate membership, payment, points, package, access, entitlements, or dashboard.

## Airtable Mapping

### `MMD — LIFF Renewal Sessions`

Purpose: staging/log only for LIFF attempts and member-facing renewal/signup flow.

Use for:

- `renewal_session_id`
- `line_user_id`
- `line_display_name`
- `member_id_candidate`
- `member_id_canonical`
- `member_id_display`
- `member_id_validation_status`
- `renewal_flow_status`
- `renewal_trigger`
- `requested_package`
- `profile_preview_json`
- `legacy_evidence_summary`
- `identity_linked_at`
- `proof_uploaded_at`
- `verified_at`
- `materialized_at`
- `reviewed_by`
- `review_note`
- `payload_json`
- `liff_url_binding`
- `member_entry_route`
- `membership_page_intent`

This table is not membership truth by itself.

### `Clients`

Purpose: read/match canonical client identity context.

Use for:

- `line_user_id`
- `line_display_name`
- `telegram_username`
- `email`
- `memberstack_id`
- `username`
- `mmd_client_name`
- `nickname`
- `source`
- `primary_channel`

### `LINE OFC Client Import Staging`

Purpose: LINE OFC rename/tag evidence staging.

Use for:

- `line_user_id`
- `line_display_name`
- `line_renamed_name`
- `line_tags_raw`
- `parsed_membership_status`
- `parsed_membership_tier`
- `parsed_membership_package`
- `parsed_member_since`
- `parsed_has_purchased`
- `parse_confidence`
- `review_status`
- `proposed_client_updates_json`
- `proposed_entitlement_json`
- `blocked_fields_json`
- `proposed_points`
- `liff_renewal_flow_status`

LINE OFC evidence remains staged/proposed until a verified materialization trigger.

### `MMD — Member Entitlements`

Purpose: verified backend/admin truth only.

Use only after official verification or admin-approved materialization.

Use for:

- `member_status`
- `access_status`
- `entitlement_level`
- `package_code`
- `start_at`
- `expire_at`
- `telegram_access_status`
- `line_user_id`
- `payment_ref`
- `session_id`

### `member_packages`

Purpose: package/payment verification ledger only.

Use only from verified payment/package flow.

Use for:

- `member_email`
- `memberstack_id`
- `package_code`
- `amount`
- `currency`
- `status`
- `start_date`
- `end_date`
- `payment_ref`
- `provider`
- `ledger_type`
- `source`

### `Sessions` / `Jobs`

Purpose: real confirmed job/session evidence for dashboard unlock.

Use for:

- `session_id`
- `job_id`
- session/job status
- linked client/member identity
- confirmed first real job/session check

Dashboard unlock should be based on server-derived evidence from these operational records, not on LIFF identity alone.

## Blockers / Follow-up Checks

- Confirm the actual LIFF frontend wrapper calls `POST /member/api/liff/identify` after route open.
- Confirm `MMD — LIFF Renewal Sessions` table/fields exist in the production Airtable base.
- Confirm `/sigil/booking` is the intended public booking request owner. Audit found references from the member dashboard, but did not confirm route handler ownership in inspected worker paths.

## Risk Notes

- LINE Rich Menu remains navigation only.
- Manual LINE OA setup can drift from repo docs unless owner-controlled.
- No production publishing was performed.
- Do not configure any LINE Rich Menu button to point directly to `/member/dashboard`.

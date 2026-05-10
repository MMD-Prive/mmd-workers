# SIGIL Renewal Production Note

- `/pay/renewal` live depends on `https://sigil.mmdbkk.com/assets/inme/renewal-r6.js`.
- Do not remove or rename this asset route without updating Webflow.
- Renewal proof upload hotfix is production verified on worker version `1a1f19e7-5451-4f87-8627-aeea17a0e87f`.
- Test Airtable inbox record: `recWOYItriR1DBYH4`.
- R2 binding was temporarily removed for deploy because Cloudflare R2 bucket `mmd-sigil-evidence` is not enabled/available yet.
- Follow-up task: enable R2 or create bucket `mmd-sigil-evidence` before turning on recovery evidence upload full mode.

## Dynamic Membership Expiry

- `/pay/renewal` must not publish or assume a fixed 365-day renewal rule.
- Public renewal choices are limited to `Premium Package`, `Standard Package`, `VIP`, and `Black Card`.
- The browser payload sends package, payment, proof, points, and dynamic policy context; backend membership/access logic decides the final expiry.
- If the policy is unclear, the renewal must remain `pending_review` for Per/manual approval instead of shortening or overwriting an active expiry.
- If a current expiry is still active, any approved extension starts from the current expiry. If already expired, it starts from now.
- Do not overwrite an active expiry with a shorter expiry.
- Customer-facing wording: `วันหมดอายุสมาชิกอาจขยายเพิ่มเติมได้ตามยอดใช้งานที่เข้าเกณฑ์ points และสถานะแพ็กเกจ โดย Per จะตรวจสอบและยืนยันวันหมดอายุสุดท้ายอีกครั้ง`

## Black Card And SVIP

- `black_card` is the actual system entitlement/status.
- Black Card is not a normal 365-day membership, and it is not lifetime by default.
- Black Card must keep `black_card_default_validity_months=36`, `black_card_review_cycle_months=12`, `black_card_expiry_rule=long_term_dynamic_points_extension`, and `black_card_lifetime=false`.
- Black Card default validity is `36` months with a `12` month soft review cycle.
- The 12-month Black Card review is a soft review only, not hard expiry.
- Black Card expiry rule is `long_term_dynamic_points_extension`; it can extend by paid renewal, eligible spending, points threshold, package activity, or Per/manual approval.
- If a Black Card expiry decision is unclear, keep the entitlement in `pending_review`; do not auto-downgrade.
- SVIP is not a public package and must not appear on `/pay/renewal`, public package cards, public pricing, or customer-facing package lists.
- Internal SVIP handling means `member_status=black_card`, `entitlement_level=black_card`, `relationship_tier=svip`, `handler_mode=per_private_first`, `handled_by=per`, `pre_release_review_required=true`, and `private_first_contact=true`.
- SVIP may have Black Room access through Black Card entitlement, but sensitive offers, private previews, high-value invites, and new access should route to Per first for private handling before release.
- SVIP does not create a separate public Telegram package/group by default.

## Access Downgrade Ladder

- Premium, VIP, Black Card, and 7 Days Guest Pass are expiring privileges, not permanent tiers.
- Expired Premium/VIP/Black Card/Guest Pass should downgrade to `standard_basic` unless blocked/manual review says otherwise.
- Standard Member remains in the system with limited visibility only: basic model info such as age, height, and weight.
- Standard Member must not see deep/private model details, private photos/videos, real availability, booking priority, private pricing/conditions, service entitlement, private Telegram groups, internal notes, or sensitive information.
- Customer-facing wording: `เมื่อสิทธิ์ Premium, VIP, Black Card หรือ Guest Pass หมดอายุ บัญชีของคุณอาจถูกปรับกลับเป็น Standard Member โดยอัตโนมัติ Standard Member ยังสามารถเห็นข้อมูลพื้นฐานบางส่วนได้ เช่น อายุ ส่วนสูง และน้ำหนัก แต่จะไม่สามารถเข้าถึงข้อมูลเชิงลึก สิทธิ์การจอง หรือกลุ่มส่วนตัวได้ จนกว่าจะต่ออายุหรือได้รับการอนุมัติสิทธิ์ใหม่`

## Payment UI And Proof Safety

- Renewal payment methods are `Bank Transfer`, `QR PromptPay`, and `Credit Card`.
- Bank Transfer details: KTB Bank / Krungthai, account name `ธัชชะ ป. / Tatcha P.`, account number `1420335898`.
- QR PromptPay uses `https://promptpay.io/0829528889` or `https://promptpay.io/0829528889/{amount}` when amount is known.
- Credit Card uses `https://www.paypal.com/ncp/payment/M697T7AW2QZZJ` and should disclose the approximate `4%+` service charge.
- Keep the `oldProof` production hotfix intact: base64 data URL, 5MB max, no request when too large, metadata plus base64 in intake payload.
- Telegram summaries must show proof metadata only and must keep `Proof Base64: [base64 omitted]`.

## Telegram Access Automation

- `/v1/membership/access/sync` reads `MEMBERSHIP_ACCESS_SYNC_MODE`, which may be `dry_run`, `notify_only`, or `enforce`; missing, empty, or invalid values default to `dry_run`.
- `dry_run` calculates would-remove/would-downgrade results and writes audit logs only. It must not call Telegram removal APIs.
- `notify_only` calculates would-remove/would-downgrade results, notifies Per/admin, and writes audit logs only. It must not call Telegram removal APIs.
- `enforce` is the only mode allowed to call Telegram removal APIs.
- `AIRTABLE_TABLE_MEMBER_ENTITLEMENTS=tblNImdF9PKAxhXGi` is configured in `payments-worker/wrangler 2.toml`.
- The configured source-of-truth table is `MMD — Member Entitlements` in Airtable base `appsV1ILPRfIjkaYg`.
- `MEMBERSHIP_ACCESS_SYNC_MODE` must stay `dry_run` for the first production rollout.
- After deploy, call `/v1/membership/access/sync` in dry-run only with an entitlement lookup key such as `entitlement_id`, `member_email`, `memberstack_id`, `telegram_user_id`, `payment_ref`, or `session_id`; confirm the response reports `entitlement_source=airtable_member_entitlements` and the expected Airtable record ID/table ID before any mode escalation.
- Only after Per reviews dry-run results should the mode move to `notify_only`; `enforce` remains a later/manual approval step.
- `enforce` is blocked unless `AIRTABLE_TABLE_MEMBER_ENTITLEMENTS` or another explicit entitlement source of truth is confirmed, and destructive removal additionally requires a matched entitlement record.
- Activity logs may receive membership decisions as fallback/audit records, but activity logs are not a reliable authoritative entitlement source of truth.
- Automated Telegram removals at scale must remain `dry_run` until the first production dry-run has been reviewed by Per; then `notify_only` may be considered before any later `enforce`.
- Key entitlement fields include `entitlement_id`, `member`, `client`, `memberstack_id`, `member_email`, `telegram_user_id`, `telegram_username`, `line_user_id`, `member_status`, `access_status`, `entitlement_level`, `package_code`, `start_at`, `expire_at`, `grace_until`, `renewal_status`, `membership_expiry_rule`, `points_can_extend_expiry`, `relationship_tier`, `handler_mode`, `telegram_access_status`, `telegram_group_key`, `telegram_chat_id`, `telegram_removed_at`, `telegram_removal_reason`, `source`, `payment_ref`, `session_id`, and `payload_json`.
- Telegram private group access follows entitlement after expiry plus grace/review, not instantly at expiry.
- Known groups: `TG_CHAT_VIP_LOUNGE=-1003578473671`, `TG_CHAT_BLACK_ROOM=-1003348473234`, `TG_CHAT_PREVIEW_TH=-1002393788585`, `TG_CHAT_MMD_PREMIUM=-1001668261779`.
- The bot must be admin in the target group/channel and the member must have a linked `telegram_user_id`.
- Telegram removal requires `MEMBERSHIP_ACCESS_SYNC_MODE=enforce`, a linked `telegram_user_id`, an expired entitlement, satisfied grace/review window, no pending payment/review extension, a confirmed entitlement source of truth, a target group mapping, and a logged Telegram success or failure result.
- Removal reasons are `premium_expired_removed_from_group`, `vip_expired_removed_from_group`, `black_card_expired_removed_from_group`, and `guest_pass_expired_removed_from_group`.
- Log every removal or Per-private-first route to the activity log when configured.

## Wrangler Filename Note

- `payments-worker/wrangler 2.toml` is still the active requested config filename for this safety pass.
- Because the filename contains a space, deploy and dry-run commands must quote the config path:

```bash
npx wrangler deploy --config "payments-worker/wrangler 2.toml"
```

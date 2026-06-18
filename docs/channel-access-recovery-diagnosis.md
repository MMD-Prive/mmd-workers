# Minimal Channel Access Recovery Diagnosis

Date: 2026-06-18

## Root Cause

Production `/webhooks/line*` is owned by `mmd-redirect-worker`, which bridges the canonical `/webhooks/line` path to the legacy Netlify LINE webhook owner. The latest Kenji/Per AI maintenance helpers exist elsewhere, but the actual production receiver for LINE is still `immigrate-worker/netlify/functions/webhook.js` through the front-door bridge.

Telegram has a live `telegram-worker` for bot/internal messaging, but its public webhook was only a skeleton and there was no production-safe `/promo/issue` route. Existing `/promo/validate` behavior lives in `payments-worker` and is catalog-only; it does not issue personal single-use Pride codes.

## Minimal Changes

- Keep `/member/dashboard` and `/member/membership` untouched.
- Keep `mmd-redirect-worker` production route behavior untouched.
- Add LINE diagnostic support to the actual Netlify webhook owner via `GET /webhooks/line?health=1`.
- Expand existing Kenji/Per AI LINE trigger recognition for the locked aliases: `Hi Per`, `Per AI`, `Kenji`, `Kenji AI`, `เคนจิ`, and `เปอร์ ai`.
- Add `telegram-worker` `/promo/issue` using KV-backed storage only. If storage is not configured, it fails closed with `storage_not_configured`.

## Remaining Work

- Confirm LINE Official default rich menu ID and action map from LINE Console/API before claiming rich menu is fully repaired.
- Configure a production `PROMO_CODES_KV` binding for `telegram-worker` before deploying `/promo/issue`.
- Wire Telegram login/verification to call `/promo/issue` after official verification. This patch only adds the minimal issuing layer.

## Production Gate Checklist

- [ ] LINE default rich menu ID confirmed.
- [ ] LINE rich menu action map confirmed to send supported trigger text/postback.
- [ ] `PROMO_CODES_KV` production binding configured for `telegram-worker`.
- [ ] Telegram production route owner decided: `member-dashboard-chat-worker` bridge or `telegram-worker` route.
- [ ] Telegram login/verification calls `/promo/issue` only after verification.

### PROMO_CODES_KV Binding

`PROMO_CODES_KV` is required before deploying `telegram-worker` `/promo/issue`.

The binding must point to a real Cloudflare KV namespace created for personal promo code records.

Do not deploy `/promo/issue` while the binding still contains placeholder IDs.

## Latest Production Gate Status

### Completed

- LINE diagnostic and trigger alias support added.
- Telegram `/promo/issue` issuing layer added.
- `PROMO_CODES_KV` real Cloudflare KV namespace IDs configured in `telegram-worker/wrangler.toml`.
- PR remains draft.
- No deploy performed.

### Still Blocked Before Production

1. LINE rich menu gate
   - Confirm LINE Official default rich menu ID.
   - Confirm action map for the Per AI / Kenji AI button.
   - Confirm whether action type is text, postback, or URI.
   - If text, expected trigger should be `Hi Per` or another supported alias.

2. Telegram bridge/source owner gate
   - Actual `member-dashboard-chat-worker` source is missing from this worktree.
   - Historical docs mention `tmp/cloudflare-member-dashboard-chat-worker/index.js`, but that bundle is not present.
   - Do not patch `chat-worker` unless confirmed as the production source for `member-dashboard-chat-worker`.
   - Bridge from Telegram verification to `telegram-worker POST /promo/issue` requires source recovery or route owner mapping.

### Production Safety Lock

- Do not deploy PR #77 until LINE rich menu action map is confirmed.
- Do not deploy Telegram promo issuing until the verified Telegram route owner is confirmed.
- Do not issue promo codes before Telegram user verification.
- Do not use promo codes as payment confirmation, membership confirmation, SVIP approval, or Black Card approval.

### LINE Rich Menu Gate

The LINE Official default rich menu ID and action map are not present in this repository/worktree.

Before production readiness, confirm from LINE Official Manager or LINE Messaging API:
- default rich menu ID
- Per AI / Kenji AI button action type
- text/postback/URI payload
- whether the button sends `Hi Per` or another supported trigger alias

Do not claim LINE rich menu is repaired until the action map is confirmed.

## LINE Rich Menu V6 Decision

Button 3 final mapping is locked:

- Label: `คุยกับ Per`
- Action type: `Message`
- Payload: `Hi Per`

Compatibility:
- Pass in principle because PR #77 already supports `Hi Per`.
- No LINE webhook code patch is needed.
- No new test is needed for this decision.

Important:
- `คุยกับ Per` is the customer-facing label only.
- `Hi Per` is the actual LINE Message payload.

Remaining external confirmation before LINE gate fully passes:
- Confirm default rich menu ID from LINE Official Manager.
- Confirm active/default = yes.
- Confirm Button 3 is saved as Message payload `Hi Per`.

## LINE Rich Menu Current Production Finding

Current manual finding:
- No active/default rich menu is currently in use in LINE Official Manager.
- Rich Menu V6 must be recreated or reactivated manually in LINE Official Manager.
- This is an external LINE configuration issue, not a webhook code issue.

Required V6 mapping:

1. สมัครสมาชิก
   - URL: https://www.mmdbkk.com/pay/membership?src=line-richmenu

2. ต่ออายุสมาชิก
   - URL: https://www.mmdbkk.com/sigil/pay/renewal?src=line-richmenu

3. คุยกับ Per
   - Action: Message
   - Payload: Hi Per

4. สิทธิประโยชน์
   - URL: https://www.mmdbkk.com/membership/benefits?src=line-richmenu

5. ค้นหานายแบบ
   - URL: https://www.mmdbkk.com/sigil/models?src=line-richmenu&entry=model-finder

6. จองนายแบบ
   - URL: https://www.mmdbkk.com/sigil/booking?src=line-richmenu

Deploy status:
- Do not deploy PR #77 for this issue.
- Recreate/reactivate Rich Menu V6 manually first.
- After manual setup, test Button 3 sends `Hi Per`.

## Safety

- No secrets were printed or changed.
- No payment confirmation, membership confirmation, SVIP approval, or Black Card approval is performed.
- Promo issue records are discount/access codes only and are single-use by design.

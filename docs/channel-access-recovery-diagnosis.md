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

## Safety

- No secrets were printed or changed.
- No payment confirmation, membership confirmation, SVIP approval, or Black Card approval is performed.
- Promo issue records are discount/access codes only and are single-use by design.

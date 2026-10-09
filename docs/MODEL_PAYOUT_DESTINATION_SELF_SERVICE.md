# MODEL_PAYOUT_DESTINATION_SELF_SERVICE

Part of [MODEL_PAYOUT_AUTO_APPROVE](./MODEL_PAYOUT_AUTO_APPROVE_DESIGN.md) (issue D). Collects where each model wants their own payout sent, after the model has acknowledged a job. **No money moves here.** Feature flag is OFF by default.

## What it does
- `POST /v1/confirm/payout-destination/context` (payments-worker): returns `enabled`, `can_submit`, and the current destination as status + masked tail only.
- `POST /v1/confirm/payout-destination` (payments-worker): validates and stores the destination on the canonical `Models` record as `pending`.
- `webflow/sigil/confirm/job-model-payout-destination-v1.js`: UI-only form on `/sigil/confirm/job-model`, shown only after acknowledgement and only when the backend says enabled.

Auth is the same signed model confirmation token as `/v1/confirm/ack` (`authorizeConfirmationRequest`, role must be `model`). The model record is taken from the Session's `Canonical Model` link (exactly one link required), never from the request body. Requires `model_ack_at` on the Session.

## Rules enforced in code
- Flag `MODEL_PAYOUT_DESTINATION_ENABLED` must be `"true"`; otherwise submit is 404 and context says `enabled:false`.
- Types: `promptpay_phone` (10-digit Thai mobile), `promptpay_national_id` (13 digits, checksum validated), `bank_account` (10-15 digits + bank name).
- Any change to a destination resets `status` to `pending` and clears `verified_by` / `verified_at`. Re-sending an identical verified destination changes nothing.
- 5 submissions per session per hour (uses `PAY_SESSIONS_KV`).
- The full number is never returned, logged, or put in an error. Errors are stable codes.

## Airtable fields on `Models` (created 2026-10-09 in base appsV1ILPRfIjkaYg, table tblI4B0bI446vp9GX)
| Field | Type | Env var for field ID |
|---|---|---|
| payout_dest_type | single select: promptpay_phone, promptpay_national_id, bank_account | `AT_MODELS__PAYOUT_DEST_TYPE` = `fldk9k2qujhTefjty` |
| payout_dest_bank | single line text | `AT_MODELS__PAYOUT_DEST_BANK` = `fld99a9MhCugaWAB2` |
| payout_dest_name | single line text | `AT_MODELS__PAYOUT_DEST_NAME` = `fldG621U5D6juDwwY` |
| payout_dest_ref | single line text | `AT_MODELS__PAYOUT_DEST_REF` = `fldIPkGcOUnxPDaJa` |
| payout_dest_status | single select: pending, verified, rejected | `AT_MODELS__PAYOUT_DEST_STATUS` = `fldLDFaPgXsj614BU` |
| payout_dest_submitted_at | date time | `AT_MODELS__PAYOUT_DEST_SUBMITTED_AT` = `fldxZUm6HkD9vSVXR` |
| payout_dest_verified_by | single line text | `AT_MODELS__PAYOUT_DEST_VERIFIED_BY` = `fldzEBi1AAV1UtbQG` |
| payout_dest_verified_at | date time | `AT_MODELS__PAYOUT_DEST_VERIFIED_AT` = `fldQzrE5EFX7oGhS8` |

The IDs are set in `payments-worker/wrangler.toml` with the flag `false`. Airtable's API cannot hide fields: restrict `payout_dest_ref` and `payout_dest_name` to owner/finance views in Airtable (hide them from shared/interface views) before enabling. Optional overrides: `AT_MODELS__TABLE` (default `tblI4B0bI446vp9GX`), `AT_SESSIONS__CANONICAL_MODEL` (default `fldrXQAyOMPCvbOaY`).
## Airtable fields to create on `Models` (not created by this PR)
| Field | Type | Env var for field ID |
|---|---|---|
| payout_dest_type | single select: promptpay_phone, promptpay_national_id, bank_account | `AT_MODELS__PAYOUT_DEST_TYPE` |
| payout_dest_bank | single line text | `AT_MODELS__PAYOUT_DEST_BANK` |
| payout_dest_name | single line text | `AT_MODELS__PAYOUT_DEST_NAME` |
| payout_dest_ref | single line text | `AT_MODELS__PAYOUT_DEST_REF` |
| payout_dest_status | single select: pending, verified, rejected | `AT_MODELS__PAYOUT_DEST_STATUS` |
| payout_dest_submitted_at | date time | `AT_MODELS__PAYOUT_DEST_SUBMITTED_AT` |
| payout_dest_verified_by | single line text | `AT_MODELS__PAYOUT_DEST_VERIFIED_BY` |
| payout_dest_verified_at | date time | `AT_MODELS__PAYOUT_DEST_VERIFIED_AT` |

Restrict `payout_dest_ref` and `payout_dest_name` to owner/finance views. Optional overrides: `AT_MODELS__TABLE` (default `tblI4B0bI446vp9GX`), `AT_SESSIONS__CANONICAL_MODEL` (default `fldrXQAyOMPCvbOaY`).

If any of the eight field IDs is missing the endpoints answer `payout_destination_not_configured` (503) even when the flag is on.

## Staff verification (manual, by design)
1. Open the model's record, compare `payout_dest_name` with `private_real_name`.
2. Match -> set status `verified`, fill `payout_dest_verified_by` and `payout_dest_verified_at`. No match / unclear -> set `rejected`.
3. Only `verified` destinations may be used by later payout/QR work (issues A, B). This PR does not read them for any payment.

## Rollout
1. Merge (no behavior change; flag off).
2. Fields exist and IDs are in wrangler.toml (done). Hide `payout_dest_ref` / `payout_dest_name` from shared views.
2. Create the Airtable fields, set the eight `AT_MODELS__PAYOUT_DEST_*` vars (non-secret field IDs).
3. Owner deploys. Do not run `wrangler deploy` from automation.
4. Set `MODEL_PAYOUT_DESTINATION_ENABLED="true"` for a pilot, test with one model on a real confirm link.
5. Paste `job-model-payout-destination-v1.js` into the Webflow page (after the existing confirm scripts).
6. Send existing models a confirm-style link once so they can submit.

## Not in this PR
Payout approval, caps, held_owner handling, QR/Telegram digest, and provider payout (issues A, B, C).

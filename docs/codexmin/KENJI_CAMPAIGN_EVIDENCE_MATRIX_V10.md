# CODEXMIN V10 — Campaign Evidence Matrix (No Personal Data)

**Read only:** Airtable `SIGIL — Knowledge Board` (128 records), `MMD — Promo Codes` (12 records); GitHub source and MMD Google Drive. Snapshot: 20 Nov 2026 ICT.

| Campaign / alias | Primary historical sources | Source label | Why insufficient for Public Kenji |
|---|---|---|---|
| CARE BACK / `6-years-care-back` / `care_back` | `shared/membership-promotion-policy.mjs`, `/promotion/6-years-care-back`, `kenji_20_011_care_back_2026` | Policy + public landing + legacy Knowledge | Neither proves current exact owner-approved public copy / per-page publication revision. October / November announcement windows differ from December payment honor. |
| CARE BACK legacy September | `kenji_sep2026_membership_sales_01_overview`, `..._03_care_back`, `..._08_wish_coupon`, `sigil_kb_20260904_care_back_coupon_booking_flow_001` | Airtable active/published, effective Sep | Contains old membership, Verify, Wish and coupon claims. No verified current publication receipt. Quarantine from public reply; preserve history. |
| Double Moment financial | `promo_double_moment_sep2026`, `payments-worker/double-moment-policy.js` | Financial policy v2/v3 | Purchase issuance depends on recorded policy at verified payment; campaign name alone cannot determine valid-to. |
| Double Moment advertising | `double-moment-continues-2026-telegram`, `events-worker/src/compcard-approved-manifest.js` | Owner-approved manifest, revision `2026-11-04-owner-approved-double-moment-monthly-120d-copy` | Hash and copy are advertising assets, not exact proof of the final Telegram message/revision or a credit entitlement. |
| Double Moment legacy Knowledge | `kenji_sep2026_membership_sales_02_double_moment` | Active + published, 14 Sep; says 180 days | Conflicts with later advertising copy (120 days) and v3 policy (3 calendar months). |
| Promo Codes | `MMD — Promo Codes` | 10 active of 12, 8 of active past expiry | Per-code state/expiry is not approval/publication authority. One active code has a later expiry but that does not extend Public announcement. |

## Canonical CARE BACK temporal authority (source, not publication approval)

- Public November wave: before `2026-12-01T00:00:00+07:00` (through 30 Nov).
- Payment honor: before `2027-01-01T00:00:00+07:00`.
- Tier-specific renewal reconfirmation boundary: `2026-11-04T16:00:00+07:00`.
- October wave: before `2026-11-01T00:00:00+07:00`.
- Source: `shared/membership-promotion-policy.mjs` Git blob `36c09b80beeadd3afab3f9355422e7034b8eb56e`.
- An owner instruction to stage Season 2 promotion in mid-November does **not** independently document a December Public publish window.
- Existing granted benefits are evaluated under their original verified transaction record; never recalculate from today's advertisement.

## Recorded legacy Airtable IDs requiring quarantine review

- `kenji_20_011_care_back_2026` — already retired in #3229.
- `kenji_sep2026_membership_sales_01_overview` — mixed September campaign overview.
- `kenji_sep2026_membership_sales_02_double_moment` — outdated 180-day Double Moment ad answer.
- `kenji_sep2026_membership_sales_03_care_back` — old Verify and renewal claims.
- `kenji_sep2026_membership_sales_08_wish_coupon` — older Wish / coupon policy.
- `sigil_kb_20260904_care_back_coupon_booking_flow_001` — old Coupon → Booking.
- `sigil_kb_20260904_care_back_real_line_smoke_status_001` — internal smoke/operational state, not a public benefit.

**Draft fix strategy:** filter *unverified campaign material* regardless of `active`/`published`, not just a manually named pair. Keep administrative list/detail/audit intact. Avoid broad live content changes without explicit owner approval.

## Double Moment version collision

| Artifact | Recorded term | Meaning / guard |
|---|---|---|
| Google Drive `MMD DOUBLE MOMENT — September 2026 Canon v1` | 180 days | Historical 13 Sep doc; cannot override newer approved copy or individual recorded policy. |
| `events-worker/src/compcard-approved-manifest.js` | 120 days | Public advertising metadata; approved manifest but separate from credit issuance. |
| `payments-worker/double-moment-policy.js` | v2: 120 days, v3: 3 calendar months with 5-month maximum | Financial code; active deployment and historical purchase metadata still need verification. |
| Telegram Preview message 135 | Delivery referenced for 3 Nov | Must read actual message ID, channel, time and exact posted text; documentation reference is not the receipt itself. |

## Safe MMD Voice

Use short Public MMD language; do not expose Internal/Private rules or guaranteed personal entitlement. When no evidence: explain only that the latest campaign cannot be verified, and route to the existing MY MMD Coupons view for personal status. This is handoff, not an eligibility claim.

## Sources

- https://github.com/MMD-Prive/mmd-workers/blob/main/shared/membership-promotion-policy.mjs
- https://github.com/MMD-Prive/mmd-workers/blob/main/events-worker/src/compcard-approved-manifest.js
- https://github.com/MMD-Prive/mmd-workers/blob/main/payments-worker/double-moment-policy.js
- https://docs.google.com/document/d/13pIyJrafq4P7vV5qcKP2lpU1znqnkRqVo9BbMi0fM9I/edit
- https://docs.google.com/document/d/1ufXXWi9HEaL65kAZCKXTMf_yOCekGnLt1aTSudjAZ2c/edit

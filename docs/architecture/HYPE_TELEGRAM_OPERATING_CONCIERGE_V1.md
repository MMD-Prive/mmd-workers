# HYPE — Telegram Operating Concierge V1

Status: implementation canon
Owner: MMD / Boss Per
Surface: Telegram
Primary worker: `telegram-worker`
Live read projection: `admin-worker`

## Role

HYPE is the Telegram operating concierge for MMD.

HYPE is not only a Preview bot or notification sender. Its role is to:

- identify a verified MMD customer from the stable Telegram User ID;
- read a customer-safe operational snapshot from canonical MMD systems;
- tell the customer their current membership/job/payment progress;
- tell the customer the next safe action;
- route the customer to MY MMD, CARE BACK, Booking, or another approved customer surface;
- keep private account status out of Telegram groups;
- continue existing Telegram access reconciliation, notifications, and room hygiene.

HYPE is **not** a source of business truth.

## Authority boundary

Canonical authority stays with:

- Identity: canonical Client / verified LINE + Telegram binding
- Membership: My MMD Entitlement Resolver
- Payment: payments-worker / canonical payment projection
- Job/session: canonical job/event state
- Calendar: canonical scheduling projection
- Final owner review: Per

HYPE must never independently:

- mark payment paid;
- grant or extend membership;
- add Points;
- activate a coupon;
- approve Black Card / VIP / SVIP;
- confirm a job;
- assign a model;
- create or override customer truth.

Protected actions remain supervised/canonical-backend actions.

## V1 live commands

Private chat:

- `/status`, `สถานะ`, `เช็กสถานะ`, `ดูสถานะ`
  - reads verified Telegram identity
  - resolves canonical Client
  - reads the Kenji LV5 live fan-in
  - returns customer-safe membership, active job, payment progress, credit and next action

- `/next`, `ต้องทำอะไรต่อ`, `ทำอะไรต่อ`, `ขั้นตอนต่อไป`
  - returns the current customer-safe next action from canonical live context

- `/help`, `ช่วยอะไรได้บ้าง`
  - shows HYPE capabilities and approved routes

## Privacy lock

Customer-specific status may be returned only in a private Telegram chat.

If a status/next-action command is sent in a group or supergroup:

- do not call Client 360;
- do not resolve account status;
- do not expose membership, model, job, payment, Points, coupon or identity data;
- ask the user to continue in a private chat with HYPE.

## Stable identity

HYPE status reads require a verified Telegram binding.

Lookup contract:

`telegram_user_id + telegram_verification_status=verified -> exactly one canonical Client`

- zero matches -> connect_required
- more than one match -> fail closed as identity conflict
- no name-only or username-only inference
- LINE remains the primary account identity boundary

## Live fan-in

V1 reuses the existing Kenji LV5 live context:

`Telegram ID -> Canonical Client / Per Rename -> Client 360 -> Entitlement -> Calendar -> Job -> Payment/Credit -> HYPE observation -> Next Action`

HYPE receives only a bounded customer-safe projection. Internal record IDs, payment references, admin notes, service secrets, risk flags and admin URLs must not be returned to Telegram.

## CARE BACK

HYPE knows the current CARE BACK Phase 2 customer flow and may route to:

`/promotion/6-years-care-back`

Phase 2 remains CARE BACK CONTINUES (1–30 September 2026), uses the same benefit policy as Phase 1, and must not create duplicate claims/coupons/Points bonuses.

Identity verification alone does not open the coupon. A Birthday Wish must be saved before personal coupon activation/display, and pre-verification customer copy is limited to "ส่วนลดสูงสุด 10%" / "UP TO 10% OFF".

## Member group command guide

HYPE may publish a command guide in the canonical MMD member groups:

- Standard group: `TELEGRAM_STANDARD_GROUP_ID=-1002073919780`
- Premium group: `TELEGRAM_PREMIUM_GROUP_ID=-1001668261779`

Group-safe commands:

- `/commands` / `/help` — show the command guide
- `/points` — route to MY MMD Points
- `/coupons` — route to MY MMD Coupon Wallet
- `/careback` — show the current CARE BACK route

Private-data commands:

- `/status`
- `/next`
- `/booking`

When private-data commands are used in Standard or Premium groups, HYPE must not call Client 360 or expose customer status in the group. It must route the user to a private HYPE chat instead.

The group command guide must never expose customer names, model names from a customer's active job, payment amounts, Points balances, coupon codes, entitlement details, or other account-specific data.

## Customer gender routing context

HYPE must know the customer's explicitly recorded gender when it is needed for routing, but must not infer it.

Canonical read order:

- explicit canonical Client fields such as Customer Gender / Client Gender / Gender / Sex / เพศ
- an explicitly labelled canonical note such as `เพศ: หญิง` or `Gender: female`
- otherwise `unknown`

Rules:

- never infer gender from customer name, photo, Telegram profile, model choices, booking history, room membership, or writing style;
- gender context is private routing context and must never be exposed in Standard, Premium, Preview, or MMD Chat;
- customer-facing public/group messages remain gender-neutral;
- downstream recommendation/catalog selection must filter by verified gender + intent before expanding results; HYPE must not pull every lane merely because a gender-aware route exists;
- if gender is unknown, use neutral routes or ask in private only when the answer materially changes the service/result;
- HYPE receives only the normalized routing value and provenance needed for routing, not an unrestricted profile dump.

Current normalized values: `male`, `female`, `nonbinary`, `other`, `prefer_not_to_say`, `unknown`.

## Preview presence and welcome

Preview is a HYPE-managed public-safe Telegram surface.

- canonical Preview group: `TELEGRAM_PREVIEW_GROUP_ID=-1002393788585`
- `/commands` and `/help` show a Preview-labelled command guide
- when a human joins Preview, HYPE deletes the Telegram join service message and posts a short welcome instead
- bot joins are cleaned up without a welcome
- Preview welcome text never resolves Client 360, entitlement, gender, job, payment, Points balance, or coupon code
- account-specific commands remain private-chat only

## Preview audience gate

HYPE must not infer customer gender or viewing preference from name, photo, LINE display name, Telegram username, or other indirect signals.

For Model discovery in Telegram Preview, HYPE follows the existing LIFF Hall audience decision only:

- `female_view -> show_female_profiles`
- `lgbt_view -> show_lgbt_profiles`
- `unknown -> hold_until_selected`
- `manual_review -> manual_review_only`

If no self-selected audience exists, HYPE must not fall back to all profiles. It routes the customer to `/hall` to choose first.

For new human joins in Telegram Preview:

- delete the Telegram join service message;
- post a group-safe HYPE welcome;
- explain that Model discovery is audience-gated;
- offer Hall selection and private HYPE chat;
- do not expose or infer account-specific gender/audience in the group.

## Existing HYPE operational capabilities retained

- Telegram internal notification routing by canonical topic
- verified Telegram identity binding
- protected-room access observation/reconciliation
- join service-message cleanup for configured MMD groups
- CARE BACK Preview/customer routing
- complaint/recovery notification routing
- fail-closed Telegram send behavior

## V2 customer commands

After V1 production verification, HYPE adds:

- `/booking`, `การจอง`, `เช็กการจอง`, `เช็กงาน`, `งานของฉัน`
  - private-chat only for live customer status
  - reads the existing safe Job/Payment projection
  - shows verified job progress, model display name, scheduled time, payment state and next action
  - never confirms availability, assigns a model, or changes job state

- `/points`, `แต้ม`, `คะแนน`, `ดูคะแนน`, `ดูแต้ม`
  - routes to `/my-mmd/points`
  - does not duplicate a Points balance in Telegram
  - canonical Points truth remains the member runtime / MMD — Points Ledger

- `/coupons`, `/coupon`, `คูปอง`, `ดูคูปอง`, `คูปองของฉัน`
  - routes to `/my-mmd/coupons`
  - does not duplicate coupon wallet truth in Telegram
  - wallet status, usage and expiry remain canonical in MY MMD

- `/careback`
  - explains the current CARE BACK Phase 2 flow
  - routes to `/promotion/6-years-care-back` and the canonical MY MMD coupon wallet

This keeps HYPE useful without creating a second Points or Coupon authority.

## Next implementation lanes

1. customer-safe payment proof status explanation
2. owner/internal HYPE summary using Client 360 + Job + Payment + Calendar
3. supervised handoff to Kenji/Per with existing context, without making the customer repeat their story
4. future Points/Coupon inline values only if a canonical member-runtime service contract explicitly exposes a bounded Telegram-safe read projection

All future lanes must preserve the same authority and privacy locks.

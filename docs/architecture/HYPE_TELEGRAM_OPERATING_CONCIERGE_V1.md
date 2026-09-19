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

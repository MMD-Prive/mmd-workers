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
- Preview welcome text never resolves Client 360, entitlement, job, payment, Points balance, or coupon code
- account-specific commands remain private-chat only
- Model discovery must never fall back to all profiles
- HYPE may use verified private gender routing context internally, but Model visibility still follows the customer's self-selected Hall audience
- `female_view -> show_female_profiles`
- `lgbt_view -> show_lgbt_profiles`
- `unknown -> hold_until_selected`
- `manual_review -> manual_review_only`
- if no Hall audience is selected, HYPE routes to `/hall` first and does not recommend Models
- Preview group copy must not disclose the customer's recorded gender/audience value

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

## Payment status explanation

HYPE may answer payment-status questions in private Telegram chat from the bounded canonical payment projection.

Supported examples include:

- `/payment`
- `จ่ายแล้วไหม`
- `ชำระแล้วไหม`
- `สลิปถึงยัง`
- `ยอดคงเหลือ`
- `เหลือจ่ายเท่าไหร่`

Rules:

- `pending_review` means evidence is awaiting review; it must never be described as paid;
- `paid=true` is the only customer-safe paid confirmation exposed by this projection;
- outstanding amount and verified credit may be shown only from canonical numeric fields;
- HYPE must never infer a payment from Job status, a Telegram message, a slip image, or customer wording;
- HYPE must never mark paid, accept/reject a slip, or modify payment truth;
- payment status is private-chat only and must not resolve Client 360 from a Telegram group.

## Owner HYPE Summary

Priority 2 is Owner Mode for Per.

Supported owner prompts include:

- `/owner`
- `/today`
- `/per`
- `วันนี้มีอะไรต้องดูบ้าง`
- `สรุปงานวันนี้`

Owner authorization is Telegram-native and fail-closed:

- the requester must be the `creator` of the canonical HYPE Ops chat (`TELEGRAM_CHAT_ID`);
- `administrator`, `member`, unknown or Telegram API failure is not enough;
- owner truth is not read until creator verification succeeds.

Privacy:

- detailed Owner Summary is delivered only to the verified owner's private Telegram chat;
- if invoked from the HYPE Ops group, the group receives only a safe acknowledgement;
- customer names, Model names, payment amounts, review queues and Client context must never be posted back into the group.

Canonical source:

- Owner Summary is derived from `admin-worker buildAdminDashboard()`;
- Payment Review remains owned by Payment Review / payments authority;
- Historical Recovery remains owned by the historical recovery runtime;
- Job and reconfirm data remain canonical Session/reconfirm truth;
- Membership review remains canonical Member/entitlement truth;
- Client detail is opened on demand through canonical Client 360 rather than copied into HYPE as a new database.

Owner Summary is read-only. HYPE may prioritize and link to actions but must not approve payments, change Job state, grant membership, or perform any protected mutation.

## Supervised Handoff · Priority 3

HYPE can hand a verified private-chat customer to Kenji or Per without forcing the customer to restart the story.

Customer commands:

- `/kenji` — prepare a cross-channel handoff to Kenji / LINE Official
- `/human` or `/handoff` — prepare a supervised handoff to Per / MMD
- Thai aliases such as `คุยกับเคนจิ`, `ขอคุยกับเปอร์`, `ส่งต่อให้ทีม`

Continuity contract:

- successful HYPE reads from `/status`, `/next`, `/booking`, and `/payment` write a bounded continuity snapshot to the existing Kenji Conversation Matrix;
- the Matrix is keyed to the existing LINE conversation hash only after Telegram resolves to one Canonical Client and that Client already has a stable LINE identity;
- if LINE identity is absent, HYPE reports `canonical_only` / `line_identity_not_linked` and does not create a synthetic LINE conversation;
- the Matrix carries topic, last customer request, canonical snapshot summary, next action, open loops and handoff state;
- HYPE does not copy raw private notes, payment references, service secrets, or unrestricted Client 360 data into the Matrix.

Handoff rules:

- every handoff refreshes the canonical HYPE/Kenji live fan-in before preparing the envelope;
- `handoff_required=true` is conversation state only and does not approve payment, confirm a Job, grant membership, or mutate entitlement;
- Kenji/Per must refresh canonical truth before any protected action;
- HYPE Ops receives a bounded internal handoff summary through the existing `human_handoff` / Crew route;
- customer-facing Telegram receives only the reference, destination and safe next step;
- when cross-channel continuity is ready, LINE/Kenji resumes from the Matrix and should not ask the customer to repeat information already present there.

Canonical LINE entry for the MMD handoff remains `https://lin.ee/xRqsALs`.

## Natural-language Intent Router · Priority 4

HYPE accepts ordinary customer language in addition to explicit slash commands.

Examples:

- `งานวันศุกร์โอเคยัง` -> Booking
- `สมาชิกหมดเมื่อไหร่` -> Membership
- `สลิปถึงยัง` / `เหลือจ่ายเท่าไหร่` -> Payment
- `แต้มผมมีเท่าไหร่` -> Points canonical route
- `คูปองใช้ได้ไหม` -> Coupon Wallet canonical route
- `CARE BACK ใช้ยังไง` -> CARE BACK
- `ต้องทำอะไรต่อจากนี้` -> Next Action

Routing rules:

- explicit slash commands and explicit handoff/owner commands take precedence;
- natural-language routing is deterministic and domain-scoped; it does not use model-generated business truth;
- a private domain such as Membership, Booking or Payment remains private-chat only even when detected from natural language;
- Points/Coupons remain route-only until a bounded canonical wallet projection is explicitly approved;
- if two protected domains are both strongly signalled and nearly tied, HYPE asks the customer to clarify instead of selecting an authority;
- generic conversation without a strong domain signal is left unclassified rather than guessed;
- the router chooses which canonical authority to read; it never decides the business result itself.

Membership natural-language questions use the existing customer-safe entitlement projection and may show level, lifecycle and active-through. HYPE must not grant, renew or upgrade membership.

## Next implementation lanes

1. safe transaction assistant for bounded intake/preparation flows
2. owner/operator acknowledgement and close-loop state for completed handoffs
3. future Points/Coupon inline values only if a canonical member-runtime service contract explicitly exposes a bounded Telegram-safe read projection

All future lanes must preserve the same authority and privacy locks.

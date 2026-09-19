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
- `แต้มผมมีเท่าไหร่` -> bounded Points read in private chat
- `คูปองใช้ได้ไหม` -> bounded Coupon Wallet read in private chat
- `CARE BACK ใช้ยังไง` -> CARE BACK
- `ต้องทำอะไรต่อจากนี้` -> Next Action

Routing rules:

- explicit slash commands and explicit handoff/owner commands take precedence;
- natural-language routing is deterministic and domain-scoped; it does not use model-generated business truth;
- a private domain such as Membership, Booking or Payment remains private-chat only even when detected from natural language;
- Points/Coupons use the bounded canonical wallet projection in private HYPE chat only; group surfaces remain route-only and must never resolve private wallet truth;
- if two protected domains are both strongly signalled and nearly tied, HYPE asks the customer to clarify instead of selecting an authority;
- generic conversation without a strong domain signal is left unclassified rather than guessed;
- the router chooses which canonical authority to read; it never decides the business result itself.

Membership natural-language questions use the existing customer-safe entitlement projection and may show level, lifecycle and active-through. HYPE must not grant, renew or upgrade membership.

## Safe Transaction Assistant · Priority 5

HYPE may prepare transaction drafts in private Telegram chat, but it does not own the final submit or any resulting business truth.

Supported intake starts:

- `/book` or natural language such as `อยากจอง dinner พรุ่งนี้ 19:00 สาทร`
- `/proof` / `/slip` or `ส่งสลิป`
- `/renew` or `ขอต่ออายุสมาชิก`
- `/mms` or `อยากจองนวด`

P5 uses the existing Kenji Conversation Matrix for draft continuity. It must not create a second transaction database.

General contract:

1. detect the requested intake lane;
2. collect only whitelisted customer-supplied fields;
3. persist a bounded draft to cross-channel continuity when a canonical Client already has LINE identity;
4. report missing fields and resume the same draft across later Telegram messages;
5. when the draft is complete, route the customer to the canonical submit surface;
6. the customer performs the canonical submit and the owning backend remains final authority.

### Booking Intake

HYPE may prepare service intent, preferred date/time, area/location, optional duration, optional Model preference and an optional request note.

Required before the draft is complete: service intent, date, time and area.

The default customer handoff is `/booking`. Existing supervised booking-draft capabilities may be reused only when canonical identity/model/access gates pass. HYPE must never convert the intake draft into a confirmed Job, assign a Model, create protected calendar state or infer availability.

### Payment Proof Intake

A Telegram photo/document is not canonical Payment Evidence.

HYPE may store only that evidence is present, the evidence type and a bounded customer note.

HYPE must never persist Telegram `file_id`, `file_unique_id`, raw media, OCR result, bank destination, or a newly invented payment reference in Conversation Matrix.

A payment-proof handoff is ready only when current canonical payment context exposes an exact signed same-origin proof surface:

- `/sigil/pay?t=...`, or
- `/pay/checkout?t=...`.

If no signed current payment intent exists, HYPE routes to `/member/payments` to resume canonical payment flow. It must not default to legacy `/confirm/payment-proof`, mint a replacement payment reference, ask for duplicate proof when canonical review is pending, or describe an unverified proof as paid.

### Membership Renewal Intake

Renewal is current-package-only.

HYPE may capture intent to renew and route:

- current Private membership -> `/sigil/member/membership?intent=renew`;
- current Public Member / Elite / Red Card -> `/pay/membership`;
- unresolved membership -> MY MMD for canonical resolution.

HYPE does not ask the customer to re-select Standard/Premium when current package is already canonical. It must not upgrade, extend, activate, grant or settle membership itself. Blocked/suspended/revoked states remain fail-closed.

### MMS Pre-booking Intake

HYPE may prepare recipient gender, canonical MMS zone, service date/time, requested MMS skills, optional duration, optional Therapist preference and an optional note.

Required before MMS draft is complete: recipient gender, zone, date, time and at least one skill.

Recipient gender is request-specific and must be supplied explicitly for this booking. HYPE must not infer it from account-holder gender, Hall audience, profile, name, history or Telegram identity because the recipient may be another person.

Canonical customer submit remains `/male-massage/member/mms-booking`. A pre-booking is a request, not confirmed Therapist availability, booking or payment.

### P5 authority lock

Every P5 flow remains draft-only: no business-truth mutation, no payment verification, no Job confirmation, no Model assignment, no membership grant/renewal, no MMS booking confirmation. Customer submit and canonical backend authority are required.

Transaction Intake is private-chat only. A request started in Standard, Premium, Preview or another group must not read/write Client transaction context there; HYPE routes the user to private chat instead.

## Supervised Execution Assistant · Priority 6

P6 lets HYPE perform bounded low-risk execution only after the customer has explicitly completed a P5 draft and explicitly asks HYPE to continue.

Customer commands:

- `/submit` or equivalent explicit wording — execute the current draft through the supervised lane;
- `/progress` — read the stored execution receipt without creating a new action.

HYPE must never auto-execute merely because an intake draft becomes complete.

### Idempotency

Each P5 `draft_id` produces one stable P6 `execution_id`.

- retries with the same draft/lane return the existing execution receipt;
- Booking and MMS downstream calls also receive this stable idempotency key/reference;
- duplicate Telegram commands must not create duplicate Booking Request or MMS Pre-booking records;
- an execution receipt is stored in the existing Kenji Conversation Matrix, not a new execution database.

### Booking execution

When the Booking draft is complete and an explicit Model preference exists, HYPE may call the existing Kenji LV5 supervised action gate with `create_booking_request`.

The existing gate must still verify Canonical Client + LINE identity, current entitlement, canonical Model/access visibility, current Calendar projection, and required booking fields.

A successful P6 Booking action creates only the canonical Booking Request draft in the booking authority.

It does not confirm the Job, assign the Model finally, create a protected calendar hold, confirm payment, or represent Model availability as guaranteed.

If any safe gate fails, HYPE records `review_required` and keeps the P5 draft for MMD review.

### Payment Proof execution

Telegram media is still not canonical Payment Evidence.

P6 may prepare an idempotent Payment Proof handoff receipt, route the customer to the exact signed current payment surface, and notify the internal Payments topic that a HYPE proof handoff is ready.

P6 must not move Telegram `file_id` / raw media into the payment system, invent a payment reference, verify the proof, or mark paid.

If no signed payment intent exists, execution remains `review_required` and routes to `/member/payments`.

### Renewal execution

P6 may queue an idempotent renewal intent for the current canonical membership lane and notify the Membership operations topic.

This is a supervised handoff only. HYPE does not select a different tier, upgrade/downgrade, extend active-through, grant membership, or settle membership payment.

Canonical renewal/payment pages and their owning backends remain final authority.

### MMS execution

A complete MMS draft may be materialized through the existing `MMS_WORKER` service binding as an idempotent canonical pre-booking.

The MMS worker remains responsible for canonical zone/skill validation, Therapist inventory/matching, coordinator idempotency, and durable pre-booking state.

HYPE must not invent a duration when the customer did not provide one.

If the customer supplied a Therapist preference by name but HYPE cannot resolve it to a canonical Therapist ID, P6 must stop at `review_required` rather than ignore or guess the preference.

MMS pre-booking may report that options exist, but it is never equivalent to Therapist confirmation, final Booking confirmation or Payment confirmation.

### Request-level mutation vs protected truth

P6 is allowed to create low-risk request-level truth such as a Booking Request draft or an MMS Pre-booking record.

Therefore P6 receipts distinguish `request_level_mutation=true` when a canonical request record was materialized, while `protected_business_truth_mutated=false` remains locked.

Protected truth still includes Payment confirmation, final Job state, final Model/Therapist assignment, Calendar authority and Membership entitlement.

### Ops alerts and privacy

P6 may emit bounded internal Telegram alerts to the canonical Booking / Payment / Membership / Alerts topics.

Customer transaction details remain private-chat only. Calling `/submit` or `/progress` in Standard, Premium, Preview or another group must not read or execute the customer's draft.

### P6 progress observation

`/progress` reads the stored execution receipt and then performs a bounded canonical observation where a direct authority read exists.

- Payment -> current Payment Authority state such as paid / review_required / pending;
- MMS -> canonical pre-booking status from `MMS_WORKER` by exact prebooking ref;
- Renewal -> current entitlement level/lifecycle/active-through only; HYPE must not infer that renewal completed merely because entitlement is active;
- Booking -> receipt-level request state only unless an exact canonical correlation is available; HYPE must not infer Job confirmation from an unrelated active Job.

Every observation includes `final_confirmation_observed=false` unless the owning authority explicitly exposes a final confirmation state. No cross-record inference is allowed.

## Exact Booking Request -> Job correlation · P7

HYPE `/progress` now performs a bounded exact correlation for Booking execution receipts.

Correlation chain:

1. take the exact `booking_ref` from the stored HYPE execution receipt;
2. read exactly one `SIGIL Booking Requests` record by `booking_ref`;
3. read only `resolver_payload_json.job_receipt.session_id`;
4. read exactly one canonical Session and exactly one canonical Job by that same `session_id`;
5. expose only bounded customer-safe correlation fields: Booking ref, Session id, Job id, Session state and Job state.

No date/name/model matching is allowed. Missing receipt/session/job records remain uncorrelated. Duplicate Booking, Session or Job matches fail closed as conflict.

`final_confirmation_observed=true` is allowed only when the exact correlated canonical Job itself exposes an explicit final/confirmed state. An unrelated active Job can never satisfy the observation.

The correlation read does not mutate Booking, Session, Job, Payment, Calendar or Membership truth.

## Bounded Points + Coupon inline projection · P7

Private HYPE chat may read a bounded member wallet projection after both identity gates pass:

`verified Telegram -> Canonical Client -> canonical LINE identity -> member-pages-worker`

Points rules:

- expose only `active_points` when the canonical member profile marks Points as `verified`;
- an unavailable/unverified source is never rendered as zero;
- rate is the canonical baseline `100 THB = 1 Point`;
- HYPE cannot add, subtract, expire, restore or rewrite Points Ledger entries.

Coupon rules:

- source is the canonical CARE BACK Coupon Wallet owned by member-pages-worker;
- identity hash is derived server-side from the canonical LINE identity with the existing LIFF secret; Telegram never supplies a member id, identity hash or coupon code;
- expose Coupon code only when wallet state is exactly `ready` and the code passes the canonical format gate;
- expose approved discount only when the wallet already contains a bounded approved percentage;
- `wish_required`, `verification_required`, `used`, `expired`, `revoked`, `invalid` and review states expose state only, not a usable code;
- HYPE cannot activate, mint, reissue, extend or change coupon discount.

Privacy:

- private HYPE chat may show the bounded values after canonical Telegram + LINE binding;
- Standard/Premium/Preview/group surfaces remain route-only and must never read or display Points balances or Coupon codes;
- HENNA remains route-only for MMD Points/Coupon and must bridge to HYPE/MY MMD.

## MMD Shop bounded Order status + Service Recovery correlation

HYPE private chat may now read a bounded MMD Shop projection through:

`verified Telegram → Canonical Client → canonical LINE identity → admin-worker → member-pages-worker`

The customer-safe projection is limited to owned Order ID/date/status, Payment status, item summary, total, and safe Fulfillment state/courier/tracking. Raw Shop notes, address, phone, internal record ids, and admin-only data are not exposed.

Recovery correlation rules:

1. explicit Order ID → correlate only when that exact Order is owned by the resolved customer;
2. no Order ID → auto-correlate only when there is exactly one eligible owned recent Order;
3. multiple candidates → mark correlation ambiguous and never guess;
4. ambiguous candidates are projected as at most five customer-safe owned Order options;
5. Telegram picker callback data contains only `Case Ref + option index`, never Order ID or private Order data;
6. on selection, admin-worker resolves the stored option, re-checks exact canonical ownership, and binds the Order to the existing Case Reference;
7. customer selection must preserve the current handoff lifecycle state; it cannot reset `sent / acknowledged / reviewing` to `prepared`;
8. correlated Order / Payment / Fulfillment context shares the same closed-loop HYPE Case Reference;
9. HYPE may read and preserve bounded context only; it cannot mark paid, shipped, delivered, refunded, or change Fulfillment.

Group/Preview/member-group surfaces remain private-data-safe and do not invoke the Shop projection.

## Canonical Recovery Outcome taxonomy

Recovery cases across MMD Shop, Booking/Job and MMS use:

`mmd-recovery-outcome-taxonomy-v1-20260919`

The lifecycle remains:

`prepared → sent → acknowledged → reviewing → resolved → customer_notified`

Outcome is a separate bounded field. It describes the recovery workflow result, not underlying business truth.

Domains:

- `mmd_shop`
- `booking`
- `mms`
- `unclassified` while the recovery lane cannot yet be grounded

Examples of terminal outcomes:

- Shop: `replacement_arranged`, `reshipment_arranged`, `refund_route_opened`
- Booking: `rebooking_arranged`, `schedule_adjustment_arranged`, `service_credit_route_opened`
- MMS: `therapist_replacement_arranged`, `rebooking_arranged`, `service_adjustment_arranged`, `service_credit_route_opened`
- shared: `information_confirmed`, `no_adjustment_required`, `closed_duplicate`, `closed_withdrawn`

Rules:

- Recovery may not become `resolved` or `customer_notified` without an explicit terminal outcome valid for that domain.
- Only an allowed operator/owner write may set the outcome.
- HYPE/HENNA may display the written outcome, but may not infer one from customer chat.
- `refund_route_opened` means the refund process was routed/opened; it never means refund completed.
- The taxonomy intentionally contains no `refund_completed`, `payment_confirmed`, or `delivered` outcome.
- Outcome writes do not mutate Order, Payment, Fulfillment, Job, Calendar, Therapist assignment, MMS booking, or entitlement truth.

## Canonical Booking + MMS Recovery correlation

Recovery now uses the same Case Reference model across Shop, Booking/Job and MMS.

Booking rules:

- an explicit or previously materialized `booking_ref` may be correlated only after the exact Booking Request is read;
- `resolver_payload_json.canonical_client_id` must match the currently resolved Canonical Client before Session or Job data is followed;
- after ownership passes, correlation follows the existing exact chain `Booking Request → job_receipt.session_id → Session → Job`;
- duplicate/conflicting exact records fail closed and are never guessed;
- only bounded fields such as Booking Ref, Session ID, Job ID and canonical states enter Recovery context.

MMS rules:

- an explicit or previously materialized `mmspre_...` reference is checked through the canonical member-safe MMS pre-booking read;
- the read is scoped by the currently resolved Canonical Client `member_ref`;
- the requested Pre-booking must be present in that owned projection before it can be bound;
- only customer-safe status, service date/time, zone and skills may enter Recovery context; Therapist IDs, LINE hashes and internal records remain excluded.

For both domains:

- the existing active Case Reference is reused only when domain and canonical reference are compatible;
- `/case` refreshes the canonical authority before presenting Booking or MMS state;
- failed ownership/authority checks leave correlation unbound without exposing foreign references;
- correlation never mutates Job, Payment, Calendar, Therapist assignment, MMS booking or entitlement truth.

## Owner / Operator Recovery Control

Recovery workflow controls are available through the credential-bound admin surface:

- page: `/internal/admin/recovery`;
- API: `/v1/admin/recovery/cases`;
- actor: credential-bound Owner or Admin only;
- writes require same-origin browser requests;
- browser code never receives or manufactures a service-binding credential.

The UI exposes recent canonical Recovery Cases and exact Case Ref lookup. It projects only bounded Recovery metadata plus the already-bounded Shop / Booking / MMS correlation fields.

Control order is deliberately strict:

`prepared/sent → acknowledged → reviewing → resolved → customer_notified`

A Case may only become `resolved` from `reviewing`, with an explicit terminal outcome valid for its domain. Non-terminal outcomes may be written without moving lifecycle state. The UI and Telegram commands share the same canonical transition engine, so taxonomy and monotonic-state checks cannot drift between surfaces.

Recovery Control never mutates Payment, Order/Fulfillment, Job/Calendar, Therapist assignment, MMS booking or entitlement truth. Operators must refresh the corresponding canonical authority before any protected business action.

## Recovery Queue Intelligence

Recovery Control now adds bounded operational queue intelligence without creating or inferring canonical business truth.

Policy version:

`mmd-recovery-queue-sla-v1-20260919`

Queue filters:

- `domain`: `all / mmd_shop / booking / mms / unclassified`;
- `state`: `open / all / prepared / sent / acknowledged / reviewing / resolved / customer_notified`;
- filters operate only over canonical Recovery Case records and never search business authorities directly.

Age metadata:

- Case age is derived only from the timestamp encoded in the existing Case Ref;
- age buckets are `under_1h / 1_4h / 4_12h / 12_24h / 24h_plus`;
- case age does not imply service failure, payment failure, job lateness or customer impact.

Operational attention windows are measured only from the last Recovery workflow `updated_at`:

- `prepared / sent`: 60 minutes to acknowledgement attention;
- `acknowledged`: 120 minutes to review attention;
- `reviewing`: 360 minutes to review/update attention;
- `resolved`: 120 minutes to customer-notification attention;
- `customer_notified`: closed, no active attention window.

Indicator semantics:

- `fresh`: below 75% of the current workflow attention window;
- `watch`: at least 75% but below the attention target;
- `overdue`: at or beyond the attention target;
- `unknown`: workflow timestamp is unavailable;
- `closed`: customer notification has been recorded.

These indicators are internal operational metadata only. They do not mutate or infer Payment, Order/Fulfillment, Job/Calendar, Therapist assignment, MMS booking, entitlement, refund, delivery or service-completion truth.

Owner Summary consumes the same server-side queue projection and exposes:

- open / attention / overdue / watch counts;
- bounded domain/state counts;
- up to five `what_to_watch_now` items;
- the workflow-only next attention such as acknowledge, start review, review/update outcome, or notify customer;
- a direct link back to `/internal/admin/recovery`.

HYPE only presents this information to verified Owner Mode. It does not auto-transition a case, auto-resolve an outcome or execute protected business actions from an SLA indicator.

## Recovery Queue Assignment

Coordination assignment uses:

`mmd-recovery-assignment-v1-20260919`

Assignment is stored inside the existing Recovery Case payload and is explicitly not an authority grant, lock, business owner record or canonical service assignment.

Supported states:

- `unassigned` — no operator has claimed coordination ownership;
- `assigned` — one credential-bound Owner/Admin actor is recorded as the current coordinator.

Supported browser actions:

- `claim` — claim an unassigned open Case for yourself;
- `release` — release your own assignment;
- `takeover` — Owner-only coordination takeover.

Rules:

- an operator cannot claim over another current assignment;
- an operator cannot release another actor's assignment;
- Owner may takeover or release another assignment;
- closed `customer_notified` Cases cannot be newly claimed/taken over;
- claim/release/takeover never changes Recovery lifecycle state or outcome;
- assignment writes do not update Recovery `state_updated_at`, so they cannot reset or extend the operational SLA clock;
- assignment never gates or grants Resolve authority. Existing protected-action authority checks remain independent.

Queue filters add:

- `assignment=all / assigned / unassigned`.

Queue metrics add:

- assigned open Cases;
- unassigned open Cases;
- attention Cases that are still unassigned.

Within the same SLA tier, unassigned Cases are surfaced before assigned Cases so the Owner can see coordination gaps without treating assignment as business truth.

Owner Summary exposes only bounded assignment labels such as `Per`, `Owner` or `Operator`. Internal assignment keys are not projected to Telegram or browser output.

HYPE Owner Summary may recommend opening the unassigned Recovery queue. HYPE itself remains read-only and cannot claim, release or takeover a Case.

## Next implementation lanes

1. customer-safe ambiguity handling for Booking/MMS only if their canonical authorities later expose multiple owned candidates;
2. optional assignment history/audit trail if multi-operator identity becomes richer than the current credential actor model.

All future lanes must preserve the same authority and privacy locks.


---

## Shared HYPE + HENNA Capability Pack 1–7

HYPE firmware also follows `docs/architecture/HYPE_HENNA_CAPABILITY_PACK_V1.md`.

Pack lock: `mmd-concierge-capability-pack-v1-20260919`.

The seven awareness lanes are:

1. MMD Shop Order Assistant
2. CARE BACK / Coupon Intelligence
3. MMS Therapist Options Assistant
4. Service Recovery / Complaint Concierge
5. Closed-loop Handoff
6. Model / Hall Discovery
7. Points + Coupon Inline Balance

Role lock:

- HYPE owns cross-system routing/operations.
- HENNA owns MMS specialist detail.
- HYPE must bridge MMS detail to HENNA/MMS authority instead of duplicating MMS truth.
- HENNA must bridge non-MMS member/account work to HYPE or exact MY MMD surfaces.
- Shared awareness never changes final-authority boundaries.

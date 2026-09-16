# MMD Privé — CARE BACK 2026 Final Lock

Status: final rules for implementation  
Effective date: 2026-08-31 (Asia/Bangkok)  
Coupon Validity Canon: **V2.2**

Owner: Boss Per / MMD  
Canonical route: `/promotion/6-years-care-back`

## Purpose and precedence

CARE BACK is a สิทธิ์ดูแลกลับ for people MMD has previously cared for and verified new members entering through the campaign. It is not a mass discount, membership package, automatic approval, VIP package, Black Card grant, or SVIP threshold.

This document supersedes earlier CARE BACK guidance where it conflicts, including any earlier lock that treated 10% as a fixed guaranteed discount, any 30-day coupon validity rule, any copy or implementation that issues a personal code immediately after login or identity verification, or any flow that requires old customers to reproduce historical slips in order to recover legacy status or Points.

## Campaign calendar

- MMD Birthday CARE BACK: through 31 August 2026.
- CARE BACK CONTINUES: 1–30 September 2026.
- Both phases use one identical benefit policy. September never creates a second claim, coupon, point bonus, or membership extension.
- After 30 September 2026 no new CARE BACK claim may be created. An existing verified claim may resume its approved workflow.

## Required customer flow

1. Start from CARE BACK and sign in through LINE/LIFF.
2. Verify Member Passport, membership status, linked LINE Official history, and recoverable Points history.
3. Create or resume one CARE BACK claim idempotently.
4. Save a Birthday Wish through the canonical Wish owner.
5. Only a successfully saved Wish can unlock the personal coupon.
6. Apply membership, payment, Points, and approved coupon benefits only after each canonical owner completes verification or approved historical reconstruction.

Identity verification starts review only. Opening the page, logging in, or submitting identity must never issue a coupon, add Points, approve payment, or create a membership term.

## Legacy verification doctrine

For historical customers, MMD must not require a customer to reproduce old transfer slips that may no longer exist.

Historical identity and membership reconstruction uses MMD-owned legacy evidence, especially:

- LINE Official identity/profile linkage
- Per-renamed customer nickname/name
- legacy tags such as `#client`, `#purchased`, `#mem...`, `#lite`, `-vip-`, and `-svip-`
- Per's original LINE Official customer notes and preserved migration trace
- payment references or slips only when they happen to exist

`immigrate-worker` remains the migration/inference layer for this evidence. It must preserve traceability and safe-match behavior; it must not silently grant canonical entitlement by itself.

For historical Points specifically, **Per's original customer note is the primary reconstruction source**. The historical-note parser may extract service amounts, dates, packages, tips, membership/renewal entries, promo/referral signals, and warnings. It produces staged/reviewable Points evidence rather than inventing missing history.

## Personal coupon — Canon V2.2

- Customer-facing copy before verified entitlement: **UP TO 10% OFF** / **ส่วนลดสูงสุด 10%** only.
- **10% is the campaign ceiling, not a guaranteed discount for every booking.**
- Public work should normally start around **5%** where the model/job combination allows it, while Public Models remain within the approved **3–5%** band.
- The base discount matrix is determined by **Model level × job format**:

| Model level | PN job format | VIP job format |
| --- | ---: | ---: |
| Public Models | 3–5% | 3–5% |
| Standard Models | 5% | 7% |
| Premium / EMs / GWs Models | 5% | 10% |

- `PN` and `VIP` in this matrix are **job formats**, not customer membership status or customer tier.
- Customer eligibility is an additional gate. The authoritative rate returned to the customer must be the verified `approved_discount_percent` after Model level × job format has been checked against customer eligibility.
- Browser/public surfaces must never calculate or invent the approved discount.
- Before verification, Public pages may display only **“สูงสุด 10%” / “UP TO 10% OFF”**.
- Coupon card color identifies membership status only and must never determine the discount:

| Card color | Membership status |
| --- | --- |
| Blue | Standard |
| Silver | Premium |
| Red | Red Card holder |
| Black | Black Card holder + VIP customer status |
| Gold | SVIP customer status |

- All five card colors may share the same campaign design language, but the card must **not print a fixed discount by color**. A generic `UP TO 10% OFF` label is allowed before the approved rate is resolved.
- Backend/API must return `approved_discount_percent` only after verification. That field is the source of truth for the actual coupon rate shown in verified member surfaces and booking confirmation.
- One use, one coupon per booking, for an eligible participating service only.

### Coupon validity

- Valid for **2 months from activation**.
- The coupon must be used to confirm a booking before the coupon expiry date.
- Once a valid booking has been confirmed within the coupon validity period, the actual service date may be scheduled up to **90 days from the original booking date**, even when the service date is after coupon expiry.
- Rescheduling must not move the service date beyond **90 days from the original booking date**.
- Example: card activated **1 September** → booking may be confirmed through **31 October** → if booked on **20 October**, the service date may be selected within 90 days from 20 October.
- Wish saved is mandatory before activation or display.
- One coupon per CARE BACK claim; viewing or copying never consumes it.
- Used, expired, revoked, or invalid codes cannot be reactivated by the customer.
- Not cash and not valid for membership fees, renewal fees, tips, payment verification, Black Card approval, or SVIP access.

## Benefit matrix

| Customer status | CARE BACK benefit | Points |
| --- | --- | --- |
| Current member (active/grace) | +180 days from the real existing expiry | Reconstruct/reconcile historical Points from Per Notes and linked legacy evidence at 100 THB = 1 Point; no automatic CARE BACK bonus |
| Former/expired member | After verified renewal/payment and restored active/grace: +90 days | +150 Points after the related renewal is verified and applied; prior historical Points may be reconstructed separately from legacy notes |
| New Standard | No historical extension | +150 Welcome Points after verified membership/payment |
| New Premium | No historical extension | +250 Welcome Points after verified membership/payment |
| Approved special selection | No historical extension | Up to +350 Points after verified membership/payment; Black Card review consideration only |

Trial / Guest Pass receives no automatic CARE BACK Welcome Points unless MMD publishes a separate rule.

## Money, membership, Points, and coupon truth

- Current/new transactions: payment confirmation belongs to the official payment-verification owner.
- Historical customer status and Points: MMD may reconstruct from LINE Official legacy evidence without requiring a historical slip.
- Historical Points rate: 100 THB = 1 Point for service amounts supported by Per Notes / preserved legacy evidence.
- A slip or receipt is supporting evidence only and is not mandatory for historical reconstruction.
- Tips do not generate historical Points; direct-hand tips never count.
- Membership/renewal fees are not auto-counted into historical Points and remain review-required unless an explicit rule says otherwise.
- Ambiguous amounts, referral bonuses, and promotion bonuses remain review-required.
- Membership extensions belong to the canonical membership owner.
- Points belong to the canonical Points Ledger owner after approved reconstruction/application.
- Coupon discount authority belongs to the backend verification path; verified responses expose `approved_discount_percent`.
- Card color, browser copy, customer-entered values, or visual tier styling must never override the approved discount.
- Every claim, coupon, extension, and Points application must be idempotent.
- Black Card remains private review; Points never auto-approve it.
- VIP is not a customer-facing membership package.
- SVIP is not point-based, purchasable, or automatic. It is privately considered by Per.

## Required states

Promotion responses must distinguish at least:

- `wish_required`
- `renewal_required`
- `ready`
- `used`
- `expired`
- `revoked`
- `invalid`

Coupon lifecycle must distinguish at least:

- `draft`
- `active`
- `used`
- `expired`
- `revoked`
- `invalid`

Historical reconstruction should additionally distinguish operational review states such as:

- `legacy_found`
- `legacy_review_required`
- `historical_points_proposed`
- `historical_points_approved`
- `historical_points_applied`

## Kenji behavior

Kenji may explain, classify, route, and summarize safe verified or approved reconstructed status. Kenji must not create or mutate claims, activate coupons, calculate an authoritative coupon rate in the browser, apply Points, extend membership, approve payment, approve Black Card, infer SVIP, or expose internal identifiers.

Customer-facing answer:

> CARE BACK เป็นสิทธิ์ดูแลกลับที่ MMD ตรวจจากสถานะและประวัติจริงครับ เริ่มจากยืนยันผ่าน LINE แล้วส่ง Birthday Wish ให้บันทึกสำเร็จก่อน จึงจะเปิดคูปองส่วนตัวได้ หน้า Public จะแสดงเพียง “ส่วนลดสูงสุด 10%” ก่อนนะครับ เพราะส่วนลดจริงขึ้นอยู่กับระดับนายแบบและรูปแบบงาน รวมถึงสิทธิ์ที่ตรวจสอบได้ของคุณ เมื่อยืนยันครบระบบจะใช้ `approved_discount_percent` ที่ผ่านการตรวจแล้ว คูปองใช้ได้ 1 ครั้ง ต้องใช้จองภายใน 2 เดือนหลังเปิดใช้ และเมื่อจองทันอายุคูปองแล้ว สามารถเลือกวันรับบริการได้ไม่เกิน 90 วันนับจากวันที่จองครับ

Safety copy:

> สิทธิ์ทั้งหมดจะมีผลหลัง MMD ตรวจสอบข้อมูล การสมัคร การชำระเงิน หรือประวัติเดิมที่ MMD เชื่อมโยงได้เรียบร้อยแล้วเท่านั้น

> การยืนยันตัวตนช่วยให้ MMD ตรวจสถานะ ประวัติที่เชื่อมได้ และ Points ที่ตรวจสอบหรือกู้คืนจากข้อมูลเดิมได้ แต่ไม่ได้หมายความว่าได้รับคูปองหรือ Points อัตโนมัติ

> คูปองส่วนตัวแสดง “ส่วนลดสูงสุด 10%” ก่อนยืนยันสิทธิ์ ส่วนลดจริงคำนวณจากระดับนายแบบ × รูปแบบงาน และสิทธิ์ที่ตรวจสอบได้ ใช้ได้ 1 ครั้ง ต้องใช้ยืนยันการจองภายใน 2 เดือนหลังเปิดใช้ และเมื่อจองแล้วสามารถเลือกวันรับบริการได้ไม่เกิน 90 วันนับจากวันที่จองครั้งแรก

## Implementation gate

- LINE/LIFF session verification is the customer identity boundary.
- The canonical Birthday Wish service is the only authority that can mark a Wish saved.
- `immigrate-worker` may normalize/infer legacy LINE evidence and historical note data, but canonical entitlement still requires safe match and canonical/admin approval/application.
- Historical Points reconstruction must use preserved Per Notes / LINE Official evidence first; do not require missing historical slips as a prerequisite.
- Backend coupon verification must expose `approved_discount_percent`; no browser code may derive the authoritative percentage from card color or customer-visible tier labels.
- Historical Points reconstruction must use preserved Per Notes / LINE Official evidence first; do not require missing historical slips as a prerequisite.
- Browser code never writes claim, coupon, Points, membership, payment, Black Card, or SVIP truth.
- Production deployment, Airtable mutation, Knowledge Board publication, and Webflow publication require separate explicit approval.

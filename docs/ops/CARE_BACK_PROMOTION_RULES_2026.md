# MMD Privé — CARE BACK 2026

**Promotion, Points & Operational Rules — Final working summary**  
**Status:** Final rules for implementation  
**Last updated:** 31 August 2026 (Asia/Bangkok)  
**Coupon Validity Canon:** V2.2

## 1. Purpose

CARE BACK is a **สิทธิ์ดูแลกลับ** for people MMD has previously cared for, and for verified new members entering through the campaign. It is not a mass discount, a membership package, or an automatic approval.

Every benefit is determined from the member status and records MMD can verify or safely reconstruct from MMD-owned legacy evidence. Opening the campaign page or submitting an identity form alone does not create a coupon, points, payment approval, or a new membership term.

Coupon Canon V2.2 supersedes earlier rules that treated 10% as a fixed guaranteed discount or used a 30-day coupon lifetime.

## 2. Campaign calendar

| Phase | Customer-facing name | Period | Rule |
| --- | --- | --- | --- |
| 01 | MMD Birthday CARE BACK | Today–31 August 2026 | Birthday window |
| 02 | CARE BACK CONTINUES | 1–30 September 2026 | Continuation for customers who saw the campaign or registration window late |

Both phases use **one identical benefit policy**. September is not a second promotion and does not create a second coupon, second point bonus, or duplicate membership extension.

After 30 September 2026, the system must not create a new CARE BACK claim. A verified claim that already exists may resume its approved workflow and status checks.

## 3. Required customer flow

1. Customer starts from CARE BACK and signs in through LINE/LIFF.
2. MMD verifies the Member Passport, membership status, linked LINE Official history, and recoverable Points history.
3. System creates or resumes one CARE BACK claim only.
4. Customer sends a Birthday Wish to MMD through the canonical Wish flow.
5. Only a successfully saved Wish can unlock a personal coupon.
6. Membership, payment, Points, and approved coupon benefits are applied only after the relevant MMD verification or approved historical reconstruction is complete.

## 4. Universal rules

### Identity, legacy history and Points

- Identity verification starts CARE BACK review; it does **not** automatically issue a coupon or add Points.
- For old customers, LINE Official identity/profile linkage, Per-renamed customer names/nicknames, legacy tags, and Per's original customer notes are valid MMD-owned migration evidence.
- Historical customers must **not** be required to reproduce old slips that may no longer exist.
- Historical Points are reconstructed primarily from **Per's original LINE Official customer notes** and preserved migration trace.
- LINE tags and nickname markers help identify relationship, period, package, and membership history; they do not by themselves invent a Points balance.
- Historical-note parsing may extract service amounts, dates, packages, tips, membership/renewal entries, promotion/referral signals, and ambiguity warnings.
- Historical Points rate remains **100 THB = 1 Point** for service amounts supported by Per Notes / preserved legacy evidence.
- Tips do not generate Points; direct-hand tips never count.
- Membership/renewal fees are not auto-counted into historical Points unless an explicit rule says otherwise.
- Ambiguous amounts and promo/referral bonuses require review.
- A transfer slip or receipt is optional supporting evidence for historical reconstruction; it is not a mandatory prerequisite.
- Every Points or membership action must be idempotent: retrying a request must not add the same benefit twice.

### Current/new transaction truth

- Current and new payment confirmation belongs to the official payment-verification owner.
- A current transaction slip is evidence only and never confirms payment by itself.
- Membership extensions are applied by the canonical membership owner, not by the browser.
- Points are applied by the canonical Points Ledger owner, not by the browser.

### Personal coupon — Canon V2.2

- A personal coupon is available only after the customer’s Birthday Wish is successfully saved.
- Customer-facing benefit before verification: **UP TO 10% OFF** / **ส่วนลดสูงสุด 10%** only.
- **10% is the campaign maximum, not a guaranteed discount for every job.**
- Public work should normally begin around **5%** where the applicable model/job combination permits it, while Public Models remain inside the approved 3–5% band.
- The base discount matrix is determined by **Model level × job format**:

| Model level | PN job format | VIP job format |
| --- | ---: | ---: |
| Public Models | 3–5% | 3–5% |
| Standard Models | 5% | 7% |
| Premium / EMs / GWs Models | 5% | 10% |

- `PN` and `VIP` in this matrix are **job formats**, not customer membership status or tier.
- Customer eligibility is an additional gate. The authoritative verified result must be returned as `approved_discount_percent` after the Model level × job format result has been checked against customer eligibility.
- Browser/public code must never calculate or invent the approved percentage.
- Before verified entitlement, Public surfaces may display only **“สูงสุด 10%” / “UP TO 10% OFF”**.
- Coupon color identifies membership status only:

| Card color | Membership status |
| --- | --- |
| Blue | Standard |
| Silver | Premium |
| Red | Red Card holder |
| Black | Black Card holder + VIP customer status |
| Gold | SVIP customer status |

- Card color must never determine the discount.
- Coupon Cards in all five colors may use status-specific visual design, but must not print a fixed rate by color. `UP TO 10% OFF` may be used as generic pre-verification campaign copy.
- Backend must return `approved_discount_percent` as the authoritative actual discount after verification.
- The coupon is single-use and limited to one coupon per booking for an eligible participating service.
- Validity: **2 months from activation**. Redemption and booking confirmation must occur before expiry.
- After a valid booking is confirmed within coupon validity, the service date may be scheduled up to **90 days from the original booking date**, including a date after coupon expiry.
- Rescheduling must remain within 90 days from the original booking date.
- Example: activation on **1 September** → booking may be confirmed through **31 October** → if booked on **20 October**, service may be scheduled within 90 days from 20 October.
- A personal code must not be displayed before the Wish is saved.
- The code is personal, single-use, and cannot be issued repeatedly for the same CARE BACK claim.
- The coupon is not cash and cannot be used for membership fees, renewal fees, tips, payment verification, Black Card approval, or SVIP access.
- Viewing or copying a code never consumes it. A used, expired, revoked, or invalid code cannot be reactivated by the customer.

### Approval boundaries

- `immigrate-worker` normalizes and infers legacy LINE evidence; it preserves traceability and safe-match behavior.
- Historical reconstruction is promoted/applied only after canonical/admin approval, not directly by browser or migration inference.
- Black Card remains a private review decision; points never auto-approve Black Card.
- SVIP is never point-based, purchasable, or automatic. It is privately considered by Per only.

## 5. Benefits by customer status

| Customer status | What MMD verifies | CARE BACK benefit | Points rule | Coupon state |
| --- | --- | --- | --- | --- |
| Current member (active/grace) | Passport, existing expiry, LINE Official legacy history, Per Notes | Extend membership **180 days from the actual existing expiry date** | Reconstruct/reconcile historical Points from Per Notes at 100 THB = 1 Point; no automatic CARE BACK point bonus | Opens after Birthday Wish is saved |
| Former/expired member | Previous member record, LINE Official history, renewal status | No automatic renewal. After official renewal payment and active/grace restoration: extend **90 days** | **+150 Points** after the related renewal is verified and applied; historical Points may be reconstructed separately from Per Notes | Remains unavailable until Wish, renewal, payment, and restored member status are verified |
| New member — Standard | New membership and payment | No historic membership extension | **+150 Welcome Points** after payment verification | Opens after Birthday Wish and relevant verification |
| New member — Premium | New membership and payment | No historic membership extension | **+250 Welcome Points** after payment verification | Opens after Birthday Wish and relevant verification |
| New member — special campaign selection | Eligibility and payment | No historic membership extension | Up to **+350 Points** only where the campaign selection is approved | Opens after Birthday Wish and relevant verification |

### Important package notes

- Customer-facing packages are **Trial / Guest Pass**, **Standard**, and **Premium** only.
- Trial / Guest Pass does not receive an automatic CARE BACK Welcome Points amount unless MMD explicitly publishes one.
- A 350-Point campaign selection can support **Black Card review consideration only**. It does not purchase, grant, or promise Black Card.
- VIP is not a customer-facing membership package. SVIP is private to Per’s review and must not be explained as a points threshold.

## 6. Exact operational rules

### Current member

- The 180-day extension begins from the member’s real recorded expiry date — never from the date they click Verify.
- Historic Points are reconstructed from Per Notes / LINE Official legacy evidence first.
- The historical-note parser produces staged `proposed_points`, confidence, and warnings; ambiguous history goes to review instead of being guessed.
- There is no automatic +50 or other automatic CARE BACK point bonus.

### Former/expired member

- The system must search and verify the old member record first.
- CARE BACK must not renew an expired membership by itself.
- The customer completes official renewal; MMD verifies the current renewal payment; the profile must be active or grace before the 90-day extension and 150-point benefit become eligible for application.
- Historical status and Points may still be reconstructed from MMD-owned LINE Official notes even when the customer no longer has old slips.

### New member

- Welcome Points are pending until membership registration and payment verification are complete.
- Standard, Premium, and approved special campaign selections follow the point table above.
- New members have no old membership expiry to extend.

## 7. Customer-facing safety copy

> สิทธิ์ทั้งหมดจะมีผลหลัง MMD ตรวจสอบข้อมูล การสมัคร การชำระเงิน หรือประวัติเดิมที่ MMD เชื่อมโยงได้เรียบร้อยแล้วเท่านั้น

> สำหรับประวัติเก่า MMD จะตรวจจากข้อมูลที่เคยบันทึกไว้ เช่น LINE Official และ Note เดิมของ MMD โดยไม่จำเป็นต้องให้ลูกค้าหาสลิปเก่าครบทุกครั้ง

> คูปองส่วนตัวจะแสดงเพียง “ส่วนลดสูงสุด 10%” ก่อนยืนยันสิทธิ์ ส่วนลดจริงขึ้นอยู่กับระดับนายแบบ × รูปแบบงาน และสิทธิ์ที่ตรวจสอบได้ของลูกค้า ใช้ได้ 1 ครั้ง ต้องใช้ยืนยันการจองภายใน 2 เดือนหลังเปิดใช้ และเมื่อจองทันอายุคูปองแล้วสามารถเลือกวันรับบริการได้ไม่เกิน 90 วันนับจากวันที่จองครั้งแรก

## 8. Worker and data rules

- LINE/LIFF session verification is the customer identity boundary.
- `immigrate-worker` owns legacy normalization/inference and preserved migration trace, not final entitlement mutation.
- Per Notes are the primary historical Points reconstruction source.
- The canonical Birthday Wish service is the only authority that can mark a Wish as saved.
- Backend coupon verification must return `approved_discount_percent`; card color and browser-visible tier styling are not discount authority.
- Browser code must not write campaign claims, activate a coupon, calculate an authoritative discount, apply Points, extend membership, approve payment, approve Black Card, or infer SVIP.
- Promotion states must distinguish at least: `wish_required`, `renewal_required`, `ready`, `used`, `expired`, `revoked`, and `invalid`.
- Historical review states should distinguish at least: `legacy_found`, `legacy_review_required`, `historical_points_proposed`, `historical_points_approved`, and `historical_points_applied`.

## 9. Go-live checklist

- [ ] `/public/access` remains a short bilingual Identity Gate only.
- [ ] Wish authentication no longer loops into repeated LINE Login / QR.
- [ ] LINE Official legacy lookup can match a customer safely before CARE BACK historical reconstruction.
- [ ] Per Notes parser can produce proposed historical Points with warnings/review state.
- [ ] Historical customers are not blocked because old slips are missing.
- [ ] Current/new payment verification remains separate from legacy reconstruction.
- [ ] Existing claims remain idempotent and do not create duplicate codes, extensions, or Points.
- [ ] Coupon verification returns `approved_discount_percent` and no client surface derives a fixed rate from card color.
- [ ] Coupon redemption is connected to the official booking/service transaction owner before any live “use coupon” claim is made.
- [ ] Production deployment and Webflow publication are separately approved and recorded.

## 10. Launch cut

**P0 before Pro launch**

1. Fix Wish login/resume loop.
2. Confirm legacy LINE OA safe-match path is callable for CARE BACK review.
3. Confirm Per Notes historical parser output can be reviewed/applied without requiring old slips.
4. Confirm `approved_discount_percent` is generated by the trusted backend path from verified booking context.
5. Keep all browser surfaces read-only for entitlement truth.

**Not a launch blocker**

- perfect historical automation for every edge case
- redesigning unrelated pages
- adding more personas to access/auth
- migrating every legacy record before launch
- fully automatic Black Card or SVIP logic

## 11. Final lock — Coupon Canon V2.2

```text
Current member = verified identity + linked legacy history → +180 days from real existing expiry
Expired member = verified current renewal/payment/active status → +90 days +150 Points
New Standard = verified membership/payment → +150 Welcome Points
New Premium = verified membership/payment → +250 Welcome Points
Approved special campaign selection = verified membership/payment → up to +350 Points for Black Card review consideration only
Personal coupon public copy = UP TO 10% OFF only
Actual coupon rate = verified Model level × job format, constrained by customer eligibility → approved_discount_percent
Public Models = PN 3–5%, VIP 3–5%
Standard Models = PN 5%, VIP 7%
Premium / EMs / GWs Models = PN 5%, VIP 10%
PN / VIP = job formats, not customer tiers
Coupon color = membership status only, never discount authority
Coupon validity = 2 months from activation; one use; one coupon per booking
Booking = must be confirmed before coupon expiry
Service date = within 90 days from original booking date, even if after coupon expiry
Reschedule = must remain within the same 90-day window from original booking date
Historical Points = Per Notes / LINE Official legacy evidence first, 100 THB = 1 Point for supported service amounts
Old slips = optional supporting evidence, not required for historical reconstruction
```

This document intentionally contains no Airtable IDs, LIFF IDs, secrets, or internal access details. Keep those only in restricted implementation documentation.

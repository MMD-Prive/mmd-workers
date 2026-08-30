# MMD Privé — CARE BACK 2026

**Promotion, Points & Operational Rules — Final working summary**  
**Status:** Final rules for implementation  
**Last updated:** 30 August 2026 (Asia/Bangkok)

## 1. Purpose

CARE BACK is a **สิทธิ์ดูแลกลับ** for people MMD has previously cared for, and for verified new members entering through the campaign. It is not a mass discount, a membership package, or an automatic approval.

Every benefit is determined from the member status and records MMD can verify or safely reconstruct from MMD-owned legacy evidence. Opening the campaign page or submitting an identity form alone does not create a coupon, points, payment approval, or a new membership term.

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
6. Membership, payment, and Points benefits are applied only after the relevant MMD verification or approved historical reconstruction is complete.

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

### Personal coupon

- A personal coupon is available only after the customer’s Birthday Wish is successfully saved.
- Customer-facing benefit: **UP TO 10% OFF** / **ส่วนลดสูงสุด 10%**.
- The approved discount is determined by **Model level × job format**:

| Model level | PN job format | VIP job format |
| --- | ---: | ---: |
| Public Models | 3–5% | 3–5% |
| Standard Models | 5% | 7% |
| Premium / EMs / GWs Models | 7% | 10% |

- `PN` and `VIP` in this matrix are job formats, not customer membership status.
- Coupon color identifies membership status only: Blue = Standard, Silver = Premium, Red = Red Card, Black = Black Card + VIP customer status, and Gold = SVIP. Color must not determine the discount.
- The coupon is single-use and limited to one coupon per booking for an eligible participating service.
- Validity: **2 months from activation**. Redemption and booking confirmation must occur before expiry.
- After a valid booking is confirmed, the service date may be scheduled up to **90 days from the original booking date**, including a date after coupon expiry.
- Rescheduling must remain within 90 days from the original booking date.
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

> คูปองส่วนตัวส่วนลดสูงสุด 10% จะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จ ใช้ได้ 1 ครั้งกับบริการที่ร่วมรายการ โดยอัตราจริงขึ้นอยู่กับระดับนายแบบและรูปแบบงาน ต้องใช้จองภายใน 2 เดือนหลัง activation และเลือกวันรับบริการได้ไม่เกิน 90 วันนับจากวันที่จอง

## 8. Worker and data rules

- LINE/LIFF session verification is the customer identity boundary.
- `immigrate-worker` owns legacy normalization/inference and preserved migration trace, not final entitlement mutation.
- Per Notes are the primary historical Points reconstruction source.
- The canonical Birthday Wish service is the only authority that can mark a Wish as saved.
- Browser code must not write campaign claims, activate a coupon, apply Points, extend membership, approve payment, approve Black Card, or infer SVIP.
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
- [ ] Coupon redemption is connected to the official booking/service transaction owner before any live “use coupon” claim is made.
- [ ] Production deployment and Webflow publication are separately approved and recorded.

## 10. Launch cut

**P0 before Pro launch**

1. Fix Wish login/resume loop.
2. Confirm legacy LINE OA safe-match path is callable for CARE BACK review.
3. Confirm Per Notes historical parser output can be reviewed/applied without requiring old slips.
4. Keep all browser surfaces read-only for entitlement truth.

**Not a launch blocker**

- perfect historical automation for every edge case
- redesigning unrelated pages
- adding more personas to access/auth
- migrating every legacy record before launch
- fully automatic Black Card or SVIP logic

## 11. Final lock

```text
Current member = verified identity + linked legacy history → +180 days from real existing expiry
Expired member = verified current renewal/payment/active status → +90 days +150 Points
New Standard = verified membership/payment → +150 Welcome Points
New Premium = verified membership/payment → +250 Welcome Points
Approved special campaign selection = verified membership/payment → up to +350 Points for Black Card review consideration only
Personal coupon = Birthday Wish saved → up to 10% by model level × job format, one use, one coupon per booking, book within 2 months from activation, service date within 90 days from original booking date
Historical Points = Per Notes / LINE Official legacy evidence first, 100 THB = 1 Point for supported service amounts
Old slips = optional supporting evidence, not required for historical reconstruction
```

This document intentionally contains no Airtable IDs, LIFF IDs, secrets, or internal access details. Keep those only in restricted implementation documentation.

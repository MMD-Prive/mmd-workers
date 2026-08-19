# MMD Privé — CARE BACK 2026

**Promotion, Points & Operational Rules — Final working summary**  
**Status:** Final rules for implementation  
**Last updated:** 19 August 2026 (Asia/Bangkok)

## 1. Purpose

CARE BACK is a **สิทธิ์ดูแลกลับ** for people MMD has previously cared for, and for verified new members entering through the campaign. It is not a mass discount, a membership package, or an automatic approval.

Every benefit is determined from the member status and records MMD can verify. Opening the campaign page or submitting an identity form alone does not create a coupon, points, payment approval, or a new membership term.

## 2. Campaign calendar

| Phase | Customer-facing name | Period | Rule |
| --- | --- | --- | --- |
| 01 | MMD Birthday CARE BACK | Today–31 August 2026 | Birthday window |
| 02 | CARE BACK CONTINUES | 1–30 September 2026 | Continuation for customers who saw the campaign or registration window late |

Both phases use **one identical benefit policy**. September is not a second promotion and does not create a second coupon, second point bonus, or duplicate membership extension.

After 30 September 2026, the system must not create a new CARE BACK claim. A verified claim that already exists may resume its approved workflow and status checks.

## 3. Required customer flow

1. Customer starts from CARE BACK and signs in through LINE/LIFF.
2. MMD verifies the Member Passport, membership status, linked history, and verifiable Points.
3. System creates or resumes one CARE BACK claim only.
4. Customer sends a Birthday Wish to MMD through the canonical Wish flow.
5. Only a successfully saved Wish can unlock a personal coupon.
6. Membership, payment, and Points benefits are applied only after the relevant MMD verification is complete.

## 4. Universal rules

### Identity, history and Points

- Identity verification starts CARE BACK review; it does **not** automatically issue a coupon or add Points.
- MMD may show the member’s current status, actual expiry, current Points, and history that can be linked safely.
- Points reconciliation uses the verified-payment rate **100 THB = 1 Point**.
- A transfer slip or receipt is supporting evidence only. It never confirms payment, Points, membership, or entitlement by itself.
- Every Points or membership action must be idempotent: retrying a request must not add the same benefit twice.

### Personal coupon

- A personal coupon is available only after the customer’s Birthday Wish is successfully saved.
- Benefit: **10% discount**, one use, for an eligible participating service.
- Validity: **30 days from activation**.
- A personal code must not be displayed before the Wish is saved.
- The code is personal, single-use, and cannot be issued repeatedly for the same CARE BACK claim.
- The coupon is not cash and cannot be used for membership fees, renewal fees, tips, payment verification, Black Card approval, or SVIP access.
- Viewing or copying a code never consumes it. A used, expired, revoked, or invalid code cannot be reactivated by the customer.

### Approval boundaries

- Payment confirmation belongs to the official payment-verification owner.
- Membership extensions are applied by the canonical membership owner, not by the browser.
- Points are applied by the canonical Points Ledger owner, not by the browser.
- Black Card remains a private review decision; points never auto-approve Black Card.
- SVIP is never point-based, purchasable, or automatic. It is privately considered by Per only.

## 5. Benefits by customer status

| Customer status | What MMD verifies | CARE BACK benefit | Points rule | Coupon state |
| --- | --- | --- | --- | --- |
| Current member (active/grace) | Passport, existing expiry, linked history, verifiable payments | Extend membership **180 days from the actual existing expiry date** | Reconcile verified payment history at 100 THB = 1 Point; no automatic CARE BACK point bonus | Opens after Birthday Wish is saved |
| Former/expired member | Previous member record, linked history, renewal status | No automatic renewal. After official renewal payment and active/grace restoration: extend **90 days** | **+150 Points** after the related renewal is verified and applied | Remains unavailable until Wish, renewal, payment, and restored member status are verified |
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
- The worker creates an application for the extension after identity verification; an application is not proof that the canonical membership record has already changed.
- Historic Points are reconciled only from verified payment records. There is no automatic +50 or other automatic CARE BACK point bonus.

### Former/expired member

- The system must search and verify the old member record first.
- CARE BACK must not renew an expired membership by itself.
- The customer completes official renewal; MMD verifies the payment; the profile must be active or grace before the 90-day extension and 150-point benefit become eligible for application.
- Any recovered history, model/service history, or old Points must be linked from evidence MMD can verify. It is never restored solely because the customer requests it.

### New member

- Welcome Points are pending until membership registration and payment verification are complete.
- Standard, Premium, and approved special campaign selections follow the point table above.
- New members have no old membership expiry to extend.

## 7. Customer-facing safety copy

Use this meaning on every CARE BACK surface:

> สิทธิ์ทั้งหมดจะมีผลหลัง MMD ตรวจสอบข้อมูล การสมัคร หรือการชำระเงินที่เกี่ยวข้องเรียบร้อยแล้วเท่านั้น

> การยืนยันตัวตนช่วยให้ MMD ตรวจสถานะ ประวัติที่เชื่อมได้ และ Points ที่ตรวจสอบได้ แต่ไม่ได้หมายความว่าได้รับคูปองหรือ Points อัตโนมัติ

> คูปองส่วนตัว 10% จะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จ ใช้ได้ 1 ครั้งกับบริการที่ร่วมรายการ ภายในระยะเวลาที่ระบบระบุ

## 8. Worker and data rules

- LINE/LIFF session verification is the customer identity boundary.
- The Worker owns claim creation/resume, coupon lifecycle checks, and safe customer responses.
- The canonical Birthday Wish service is the only authority that can mark a Wish as saved.
- Browser code must not write campaign claims, activate a coupon, apply Points, extend membership, approve payment, approve Black Card, or infer SVIP.
- Promotion states must distinguish at least: `wish_required`, `renewal_required`, `ready`, `used`, `expired`, `revoked`, and `invalid`.
- Coupon record lifecycle must distinguish at least: `draft`, `active`, `used`, `expired`, `revoked`, and `invalid`.

## 9. Go-live checklist

- [ ] Public page shows both campaign phases and makes clear that the rules are shared.
- [ ] Public page uses the approved three-image rotating hero and reduced-motion fallback.
- [ ] Wish page explains that a successful Wish is required for a personal coupon.
- [ ] Worker rejects new CARE BACK claims after 30 September 2026.
- [ ] Existing claims remain idempotent and do not create duplicate codes, extensions, or Points.
- [ ] Payment, membership, and Points owners are connected before live benefit application.
- [ ] Coupon redemption is connected to the official booking/service transaction owner before any live “use coupon” claim is made.
- [ ] Production deployment and Webflow publication are separately approved and recorded.

## 10. Final lock

```text
Current member = verified identity → +180 days from real existing expiry
Expired member = verified renewal/payment/active status → +90 days +150 Points
New Standard = verified membership/payment → +150 Welcome Points
New Premium = verified membership/payment → +250 Welcome Points
Approved special campaign selection = verified membership/payment → up to +350 Points for Black Card review consideration only
Personal coupon = Birthday Wish saved → 10%, one use, eligible service, 30 days from activation
Points reconciliation = verified payment only, 100 THB = 1 Point
```

This document intentionally contains no Airtable IDs, LIFF IDs, secrets, or internal access details. Keep those only in restricted implementation documentation.

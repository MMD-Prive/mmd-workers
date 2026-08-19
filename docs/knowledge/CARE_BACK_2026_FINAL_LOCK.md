# MMD Privé — CARE BACK 2026 Final Lock

Status: final rules for implementation  
Effective date: 2026-08-19 (Asia/Bangkok)  
Owner: Boss Per / MMD  
Canonical route: `/promotion/6-years-care-back`

## Purpose and precedence

CARE BACK is a สิทธิ์ดูแลกลับ for people MMD has previously cared for and verified new members entering through the campaign. It is not a mass discount, membership package, automatic approval, VIP package, Black Card grant, or SVIP threshold.

This document supersedes earlier CARE BACK guidance where it conflicts, including any copy or implementation that issues a personal code immediately after login or identity verification.

## Campaign calendar

- MMD Birthday CARE BACK: through 31 August 2026.
- CARE BACK CONTINUES: 1–30 September 2026.
- Both phases use one identical benefit policy. September never creates a second claim, coupon, point bonus, or membership extension.
- After 30 September 2026 no new CARE BACK claim may be created. An existing verified claim may resume its approved workflow.

## Required customer flow

1. Start from CARE BACK and sign in through LINE/LIFF.
2. Verify Member Passport, membership status, linked history, and verifiable Points.
3. Create or resume one CARE BACK claim idempotently.
4. Save a Birthday Wish through the canonical Wish owner.
5. Only a successfully saved Wish can unlock the personal coupon.
6. Apply membership, payment, and Points benefits only after each canonical owner completes verification.

Identity verification starts review only. Opening the page, logging in, or submitting identity must never issue a coupon, add Points, approve payment, or create a membership term.

## Personal coupon

- 10% discount, one use, eligible participating service only.
- Valid 30 days from activation.
- Wish saved is mandatory before activation or display.
- One coupon per CARE BACK claim; viewing or copying never consumes it.
- Used, expired, revoked, or invalid codes cannot be reactivated by the customer.
- Not cash and not valid for membership fees, renewal fees, tips, payment verification, Black Card approval, or SVIP access.

## Benefit matrix

| Customer status | CARE BACK benefit | Points |
| --- | --- | --- |
| Current member (active/grace) | +180 days from the real existing expiry | Reconcile verified payment history only; no automatic CARE BACK bonus |
| Former/expired member | After verified renewal/payment and restored active/grace: +90 days | +150 Points after the related renewal is verified and applied |
| New Standard | No historical extension | +150 Welcome Points after verified membership/payment |
| New Premium | No historical extension | +250 Welcome Points after verified membership/payment |
| Approved special selection | No historical extension | Up to +350 Points after verified membership/payment; Black Card review consideration only |

Trial / Guest Pass receives no automatic CARE BACK Welcome Points unless MMD publishes a separate rule.

## Money, membership, and Points truth

- Points reconciliation rate: verified payment only, 100 THB = 1 Point.
- A slip or receipt is supporting evidence only and never confirms payment, Points, membership, or entitlement.
- Payment confirmation belongs to the official payment-verification owner.
- Membership extensions belong to the canonical membership owner.
- Points belong to the canonical Points Ledger owner.
- Every claim, coupon, extension, and Points application must be idempotent.
- Black Card remains private review; Points never auto-approve it.
- VIP is not a customer-facing package.
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

## Kenji behavior

Kenji may explain, classify, route, and summarize safe verified status. Kenji must not create or mutate claims, activate coupons, apply Points, extend membership, approve payment, approve Black Card, infer SVIP, or expose internal identifiers.

Customer-facing answer:

> CARE BACK เป็นสิทธิ์ดูแลกลับที่ MMD ตรวจจากสถานะและประวัติจริงครับ เริ่มจากยืนยันผ่าน LINE แล้วส่ง Birthday Wish ให้บันทึกสำเร็จก่อน คูปองส่วนตัว 10% จึงจะเปิดได้ 1 ครั้งและมีอายุ 30 วันหลัง activation ส่วน Membership และ Points จะมีผลหลัง MMD ตรวจข้อมูล การสมัคร หรือการชำระเงินที่เกี่ยวข้องเรียบร้อยแล้วเท่านั้นครับ

Safety copy:

> สิทธิ์ทั้งหมดจะมีผลหลัง MMD ตรวจสอบข้อมูล การสมัคร หรือการชำระเงินที่เกี่ยวข้องเรียบร้อยแล้วเท่านั้น

> การยืนยันตัวตนช่วยให้ MMD ตรวจสถานะ ประวัติที่เชื่อมได้ และ Points ที่ตรวจสอบได้ แต่ไม่ได้หมายความว่าได้รับคูปองหรือ Points อัตโนมัติ

> คูปองส่วนตัว 10% จะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จ ใช้ได้ 1 ครั้งกับบริการที่ร่วมรายการ ภายในระยะเวลาที่ระบบระบุ

## Implementation gate

- LINE/LIFF session verification is the customer identity boundary.
- The canonical Birthday Wish service is the only authority that can mark a Wish saved.
- Browser code never writes claim, coupon, Points, membership, payment, Black Card, or SVIP truth.
- Production deployment, Airtable mutation, Knowledge Board publication, and Webflow publication require separate explicit approval.

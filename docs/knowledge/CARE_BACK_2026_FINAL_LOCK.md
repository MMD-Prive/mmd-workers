# MMD Privé — CARE BACK 2026 Final Lock

Status: final rules for implementation  
Effective date: 2026-08-20 (Asia/Bangkok)  
Owner: Boss Per / MMD  
Canonical route: `/promotion/6-years-care-back`

## Purpose and precedence

CARE BACK is a สิทธิ์ดูแลกลับ for people MMD has previously cared for and verified new members entering through the campaign. It is not a mass discount, membership package, automatic approval, VIP package, Black Card grant, or SVIP threshold.

This document supersedes earlier CARE BACK guidance where it conflicts, including any copy or implementation that issues a personal code immediately after login or identity verification, or requires old customers to reproduce historical slips in order to recover their legacy status or Points.

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
6. Apply membership, payment, and Points benefits only after each canonical owner completes verification or approved historical reconstruction.

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
| Current member (active/grace) | +180 days from the real existing expiry | Reconstruct/reconcile historical Points from Per Notes and linked legacy evidence at 100 THB = 1 Point; no automatic CARE BACK bonus |
| Former/expired member | After verified renewal/payment and restored active/grace: +90 days | +150 Points after the related renewal is verified and applied; prior historical Points may be reconstructed separately from legacy notes |
| New Standard | No historical extension | +150 Welcome Points after verified membership/payment |
| New Premium | No historical extension | +250 Welcome Points after verified membership/payment |
| Approved special selection | No historical extension | Up to +350 Points after verified membership/payment; Black Card review consideration only |

Trial / Guest Pass receives no automatic CARE BACK Welcome Points unless MMD publishes a separate rule.

## Money, membership, and Points truth

- Current/new transactions: payment confirmation belongs to the official payment-verification owner.
- Historical customer status and Points: MMD may reconstruct from LINE Official legacy evidence without requiring a historical slip.
- Historical Points rate: 100 THB = 1 Point for service amounts supported by Per Notes / preserved legacy evidence.
- A slip or receipt is supporting evidence only and is not mandatory for historical reconstruction.
- Tips do not generate historical Points; direct-hand tips never count.
- Membership/renewal fees are not auto-counted into historical Points and remain review-required unless an explicit rule says otherwise.
- Ambiguous amounts, referral bonuses, and promotion bonuses remain review-required.
- Membership extensions belong to the canonical membership owner.
- Points belong to the canonical Points Ledger owner after approved reconstruction/application.
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

Historical reconstruction should additionally distinguish operational review states such as:

- `legacy_found`
- `legacy_review_required`
- `historical_points_proposed`
- `historical_points_approved`
- `historical_points_applied`

## Kenji behavior

Kenji may explain, classify, route, and summarize safe verified or approved reconstructed status. Kenji must not create or mutate claims, activate coupons, apply Points, extend membership, approve payment, approve Black Card, infer SVIP, or expose internal identifiers.

Customer-facing answer:

> CARE BACK เป็นสิทธิ์ดูแลกลับที่ MMD ตรวจจากสถานะและประวัติจริงครับ เริ่มจากยืนยันผ่าน LINE แล้วส่ง Birthday Wish ให้บันทึกสำเร็จก่อน คูปองส่วนตัว 10% จึงจะเปิดได้ 1 ครั้งและมีอายุ 30 วันหลัง activation ส่วนประวัติสมาชิกและ Points เดิม MMD จะตรวจจากข้อมูลที่เคยบันทึกไว้ รวมถึง LINE Official และ Note เดิมของ MMD โดยไม่จำเป็นต้องให้คุณหาสลิปเก่าครบทุกครั้งครับ

Safety copy:

> สิทธิ์ทั้งหมดจะมีผลหลัง MMD ตรวจสอบข้อมูล การสมัคร การชำระเงิน หรือประวัติเดิมที่ MMD เชื่อมโยงได้เรียบร้อยแล้วเท่านั้น

> การยืนยันตัวตนช่วยให้ MMD ตรวจสถานะ ประวัติที่เชื่อมได้ และ Points ที่ตรวจสอบหรือกู้คืนจากข้อมูลเดิมได้ แต่ไม่ได้หมายความว่าได้รับคูปองหรือ Points อัตโนมัติ

> คูปองส่วนตัว 10% จะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จ ใช้ได้ 1 ครั้งกับบริการที่ร่วมรายการ ภายในระยะเวลาที่ระบบระบุ

## Implementation gate

- LINE/LIFF session verification is the customer identity boundary.
- The canonical Birthday Wish service is the only authority that can mark a Wish saved.
- `immigrate-worker` may normalize/infer legacy LINE evidence and historical note data, but canonical entitlement still requires safe match and canonical/admin approval/application.
- Historical Points reconstruction must use preserved Per Notes / LINE Official evidence first; do not require missing historical slips as a prerequisite.
- Browser code never writes claim, coupon, Points, membership, payment, Black Card, or SVIP truth.
- Production deployment, Airtable mutation, Knowledge Board publication, and Webflow publication require separate explicit approval.

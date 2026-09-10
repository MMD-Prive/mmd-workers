# MMD Privé — CARE BACK 2026

**Promotion, Points & Operational Rules — Final working summary**  
**Status:** Active canonical operations policy  
**Last updated:** 10 September 2026 (Asia/Bangkok)  
**Coupon Validity Canon:** V2.2  
**Membership / CARE BACK Canon:** V3.0

## 1. Purpose

CARE BACK is a **สิทธิ์ดูแลกลับ** for people MMD has previously cared for and for verified new members entering through the campaign. It is not a mass discount, a membership package, or an automatic approval.

Public pages explain policy only. Actual payment, membership term, Points, coupon percentage and `active_through` come from their canonical owners after verification.

## 2. Private Membership term lock

| Private Membership | Base duration | Expanded CARE BACK for qualifying signup / renewal from 1 Aug 2026 |
| --- | ---: | ---: |
| Standard | **1 year** | **+180 days** |
| Premium | **2 years** | **+1 full year** |

Operational consequences:

- Premium must never be described as `1 YEAR` or `THB / YEAR` on current customer-facing Private Membership surfaces.
- `current +180 days` is not the universal rule for membership activity dated on/after 1 Aug 2026.
- A qualifying Standard signup/renewal receives +180 days after canonical verification.
- A qualifying Premium signup/renewal receives +1 full year after canonical verification.
- The browser never calculates the final date.
- The canonical membership owner returns the real account result and My MMD presents it.

### No double stacking

A single qualifying membership transaction receives one CARE BACK duration extension only.

- Premium renewal from 1 Aug 2026 onward → Premium rule `+1 year`, not generic `+180 days` plus another year.
- Standard renewal from 1 Aug 2026 onward → Standard rule `+180 days`, not legacy former-member `+90 days` plus another 180 days.
- Retry/resume must be idempotent.

### Legacy compatibility

Historical claims created under pre-expansion policy remain auditable and are not silently rewritten. Existing records may therefore still contain legacy status-based adjustments such as current-member +180 days or former/expired +90 days.

Those values are compatibility history only. They must not be reused as the public rule for a new qualifying membership transaction dated on/after 1 Aug 2026.

## 3. Campaign calendar

| Phase | Customer-facing name | Period | Rule |
| --- | --- | --- | --- |
| 01 | MMD Birthday CARE BACK | through 31 August 2026 | Birthday window |
| 02 | CARE BACK CONTINUES | 1–30 September 2026 | Same campaign, continuation window |

September is not a second promotion. It must not create a second coupon, duplicate point bonus, or duplicate membership extension.

## 4. Customer flow

### Public Wish

1. Anyone may open `/promotion/6-years-care-back/wish` and submit a Birthday Wish without LINE login or membership verification.
2. A successful Wish is complete by itself.
3. LINE verification after Wish is optional and exists for linking/receiving the personal coupon.
4. Membership duration, Points and payment are separate verified flows.
5. Wish alone never grants membership extension or Points.

### Membership activity

1. Customer signs up for or renews Private Membership through the canonical membership/payment path.
2. MMD verifies identity, membership transaction and payment as required.
3. Canonical membership logic resolves Standard or Premium.
4. If the transaction is CARE BACK eligible and effective on/after 1 Aug 2026, apply the package-specific extension once.
5. My MMD shows the verified final status and `active_through`.

## 5. Identity, legacy history and Points

- Historical customers must not be forced to reproduce old slips that may no longer exist.
- LINE Official identity/profile linkage, Per-renamed customer names, legacy tags and Per's original customer notes are valid MMD-owned reconstruction evidence.
- Historical Points are reconstructed primarily from Per Notes / preserved LINE Official evidence.
- Historical Points baseline remains **100 THB = 1 Point** for supported service amounts.
- Tips do not generate historical Points; direct-hand tips never count.
- Membership/renewal fees are not auto-counted into historical Points unless an explicit rule says otherwise.
- Ambiguous amounts and promo/referral bonuses remain review-required.
- `immigrate-worker` normalizes/infer legacy evidence but never grants canonical entitlement by itself.

### Campaign Points retained

| Case | Points rule |
| --- | --- |
| Current member verification-only | Historical Points reconciliation; no automatic CARE BACK point bonus unless separately approved |
| Former/expired renewal | +150 Points where the approved renewal rule applies; historical Points may be reconstructed separately |
| New Standard | +150 Welcome Points after verified membership/payment |
| New Premium | +250 Welcome Points after verified membership/payment |
| Approved special campaign selection | Up to +350 Points after verified membership/payment; Black Card review consideration only |

Trial / Guest Pass receives no automatic CARE BACK Welcome Points unless MMD publishes a separate rule.

## 6. Personal coupon — Canon V2.2

- Coupon requires a successfully saved Birthday Wish.
- Public/unverified wording is **UP TO 10% OFF / ส่วนลดสูงสุด 10%** only.
- 10% is the campaign ceiling, not a guaranteed discount for every booking.
- Approved rate is resolved from **Model level × PN/VIP job format × customer eligibility** and returned by trusted backend as `approved_discount_percent`.
- Browser/public code never calculates or invents the authoritative percentage.
- Card color represents membership status only and never determines discount.

| Model level | PN job format | VIP job format |
| --- | ---: | ---: |
| Public Models | 3–5% | 3–5% |
| Standard Models | 5% | 7% |
| Premium / EMs / GWs Models | 5% | 10% |

`PN` and `VIP` are job formats, not customer membership tiers.

### Coupon validity

- **2 calendar months from activation**.
- Single use, one coupon per booking.
- Booking confirmation must occur before verified expiry.
- After valid booking, service date may be scheduled within 90 days from the original booking date, including after coupon expiry.
- Rescheduling must remain within the same original 90-day window.
- Coupon is not cash and cannot be used for membership fees, renewal fees, tips, payment verification, Black Card approval, or SVIP access.

## 7. Authority boundaries

- Payment truth → official payment-verification owner.
- Membership base term + CARE BACK extension → canonical membership owner.
- Final `active_through` → canonical membership state / My MMD.
- Historical migration evidence → reviewed MMD-owned evidence.
- Points → canonical Points Ledger.
- Coupon actual rate → backend `approved_discount_percent`.
- AI / Kenji → advisory and routing only.
- Policy / exception → Per.

No browser, query string, card color, visual tier, Wish submission, Telegram observation or Drive observation may override those authorities.

## 8. Required public wording

Use one policy consistently across customer-facing surfaces:

> Private Standard อายุพื้นฐาน 1 ปี · Private Premium อายุพื้นฐาน 2 ปี สำหรับการสมัครหรือต่ออายุ Private Membership ที่เข้าเงื่อนไข CARE BACK ตั้งแต่เดือนสิงหาคม 2026 Standard +180 วัน · Premium +1 ปี วันหมดอายุจริงยึด My MMD หลัง MMD ยืนยัน

Wish-specific wording:

> Wish ส่งได้ทุกคนครับ Wish อย่างเดียวไม่เพิ่มวันสมาชิกหรือ Points หากต้องการคูปองค่อยยืนยัน LINE หลังส่งได้ ส่วน CARE BACK Membership คิดตามแพ็กเกจและสิทธิ์ที่ตรวจสอบได้ — Standard +180 วัน · Premium +1 ปี

Required sweep routes:

- `/`
- `/member/membership`
- `/sigil/member/membership/benefits`
- `/promotion/6-years-care-back`
- `/promotion/6-years-care-back/wish`

## 9. Runtime compatibility rule

The 2026-09-10 policy/wording sweep does **not** require destructive rewriting of historical CARE BACK claim records or pre-expansion compatibility constants. Runtime may continue to recognize existing legacy claim state, but customer-facing and knowledge surfaces must not present legacy lifecycle constants as the current universal membership policy.

Any future mutation path that creates a new qualifying Private Membership signup/renewal on/after 1 Aug 2026 must resolve the package-specific extension through the canonical membership owner.

## 10. Go-live checks

- [ ] Standard is shown as base 1 year where Private Membership duration is stated.
- [ ] Premium is shown as base 2 years everywhere current Private Membership duration is stated.
- [ ] CARE BACK Standard = +180 days for qualifying signup/renewal from Aug 2026.
- [ ] CARE BACK Premium = +1 full year for qualifying signup/renewal from Aug 2026.
- [ ] No public page calls `+180 days` the universal expanded CARE BACK membership duration.
- [ ] Wish remains public before LINE verification.
- [ ] Wish alone does not promise membership time or Points.
- [ ] Coupon public copy remains UP TO 10% and validity remains 2 calendar months from activation.
- [ ] My MMD remains the verified customer-facing source for actual status and expiry.
- [ ] All membership/CARE BACK writes remain idempotent and non-stacking.

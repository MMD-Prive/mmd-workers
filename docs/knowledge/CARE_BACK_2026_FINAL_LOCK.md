# MMD Privé — CARE BACK 2026 Final Lock

Status: final canonical policy for implementation and customer wording  
Effective membership-policy revision: **2026-09-10 (Asia/Bangkok)**  
Expanded membership activity effective: **2026-08-01**  
Coupon Validity Canon: **V2.2**  
Membership / CARE BACK Canon: **V3.0**

Owner: Boss Per / MMD  
Canonical route: `/promotion/6-years-care-back`

## Purpose and precedence

CARE BACK is a สิทธิ์ดูแลกลับ for people MMD has previously cared for and verified new members entering through the campaign. It is not a mass discount, an automatic entitlement, VIP package, Black Card grant, or SVIP threshold.

This document supersedes earlier CARE BACK guidance where it conflicts, including:

- any public or knowledge copy that describes Premium Private Membership as 1 year;
- any current implementation wording that treats `current +180 days` as the universal CARE BACK membership rule;
- the former-member `+90 days` rule for a new qualifying renewal dated on or after 1 August 2026;
- any 10% fixed-coupon rule or 30-day coupon-validity rule;
- any flow that requires a customer to send a Wish only after LINE verification.

Canonical membership and campaign truth remains backend-owned. Public pages explain policy; they do not calculate an account-specific expiry.

## Private Membership term canon

| Private Membership | Base term | CARE BACK extension for qualifying signup / renewal from 1 Aug 2026 |
| --- | ---: | ---: |
| Standard | **1 year** | **+180 days** |
| Premium | **2 years** | **+1 full year** |

The base term and CARE BACK extension are separate concepts. Customer-facing wording should make both visible where duration is discussed.

Examples:

- New qualifying Standard signup: base 1 year + CARE BACK 180 days.
- New qualifying Premium signup: base 2 years + CARE BACK 1 year.
- Qualifying Standard renewal: renewed Standard term + 180 days.
- Qualifying Premium renewal: renewed Premium term + 1 year.

The actual `active_through` date shown to a customer is the date confirmed by the canonical membership owner / My MMD. The browser must never add days or years itself.

## Expanded CARE BACK membership rule

For **Private Membership signup or renewal with an effective transaction date on or after 1 August 2026**, CARE BACK membership duration is package-specific:

- Standard → **+180 days**.
- Premium → **+1 full year**.

The expansion applies to eligible new signup and renewal transactions after canonical payment/membership verification. It replaces lifecycle-only duration wording for those transactions.

### No double stacking

A single qualifying membership transaction receives one CARE BACK membership extension only. Do not stack an older lifecycle benefit and the expanded package benefit on the same transaction.

- A Premium renewal dated on/after 1 Aug 2026 receives the Premium expansion **+1 year**, not generic `+180 days` plus another year.
- A Standard renewal dated on/after 1 Aug 2026 receives **+180 days**, not the former-member legacy `+90 days` plus another 180 days.
- Retries/resume must remain idempotent.

### Legacy compatibility

Already-created CARE BACK claims or historical adjustments created under the pre-expansion rules remain auditable and must not be silently rewritten.

Legacy states may therefore still contain:

- Current member verification-only adjustment: +180 days from verified existing expiry.
- Former/expired pre-expansion renewal adjustment: +90 days.

Those values are **legacy compatibility**, not the current customer-facing rule for a qualifying signup/renewal dated on or after 1 Aug 2026.

## Campaign calendar

- MMD Birthday CARE BACK: through 31 August 2026.
- CARE BACK CONTINUES: 1–30 September 2026.
- Both phases use one campaign identity and one idempotent benefit history.
- September never creates a second coupon, point bonus, or duplicate membership extension.
- After 30 September 2026 no new CARE BACK campaign claim may be created unless a later owner policy explicitly reopens the campaign. Existing verified claims may resume their approved workflow.

The expanded Private Membership duration policy is tied to qualifying signup/renewal activity from August 2026 onward and must not be flattened back to the old lifecycle-only table.

## Public Wish and verification order

Birthday Wish is public.

1. Anyone may send a Birthday Wish through `/promotion/6-years-care-back/wish` without LINE login or membership verification.
2. A successful Wish is complete by itself.
3. LINE verification after Wish is optional for linking/receiving the personal CARE BACK coupon.
4. Membership, Points, payment, and account-specific CARE BACK duration remain separate verified flows.
5. Wish alone never grants Coupon, membership extension, or Points.

Canonical public Wish endpoint remains `/member/api/care-back/public-wish`.

## Identity and legacy verification doctrine

For historical customers, MMD must not require a customer to reproduce old transfer slips that may no longer exist.

Historical identity and membership reconstruction may use MMD-owned evidence, especially:

- LINE Official identity/profile linkage;
- Per-renamed customer nickname/name;
- legacy tags such as `#client`, `#purchased`, `#mem...`, `#lite`, `-vip-`, and `-svip-`;
- Per's original LINE Official customer notes and preserved migration trace;
- payment references or slips when they happen to exist.

`immigrate-worker` remains the migration/inference layer for this evidence. It preserves traceability and safe-match behavior; it does not silently grant canonical entitlement by itself.

For historical Points, Per's original customer note remains the primary reconstruction source. Historical-note parsing produces staged/reviewable evidence rather than inventing missing history.

## Points policy retained

The membership-duration expansion does not by itself rewrite approved campaign Points policy.

| Case | Points policy |
| --- | --- |
| Current member verification-only | Historical Points reconciliation; no automatic CARE BACK bonus unless separately approved |
| Former/expired renewal | +150 Points where the related approved renewal rule applies; historical Points may be reconstructed separately |
| New Standard | +150 Welcome Points after verified membership/payment |
| New Premium | +250 Welcome Points after verified membership/payment |
| Approved special selection | Up to +350 Points after verified membership/payment; Black Card review consideration only |

Trial / Guest Pass receives no automatic CARE BACK Welcome Points unless MMD publishes a separate rule.

Historical Points baseline remains 100 THB = 1 Point for supported service amounts. Tips do not generate historical Points. Membership/renewal fees are not auto-counted into historical Points unless an explicit rule says otherwise.

## Personal coupon — Canon V2.2

- Customer-facing copy before verified entitlement: **UP TO 10% OFF** / **ส่วนลดสูงสุด 10%** only.
- 10% is the campaign ceiling, not a guaranteed discount for every booking.
- The base discount matrix is determined by **Model level × job format**:

| Model level | PN job format | VIP job format |
| --- | ---: | ---: |
| Public Models | 3–5% | 3–5% |
| Standard Models | 5% | 7% |
| Premium / EMs / GWs Models | 5% | 10% |

`PN` and `VIP` are job formats, not customer membership tiers.

Customer eligibility is an additional gate. The authoritative rate returned to the customer must be verified `approved_discount_percent`. Browser/public surfaces must never calculate or invent it.

Coupon color identifies membership status only and never determines the discount.

### Coupon validity

- Valid for **2 calendar months from activation**.
- One coupon per one booking, single use.
- Booking must be confirmed before verified coupon expiry.
- Once a valid booking is confirmed before expiry, service may be scheduled up to 90 days from the original booking date.
- Rescheduling must remain within the original 90-day service window.
- Coupon is not cash and is not valid for membership fees, renewal fees, tips, payment verification, Black Card approval, or SVIP access.

## Money, membership, Points, and coupon authority

- Current/new payment confirmation → official payment-verification owner.
- Membership base term and CARE BACK extension → canonical membership owner.
- Account-specific `active_through` → canonical membership state / My MMD.
- Historical customer reconstruction → reviewed MMD-owned LINE evidence / migration trace.
- Points → canonical Points Ledger after approved reconstruction/application.
- Coupon rate → trusted backend `approved_discount_percent`.
- AI / Kenji → explain and route only; never mutate entitlement.
- Policy / exception → Per.

Browser copy, visual tier styling, query strings, customer-entered values, Telegram/Drive observations, or a Wish submission must never override these authorities.

## Customer-facing wording lock

Use these facts consistently across Home, Membership, Benefits, CARE BACK, Wish, Kenji, and related knowledge:

> Private Standard มีอายุพื้นฐาน 1 ปี และ Private Premium มีอายุพื้นฐาน 2 ปีครับ สำหรับการสมัครหรือต่ออายุ Private Membership ที่เข้าเงื่อนไข CARE BACK ตั้งแต่เดือนสิงหาคม 2026 Standard จะได้เพิ่ม 180 วัน ส่วน Premium จะได้เพิ่ม 1 ปี วันหมดอายุจริงให้ยึดข้อมูลที่ MMD ยืนยันใน My MMD ครับ

For Wish surfaces:

> Wish ส่งได้ทุกคนครับ Wish อย่างเดียวไม่เพิ่มวันสมาชิกหรือ Points หากต้องการคูปองส่วนตัวค่อยยืนยัน LINE หลังส่งได้ ส่วน CARE BACK Membership จะคิดตามแพ็กเกจและสิทธิ์ที่ตรวจสอบได้ — Standard +180 วัน · Premium +1 ปี

Safety copy:

> สิทธิ์ทั้งหมดจะมีผลหลัง MMD ตรวจสอบข้อมูล การสมัคร การชำระเงิน หรือประวัติเดิมที่ MMD เชื่อมโยงได้เรียบร้อยแล้วเท่านั้น

## Required implementation behavior

- LINE/LIFF session verification is the customer identity boundary where identity is required.
- Public Wish must not require verification before submission.
- Canonical membership code owns base duration and the final `active_through` result.
- CARE BACK duration must be idempotent and non-stacking for the same qualifying membership transaction.
- Existing pre-expansion claim history must remain auditable rather than silently rewritten.
- Backend coupon verification must expose `approved_discount_percent`; browser code never derives the authoritative percentage.
- Browser code never writes claim, coupon, Points, membership, payment, Black Card, or SVIP truth.

## Publication sweep — 2026-09-10

The following customer-facing pages must carry this same term policy:

- `/` — Home
- `/member/membership`
- `/sigil/member/membership/benefits`
- `/promotion/6-years-care-back`
- `/promotion/6-years-care-back/wish`

No one of these surfaces may describe Premium Private Membership as a one-year plan or describe `+180 days` as the universal expanded CARE BACK duration.

# 6 YEARS CARE BACK · Phase 2 · November 2026

November-only content specification, aligned to the owner’s artwork direction. Announcement window: November 25 through November 30 inclusive, Asia/Bangkok (public display interval `2026-11-25T00:00:00+07:00` inclusive to `2026-12-01T00:00:00+07:00` exclusive). This is not a settlement deadline or a grant of entitlement.

## November benefit panels for review

| Audience | Proposed Thai display | Release condition |
| --- | --- | --- |
| Current eligible members | สมาชิกปัจจุบันที่เข้าเงื่อนไข: ต่ออายุล่วงหน้า Standard รับเพิ่ม **180 วัน** / Premium รับเพิ่ม **1 ปี** | Confirm both tier amounts and eligibility in the signed-in renewal offer. |
| Eligible former members | สมาชิกที่หมดอายุ: สมัครกลับรับเพิ่ม **6 เดือน** เมื่อผ่านการตรวจสิทธิ์ตามประวัติสมาชิกเดิม | Confirm prior-member cohorts and exact rejoin duration; do not imply all expired members qualify. |
| First-time Standard | สมาชิกใหม่ Standard: รับเพิ่ม **180 วัน** รวมประมาณ **1 ปีครึ่ง** | Confirm the new-member credit exists in the signup offer; 180 days is the exact increment, and “about 1½ years” is the display shorthand. |
| First-time Premium | สมาชิกใหม่ Premium: อายุสมาชิก **รวม 2 ปี** | Show the total only. Do not promise an extra year atop a two-year base. Hold the artwork’s “รับเพิ่ม 1 ปี” wording until the first-term package and promotional allocation are reconciled. |

The public campaign page currently describes a two-year Premium base and references a qualifying promotion; neither that page nor the design verifies the first-time signup allocation. The desired first-time total here remains two years, not three. Copy is a specification for November only, not a change to checkout, package definitions, December settlement, historical entitlements, or Phase 3.

## Current behavior observed in source, not customer acceptance

Ten read-only fixtures evaluated the [exact shared policy at the reviewed main commit](https://github.com/MMD-Prive/mmd-workers/blob/a021cd821b6c9c5d810f45c2a8b245a4c8fe88c6/shared/membership-promotion-policy.mjs), with the transaction clock set to November 25, 2026 Bangkok:

- Active renewal selects Standard +180 days and Premium +1 year.
- A first-time Standard signup returns no promotional adjustment in this helper; its November +180 days is not verified as configured. First-time Premium returns a two-year total with no bonus.
- Expired-member **renewal** selects the tier renewal bonus after November 4. A separate **signup** with verified prior membership and an expired term selects the six-month adjustment; an active member cannot use that returning-signup branch. These are different pathways and the helper does not approve either a charge or an entitlement. Keep the existing delayed-return review gate intact; the renewal price helper rejects more than 90 days since expiry.
- The shared November announcement predicate was already true on November 24 and turns false at Bangkok midnight on December 1. It is not the start gate for this particular Nov 25–30 creative. Do not change the shared predicate to force this poster into old consumers.

None of these observations verifies a hosted Webflow embed, a signed-in offer, or a payment.

## Rejoin acceptance cases before release

| Case | Current source behavior | Required evidence before publishing |
| --- | --- | --- |
| Same-tier Premium, 30 days lapsed | The signed-in quote and canonical web settlement use the ordinary renewal path. At November 25 Bangkok, the helper returns +1 year for renewal, not +6 months. | Verify the approved rejoin entry separately from renewal, with matching quote and proposed expiry. |
| Same-tier, exactly 90 days / just beyond 90 days, then 1 year or more | Keep the existing price and manual-review safeguards. The reviewed payment writer can stop beyond 90 days before the promo helper runs. | No automatic price, checkout, or entitlement for cases that require review. Verify the reviewed route separately. |
| Cross-tier rejoin (e.g. former Premium, now Standard) | The reviewed Payments writer's prior-history flag is scoped to the selected package. That does not prove first-ever Private membership. | Separate first-ever membership from first purchase of the selected tier. Never grant both returning and first-time bonuses. |

Do not force `action=signup` in the existing renewal path to make the copy match. Verify eligible and ineligible cases with synthetic or approved test accounts only, without submitting payment. A later shared-policy edit requires the existing Payments release approval; keep the Kenji evidence gate unchanged and refresh its policy attestation only if that promotion lane is separately approved.

## Neutral public copy while numeric artwork is held

> **6 YEARS CARE BACK · PHASE 2**  
> เพราะทุกความไว้วางใจมีความหมาย  
> ตรวจสอบสิทธิ์ตามสถานะสมาชิกของคุณได้ถึง **30 พ.ย. 2569** ทาง LINE Official **@mmdprive**

Use dated copy only within the announcement window and return to neutral membership-status guidance afterward. Do not use copy visibility to decide a customer's eligibility.

## Before updating Webflow or posting the numeric artwork

1. Compare each panel above against the intended signed-in offer for at least one eligible and one ineligible account per applicable cohort. Compare first-term total and promo increment independently. No payment submission as part of this check.
2. Scan the final exported QR on a phone. Verify the intended MMD account or approved status destination, no customer-specific token, and no account data on the in-phone screen.
3. Compare the exact published/staged Webflow embed and hydration behavior before applying edits to the [campaign page](https://www.mmdbkk.com/promotion/6-years-care-back) or [Benefits page](https://www.mmdbkk.com/sigil/member/membership/benefits). Test anonymous rendering and signed-in offer separately. Test the start boundary, November 30 near midnight, and December 1 at 00:00 Bangkok.
4. Record the final artwork version, approved destination, and actual send receipt separately. Do not reuse the October poster workflow or use this draft as permission to publish.

This PR contains review copy only; no asset upload, runtime, offer, checkout, eligibility, or send integration changes. No unverified image or numeric offer is publicized by the PR.

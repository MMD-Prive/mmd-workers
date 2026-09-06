# MMD CARE BACK — Public Wish / Optional Coupon Verification

Date: 2026-09-06
Status: canonical owner instruction

## Final customer logic

```text
Public Wish
  -> submit successfully without LINE login, member status, or claim
  -> customer may stop here
  -> optional: verify LINE
  -> verified LINE identity receives one personal CARE BACK discount coupon
```

A Birthday Wish is never blocked by LINE/LIFF, membership, Points, payment, renewal, or CARE BACK claim state.

## Coupon after verification

- LINE verification is optional for the Wish itself.
- After a verified LINE identity links the public Wish, the backend issues/resumes one identity-bound CARE BACK coupon.
- This coupon is single-use and valid for 2 calendar months from activation.
- Public/customer copy may say `คูปองส่วนลด` or `UP TO 10% OFF`.
- `10%` remains the maximum, not a guaranteed rate for every booking.
- Exact `approved_discount_percent` remains backend-owned and is resolved later from Model level × PN/VIP job format / booking context.
- Membership extension and Points remain separate eligibility flows. They must never block coupon issuance after verified Wish linking.
- Browser code never supplies member ID, claim ID, tier, points, payment state, or discount authority.

## Continuity bridge

- Public Wish endpoint sets an opaque pending-Wish cookie after a successful submission.
- Canonical My MMD remains `/my-mmd/` (legacy `/member/my-mmd` redirects there).
- My MMD Worker behavior consumes that opaque token after a signed LIFF session exists and POSTs it to `/member/api/care-back/link-wish`.
- A 401 keeps the token pending so the normal LINE verification bridge can finish first.
- Successful linking clears the pending token and reloads My MMD once so the latest backend coupon state can be read.
- Lovable remains presentation-only; coupon authority stays in MMD Workers/Airtable.

## Customer-facing CTA

After Wish success:

- TH: `ยืนยัน LINE เพื่อรับคูปองส่วนลด`
- EN: `Verify LINE to receive my discount coupon`
- ZH: `验证 LINE 领取折扣券`
- Target: `/member/my-mmd` / canonical My MMD handoff.

The customer can close the page after the Wish without losing the submitted Wish.

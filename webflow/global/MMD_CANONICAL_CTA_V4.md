# MMD Canonical CTA V4

Production Webflow source mirror for the registered site script `mmdcanonicalctav4` / `MMDCanonicalCTAV4` version `4.0.0`, published on 2026-09-11.

## Route ownership

- Generic member status / next action: `/member/dashboard`.
- Legacy app runtime compatibility: `/member/my-mmd`; do not use it as the generic member-status CTA.
- CARE BACK `/promotion/6-years-care-back` and `/promotion/6-years-care-back/wish` intentionally keep the bounded `/member/my-mmd` handoff.
- Payment list / status navigation: `/member/payments`.
- Exact payment + proof remains backend-owned signed `/sigil/pay?t=...`; this presentation script does not mint payment references.

## Membership presentation corrections

### `/sigil/member/membership/benefits`

- Standard base term: 1 year.
- Premium base term: 2 years.
- Qualifying CARE BACK from August 2026: Standard +180 days after verification; Premium +1 year after verification.
- Old `/sigil/member/dashboard` links are normalized to `/member/dashboard`.

### `/member/renewal`

- Generic status/back links normalize from `/member/my-mmd` to `/member/dashboard`.
- Premium new signup copy is `2,999 บาท / 2 ปี`.
- Generic payment continuation label is `ไปต่อที่รายการชำระ` and remains on `/member/payments`.
- `/confirm/payment-proof` is not a default route.

## Source

`webflow/global/mmd-canonical-cta-v4.js` is an exact mirror of the Webflow registered inline source at the time of this sync. Update Webflow and this mirror together when a later canonical CTA version is approved.

Regression check:

```bash
node --test webflow/global/mmd-canonical-cta-v4.test.mjs
```

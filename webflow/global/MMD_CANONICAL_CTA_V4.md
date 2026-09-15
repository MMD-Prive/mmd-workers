# MMD Canonical CTA V4.1

Production source for the Webflow canonical membership/navigation runtime. Version 4.1 restores member-route behaviors that were dropped when the original inline V4 was compacted to fit Webflow's inline-script limit.

## Deployment model

- Source of truth: `webflow/global/mmd-canonical-cta-v4.js`.
- Production should load this file as a version-pinned hosted Webflow site script rather than copying the full runtime into an inline 2,000-character block.
- Keep the Webflow applied-script count unchanged by replacing the old inline `MMDCanonicalCTAV4` slot with the hosted V4.1 script.
- Update the GitHub source and Webflow hosted-script version together.

## Route ownership

- Generic member status / next action: `/member/dashboard`.
- Legacy app runtime compatibility: `/member/my-mmd`; do not use it as the generic member-status CTA.
- `/public/access` keeps its explicit member-app entry behavior: LIFF status for the primary login button and `/member/my-mmd` for the legacy app button.
- CARE BACK `/promotion/6-years-care-back` and `/promotion/6-years-care-back/wish` intentionally keep the bounded `/member/my-mmd` handoff.
- CARE BACK main page keeps its explicit Wish destination `/promotion/6-years-care-back/wish`.
- `/member/promotion`, `/membership`, and `/member/membership` use `/member/dashboard` for generic dashboard actions.
- `/member/my-mmd` retains its explicit LIFF status handoff.
- Payment list / status navigation: `/member/payments`.
- Exact payment + proof remains backend-owned signed `/sigil/pay?t=...`; this presentation script does not mint payment references.

## Membership presentation corrections

### `/sigil/member/membership/benefits`

- Standard base term: 1 year.
- Premium base term: 2 years.
- Qualifying CARE BACK from August 2026: Standard +180 days after verification; Premium +1 year after verification.
- Old `/sigil/member/dashboard` links normalize to `/member/dashboard`.
- Prefix matching is used so dashboard links that already carry safe query/hash context are still normalized.
- The approved hero artwork is already present directly in the full Webflow embed, so V4.1 does not need a runtime hero override.

### `/member/renewal`

- Generic status/back links normalize from `/member/my-mmd` to `/member/dashboard`.
- Premium new signup copy is `2,999 บาท / 2 ปี`.
- Generic payment continuation label is `ไปต่อที่รายการชำระ` and remains on `/member/payments`.
- `/confirm/payment-proof` is not a default route.

## Dynamic content safety

V4.1 restores a debounced `MutationObserver` for Webflow content injected after initial page load. The observer watches child-list changes only, so href rewrites do not recursively trigger it.

## Regression checks

Focused:

```bash
node --test webflow/global/mmd-canonical-cta-v4.test.mjs
```

The CARE BACK frontend CI lane imports the same regression guard, so root CI exercises it through `npm run test:care-back-wish-frontend`.

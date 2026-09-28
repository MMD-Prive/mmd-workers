# Create Job LV11 Owner Composer — 2026-09-28

Production surface: `/internal/admin/jobs/create-job`

## Purpose

LV11 is the next presentation / operator-continuity layer for the canonical Create Job surface. It does not replace the existing Create Job business runtime and it does not move identity, entitlement, model eligibility, settlement, pricing, Payment Truth, Official Verify, or link-release authority into Webflow.

## Webflow composition

- compact Kenji Job Flow rail on desktop
- one active Create Job stage at a time
- live summary on desktop; summary drawer on constrained widths
- Kenji visual guide across all five stage headers
- explicit `KENJI · DRAFT` resume card
- `NEEDS YOU` local missing-input summary
- up to 8 Client / Model Profile Photos in a compact gallery
- Client Profile Photo refresh through canonical `POST /v1/admin/clients/profile-photo/sync`

The page root identifies the presentation as `data-design="lv11"`.

## Draft safety

LocalStorage remains a non-authoritative draft hint only.

Resume must re-run the canonical UI search/select path for Client and Model. It may restore ordinary operator fields after those identities are resolved, but it must not trust saved Client / Model objects as identity truth.

## Profile-photo safety

Profile photos are context only and never replace Canonical Client or Canonical Model resolution.

The gallery caps display/history at eight images. Client refresh uses the existing credential-bound admin endpoint and does not write business truth from the browser.

## Runtime safety

The LV11 Webflow enhancement:
- does not install a new global `window.fetch` interceptor
- does not install a global `MutationObserver` loop
- does not change `POST /v1/admin/job/create` ownership
- does not synthesize Model assignments or confirmation URLs
- does not change Public Job V2 / Private PN-VIP branching

## Canon preserved

- Canonical Client lock
- Public Job V2
- Private entitlement / Model capability re-check
- Direct vs Modeling Partner settlement semantics
- Base → Coupon → Owner Adjustment → Final Customer Price presentation
- payments-worker money authority
- Official Verify release gate
- payment-first Member / Model link release

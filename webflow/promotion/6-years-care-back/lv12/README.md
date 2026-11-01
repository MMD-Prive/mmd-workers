# MMD Privé — Care Back LV12

Production route: https://www.mmdbkk.com/promotion/6-years-care-back

This release is the main campaign page. Wish submission remains on its existing separate page. It contains no payment, membership or coupon write calls.

## Files

- `care-back-lv12.html`: complete standalone HTML, CSS, runtime and three-language copy. Images and fonts retain their original hosted URLs; internet access is required for those assets.
- `body.html`, `style.css`, `runtime.js`, `care-back-lv12.copy.json`: editable source.
- `head.html`, `footer.html`, `webflow.json`: exact Webflow page code and embed payload. The JSON also includes the previous LV10 page code for rollback.
- `before.json`: source snapshot used for content-preservation tests.
- `qa.json`, `release.json`: verification and publication records.

## Build and test

Node 20 or newer:

```sh
npm install
npm run build
npm test
```

Building writes files only. It does not publish or call Webflow. To apply the output, use the site/page/embed IDs in `webflow.json` with the Webflow connector and verify readback before publishing.

## Responsive review

On `mmdprive.webflow.io` only, append `?preview=390&lang=th` to this route. The review frame supports 320, 390, 768 and 1440px. This review mode is disabled on customer domains. The iframe renders the actual published staging page at the chosen width.

## Behaviors

Compact mobile hero; horizontal benefit cards; sticky chapter navigation and reading percentage; non-duplicating mobile actions; coupon-colour preview; complete expandable founder letter; collapsible Bangkok/archive section; 33-photo dialog with a detail viewer, previous/next controls, keyboard arrows and native Escape closing. Loading shows actual settled hero-image percentages and a localized retry action on failure. Reduced-motion preferences pause autoplay.

Membership days, Points, coupon rates, validity and eligibility remain authoritative in My MMD and existing verification services. No live submission or financial transaction is part of the test suite.

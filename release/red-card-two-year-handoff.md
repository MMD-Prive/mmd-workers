# Red Card two-year policy release handoff

The approved Public Red Card policy is **฿11,499 paid once for 2 years**. Git-controlled policy, payment inference, write-through, and `/pay/membership` fallback copy now reflect that term. The runtime `/pay/membership` page derives term badges from the public catalog.

## Webflow release step

After this code change is approved and deployed, update and publish the separate active Webflow designer embed as a distinct release action:

- Page: `/pay/membership` (page ID `6a70c99f1b2b686c83001271`)
- Main embed: `8466d573-3dd8-dbf6-8a65-a4bea41ddcfe`
- The active embed contains the manual desktop and mobile Red Card one-year fallbacks: `11,499 THB · 1 ปี` (three strings), `11,499 · 1Y` (one string), `958 THB / เดือน` (one string), and scoped term badges.
- Update those Red Card fallbacks to show two years and the corresponding monthly equivalent (approximately ฿479/month), while retaining the full one-time price of ฿11,499.
- The separate nav embed has no Red Card term copy. `webflow/pay/membership/membership.html` is a preceding skin and is not the active designer embed.

This handoff is documentation only. Do not paste or publish the embed as part of this code change. Preserve the existing `/member/membership` overview and leave Elite, Member, Black Card, and Private plans unchanged.

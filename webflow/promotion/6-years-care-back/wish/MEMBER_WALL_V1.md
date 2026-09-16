# Wish member wall and MY MMD navigation

Webflow page: `6a70f07763a06d2aaab02d53` at `/promotion/6-years-care-back/wish`.

- Head: `wish-atelier-head.html`, followed by `wish-member-wall.css` in a style tag.
- Footer: `wish-atelier-footer.html`, followed by `wish-member-wall.js` in a script tag.
- Existing V24 embed `5f36532e-b8ac-0047-ab9e-c23a92380082`: `wish-phase2-v24-embed.html`.
- Existing V25 embed `1bb57d5b-fe32-6895-da58-ef79b610f7d6`: `wish-phase2-v25-embed.html`.
- Those Webflow draft edits have been applied. Publish only after the Worker deploy passes.

Publication consent is separate from confirmation to send and is unchecked by default.
POST /member/api/care-back/public-wish accepts optional boolean public_display_consent.
The existing payload_json stores the consent version and timestamp, so no Airtable schema change is required.
Signed member linking preserves consent and records member verification only for known active/grace/expired member states with a canonical Campaign Claim. Pending, unknown, blocked, suspended and revoked states do not qualify. Membership is evaluated at linking time; the wall does not re-resolve membership on every public read.
GET on the same endpoint returns only text and submitted_at for completed, explicitly consenting, verified member-linked wishes. The bounded feed takes up to 24 eligible wishes from the newest 100 member-linked campaign records. Legacy submissions without stored publication consent remain private; do not infer consent from wish_submitted or campaign linkage.

The unverified local textarea floating-message handler is removed. Rendering uses textContent and never publishes a browser draft. MY MMD goes directly to /my-mmd/; the separate coupon link goes to /my-mmd/coupons. Pending-Wish cookie/link handling remains with the existing backend/MY MMD bridge. Coupon issuance policy is unchanged.

Release order: merge Worker patch, verify member-pages-worker deployment, read GET feed without authentication, publish Webflow, verify a signed real-member submission/link and coupon wallet. Do not create production test wishes without approval.

Observation: the literal /wish URL currently shows the site's 404; the existing canonical Wish page is the nested promotion URL above.

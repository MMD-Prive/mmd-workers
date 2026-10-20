# LINE membership renewal and promotion purchase review

Prepared against main `3e13920e784118c0cbd43b004415ec4f5256f7ec`. No AGENTS.md was found in the checkout or its applicable parent directories. Implementation and verification use an isolated task checkout; the original dirty desktop repository is untouched.

## Customer entries and wording

- Renewal: `https://miniapp.line.me/2010862595-yT4DCEMc/?intent=renew&view=package`. The verified current package is already selected; customers see the amount, purchased term, bonus, start, current expiry, resulting expiry, and payment CTA.
- Explicit old LINE entry `/sigil/member/membership?source=line&intent=renew` now redirects to that authenticated LIFF entry. Other membership marketing entries and existing signed-payment compatibility links keep their routes.
- Double Moment: `https://miniapp.line.me/2010862595-yT4DCEMc/?intent=promo&campaign=double_moment&view=care`. This selects the promotion directly. It does not create a CARE BACK wish or coupon.
- LINE's initial `liff.state` query is preserved. Browser hints confer no identity, price, or entitlement.

Canonical commercial policy is unchanged:

| Item | Payment | What the customer receives | Deadline / validity |
| --- | ---: | --- | --- |
| Standard renewal | 1,000 THB | 1 purchased year + 180 CARE BACK bonus days when eligible | CARE BACK announced through **31 October 2026**, Bangkok; existing backend honors eligible canonical payments **before 1 January 2027**, Bangkok |
| Premium renewal | 2,500 THB | 1 purchased year + 1 CARE BACK bonus year when eligible; **2 years total** | Same CARE BACK deadline; determined by canonical paid time, not proof-review time |
| Double Moment | 20,000 THB | 20,000 paid service credit + two separate 3,500 bonus credits = **27,000 THB in service credit**, not cash | **Ongoing purchase availability**; **180 days from credit issuance after verification** is credit validity, not a campaign purchase deadline |

Double Moment is **ongoing**, as documented in [the existing approved continuous campaign policy](../ops/HYPE_DAILY_COMPCARD_20261018.md#promotion-availability-and-campaign-terms): `availability_mode: continuous`, `valid_to: null`, and active until the owner pauses it or revokes approval. The existing payment backend has no purchase deadline gate. No new deadline or deadline-confirmation blocker is introduced. Existing rules retained: unique canonical Client for the verified LINE identity; an already activated campaign is not purchased again; each bonus applies to a different confirmed booking with service amount at least 20,000 THB; one package per verified member per campaign; non-refundable; separate bonuses; no automatic coupon addition. UI states these credit constraints.

Renewal eligibility remains the canonical current Standard/Premium package with known expiry: advance renewal starts at future expiry; expired less than one calendar year starts at renewal time; longer-expired / unknown / unsupported records receive signup or owner review, without a payment CTA.

## Server integration

- Offer endpoints are read-only. Both customer purchase flags remain **false** in checked-in configuration.
- The Double Moment BFF reads the authenticated LIFF session and sends only its verified LINE/member identity over PAYMENTS_WORKER with server-held `AUTH_SERVICE_MEMBER_TO_PAYMENTS`. Browser identity, amounts, campaign, and destination overrides are rejected. No upstream identity records or credentials are serialized to the customer.
- Payments resolves exactly one canonical Client and reuses the existing campaign claim/session algorithm. Offer calls cannot create claims, payments, or credits. Start calls keep the existing pending-only behavior. Credit issuance remains exclusively in official payment reconciliation.
- Renewal now atomically upserts its deterministic payment session into the existing LIFF renewal table before requesting checkout. This supplies the LINE/package/amount link required by the existing settlement path. Retry uses the same record; no verification or entitlement fields are written by the bridge.
- Checkout accepts only the backend-issued HTTPS `mmdbkk.com/pay/checkout?t=...` destination, rejecting additional parameters, credentials, alternate ports, and foreign hosts. Local pending-payment persistence must succeed before handoff. Session reads/purchases use the existing serialized member API lane.
- The canonical deployment workflow uses `payments-worker/wrangler.merged.toml` and `index.review-wrapper.js`; its existing Double Moment handler and verified reconciliation remain in place. Do not deploy the legacy default payment config for this flow.

## Reviewable preview and tests

Open [the self-contained mock preview](../previews/liff-commerce.html) locally, or run `node scripts/preview-liff-commerce.mjs` to rebuild it. It reuses the actual renewal renderer, Double Moment client, and canonical policy constants against synthetic fixtures pinned to 20 October 2026. CSP blocks every network request; payment buttons only display a preview receipt. No LINE login, bindings, real customer records, payment intents, notifications or entitlements are used. This is a customer-card preview, not proof of the deployed authenticated LINE experience.

- `npm run test:liff-commerce`: **38 passing**; BFF + real campaign handler with mocked Airtable/payment downstream, amount/identity tampering, unauthorized/origin requests, unresolved/ambiguous Clients, activated claims, unsafe redirects, failed local persistence, retry identity, pending proof no-grant, verified issuance and replay, UI amounts/terms/double taps, production front-gate redirect, and LINE state handling.
- `npm run test:member-pages-liff` using Node 22: **602 passing** on the current main base, including session, shell, canonical profile, gateway and renewal policy regressions.
- Additional targeted gateway/renewal/settlement/write-through/route regressions: **82 passing**.
- `npm run check` using Node 22 and `git diff --check`: passed.
- Browser checks: 390px mobile card layout, Standard/Premium/Double Moment selection and inert payment CTA; screenshots in local `output/playwright/`. A PR-only CI workflow reruns commerce tests and uploads the offline HTML as `liff-commerce-mock-preview`.

## Remaining live acceptance — separate approval required

1. Review the draft PR and commercial copy, including the announced CARE BACK deadline versus honored paid-time boundary. Double Moment remains ongoing under the existing continuous policy; do not request or invent a purchase deadline. Its 180-day credit validity is a separate financial term.
2. Approve any merge/deploy separately. Verify the production deployment uses the reviewed commit and merged payment config, correct PAYMENTS_WORKER binding, and separately provisioned member-to-payments service secret. This task does not read/provision production secrets.
3. With explicit approval for an isolated staging configuration, enable flags there and validate iOS/Android LINE: login/return via both permanent links, `liff.state`, correct verified package without reselection, old/new dates, selected promotion, 401/retry, back/return and cookie rotation. Use mocked payment authority; do not create live intents merely to inspect UI.
4. Only with further explicit approval for a real transaction: validate signed checkout in LINE, pending resume/retry and identity links; verify no entitlement on intent/proof upload; then verify official reviewed payment updates membership/credits exactly once with canonical paid dates. Test cancellation/rejection and no coupon addition. Customer notifications require their own explicit approval.
5. Owner signs off mobile results and separately authorizes production flag enablement/rollout. Both checked-in flags stay false until then. No production acceptance is claimed.

# Pero Standard search rebuild

Route: `/partner/model-selection`. Customer `/booking` and `/sigil/booking` are unchanged.

- Server-scoped Standard/PN, excluded Benz T canonical ID, reviewed accepting status and self-reported Straight qualification. No inference from images.
- First successful token verification fixes a 60-minute deadline; refresh/search cannot renew it. Owner policy activation invalidates old links; rotate explicitly to issue the replacement.
- No initial model payload. Explicit search returns exact numeric matches before near matches (up to 3 cm / 5 kg). Missing metrics are never invented. Display values may be chosen by the owner from Compcard or Airtable without requiring source agreement or averaging.
- Every photo and selection route reapplies scope/filter restrictions. Owner-only data is never projected.
- Owner controls let the owner enable the scope and record qualifications while importing existing protected photos. Source originals are unchanged. The existing owner media picker supports up to 30 approved photos per model. Partner gallery supports viewing all of them; downloads retain separate existing permission.
- Search changes clear old results and image blobs. Thai labels and approximate/near badges; 320 and 390px fixture checked.

## Verified locally
25 backend tests pass (existing 21 plus scope integration and matching regressions). Browser fixture checked empty initial state and submitted search with near/approximate result. This is not real-photo or live-link validation.

## Release work still required
This is a draft integration, not a deployed completed catalogue. Existing live job has not been changed by this patch. No models or private media were imported in this change. Review/import eligible existing Standard models using owner workspace; enable scope and rotate the link; deploy Worker and matched Webflow head/footer; validate real data, expiry and submission before delivering the link. Server intentionally does not relabel existing unqualified models as Standard. Full canonical i18n repository sync remains pending; copy.json and inline fallback are updated here. Generated embeds were built without JS compression in this environment; both remain below Webflow's 50,000-character per-block limit.

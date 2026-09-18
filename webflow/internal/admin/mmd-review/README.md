# MMD Review

Canonical admin route: `/internal/admin/mmd-review`.

- Worker owns authentication, protected HTML, queue reads, file verification and decisions.
- Webflow page `6aaacdd1c4bf88dab0d34e27` is a noindex entry only. Never put private media, credentials, draft content or business authority into Webflow.
- Webflow Dashboard has an additive MMD Review shortcut (`dashboard-entry.js`).
- `review.html`, `review.css`, `review.js` are the split page sources. The generated `admin-worker/src/private-media-review-page.js` packages exactly these sources for Worker delivery. The test checks they match.
- API: `GET /v1/admin/private-media?status=pending_review|approved|rejected&cursor=...`; `POST /file`; `POST /decision`.
- Browser API requires the existing credential-bound owner/admin cookie on the production host. Model/partner roles, bearer/confirm credentials, and cross-origin mutations are rejected.
- The queue returns allowlisted metadata and canonical Model display names, without object keys or URLs. Legacy bucket/key records remain locked.
- Review opens a verified, no-store binary via an in-memory blob URL; it is revoked on close, tab hiding and page exit. Notes are never stored persistently in the browser.
- Decisions require the observed status and reviewed media digest, use the existing canonical review audit writer, and read back the flags before reporting success.
- Approval always leaves `public_safe=false`. This page does not issue customer grants or consume previews.

Validation: `node --test admin-worker/private-media-review.test.mjs admin-worker/model-schema-patch-v1.test.mjs admin-worker/admin-login-active-entrypoint.test.mjs`.

Production deploy workflow checks unauthenticated queue=401 and page=303 on apex and www after exact route synchronization. Authenticated browser testing with a real test admin and media remains a separate check; development tests use synthetic fixtures only.

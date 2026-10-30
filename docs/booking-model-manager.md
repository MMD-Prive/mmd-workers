# Booking Model Manager

Owner/admin route: `/internal/admin/booking-models`.
API: `GET /v1/admin/booking-models`.
Approved public cover: `GET /v1/admin/booking-models/:model_id/cover?media_id=...`.

This first release gives Per one searchable directory for Booking. Search matches working name, nickname, canonical code or an exact Airtable record ID. The Public/Private inventory filters and attention filters operate on a 20-record Airtable page. A filtered page can be empty while more records remain: the UI retains Load more and explains that the search can continue.

The detail dialog shows height, weight, body type, skin tone, baseline profile gates, the approved public cover state and specific missing/review items. Its MMD Review link opens the existing review queue. This release does not edit profiles, approve media, change package grants or enable Private media delivery. Those remain separate flows. It labels the current unconnected Private Booking media explicitly.

## Authority and data

- Only the existing credential-bound owner/admin browser session is accepted. Anonymous pages redirect to the existing login; JSON and media endpoints return 401. Login returns to the directory.
- The shared admin workspace directory includes Booking Models.
- Model metadata comes from the canonical Models table. Eligibility calls the existing Booking sanitizer; approved covers use the existing media registry policy and R2 delivery gate. No schema changes or duplicated visibility authority.
- This is a baseline profile diagnostic, not a claim that a customer can book the Model. Entitlements, current customer blocks, search/work criteria and sales rules still apply at Booking.
- Private records remain admin-only inventory. Private model photos are not substituted with Public photos.
- Responses project only named fields. No contact details, private names, notes, object keys, Drive links, arbitrary attachments or Airtable credentials are returned.
- Covers recheck canonical Model state, current primary selection and the existing object metadata checks on every read. Bytes stream through a same-origin authenticated, no-store route.
- Model/media upstream errors remain distinct from a genuine empty search or a missing cover. There are no canonical data writes.
- Search text is an escaped Airtable string literal, at most 80 characters. Pagination is bounded and a repeated source cursor fails closed. The client aborts prior searches and ignores late responses. Session denial and page hiding clear rendered profiles.

## Copy

Canonical source: [mmd-i18n PR #45](https://github.com/MMD-Prive/mmd-i18n/pull/45), commit `6a1c5f2f4ab1c0471207d049fdcd40efd54e7318`,
`assets/i18n/pages/booking-model-manager.th.json`.
The byte-identical JSON snapshot is bundled as `admin-worker/src/booking-models.copy.json` so the protected page does not depend on an external dictionary request.

## Validation and release

- 17 backend/route/authorization tests and 4 DOM tests, using synthetic read-only fixtures.
- A Wrangler dry-run of the new handler and its dependency graph passes. It is an isolated bundle check, not a full admin-worker production build.
- Existing active-entrypoint, login, media and workflow checks run in GitHub CI.
- No real booking, media approval, Model update, production publish or production deployment was performed for this change.
- Mobile layout uses one column below 650 px, 16 px inputs, 46–48 px primary controls, a bounded detail dialog and the internal white/soft-orange palette. Visual browser QA on the live authenticated page remains a release check.

After owner approval, merge the Worker and copy PRs, then use the existing owner-approved admin deployment workflow for the exact approved main SHA. The workflow synchronizes only the two new narrow route families (apex and www) and checks signed-out page=303 and API=401. Recheck an authenticated search by working name/code, filter, pagination, detail and session expiry after release. Customer Booking design and routes are unchanged.

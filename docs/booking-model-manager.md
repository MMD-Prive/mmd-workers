# Booking Model Manager

Page: `/internal/admin/booking-models`. Search API: `GET /v1/admin/booking-models`.

## Admin inventory and customer visibility

Per and authenticated admins can inspect **all linked Public/Private media, in every review state**. Customer approval and customer visibility never gate admin thumbnails or the detail gallery. Pending, approved, rejected, revoked, archived and other registered states appear with labels. Hidden/protected Model records remain visible to the authorized admin. Photo thumbnails prefer a registered profile-main photo, then another available photo. Detail shows all linked photos/clips; clip-only records have an explicit label.

Customer profile diagnostics are separately labeled. This feature neither approves media nor changes Public/Private customer delivery, membership/package grants, customer blocks, or customer search rules. The existing MMD Review link is still the place for approval/revocation decisions. Private customer Booking media delivery is still a separate integration.

## Media delivery

- Authenticated GET/HEAD: `/v1/admin/booking-models/:model_id/media/:asset_record_id`.
- The old `/:model_id/cover?media_id=...` route remains a gated compatibility alias.
- Each read verifies that the canonical Model exists, the asset links to that exact Model, the configured bucket matches one of the three known Model-media buckets, and the object size/MIME/media ID/Model ID/hash metadata match the registry.
- Registered Public candidates and Private originals use their existing R2 bindings. There is no approval-state filter and no guessed storage URL.
- Bytes stream through the signed-session route with private no-store, nosniff and same-origin resource policy. Clips support byte ranges. There is no bearer token or private object key in the browser response.
- Unsupported/missing objects show a file-unavailable state; records without linked media show a neutral empty state. Unlinked Drive files or arbitrary storage objects are not silently guessed.
- Registry reads follow pagination without approval filters, join actual Model record links, detect repeated cursors and stop with an unavailable state if the bounded scan is incomplete.
- Page hiding/session failure clears rendered inventory and gallery; closing a detail stops/removes video sources.

## Search and access

The page uses the existing owner/admin signed session and login. It is linked from the existing internal workspace directory. Search matches working name, nickname, Model code or an exact record ID. Public/Private and attention filters operate on bounded source pages, retaining Load more even when the current filtered page is empty. Responses contain allowlisted profile/media descriptors and omit contact details, private names/notes, object keys and Drive URLs.

## Copy and validation

Thai copy source: [mmd-i18n PR #46](https://github.com/MMD-Prive/mmd-i18n/pull/46), with an identical bundled JSON snapshot in `admin-worker/src/booking-models.copy.json`.

- 27 backend/DOM tests and the 5 DOM cases against the bundled page renderer.
- Tests prove admin previews of pending/rejected/Private media while customer media delivery remains closed; hidden Model inventory, ownership mismatch, unsupported sources, metadata mismatch, pagination, session denial and range/HEAD behavior are covered.
- Isolated handler dependency bundle passes Wrangler dry-run. The source-string client prevents the previous production `__name` serialization bug.
- No Model, approval, booking, entitlement or storage data is written by this feature.

The existing owner-approved admin deployment workflow and narrow route families are unchanged.

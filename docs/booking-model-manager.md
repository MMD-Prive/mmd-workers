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


## Existing Drive folders (owner-requested, 2026-10-31)

The admin now reads linked Drive originals alongside the R2 registry. No copy,
customer approval or Model visibility is created. Exact canonical folder references
must agree, and a fresh canonical lookup must include this Model and may include records explicitly
sharing the same folder. Unexplained conflicting links are reported for review. The existing signed Model directory rechecks approved ancestry.
The admin uses signed requests to the existing Model Drive directory, whose OAuth
credentials already serve Model discovery. The invalid admin-local OAuth credential
is not used or copied. No credentials
or Drive URLs are sent to the browser.

Thumbnails use a same-origin owner route; opening detail loads a photo/clip gallery
from the exact folder and up to four nested levels. Inventory is bounded (40 folders,
500 media, 20 provider pages per folder), reports partial results explicitly and
rejects repeated cursors. Each file read rechecks the current Model/folder binding
and the file's exact ancestry; requests cannot choose another folder. R2 previews
remain available in the same detail. Unlinked Models are not matched by name.

Validation: 36 backend + actual inline DOM tests, plus 7 bundled DOM cases. Live
validation is recorded in the change PR; passing fixtures alone does not establish
production Drive access or mean every Model has been linked.

The directory adds signed/internal POST admin-media-list and admin-media-file routes.
They recheck approved roots and exact file ancestry on each request. Unsigned
workers.dev calls are rejected. Existing customer routes are unchanged.

## Existing profile attachments and imported source paths

A read-only inventory of all 126 Model records found 66 explicit folder IDs and
60 without an ID. Ten of those unlinked records already have profile_photo
attachments. The admin now projects those current attachments and exact
primary_image_key legacy R2 covers through protected same-origin routes. CDN URLs
and object keys stay server-side; foreign CDN hosts, redirects, MIME mismatches,
unlinked attachment IDs and conflicting R2 object ownership are denied.

Imported source_folder + source_file records may resolve a missing folder ID
only when the complete approved-root path has one exact match. Generic compcard
categories, conflicting explicit references and ambiguous paths cannot bind by
name. This is a read-only admin lookup, with no canonical field, customer
visibility, approval or source-file mutation. Existing Drive and R2 read policies
remain separate from customer media policies. Thai copy is mirrored in mmd-i18n.

Admin inspection accepts multiple canonical records when their explicit folder ID
or complete imported source path agrees with the same resolved folder. Duplicate
catalog records do not require a merge before the owner can inspect their common
source. Unexplained folder links, ambiguous source paths and mismatched scope
remain unavailable. This does not consolidate records or grant customer access.

The 126-record inventory also contains 27 records whose exact folder ID is already
embedded in an imported public/private/exclusive folder_scope_key (without a
separate drive_folder_id value). Read this existing ID directly, including typed
legacy scopes. Conflicting explicit IDs still fail; old classification segments
do not become a customer grant or an admin image approval requirement. No field
migration is required to inspect these originals.

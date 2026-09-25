# Private Media operating contract — 16 September 2026

Private originals use only `PRIVATE_MODEL_MEDIA` → `mmd-private-model-media`.
Deployment verifies r2.dev is disabled and no custom domain is enabled. It stops if bucket creation or verification fails. There is no public-bucket fallback.

## Upload and MMD review

- Model session cookie + exact allowed origin → POST `/v1/model/media/private-upload-plan` with `file_name`, `content_type`, `file_size_bytes`. Server binds the Model; browser values never grant authority.
- POST raw bytes to returned `upload_endpoint`. JPG/PNG/WebP ≤15 MiB; MP4 ≤50 MiB. Plans expire after 30 minutes. Worker verifies size/signature, writes an immutable R2 key and SHA-256 metadata, then creates a review request and moves the asset to `pending_review` with all safety flags false.
- The Model UI keeps the selected File only for the active upload. No private thumbnails, persisted media, drafts, tokens or admin credentials. Leaving the component aborts the active upload. Metadata remains server-owned; interrupted plans cannot unlock media.
- Authenticated MMD admin: POST `/v1/model/media/review-file` with `model_id` and `media_asset_id` (Airtable record ID) to inspect the private bytes. POST `/v1/model/media/review-decision` with those IDs plus `decision: approve|reject|revoke` and optional `note`. The server validates the actual object and writes the actor/hash audit before changing safety flags. These are admin API operations; this change does not add a new admin review screen.
- Approved means `review_status=approved` AND `private_safe=true`; public_safe remains false. Reject/revoke blocks future grants and consumption. No Model action sets safety flags.

## Customer grant and consumption

- Existing admin-only POST `/v1/model/private-flash/authorize` requires `model_id`, `client_id`, `media_asset_id`, `preview_kind: private_pic|private_clip`, plus verified payment basis or explicit admin manual unlock. Payments must belong to the same Client. Client requires canonical LINE identity; viewing additionally requires a current verified member session resolving uniquely to that Client.
- Grant expires within four hours, binds one customer/model/asset, stores token hash only and enforces one view. Returned `viewer_url` places the token in a fragment, removed immediately by the viewer.
- Viewer `/api/member/app/private-preview/view` checks access; an explicit open/play action POSTs to `/consume`. GET/status and previewing the link never consume the grant.
- Consume rechecks customer, grant, expiry, media approval, MIME, owner, immutable private object and durable gate. The gate commits consumption and an audit event atomically before any bytes are released. The append-only Airtable consumption log and canonical grant mirror must also confirm success before delivery.
- Any failure after the durable consume burns the grant, including failed logging or delivery. MMD must investigate and explicitly issue a fresh grant; clients cannot retry the same grant to retrieve bytes.
- Private Pic hides after 3 seconds from image load. Private Clip has no loop, seeking or replay controls and closes at the end. Hiding/leaving the viewer closes the media and revokes its transient object URL. No browser persistence or public/signed R2 URL is used. Viewing necessarily uses transient browser memory; web delivery cannot prevent OS screenshots or a customer copying bytes already delivered.

## Compatibility and verification

Legacy media in the public model bucket cannot pass the new private-object check. Existing media must be uploaded and reviewed into the dedicated private bucket before new grants work; this release does not copy or approve existing media automatically. Existing Kenji runtime pause remains unchanged.

Tests cover actual admin entrypoint/Model session authority, cross-origin preflight, upload ownership and file checks, missing objects, MMD review audit failure, simultaneous consume, gate failure, incorrect customer/model/type/approval, logging failure, expiry/replay, viewer isolation and cleanup. Local focused/regression suite: 75 passing tests.

Deployment order: Workers and private bucket verification first; then merge the Model UI using an ordinary merge commit, allow Lovable sync/build, and publish the verified project.

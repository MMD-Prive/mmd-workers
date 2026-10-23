# Canonical model source sync contract

Status: implementation contract; production sync is not active.

## Outcome

One canonical Airtable `Models` record is the identity for a person. Drive,
Studio, and approved applications are source events, not independent model
identities. Accepted media bytes are held in an R2 staging area until their
lane-specific review is complete. Every accepted source event must have an
idempotent Airtable receipt and a verified R2 object/manifest before the UI
reports `synced`. Never equate an R2 upload with publication approval.

## Source triggers

| Source | Trigger | Canonical match | Media handling |
| --- | --- | --- | --- |
| Per uploads to Drive | Drive change notification followed by a bounded Changes API reconciliation; also periodic recovery | Exact approved-root folder ID and lane scope, one-to-one against `Models` | Fetch changed bytes, verify MIME/size/hash, stage privately in R2; do not publicize |
| Per enters data in Studio | Successful intake commit and each successful asset upload | Explicit backend-resolved model ID or a new application/intake-owned key; never name alone | Keep existing Studio R2 upload; attach to canonical identity only after resolution |
| Model application passes review | Approval/onboarding transaction after canonical model resolution | Existing linked model or deterministic application-owned key | Reuse verified application R2 bytes; create media review records; do not mark public/private safe |
| Studio edits established model | Successful backend edit | Existing canonical model ID | Patch permitted fields with provenance; stage new files for review |

The UI may show `pending_identity`, `pending_media`, `review_required`,
`sync_retry`, or `synced`. It must not show `synced` while either persistence
side failed. Google Drive notifications are hints, not truth; the Changes API
cursor and a bounded periodic reconciliation cover missed/duplicate events.

## Identity and privacy invariants

1. Stable key is the Airtable Model record ID. Keep source IDs (`drive_folder_id`,
   Studio intake ID, application ID) as distinct, unique bindings. Never merge
   people from display name, nickname, LINE alias, photo similarity, or a URL.
2. Drive folders resolve under an approved Public/Private/Exclusive root and
   match one exact folder ID plus `folder_scope_key`. Duplicates, missing links,
   lane conflicts, and unapproved roots enter an owner review queue. They do
   not create a second canonical model automatically.
3. Source events have a stable idempotency key (source, source ID, revision or
   content hash). Replays update the same receipt. A changed file creates a
   new revision; deletion/takedown makes the prior asset unavailable rather
   than silently reusing its URL.
4. R2 keys are server-generated and lane-isolated. Private/original media and
   internal manifests stay in a private bucket/prefix. Public media becomes
   visible only after the existing explicit safety review and publication gate.
   Store no OAuth credentials, contact details, or unnecessary raw profile text
   in an R2 manifest.
5. Airtable is the searchable canonical index and review ledger; R2 holds the
   verified bytes. The event is `synced` only after both sides are verified.
   Partial failures remain retryable without duplicating Models or media.

## Activation order and evidence

1. Repair the production Google Drive OAuth refresh for `member-pages-worker`
   and verify an exact approved folder lookup. The connected ChatGPT Drive
   account does not prove the Worker credential works.
2. Select a private metadata/media staging prefix and verify its access,
   retention, and rollback contract. Inspect existing Airtable Model Media
   field IDs before writes. Keep legacy conflicts in review.
3. Add a backend ingestion coordinator with event receipts and retries. Wire
   Studio upload/intake and application approval first; Drive notification,
   Changes cursor and a scheduled recovery pass next. Use backend authority,
   not a browser-supplied model ID or source URL.
4. Test same event twice, conflicting identity, rejected media, partial R2 or
   Airtable failure, changed photo, and deletion. Run a dry-run on existing
   inventory, resolve conflicts with Per, then activate per source and lane.
5. Prove a newly approved model and a new Drive photo become searchable from
   canonical Airtable and are present in R2, with review flags preserved.

Existing `model-drive-r2-metadata-sync-preflight.md` documents 47 linked
Drive folders, including duplicate bindings and missing scope keys. Its
source-only flag is disabled; this contract does not change that flag or
assert that production sync is already running.

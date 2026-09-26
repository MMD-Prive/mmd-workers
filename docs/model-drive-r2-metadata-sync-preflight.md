# MMD APP Canonical ↔ Drive → R2 metadata sync: source-only preflight

Status: OPEN. This source-only follow-up has no scheduled sync, R2 writes, media fetches, Airtable writes, routes, or production activation. `MMD_MODEL_DRIVE_METADATA_SYNC_ENABLED` is explicitly `false` in Wrangler config.

## Verified source ownership (origin/main 471414990b143bd24cfe30efecf70de4131cd6ac)

- `member-pages-worker/src/model-drive-directory.js` resolves folders under the approved Public, Private, and Exclusive roots and returns `folder_scope_key`.
- `admin-worker/src/unified-model-drive-link.js` looks up canonical Models by Drive folder ID and scope key. Its materialization path creates Models and therefore must **not** be reused by the sync.
- `admin-worker/wrangler.toml` binds `MMD_MODEL_ASSETS` to `mmd-models`, `PRIVATE_MODEL_MEDIA` to `mmd-private-model-media`, and `PUBLIC_MODEL_UPLOADS_R2` to a separate upload bucket. A binding alone does not establish a reserved private metadata prefix, retention, access or read policy.
- The existing owner-triggered media import in `admin-worker/src/private-media-review.js` reads actual bytes; it is outside this phase.

## Change in this branch

`reconcileModelDriveFolder` accepts already-resolved Drive folder metadata and canonical lookup results. Only an exact one-to-one folder ID plus lane scope match is eligible for a future manifest. Missing or conflicting bindings fail closed to `review_required`. The function has no storage or network dependencies. Its output contains internal IDs and lane only; it is not a customer response.

## Current read-only reconciliation (2026-09-26)

- Airtable `Models` currently returns 106 canonical records: 47 with `drive_folder_id`, 59 without one.
- The 47 linked records contain 3 duplicate folder IDs spanning 8 records and 20 records without `folder_scope_key` (these cohorts overlap).
- 42 unique linked folder IDs were checked by metadata-only parent traversal against the approved Public, Private, and Exclusive roots: 37 resolve under an approved root, 4 resolve outside those roots, and 1 could not be read by the connected Drive metadata call. That last result is an access/read error, not proof that the source was deleted.
- 11 unique linked records have a one-to-one folder ID, a matching `lane:drive:<folder_id>` scope key, and a matching canonical lane permission; all 11 resolve under an approved root (7 Private and 4 Exclusive). These are preflight results only; no Airtable write or R2 manifest was made.
- The connected Drive profile matches the approved source account, and approved-root folder listings are readable through the ChatGPT connector. This does not prove production service-account access.
- The supplied inventory Library ID is not a Google Drive file ID, and the named CSV was not present in the readable local workspace. Therefore the 59 unlinked records cannot be matched to current source candidates from this run; no person count is inferred from folder counts.

## Follow-up change

`resolveModelDriveMetadataSyncReadiness` is a pure gate. The sync remains disabled by default. If enabled, it still reports OPEN with the current credential, private R2 contract, and writer blockers. This PR deliberately adds no scheduler integration, Drive client, R2 binding/prefix, writer, or live production configuration change.

## Remaining gates

1. Confirm source account access and service-account permissions against approved Drive roots in the target environment.
2. Approve a distinct private R2 metadata bucket/prefix contract (binding, object schema, retention, ACL, and audit). No prefix or production bucket is selected by this branch.
3. Make the approved inventory available to this task through a readable file interface; do not resolve the unlinked records by name alone.
4. Implement the paginated, bounded read-only Drive inventory and private manifest writer only after the above gates are verified. Do not request `alt=media` or modify Public/Private media approvals.
5. Add a dry-run diff, conflict review queue, scheduled trigger and production evidence; retain OPEN until a controlled run and idempotent rerun pass.

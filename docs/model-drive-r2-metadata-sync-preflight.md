# MMD MODEL Drive → R2 metadata sync: source-only preflight

Status: OPEN. This branch has no scheduled sync, R2 writes, media fetches, Airtable writes, routes, or production activation.

## Verified source ownership (origin/main d8e58065)

- `member-pages-worker/src/model-drive-directory.js` resolves folders under the approved Public, Private, and Exclusive roots and returns `folder_scope_key`.
- `admin-worker/src/unified-model-drive-link.js` looks up canonical Models by Drive folder ID and scope key. Its materialization path creates Models and therefore must **not** be reused by the sync.
- `admin-worker/wrangler.toml` binds `MMD_MODEL_ASSETS` to `mmd-models`, `PRIVATE_MODEL_MEDIA` to `mmd-private-model-media`, and `PUBLIC_MODEL_UPLOADS_R2` to a separate upload bucket. A binding alone does not establish a reserved private metadata prefix, retention, access or read policy.
- The existing owner-triggered media import in `admin-worker/src/private-media-review.js` reads actual bytes; it is outside this phase.

## Change in this branch

`reconcileModelDriveFolder` accepts already-resolved Drive folder metadata and canonical lookup results. Only an exact one-to-one folder ID plus lane scope match is eligible for a future manifest. Missing or conflicting bindings fail closed to `review_required`. The function has no storage or network dependencies. Its output contains internal IDs and lane only; it is not a customer response.

## Remaining gates

1. Confirm source account access and service-account permissions against approved Drive roots in the target environment.
2. Approve a distinct private R2 metadata bucket/prefix contract (binding, object schema, retention, ACL, and audit). No prefix or production bucket is selected by this branch.
3. Connect read-only Drive inventory with pagination and bounded retries to this preflight, then implement the private manifest writer behind an off-by-default flag. Do not request `alt=media` or modify Public/Private media approvals.
4. Add a dry-run diff, conflict review queue, scheduled trigger and production evidence; retain OPEN until a controlled run and idempotent rerun pass.

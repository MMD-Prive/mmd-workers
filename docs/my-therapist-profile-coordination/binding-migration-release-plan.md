# Binding, migration and activation plan — proposal only

Prepared 2026-11-03. No configuration was applied, no namespace was provisioned, no migration was run, and no release command is executed by these artifacts.

## Concrete local candidate

- Worker: `mms-worker`; main: `src/runtime-index-with-dispatch.js`.
- Proposed private binding: `MMS_THERAPIST_PROFILES` → `MmsTherapistProfileCoordinator`.
- Storage: a **new SQLite-backed namespace** for that class. Continue using its storage key-value API for the operation journal.
- Proposed append-only legacy migration: `v6-mms-therapist-profile`, `new_sqlite_classes: ["MmsTherapistProfileCoordinator"]`.
- The tag is provisional: local config currently ends at v5, but no current production migration/namespace state was read. Stop if the tag/class/binding is already used or history differs; never invent a replacement tag to make validation pass.
- Existing five DO bindings and migration entries v1–v5 remain intact, in their current order. Do not rename, transfer, delete or recreate any existing namespace. Do not convert this Worker to the newer `exports` lifecycle format in this change.
- No routes, secrets, compatibility date/flags, cron, R2 binding/bucket/key scheme, service bindings or other Worker config changes.
- Owner naming remains deterministic `getByName(authenticatedTherapistId)`. Never include client owner/storage keys, change the owner naming scheme on rollback or create a new namespace to bypass quarantine.

`binding-migration.proposed.patch` is the exact minimal config diff against the recorded local config hash. It is stored outside the production config and has passed `git apply --check` without applying it. `binding-migration-plan.json` and the local scope guard tests verify that only the one appended binding and one appended creation migration may differ. The actual `mms-worker/wrangler.jsonc` remains unchanged.

## Storage initialization

A new owner object starts at revision 0 with no operation history. Read the existing manifest from its existing owner key; keep its current ETag, photos, public selection, intro and courses. Do not backfill or overwrite R2 as part of namespace provisioning. First mutation creates a durable intent, then performs conditional effects. If a manifest is absent, create it conditionally. There is no production SQL/R2/Airtable data migration or account-setting mutation in this proposal.

Existing legacy upload IDs remain bounded by current stored manifest/object metadata. Do not claim historical deleted upload identities are reconstructed: the new tombstone journal protects identities processed by this new coordinator. Before activation, define which legacy retry-capable clients may still exist; an outstanding old upload retry is part of the writer-drain gate below.

## Future release sequence — every production action still requires approval

1. **Fresh baseline and exact candidate:** read current main/PR commit, active Worker versions/traffic, exported classes, binding names/types, applied migration tag and route ownership, without logging secret values. Verify the intended changes can be isolated from all other local work. Old snapshots from earlier sessions are not a current baseline.
2. **Separate lifecycle provisioning from business activation:** prepare a minimal lifecycle-only candidate from that fresh production baseline. It adds the new binding/SQLite class/export while retaining the existing business request path. A minimal dormant class may be used for bootstrap, then replaced by the reviewed implementation on activation. Do not bootstrap by deploying this whole dirty business patch, and do not publish a bootstrap candidate whose imports accidentally activate the refactored handler. This isolated bootstrap candidate has **not** been built or proven equivalent in this task.
3. **Provision under explicit release/migration approval:** use the supported non-versioned lifecycle deployment path for the isolated candidate. Do not try to gradually apply the migration or claim versions-upload alone provisioned it. Read back the namespace/class/tag, active version/traffic and existing binding/config preservation. Do not create/delete routes or rotate secrets. The new namespace stays unused by business traffic at this stage.
4. **Front compatibility and a write-pause/drain gate:** the new frontend can speak the old backend contract, but old open pages cannot automatically acquire a revision. Prepare a separately approved, server-enforced pause for all affected profile mutation entrypoints and all external writers of the same Therapist fields. A browser-only disabled button is insufficient. Prove old in-flight writes and upload retries have settled; quarantine any unknown outcomes. A pause/drain tool and external-writer inventory are **not implemented/proven** by this task, so this is a hard activation gate.
5. **Activate coordinated business paths as one consistent writer generation:** while writes remain paused, activate the reviewed backend and paired frontend. Do not split traffic between legacy uncoordinated profile writers and the new coordinator. Confirm the backend binding is present; absent binding must remain 503. Old/unversioned pages receive 428 and must reload; do not add a legacy write bypass. GET revision/directory/media must use the same owner queue.
6. **Accept before reopening writes:** use separately authorized controlled accounts/data for authenticated verification, including conflict/draft behavior, ownership, known-rejection/unknown handling, upload/delete retries and production readback. Keep test accounts Offline/Hidden/Matching disabled and create no real job. Only a separately approved acceptance decision may lift the write pause.

## Existing workflow compatibility

Read-only inspection of the local helper confirms its narrowly guarded 10211 fallback requires route-free `mms-worker` configuration and explicit migration allowance; other failures stop. Do not modify or rerun that helper/workflow in this task. Its guard does not prove that the chosen bundle is lifecycle-only: candidate scope must be proven separately.

The local workflow is triggered by matching changes pushed to `main`. Before any future merge, establish a separately approved deployment hold/approval gate or a proven candidate separation; do not assume merge and deploy are operationally independent in the current workflow. No workflow change or dispatch is performed here.

The existing workflow also has optional Therapist secret initialization and Telegram secret rotation paths. Both must remain false for this scoped release; do not invoke those paths or touch the Telegram Worker. The helper's existing migration-allowance flag is not a new approval from Boss Per. No workflow dispatch, rerun or live API was used here.

Check the exact approved Wrangler version when preparing release. Official documentation checked 2026-11-03 states that lifecycle changes are atomic, require the non-versioned deployment path and should be separated from unrelated business changes. Older Wrangler can report 10211 on version upload; fail closed if actual tool behavior differs. Do not upgrade dependencies merely to bypass a migration rejection.

## Rollback / stop rules

- Lifecycle changes are not an ordinary code rollback. Do not roll back to a version preceding the migration, remove the class/export/binding or run a delete migration. Retain SQLite storage, journal, operation identities and tombstones.
- After any coordinated write, never restore an old backend that writes the whole manifest unconditionally or ignores pending state. Use a reviewed coordinator-compatible corrective candidate; keep the server write pause in force until it is safe. That rollback/corrective candidate is **not prepared or proven** here.
- A UI rollback must not restore unversioned write bypasses. If no compatible UI is available, keep writes paused.
- Do not roll back R2/Airtable data, reset revision to zero, delete pending entries, change namespace owner names or discard quarantine to make a smoke test pass.
- Any baseline/tag/config drift, unexplained external writer, unsettled old write, schema mismatch, wrong code/binding pair or unsupported recovery proof stops the activation. Report the exact gap; do not switch baselines silently.

## Evidence boundaries

Local config-diff guard tests and check-only patch validation are proof of the proposed diff's scope. Previous/fresh local code tests are not CI or production acceptance. No fresh deployed artifact equivalence, namespace readback, migration success, write-drain proof, operational settlement mechanism or authenticated LINE acceptance is claimed. RELEASE: NO-GO.

Official references, read 2026-11-03:
- https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ (new `exports` format; not adopted here)
- https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/

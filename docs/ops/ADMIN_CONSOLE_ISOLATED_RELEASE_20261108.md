# Admin Console: isolated production release

## Approved scope

Console implementation PR #3135 and i18n PR #54 are merged. The owner approved
the completed Console work in the current chat. The production Admin Worker is
older than main, so this release uses its verified production source plus the
Console changes only. It does not run the broad admin deployment workflow.

| Reference | Pinned value |
| --- | --- |
| Production source | `12591f4a85677535b08ed547adfc0ce7bc993327` |
| Production version | `030b5c09-2394-4fdd-9547-6461707f6dd7` |
| Production deployment | `7db93a14-c9bd-43a6-88fb-00e837ef4c3a` |
| Verified baseline Actions run | `42346835895`, attempt 1 |
| Verified baseline deployment job | `128326354592` |
| Console source | `bf78217a115995fa82bba0b57f01f326c25ac82b` |
| Console squash merge (same Git tree) | `86d68328a86c39a12b089566fc64efb5646a362a` |
| Console parent | `616ad8ed7658c352fb3d877b2d0b1b8c8276ef72` |
| Build tools | Node 22.23.4, Wrangler 4.158.0 |

The baseline job's checkout, successful validation, Kenji asset pin, uploaded
version and deployed version are linked by its original GitHub metadata and log.
The adapter checks that evidence before upload. The observed version and
deployment must still match these exact values, with one version serving 100%.

## Source isolation

The builder materializes a temporary checkout of the production source and
changes only:

- `admin-worker/src/admin-console-client.js`
- `admin-worker/src/admin-console-page.js`
- `admin-worker/src/admin-console-style.js`
- `admin-worker/src/admin-dashboard-jobs.js`
- `admin-worker/src/admin-login-hero-worker-core.js`
- `admin-worker/src/admin-login-hero-worker.js`

The shared jobs and login-core modules were identical between production and
the Console parent. The entrypoint had one unrelated six-line Standard Join
Intake change. The builder proves that removing those exact lines from the
Console parent restores the complete production entrypoint, and removes the same
lines from the Console candidate. This avoids bringing that feature into the
release through a copied entrypoint.

Every other source file, dependency manifest and source configuration comes from
the production baseline. Kenji's existing admin asset pin stays at the baseline
SHA. Console's language assets stay pinned to the approved i18n commit with SRI.

The original deployment prepended its Kenji pin to an already versioned URL.
The live CSS and JS URLs therefore contain
`?v=12591f4a85677535b08ed547adfc0ce7bc993327?v=0caeb7176f642fb4866e9bf7687777271fc49f6a`.
The isolated builder preserves these exact existing URLs. Its receipt records
both URLs and compiled digests before and after reproducing that transformation.
It proves all other compiled bytes are unchanged by the asset transformation.

The production configuration, bindings, secrets, cron schedule, subdomain and
existing routes are inherited and checked through the existing code-only release
engine. No Durable Object migration or storage provisioning is performed.
`ADMIN_WORKER_BUILD_SHA` is an inherited baseline value; use the new version's
annotations and release receipt to identify this explicitly mixed-source overlay.

## Protected workflow

Run **Release Admin Console only** from `main`. The workflow requires:

1. `production_approved = true` for this Console release.
2. A nonempty owner approval reference.
3. `approved_sha` equal to the exact full main SHA executing the workflow.
4. The pinned production version and deployment above.
5. Passing contracts and the unchanged production protection preflight.
6. The existing `mmd-production-mutation` environment approval.

It shares the `deploy-admin-worker-production` concurrency group with other
participating admin releases. Production reviewer protection, main-only branch
restriction, sole owner review and disabled administrator bypass remain intact.
The adapter verifies them again immediately before consequential steps.

## Route activation

After the code-only engine confirms the new version is active at 100%, the
create-only route helper may add exactly these routes to `admin-worker`:

```text
mmdbkk.com/internal/admin/console*
www.mmdbkk.com/internal/admin/console*
```

Both must be absent before upload. Explicit Console route shadows or exclusions
stop release. Each creation is preceded by fresh checks of the complete zone
route inventory, exact new deployment, latest version, preserved configuration
and approval. Every original route is compared, including routes owned by other
Workers and routes with no Worker. The helper exposes no update or delete action.

The final read-only acceptance probes check signed-out GET and HEAD on both
hosts, covering the bare path, slash alias and a filtered URL. They require the
existing owner login gate and preserved Console return path. They do not submit
credentials, create jobs, change money records or send messages.

## Receipt and recovery

The workflow retains `admin-console-isolated-receipt.json` as an Actions artifact.
It records source and artifact digests, exact version/deployment identities,
preservation evidence, route intents, confirmed route IDs and public gate results.
It does not contain credentials, complete bindings or raw production logs.

An ambiguous upload, promotion or route creation stops without an automatic
retry. A later attempt must first reconcile current state with GETs. Never treat
a timed-out POST as proof that nothing happened.

If recovery is required, establish whether zero, one or two routes were created
and whether the candidate is still the latest active deployment. Prepare the
exact recovery through the existing protected approval path. Restoring the old
Worker while leaving the new routes installed does not restore Webflow ownership.
Only route IDs proven created by this release are eligible for a separately scoped
ownership restoration; never remove, replace or reset other routes.

This document is a release procedure. A successful Actions receipt and live
readback are required before claiming production activation.

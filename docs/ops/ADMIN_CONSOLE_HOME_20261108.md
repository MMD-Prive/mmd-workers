# Admin Console home — 8 November 2026

**Status:** prepared against the baseline below. Production activation is
established by a completed release receipt after all final acceptance checks.

## Scope

Make `/internal/admin/console` the default admin landing page. Successful login
continues to honor a sanitized, explicitly selected task. The canonical
`/internal/admin` GET and HEAD entry redirects authenticated admin sessions to
Console before background backfill work can start. Its existing POST diagnostic
handler remains separate. Partner sessions retain their partner destination.

The login form and its browser fallbacks use Console. The Console brand and
workspace links return to Console; the Control Room remains available in Tools.

The reviewed runtime scope is four files:

- `admin-worker/src/admin-login-hero-worker-core.js`
- `admin-worker/src/admin-login-hero-worker.js`
- `admin-worker/src/admin-login-page.js`
- `admin-worker/src/admin-console-page.js`

## Exact production baseline

Read-only verification at 14:28 UTC on 8 November 2026 established:

| Evidence | Required value |
| --- | --- |
| Active and latest version | `51ae638f-55b5-40f2-a0fb-2a0f7e40c8f5` |
| Active deployment | `8eb1667c-28d0-4410-896d-9357f979b8a4` |
| Allocation | Exact version at 100%, percentage strategy |
| Baseline release control SHA | `4339243b286e2c4844abd49172a828f25c4f5c1e` |
| Source parent | `01d3c05a1b3943a4d1fbf812094cf8090799f572` |
| Module | One `worker.js`, 6,433,033 bytes |
| Module SHA-256 | `ae3509889e56ea7756be7a913f706461c9cfa5a37b223c45c40b7345904457e5` |

The active Worker is the earlier mixed-source Console overlay. Its control SHA
does not represent a broad main-source deployment. The new overlay transforms
only the exact live bytes, requires unique anchors, and reverses every edit to
prove that all unrelated runtime bytes remain unchanged. Four pinned source
hashes and the full byte-preservation evidence are recorded in the release.

Existing exact root routes, login routes and Console routes on both apex and
www already belong to `admin-worker`. This release has no route mutation step
and receives no route-write credential. Canonical root navigation uses
`/internal/admin` without query parameters; language and filters belong on
`/internal/admin/console`. Existing slash-to-root redirects remain outside this
code-only change.

## Protected workflow

Use `.github/workflows/deploy-admin-console-home.yml`. Pull requests run contracts
without production credentials. A release requires a manual dispatch on main,
`production_approved=true`, a nonempty approval reference, the exact approved
main SHA, and the expected version/deployment above. The protected
`mmd-production-mutation` environment and existing approval verifier remain in
force. Its required reviewer, main-only branch policy and disabled administrator
bypass are checked before mutation.

Dispatches share `deploy-admin-worker-production` concurrency with other scoped
admin releases. Before each engine mutation, the adapter rechecks the current
main SHA, clean checkout, source-parent ancestry and four source hashes. A
queued release that changes the active/latest version makes this baseline stale;
the run stops rather than rebasing itself or broadening its scope.

During preparation, application Delete/Restore run
[`42489299796`](https://github.com/MMD-Prive/mmd-workers/actions/runs/42489299796)
was waiting in the same production concurrency group, on main
`01d3c05a1b3943a4d1fbf812094cf8090799f572`. Finish Console-home review and CI, then
require that queue to clear before dispatch. Leave the unrelated run unchanged.
If it promotes first, verify its new deployment, version and module digest and
review a Console-home overlay on that exact artifact so the application changes
are preserved. The baseline pins in this prepared release must then be updated
with corresponding preservation evidence and tests.

Contracts install root and `immigrate-worker` dependencies with lifecycle scripts
disabled, using Node **22.23.4** and Wrangler **4.158.0**. They run all Console
contracts, the original release/approval/validation guards, login contracts,
dashboard jobs and owner smoke contracts. The exact-overlay test reconstructs
the original Console baseline with the existing isolated builder.

The release job installs only root dependencies. It downloads the single live
module, verifies its exact digest, applies the reviewed overlay and tests the
actual candidate in a subprocess with stripped credentials and blocked network.
It reuses the unchanged `releaseCurrentSession` engine for one strict-inherit
version upload and one exact 100% promotion. Existing bindings, version
configuration, operational settings, schedules, subdomain and full route
inventory remain guarded by that engine.

## Acceptance and receipts

After promotion, exact deployment and latest-version reads bracket the live
module digest check and public acceptance. Credential-free checks on both hosts
require:

- Root and Console GET return 303 to the same-host login with the requested path
  preserved; they return no document.
- Root and Console HEAD return 401 without a session.
- The default login page returns HTML containing exactly one hidden `next` input
  set to `/internal/admin/console`.

Authenticated home redirects, successful login, allowed task returns, partner
behavior, browser fallbacks and preserved root POST diagnostics are covered by
the candidate's fixtures. Acceptance does not submit real credentials or call
business mutation APIs.

The artifact `admin-console-home-receipt-<run>-<attempt>` retains
`admin-console-home-receipt.json` for 90 days. It includes the original engine
receipt, source hashes, reversible-edit evidence, module digests, deployment
IDs and public acceptance results. A completed code promotion is distinguished
from completed final acceptance.

Any failure stops without mutation retry, route repair or automatic rollback.
An uncertain upload/promotion or failed final readback requires inspection of
the saved receipt and a fresh live inventory before a separately reviewed
recovery. Never rerun the old Console route-activation workflow for this change.

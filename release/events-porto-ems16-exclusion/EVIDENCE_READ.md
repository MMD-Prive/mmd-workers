# Protected read-only release observations

This preparation adds an observation workflow, not another release path. It
does not enable `REVIEWED_RELEASE_POLICY`, choose a release window, upload a
Worker version, promote a deployment, edit R2, or invoke a live send handler.
Live posting continues unchanged. The existing paired runtime artifact and all
existing files remain unchanged.

The connected API established a complete semantic inventory of 125 objects on
November 13, but parsed JSON and omitted object-response headers. Reserializing
that data would not establish the original byte hashes or GET ETags. Eighteen
historical promotion objects need exact observed hashes before a separate
release policy can be reviewed. This workflow obtains those observations using
the existing release credential without granting it new permissions.

## Gates

1. PR and dispatch contracts run without production credentials.
2. Unprivileged readiness requires an explicitly authorized read on exact current
   main, completed Node 18/20/22 push checks for that SHA, and this dispatch
   attempt's completed contracts. Missing, changed, canceled or ambiguous
   evidence stops the run.
3. The existing protection validator checks environment configuration. This is
   not an approval receipt. The `collect-evidence` job separately requires actual
   Per approval in `mmd-production-mutation` before the existing Cloudflare
   credential is available. No reviewer, permission, secret or environment
   setting changes.
4. The job shares `deploy-events-worker-production` concurrency with deployments,
   with `cancel-in-progress: false`. It verifies exact clean checkout, baseline
   active/latest version, module hash, bucket binding and existing enabled flags,
   including Promotion OFF.
5. The collector reads only the four existing plans/deliveries/history/monthly
   prefixes. Its allowlisted transport accepts GET only. It reads every object
   twice, bounds and validates pagination and JSON, and compares raw hashes,
   inventory size and GET ETags across observations. Missing, denied, malformed,
   truncated or changing data stops collection without retry or cleanup.
6. After collection, the entry repeats baseline/configuration and exact current
   main/CI/current-dispatch checks before saving the artifact. Failures produce
   only a generic diagnostic, not provider bodies or private state.

The artifact contains sanitized keys, byte hashes, sizes, hashed ETags, minimal
validated identity/status summaries and source/runtime provenance. It excludes
captions, chat IDs, message receipts, credentials and raw object bodies. Observed
historical promotion hashes are data for later review, not approved exceptions.
No observation is labeled producer clearance or permission to release.

## Execution after review and merge

Dispatch `read-events-porto-ems16-release-evidence.yml` on main with
`read_approved=true`, the actual owner authorization reference, and the exact
current main commit as `approved_sha`. These are observation inputs only. When
the run reaches `collect-evidence`, Per must approve that specific job in the
protected environment. No protected approval run exists until dispatch.

Successful output is the native Actions artifact
`events-porto-ems16-readonly-evidence-<run>-<attempt>`. A denied R2 read means
existing credentials are insufficient; this job does not change permissions or
silently switch credentials. The observation step itself has no path to a
Cloudflare write, deploy, version upload, or handler test.

Full release still needs a reviewed finite policy, complete producer provenance,
historical promotion exceptions/disable boundary, fresh exact-main checks, a
separate protected release approval, and repeated execution-time snapshots. Any
already accepted external request remains outside a promise about visibility.

## Local source contracts

```sh
node --test scripts/events-porto-ems16-evidence-read.test.mjs \
  scripts/events-porto-ems16-readonly-evidence.test.mjs \
  scripts/events-porto-ems16-release-state.test.mjs \
  scripts/admin-production-approval.test.mjs \
  scripts/admin-production-validation.test.mjs
```

Tests use synthetic memory-only providers, not production credentials, live
handlers or network sends. Remote exact-head CI and actual credential access
remain separate evidence.

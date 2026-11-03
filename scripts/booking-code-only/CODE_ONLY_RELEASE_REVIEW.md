# Public booking code-only release review

This new path does not import or invoke the older booking migration runner. It supports only staged version uploads with strict binding inheritance, then 100% deployments. Member is fully read back and verified before SIGIL receives any write. No full-script PUT, v6 migration, exported lifecycle declaration, credential creation, route modification or rollback exists in the adapter.

## Files

- booking-code-only-release.mjs: pinned two-worker state machine, hashes, metadata validation, journal-before-write, post-readback checks.
- booking-code-only-owner-approval.mjs: independent read-only GitHub owner/environment gate, derived from existing reviewed gate with distinct no-migration scope and workflow.
- booking-code-only-adapter.mjs: explicit production transport and `--execute` CLI, no writes on import.
- booking-code-only-release.test.mjs and booking-code-only-adapter.test.mjs: offline mocks, exact baseline/candidate artifact hashes, approval rejection, drift and partial failures.

## Official API evidence checked 2026-11-03

- https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/ : version uploads are independent of traffic; only DO lifecycle changes require atomic deployment.
- https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/ : existing DO classes can use versions; class creation/deletion/rename/transfer cannot.
- https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/ : updating existing class code needs no migration.
- https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/ : logpush, tail consumers and tags are script settings, not version upload attributes.
- Cloudflare connected OpenAPI spec: POST /accounts/{account_id}/workers/scripts/{script_name}/versions explicitly uploads without deployment. bindings_inherit=strict rejects unresolved inherit bindings against the latest uploaded version, which may differ from deployed. Hence latest-version drift is checked immediately before upload and promotion.
- Cloudflare connected OpenAPI spec: POST /accounts/{account_id}/workers/scripts/{script_name}/deployments accepts strategy percentage and version_id/percentage array. This runner sends one version at 100%; no force bypass.

## Required caller integration

Workflow path must be `.github/workflows/deploy-public-booking-code-only.yml`, workflow_dispatch on main, owner mmdprive numeric ID 216427112, repository numeric ID 1121397236, first run attempt only, protected environment member-pages-code-only-owner with sole owner reviewer, no administrator bypass, main-only custom branch policy and a real approved history receipt. Exact release HEAD and source HEAD are separate. Source must be 82561437067dc06b751956376ba265fa7322cd34 / tree 83a93fc60ef2494ada52c0b40509d28edfdfe776. The local equivalent 77fc3c89 is not an approval alias.

Set SOURCE_ROOT and RELEASE_ROOT to clean exact checkouts. Build artifacts outside both, with regenerated member manifest recording actual approved source HEAD. Set ARTIFACT_ROOT and JOURNAL_PATH outside clean checkouts. The journal uses append and fsync and excludes tokens, binding values, and raw provider errors. Upload journal as a workflow artifact even on failure. On any uncertain write outcome, stop; inspect provider state read-only before a separately reviewed recovery. Never auto-retry or auto-rollback.

Required env: RELEASE_MODE and APPROVED_RELEASE_SCOPE public-booking-code-only-no-migration; PRODUCTION_APPROVED true; APPROVED_MIGRATION_POLICY none-retain-existing-v5; APPROVED_SOURCE_MAP_POLICY local-evidence-only-not-uploaded; APPROVED_SHA exact release HEAD; APPROVED_SOURCE_SHA and APPROVED_SOURCE_TREE above; APPROVAL_REF real owner message reference; normal GitHub run identity; GH_TOKEN; CLOUDFLARE_API_TOKEN.

Before publication, independent review and workflow CI remain required. These files were tested offline only. The adapter has not called production. Present unsupported runtime limits, placement modes, new resource/settings fields fail closed rather than silently resetting them. Provider-version annotations are excluded from semantic settings comparison; settings, bindings, class names, namespace IDs, handlers, runtime, routes, schedules and subdomain are compared. Secret values are inherited by name and never copied or logged. Provider fields can race between last read and write because this API offers no compare-and-swap in its documented schema; post-write verification detects drift and halts.

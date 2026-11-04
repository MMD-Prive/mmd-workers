# PR3027 identity hardening: scoped release

This is a separate release path. Historical scripts/booking-code-only and its workflow are unchanged. AUTH is already deployed and is not in this adapter's write allowlist. No Webflow operations exist here.

## Sealed inputs

- Application source: merged 7fd8dae0d97a42d0594650a8b663df99fe584467, tree 0806c133499c3600d554bd175e5c4533163acd08.
- Tooling HEAD: separately approved current workflow main HEAD, verified against clean release checkout and current main before writes.
- release-contract.json: reviewed active/deployment IDs, original module hashes, semantic configuration fingerprints and exact candidate hashes. Null fields fail closed. Never regenerate seals automatically during deployment.
- Owner authorization reference is checked separately from live GitHub protected-environment approval. No PR approval operation is performed.

## Preparation and publication

Read-only baseline capture checks exact deployed/latest version, deployment at 100%, original bytes and MIME, complete resources/settings/script-settings, routes in the existing mmdbkk zone, account custom-domain mappings for the target Worker, schedules and workers.dev state. Snapshots re-read deployment/latest IDs to reject changes during capture.

Build minimal deltas from exact baseline bytes using source-only checkout; no repository entrypoint rebuild replaces production. Candidate tests execute built bytes. Exact candidate hashes and source manifest provenance are checked again at publish time.

Publish MEMBER first: strict-inherit version upload, exact bytes/configuration readback, 100% deployment and serving verification. MEMBER is checked again before SIGIL upload and immediately before SIGIL promotion. All worker writes are restricted to version POST and deployment POST. No PUT, migrations, exports lifecycle payload, configuration changes, force option, rollback or retry is supported.

Journal append+fsync precedes every attempted mutation. Uncertain outcomes stop with no automatic recovery. The workflow always retains the mandatory safe journal. A separate artifact preserves only candidate code files and selected proof/manifests; it never uploads live settings/bindings dumps. Do not resume a partial release blindly: read provider state and perform a separately reviewed recovery plan.

## Semantic preservation

The strict schema includes full recognized resources and optional configuration. It preserves binding identity, service targets, DO class/namespace identity, runtime, handlers, module MIME, annotations, cache options, package dependencies and script settings. Only provider-generated ID/number/timestamp/author/source, script etag/last_deployed_from and workers/triggered_by are excluded from semantic equality; these naturally change when code is uploaded. Missing compatibility_flags normalizes to []. Secret bindings must expose name/type only and are inherited by name; unexpected secret metadata blocks release rather than being silently dropped. Unknown properties, unsupported nonempty runtime limits or placement mode block publication. Secret values are never needed.

## Official API evidence checked 2026-11-03

- https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/
- https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/
- https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/
- Current connected Cloudflare OpenAPI: POST versions stages without deploying; bindings_inherit=strict resolves against latest uploaded version and fails missing bindings. POST deployments chooses version percentages. Script settings are fetched separately and never sent as unsupported version metadata. Existing classes require no lifecycle migration.

The API has no documented compare-and-swap for these writes. Fresh preflight plus post-write verification narrows and detects races but cannot make a two-Worker release atomic. Shared deployment concurrency and protected owner approval remain required.

# Application Delete/Restore scoped release

This release must not deploy current main as a whole. Production is the Console-only source overlay at version `51ae638f-55b5-40f2-a0fb-2a0f7e40c8f5`, deployment `8eb1667c-28d0-4410-896d-9357f979b8a4`, source annotation `4339243b286e2c4844abd49172a828f25c4f5c1e`. Read on 2026-11-08 through Cloudflare GET APIs. Its source provenance is baseline `12591f4a85677535b08ed547adfc0ce7bc993327` plus Console `bf78217a115995fa82bba0b57f01f326c25ac82b`.

## Exact scope

Feature source is commit `b830606cdc626db876751b62f938e7d84bec5c4b`. Both changed module sources at its parent match production baseline source `12591f4a85677535b08ed547adfc0ce7bc993327` byte-for-byte. The release does not rebuild the full worker or replace the activation module.

The native review source is enclosed in a lexical scope and injected in place of only the old review module section. It receives the unchanged live activation helper functions. It exposes only the two existing route entrypoints and the new mutation helper. The coordinator receives only the reviewed mutation queue block. Its dynamic import is replaced with the same already-initialized helper; queue and error behavior remain unchanged.

An Acorn AST scan proves all 53 old section bindings have no outside identifier usage except the two retained route entrypoints. This includes expressions inside template literals. Both private field maps and `isPerOwner` stay private. A reverse patch must reconstruct every original byte. The whole original artifact and section are SHA-256 pinned. Unknown or drifted live bytes stop release, even if a version annotation matches.

- Live artifact: `ae3509889e56ea7756be7a913f706461c9cfa5a37b223c45c40b7345904457e5`
- Candidate artifact: `11b2a49481686cc30cba64b416fe83678fc0f2bf4dec27aa8694b588e77259cf`
- Unrelated runtime: `0d9fc4e78f2258c6afcd53f4ad3f62d0a2e304eecf82127ba31c84831ee94ff7`

The existing MODEL_ACTIVATION_COORDINATOR binding, ModelActivationCoordinator class and namespace were verified read-only and are pinned as pre-upload prerequisites. No configuration, routes, schedules, bindings, DO migration or business-record writes are included. The existing code-only release transport inherits and verifies these properties before upload, before promotion and after promotion. No retry or automatic rollback occurs after uncertain writes.

## Verification

158 offline overlay/transport/approval tests passed. The actual full candidate artifact passed Node syntax checking and 38 existing application deletion, review, browser-script and onboarding tests. Those tests use the actual overlaid coordinator and route functions, with fixture-only Airtable/storage. No production deletion or record mutation was tested. The full repository aggregate suite was not run because its external access scope was denied earlier.

## Release gate

Use `deploy-admin-application-delete-code-only.yml`, after independent review, merge preserving the feature commit ancestry, and successful checks. Dispatch only from main with its exact approved SHA, an owner authorization reference, and the pinned version/deployment. The protected `mmd-production-mutation` environment remains mandatory. The workflow and scripts do not grant approval, change protection or self-approve. A required reviewer must authorize the pending deployment through the existing gate.

The release runner installs the locked dependencies, reads current code, checks exact baseline and source hashes, reruns the actual candidate fixture tests with subprocess credentials removed, and then invokes the existing strict-inherit code-only transport. Any baseline drift requires new investigation and review, not replacement of the constants to force release.

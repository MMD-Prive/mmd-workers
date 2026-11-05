# Model Session Flow: Local Release Packet

Status: PREPARED_LOCAL_HOLD. No push, upload, deploy, promotion, publication,
secret change, route change, or data migration is authorized by this packet.

## Scope and Config

1. Payments: `payments-worker/wrangler.merged.toml` ->
   `index.session-paid-projection-wrapper.js`. Never use the legacy
   `payments-worker/wrangler.toml` for this flow.
2. Events: `events-worker/wrangler.toml` -> `src/model-eta-wrapper.js`.
   Add only `SESSION_COMPLETION_STATE` -> existing private bucket
   `mmd-private-model-media`. Do not create a public bucket or copy bank data.
3. Admin: `admin-worker/wrangler.toml` -> `src/admin-login-hero-worker.js`.
4. Member Pages: `member-pages-worker/wrangler.toml` -> `src/runtime-index.js`.
5. Webflow install artifacts last, after all backend gates pass. Publication
   remains a separate approval; never publish the whole site as a fallback.

## Release Order and Gates

Prepare each component independently in a clean, owner-approved checkout.
Review the complete shared dependency diff, not only the entrypoint file.
The packet's patches include accumulated local edits and untracked additions;
they are review inputs, not an approved clean release commit or upload bundle.
Shared/cross-Worker source patches overlap intentionally. Review/merge their
union once into one approved SHA; do not apply each packet sequentially to the
same checkout or mix source revisions across the four Worker builds.

Release Payments first: final intent remains pending until actual reviewed proof
passes. Confirm pending/invalid evidence blocks work, correct evidence updates
the canonical lifecycle, and the live payment preflight remains enforced.

Release Events second: preserve every existing binding, setting and 15-minute
cron, then add the one private completion bucket binding. Confirm shared-bucket
access and conditional completion/outbox writes before enabling new clients.
This Worker also runs reconfirm and compcard/promotion jobs: preserve their
current flags, schedules and existing storage. No campaign action is approved.

Release Admin third: preserve current bindings and 5-minute cron. Verify owner
auth/same-origin checks, ETA, payout source uniqueness/revision/bank guards,
Telegram delivery-unknown handling and manual-review recovery before proceeding.

Release Member Pages fourth: signed customer links must access only the bound
Session, reject wrong/expired credentials and preserve existing member APIs.

Install customer confirmation companion before tracker, replace Aftercare and
MY MODEL/Console embeds only after inspecting current saved embeds. Do not
append duplicate runtimes or replace unrelated footer scripts. The Console
artifacts are components, not an approved replacement of the entire footer.

At each stage stop on baseline drift, binding/settings differences, failed
authenticated checks or uncertain upload/promotion outcomes. Do not automate
the sequence or deploy all workers. Do not send real messages or transfer money
without separate authorization. No route, DNS, schema or secret mutation belongs
to this release, except the separately approved Events binding addition.

## Production Drift Hold

The fresh GET-only baseline observed Admin version
`47111ca8-7653-4db6-84e5-128767aa1b2f`, replacing the previous audit's
`6274c7de-9c09-4e05-a074-057cfbcf61a7`. No deployment was performed by this task.
The new baseline must be explained and compared before preparing an upload.
The packet records it for review, not as approval to overwrite the new version.

## Preservation and Rollback

`binding-plan.json` is a declarative inheritance plan, NOT an executable upload
request and NOT a sparse Wrangler config. `config-reference.json` pins the source
config and its hash. Preserve all active bindings by name (including secrets),
runtime settings, Durable Object migrations, routes and schedules. Never rotate
or export secret values. Re-read active traffic and settings before release.

Rollback only versions introduced by the approved release, in reverse order:
restore UI, Member Pages, Admin, Events, Payments as appropriate. Re-promote the
captured pre-release version; do not rebuild old code from a dirty checkout.
Do not delete the new bucket binding, receipts, completion evidence or bank
records during rollback. Escalate ambiguous delivery; never bulk-retry it.

## Validation and Approval

Previously validated: 76 scoped runtime tests and 6 local cross-handler tests.
These are local/synthetic evidence, not production acceptance. Re-run exact
checks on the eventual approved clean SHA and inspect compiled import closure.
No Worker bundle or dry-run is claimed by this packet. Baseline freshness,
clean source review, build/config comparison and explicit Per release approval
are still mandatory before any upload, promotion, push or publication.

Local packet validation (no network or production mutation):

```sh
node --import /private/tmp/mmd-jsdom-loader.mjs scripts/prepare-model-session-flow-release.mjs --verify release/model-session-flow-local/packet
```

Rebuilding into a new explicit output directory requires Node's
`--experimental-vm-modules`, the same local dependency loader, and Python 3.11+
via `RELEASE_PYTHON` (TOML parser). The generator refuses to overwrite a packet.

# Owner job amendments

Entry: `/internal/admin/jobs/all` → **แก้ไขงาน** → select upcoming job → select canonical model with photo → change customer PN/options/travel and model PN/options/travel → review computed totals → save with reason.
Direct entry: `/internal/admin/jobs/edit?session_id=<existing session id>`.

The Worker page/API require the existing signed owner/admin cookie on mmdbkk.com. POST additionally requires same Origin. This is an existing-job correction, not creation, payment verification, LINE identity binding or notification sending. Deposit/received records and payment references are retained. The visible balance is a quote snapshot; the Payment flow still reconciles actual verified receipts against its ledger.

## Supported scope

Direct PN/options quotes with an existing valid service-pricing snapshot, before travel/work has started. Partner settlement, discounts, combined membership amounts, ambiguous records, refund/cancel/completed jobs and inconsistent pricing snapshots stop for review instead of overwriting their contracts. This first editor changes model and monetary terms; date/place/remarks remain in their existing workflows.

Both Job and Session receive the selected Models record ID, name, price and travel fields. Service-pricing markers are refreshed while operational/model remark blocks are retained. The durable audit holds complete before-images and the reason/actor plus before/after totals. UI history lists the latest 20 editor amendments. Earlier human notes can retain historical figures; current values are the structured quote and latest amendment, not historical prose.

Customer/model acknowledgements and model reconfirm acknowledgement are cleared; any canonical pre-travel model state is returned to `offered`. LINE identities are never moved when changing the assigned model. Existing signed links resolve the current Session; model identity authorization must still match the new Canonical Model.

## Release

1. Deploy payments-worker with the shared confirmation revision change **before** enabling the editor. Unamended job hashes remain backward compatible. Owner-amended notes require the current revision; price-only changes cannot reuse a previous acknowledgement screen. Existing customer/model scripts already submit that revision.
2. Deploy admin-worker with the `job-edit-v1` SQLite DO migration and `JOB_EDIT_COORDINATOR` binding plus the four exact editor route patterns in wrangler.toml. Preserve all existing bindings/migrations. Missing coordinator fails closed on save.
3. Check owner GET, anonymous/partner denial, job picker, same-origin POST denial and read-only audit. Test a designated non-production fixture before a real owner amendment. Do not acknowledge for a model/customer during smoke tests.

## Write interruption and concurrency

One durable coordinator per Session serializes this editor's requests, persists the plan before external writes, and uses request IDs for idempotency. An identical retry can resume an interrupted Job/Session write only if the records still match the recorded before-image or intended patch. Another request cannot run while a pending journal exists. Conflicts with other writers stop for review. Airtable has no cross-table transaction/CAS: unrelated external lifecycle writers are not serialized by this coordinator. Never automatically roll back or overwrite them. A conflict may leave the Job mirror updated while Session remains unchanged; the API reports a review-required failure, never success. Keep/retry the original request to finish an uncomplicated network interruption; an owner must reconcile a conflict explicitly. Durable history is independent of the presentation proxy.

Validation: node tests for route auth/Origin, money totals/paid retention, stale revisions, old acknowledgement clearing, partial retry after eviction, idempotency/conflict and final-save DOM interaction. Build the actual admin entrypoint before release.

# MY PARTNER job sales — Staging implementation

Adds job-specific sales proposals in the existing job-detail panel. Partner selects Bridge, Co-Partner (รวมโม), or Profit Share (หารกำไร), enters model-net and sale amounts, and confirms sharing. Each successful save is pending_review. Activation into canonical job agreements and settlement remains pending implementation and review. No payout result is calculated from draft inputs.

## Contract

- GET/POST `/v1/partner/jobs/sales-proposal` uses existing Partner token verification. Request selects one canonical session, whose Partner snapshot and active Partner–Model relationship must match.
- GET returns proposal, storage revision, current job revision, and editability. POST requires both revisions, explicit consent, and a stable Idempotency-Key.
- Storage is one conditional R2 document per Partner/session under `partner-job-sales/v1/`. Exact last-request retries reuse the saved result. Competing revisions fail with 409. History records proposed terms and actor/time.
- Start/complete/cancellation and locked settlement block editing. Changed job snapshots are flagged `job_changed`. Scope is rechecked after dependency reads and saves. A job change after writing can leave a pending proposal requiring fresh review, without changing canonical finance or assigning work.
- GET `/v1/partner/admin/job-sales` uses existing owner authority. Existing credential-bound admin console bridges it through fixed route `/v1/admin/partners/job-sales`, with paginated read-only review.
- Bridge percent uses existing 5–10 validation. Profit-share percent is greater than 0 and less than 100. Rates require finite non-negative amounts with at most two decimal places. Draft proposal records the existing `payment_truth_net_basis` basis rule. The effective financial calculation requires owner-confirmed job agreement and payment truth.
- Failed form requests preserve typed data. Explicit reload refreshes revision and resets consent. Saving on one job does not edit roster defaults or another job.

## Staging preview

`MY-PARTNER-Job-Sales-Staging.html` extends the Premium Atelier review with two sample jobs. It reuses `partner-job-sales-ui.ts` against a browser-local demonstration adapter. Persistence there is localStorage, labeled as sample data. Source integration tests separately exercise the real HTTP handlers against synthetic Airtable/R2 fixtures. Preview persistence is not evidence of live API deployment.

## Validation

- Partner TypeScript check and 171 Partner tests pass.
- Owner console 9 tests pass, including fixed job-sales/cursor route forwarding.
- Staging DOM test covers saving, reopening, independent jobs and conditional percent controls.
- New rendered mobile QA at 320/390/430 remains pending because the available preview browser was blocked. Existing responsive rules retain 44px controls and one-column form layout up to 430px, but geometry is not verified by DOM tests.
- Source changes are for Draft PR review. Production, live rates, canonical agreements and payout data were not changed.

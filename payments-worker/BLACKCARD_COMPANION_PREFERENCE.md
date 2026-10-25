# Black Card Companion preference

`payments-worker` owns the signed confirmation token, confirmation session, and payment-facing APIs. The new preference handler keeps that token/session gate, resolves the Session's canonical `member_id` against `Members`, writes the account-scoped request and audit outbox to D1, and mirrors the request to `MMD — Black Card Companion Preferences` for review. The preference path does not activate entitlement, change payment state, create a booking, or grant model access.

## Closed sales policy

The current owner policy is 35,000 THB / 3 years with status `Owner Confirmed / Not Activated`. The canonical `packages` table has no active `blackcard` package. Accordingly, the Webflow flow says new applications and payment are not open, and `/v1/confirm/payment-instructions` returns `available: false` for Black Card until all the following are independently true:

1. `BLACKCARD_SALES_ENABLED` is explicitly set to `true` through an approved configuration change.
2. The exact policy record is updated to `Owner Confirmed / Activated`, 35,000 THB, and 3 years.
3. Exactly one active `blackcard` package exists at 35,000 THB / 1,095 days with the Black Card tier.

The existing data does not satisfy these checks. This PR does not enable sales, add a package, or modify the policy.

Even with the release gate enabled, instructions require a canonical Black Card Session package, a membership/Black Card signed subject, and a backend amount of exactly 35,000 THB. Booking/full/deposit tokens and browser amount/product overrides cannot supply these conditions.

## Identity, evidence, retries and readback

Confirmation links are bearer credentials scoped to their issued Session. Signature, expiry, active token record and role are checked; the Session must be unique and its stored ID/payment reference must exactly match. Its member ID must resolve to exactly one canonical Members record before any preference read or write. Caller-supplied member IDs are ignored.

Preference eligibility reads the exact Session/reference payment record and canonical verification or received-proof state. A Session `paid`/`completed` summary or payment status alone is insufficient. Proof receipt remains `evidence_submitted`, never verified or entitled.

Readback always returns the member's latest D1 preference, including through an older still-valid link. Expired retention data is not returned or re-mirrored. Delivered readback uses D1 without requiring the review mirror to be available. This PR enforces read/retry expiry; automated deletion and review-to-D1 reconciliation are separate rollout requirements.

An optional UUID `request_key` distinguishes deliberate changes from retries; legacy requests retain token-scoped idempotency. New changes send `previous_request_id` and a reason. D1 inserts use compare-and-set against the latest member request and commit the request plus its matching audit ID atomically. Mirror sync takes a bounded D1 lease and uses Airtable upsert by idempotency key, so an uncertain HTTP result can be retried without creating another record. The original correlation and source Session hash are preserved.

## Provisioning before enabling preference writes

The D1 database `mmd-blackcard-companion-preferences` already exists. Its binding is declared in `wrangler.merged.toml`, the config used by the release workflow. The migration in `migrations/0001_blackcard_companion_preference.sql` is local source only; it has not been applied remotely. Before rollout, an owner must approve the retention period, configure `BLACKCARD_PREFERENCE_RETENTION_DAYS` (integer 1–3650), apply the migration to the intended D1 environment, and verify the existing Airtable field IDs/options against the current base. Writes fail closed while D1, retention, or the mirror is unavailable.

No Worker route is added or changed in this PR. Do not deploy or publish as part of review.

## Rollback

Remove/disable the Webflow preference action and revert the Worker source through the normal reviewed release process. Keep the D1 tables and records for reconciliation and retention handling; do not drop the migration during rollback. Sales remain closed until the separate policy/package/configuration gate is satisfied.

## Targeted validation

Run `npm run test:blackcard-flow` on Node 24 plus the relevant payment-instructions and confirmation-details tests. The preference tests execute the actual migration and SQL using `node:sqlite`; the configured Worker entrypoint is exercised with fixture bindings and only the Cloudflare DurableObject base class stubbed. Run `python3 payments-worker/blackcard-config.test.py` on Python 3.11+ to parse the release/compatibility TOML and verify binding scope. The `Black Card preference contract` PR workflow runs these checks. These checks do not prove remote migration, Worker deployment, Webflow publication, or authenticated live customer E2E.

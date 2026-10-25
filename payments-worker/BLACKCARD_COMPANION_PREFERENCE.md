# Black Card Companion preference

`payments-worker` owns the signed confirmation token, confirmation session, and payment-facing APIs. The new preference handler keeps that token/session gate, resolves the Session's canonical `member_id` against `Members`, writes the account-scoped request and audit outbox to D1, and mirrors the request to `MMD — Black Card Companion Preferences` for review. The preference path does not activate entitlement, change payment state, create a booking, or grant model access.

## Closed sales policy

The current owner policy is 35,000 THB / 3 years with status `Owner Confirmed / Not Activated`. The canonical `packages` table has no active `blackcard` package. Accordingly, the Webflow flow says new applications and payment are not open, and `/v1/confirm/payment-instructions` returns `available: false` for Black Card until all the following are independently true:

1. `BLACKCARD_SALES_ENABLED` is explicitly set to `true` through an approved configuration change.
2. The exact policy record is updated to `Owner Confirmed / Activated`, 35,000 THB, and 3 years.
3. Exactly one active `blackcard` package exists at 35,000 THB / 1,095 days with the Black Card tier.

The existing data does not satisfy these checks. This PR does not enable sales, add a package, or modify the policy.

## Provisioning before enabling preference writes

The D1 database `mmd-blackcard-companion-preferences` already exists. The migration in `migrations/0001_blackcard_companion_preference.sql` is local source only; it has not been applied remotely. Before rollout, an owner must approve the retention period, configure `BLACKCARD_PREFERENCE_RETENTION_DAYS` (integer 1–3650), apply the migration to the intended D1 environment, and verify the existing Airtable field IDs/options against the current base. Writes fail closed while D1, retention, or the mirror is unavailable.

No Worker route is added or changed in this PR. Do not deploy or publish as part of review.

## Rollback

Remove/disable the Webflow preference action and revert the Worker source through the normal reviewed release process. Keep the D1 tables and records for reconciliation and retention handling; do not drop the migration during rollback. Sales remain closed until the separate policy/package/configuration gate is satisfied.

## Targeted validation

Run `npm run test:blackcard-flow` plus the relevant payment-instructions tests, and validate the SQL locally with SQLite. These checks do not prove remote migration, Worker deployment, Webflow publication, or authenticated live customer E2E.

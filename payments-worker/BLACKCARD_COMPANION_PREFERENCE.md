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

Readback always returns the member's latest D1 preference, including through an older still-valid link. The owner-approved 90-day retention window applies only to free text. Structured Companion, request ID and operational status remain readable through the same identity/payment gates after text expiry. Expired free text is never re-mirrored. Delivered readback uses D1 without requiring the review mirror to be available. The existing five-minute payments-worker cron now performs bounded review reconciliation, pending mirror retries and retention redaction.

An optional UUID `request_key` distinguishes deliberate changes from retries; legacy requests retain token-scoped idempotency. New changes send `previous_request_id` and a reason. D1 inserts use compare-and-set against the latest member request and commit the request plus its matching audit ID atomically. Mirror sync takes a bounded D1 lease and uses Airtable upsert by idempotency key, so an uncertain HTTP result can be retried without creating another record. The original correlation and source Session hash are preserved. Once a request reaches its text cutoff (including under an internal hold), its operation key is permanently retired for writes (`410 preference_request_retired`). A fresh intent requires a new UUID, the exact latest `previous_request_id`, and a new reason (`409 preference_new_request_required` otherwise). It starts its own 90-day text window, including a deliberate same-choice request. New requests inherit structured experience choices only, never a previous request’s note or reason. The latest recorded Companion snapshot remains available after text redaction.

## Lifecycle ownership and review workflow

Schema readback on 2026-10-25 confirms `MMD — Black Card Companion Preferences` (`tblmU2D3u0fjlBpeo`) is a restricted Worker-owned review mirror, with D1 canonical. Its retention field explicitly requires request free text to be deleted or redacted when due unless an approved hold applies. `admin-worker` already has the `PAYMENTS_WORKER` service binding; its existing `AUTH_SERVICE_ADMIN_TO_PAYMENTS` credential owns approved retention holds.

An authorized internal Airtable reviewer edits only operational `status`, `reviewed_by`, `review_note` and `reviewed_at`. The Worker verifies immutable request/member/payload fingerprints, requires a reviewer reference and an explicit valid timestamp, and enforces monotonic review revisions and allowed transitions. `reviewed_by` is an internal reference supplied through the restricted review source, not an authentication credential or proof of entitlement. A final `recorded`, `declined` or `cancelled` decision cannot reopen; corrections use a new preference request. Same-state annotations require a newer timestamp. Internal review notes are limited to 500 characters and never returned to customers.

Reconciliation commits the decision and a non-sensitive lifecycle audit event together in D1. Mirror acknowledgement updates only sync metadata, including the exact accepted `review_revision_hash`; it never overwrites reviewer-owned columns outside the separately required retention cleanup. A newer edit during acknowledgement is reconciled on the next pass. ACK retries do not duplicate the audit event. Customer reads use the D1 state. Operational review can continue after text expiry: the Worker validates the immutable member/request/payload hash and structured choice, commits status plus a hashed audit receipt without storing raw reviewer identity or notes, then scrubs mirror text. The accepted revision is persisted before its proposal text is cleared; a D1/CAS failure leaves the remote proposal retryable while canonical free text remains erased. A lost ACK retries from the revision receipt without reconstructing private text. Rejected proposals are scrubbed when due and cannot change canonical state.

The cron processes at most ten requests per pass, oldest-polled first, with per-request leases and checkpoints even on failure, so bad/held records cannot starve later requests. It also retries undelivered initial mirrors without requiring a customer retry. Errors are sanitized in D1 `maintenance_error` and mirror `d1_last_error`; logs contain aggregate counts only. Existing notification work and preference lifecycle work run independently in the same scheduled tick.

## Retention and approved holds

When `retention_expires_at` is due, the Worker first clears D1 `note`, `change_reason`, `review_note` and `reviewed_by`, then clears the corresponding four Airtable fields. A mirror outage cannot retain canonical free text; remote redaction resumes on a later pass. An expired mirror is never recreated. Later edits that reintroduce mirror free text are redacted again. Minimal member/request identity, payload/idempotency hashes, timestamps, preference state and non-sensitive audit receipts remain for structured readback, reconciliation and replay protection. The minimal ledger has no new TTL in this change. This is logical free-text redaction, not deletion of the replay ledger.

Approved holds live in the dedicated D1 hold table; text or statuses entered in Airtable cannot create a hold. The service-only `POST /v1/internal/blackcard/preference-retention` uses the existing admin-to-payments credential, with no new public Cloudflare route or secret. Bodies require:

- `place_hold`: `request_id`, `operation_id` (UUID v4), `actor` (internal operator reference), `reason` and an explicit future `hold_until`.
- `release_hold`: `request_id`, `operation_id`, `actor`, `reason` and the returned `hold_id`.

The authenticated admin caller owns approval of the hold; a browser confirmation token is not accepted. Actor/reason are hashed in hold and lifecycle receipts. Repeated operations are idempotent. Holds retain internal evidence until their explicit deadline; they do not bypass customer identity/payment gates, revive retired operation keys or block fresh preference requests. Structured readback and operational review remain available under the normal gates, regardless of a hold. Release or hold expiry resumes redaction automatically. A hold cannot claim to preserve data already redacted. The Worker API is the backend operation surface; this PR adds no operator UI or browser hold action.

The compatibility codec for #2740 preserves that flow's minimal legacy Session selection markers. This lifecycle owns the D1 request ledger and its matching Airtable review mirror; general Session notes keep their existing owner.

## Provisioning before enabling preference writes

The D1 database `mmd-blackcard-companion-preferences` already exists. Its binding is declared in `wrangler.merged.toml`, the config used by the release workflow. Migrations `0001_blackcard_companion_preference.sql` and `0002_blackcard_preference_lifecycle.sql` are source only and must be applied in order. Read-only Cloudflare introspection on 2026-10-25 found no `mmd_blackcard*` tables in this database, and no `BLACKCARD_DB` binding or retention variable on the deployed Worker. The existing admin service credential was present by name only; no value was read. The owner approved 90 days for free text and retention of the existing minimal ledger on 2026-10-25. Source configuration now declares `BLACKCARD_PREFERENCE_TEXT_RETENTION_DAYS = "90"`; writes reject missing or different values, and the old generic `BLACKCARD_PREFERENCE_RETENTION_DAYS` flag cannot authorize writes. Before a separately approved rollout, configure this dedicated variable and the `BLACKCARD_DB` binding, apply both migrations to the intended D1 environment, and verify the existing Airtable field IDs/options against the current base. The existing `retention_expires_at` column now means free-text cutoff only; no extra migration or production backfill is introduced. Writes fail closed while D1, retention, or the mirror is unavailable.

No Worker route is added or changed in this PR. Do not deploy or publish as part of review.

## Rollback

Remove/disable the Webflow preference action and revert the Worker source through the normal reviewed release process. Keep the D1 tables and records for reconciliation and retention handling; do not drop the migration during rollback. Sales remain closed until the separate policy/package/configuration gate is satisfied.

## Targeted validation

Run `npm run test:blackcard-flow` on Node 24 plus the relevant payment-instructions, confirmation-details and #2740 member-payment tests. The preference tests execute the actual migration and SQL using `node:sqlite`; the configured Worker entrypoint is exercised with fixture bindings and only the Cloudflare DurableObject base class stubbed. Run `python3 payments-worker/blackcard-config.test.py` on Python 3.11+ to parse the release/compatibility TOML and verify binding scope. The `Black Card preference contract` PR workflow runs these checks, including the lifecycle suite. These checks do not prove remote migration, Worker deployment, Webflow publication, or authenticated live customer E2E.

# Public Model application deletion and recovery

## Scope

The owner review page `/internal/admin/model-applications` now has **Delete · ลบใบสมัคร** on the queue and detail view. A confirmation names the applicant and application ID. Deletion moves the application into **ถังขยะ / กู้คืน**. The trash view and deleted detail offer **กู้คืนใบสมัคร**, restoring the prior intake state.

This is recoverable removal from the review queue, not erasure. No Airtable record, media object, linked Model, contact payload, review status, or publication policy is deleted. A deleted application cannot be approved, rejected, given a role policy, or onboarded until restored. Existing Model access/publication is not revoked by removing its application from this queue.

## Storage and authorization

- Existing `public_model_intake_status` text field: `owner_deleted` while in trash.
- Existing `summary_json` text field: preserves current properties and stores `owner_review_deletion` metadata, including the previous intake status and owner timestamps.
- Invalid metadata fails closed. The implementation does not create fields or change Airtable schema.
- POST `/v1/admin/model-applications/:application_id/delete` and `/restore` require the exact owner credential session, same canonical origin, and `confirm_application_id` matching the URL.
- Decision, role-policy, onboarding, deletion, and restoration share an application-keyed queue in the existing `MODEL_ACTIVATION_COORDINATOR`. Missing binding fails closed with 503; no new bindings or migrations are introduced.
- GET list filters in Airtable before applying the existing record limit. `?view=deleted` selects trash. Old application detail links remain usable for recovery.

The live Airtable schema was checked read-only on 2026-11-08: `fldHk2h9Rf6g5UlZw` is `public_model_intake_status` (`singleLineText`), and `fldSSEwULqezCAPzY` is `summary_json` (`multilineText`).

## Validation

- 114 related tests passed, including delete/restore round trips, exact application isolation, no asset/Model writes, owner and origin checks, missing binding, malformed metadata, provider failures, cancel, repeated clicks, and overlapping requests.
- `npm run check` passed using Node 22.
- The admin Worker entry bundled with esbuild and passed syntax checking. Unrelated existing duplicate-key warnings were observed.
- The local fixture preview showed the new Delete control, exact-ID confirmation, and trash entry. Full final live/browser E2E is not claimed.
- Full repository `npm test` is not a pass: unrelated dependencies initially blocked it; a later aggregate run was stopped by the execution approval layer because its external-access scope was not established. Do not treat focused tests as the full repository suite.

## Release gate

This change is local only. No push, merge, or deployment was performed. Production remains unchanged.

A release needs an explicitly approved commit and the repository's protected production workflow. `deploy-admin-worker.yml` currently requires the exact approved main SHA, an owner approval reference, and the `mmd-admin-worker-solo-mutation` protected environment. Do not bypass that gate or deploy the complete current-main Worker without reviewing unrelated release scope. Verify the existing coordinator binding, candidate/production parity, and authenticated readback before claiming that the live button works. Any production deletion test requires a separately authorized disposable application; do not use real Kim/ปัน applications as test data.

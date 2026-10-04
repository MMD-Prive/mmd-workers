# MMS admin and MY THERAPIST

`/internal/admin/mms` now includes a work-app section backed by MMS Therapists, MMS Jobs and MMS Job Offers through the authenticated admin-to-MMS service binding. The existing MMD finance/job bridge remains available as a separate legacy operation; it does not determine the Therapist's work-app job state.

## Team readiness

Active operational status, a real linked LINE identity with Active auth, and Approved work-app access are all required to open MY THERAPIST. Available is also required for the owner test-offer action. These checks do not grant or change any of those states. Owner can open the existing Therapist settings, then issue a 30-minute one-time invite when Active and unlinked. The invite is displayed only in the current page, with its token in the URL fragment; nothing is sent or persisted in browser storage automatically. Hashes and customer contacts are excluded from the new work read projection.

## Owner test offers

`POST /v1/admin/mms/test-jobs` delegates to the internal-only `/internal/mms/admin/test-jobs` through the existing authenticated admin gateway. It targets exactly one ready Therapist, stores explicit TEST ONLY copy, payout 0, and no real customer/payment data. It initializes the existing dispatch coordinator, so accept/start/complete use the normal Therapist APIs. It does not fabricate a linked LINE identity, session, payment or payout verification, and it does not create a MMD finance session.

An existing prepared MMS test job may be reused only if its internal payload has `is_test: true` and the exact target Therapist ID. New test IDs derive from Therapist ID plus request key. Sequential retries reuse existing job/offer records; duplicates fail closed on storage lookup. Existing accepted/completed coordinator state is returned without resetting the job. Expired offers are not extended. Storage and coordinator failures return an error, and the UI preserves its request key for recovery. Airtable multi-row writes are not transactional; partially prepared records can appear as Matching and require a retry. This is an owner test tool, not a bulk dispatch or payment workflow.

The Tamp prepared record `mmsjob_87b38040dc13fab9e2e84bcd` is shown as pending until real readiness permits sending. No live activation, identity linking, invitation delivery, job dispatch or payment change is performed by this code update itself.

## Rollout

Deploy mms-worker before admin-worker. Verify the authenticated workspace read, issue a real invite for one Active unlinked Therapist, complete LINE linking, refresh readiness, then send a test offer and complete the receive/start/complete cycle on iPhone/Android. The original native MY THERAPIST rollout requirements still apply.

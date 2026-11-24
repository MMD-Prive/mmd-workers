# Private Handoff QA baseline

This directory preserves the Private Handoff modules read from three active QA Workers on 25 November 2026 in Bangkok time. Each Worker has its own directory because deployed copies differ. The manifest records the deployment version and SHA-256 of every saved module. The active deployment was read before and after each content download.

These are partial Worker snapshots. Their entry modules and unrelated modules are outside this scope. They are review inputs and do not constitute a standalone deployable Worker.

Run the following from the repository root.

```sh
node qa-private-handoff/verify.mjs
node --test qa-private-handoff/worker.test.mjs
```

The tests import the exact saved Booking QA core. The existing tests were updated to account for the deployed customer's additional pending-request field. A further test seeds an in-memory copy of the existing confirmed Uri reference and checks owner, other-customer, and no-entitlement reads, plus two repeated accept calls. No live data is written by these tests.

## QA evidence retained from the preceding run

Uri booking reference ends in 4da0e53a. Two POST responses returned HTTP 200, the same job ID and confirmed. R2 contained one job and one confirmation object. The model QA was restored to the Mek version.

## Other-customer QA preparation

The current customer adapter derives its identity from QA_LINE_SUBJECT and a single fixture fallback. A second tab with the same identity cannot establish customer separation. Authenticated QA validation needs a distinct verified LINE subject bound to a distinct QA customer ID and an existing supported session path. That preparation requires review of the gateway subject restriction and session linkage before any deployment.

Use the existing Uri request for both views. On the owner's session, the menu and booking_ref read should expose one confirmed Uri job. On an authorized other-customer session, the menu and booking_ref read should return no Uri jobs, with HTTP 200 and an empty jobs array. A session without Private entitlement should return 403. Keep tests read-only. Do not accept jobs or create bookings in this access check.

The second-customer authenticated QA result remains NOT_PROVEN. Kendo is retained as case provenance; delivery to Kendo has no verified requirement or receipt in this baseline.

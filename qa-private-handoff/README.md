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

## Second-customer acceptance checklist

Before a QA run, record the active Booking version and verify the owner and second customer resolve from separately verified LINE identities into distinct customer IDs. The deployed gateway currently restricts LINE verification to QA_LINE_SUBJECT. The adapter also reads that fixed subject and falls back to PRIVATE_QA_VERIFIED_FIXTURE_CLIENT. Editing the subject map alone cannot provide a second identity. Prepare and review gateway and adapter support together before requesting a QA deployment. Approval for that change is still required.

Check both session roles through the existing jobs menu and then through the same Uri booking_ref. Record host, path, HTTP status and the number of Uri jobs. Also inspect pending requests for cross-customer disclosure. Never supply a customer ID through page input to establish identity. Keep authentication material out of results.

| Actor | Menu | Existing Uri reference |
|---|---|---|
| Owner with Private entitlement | HTTP 200, one confirmed Uri job | HTTP 200, one confirmed Uri job |
| Second customer with Private entitlement | HTTP 200, zero Uri jobs or pending Uri requests | HTTP 200, zero jobs |
| Customer without Private entitlement | HTTP 403 | HTTP 403 |

Compare job and confirmation object counts before and after these GET-only reads. Any cross-customer result fails acceptance. Missing verified sessions keep this check NOT_PROVEN. The added workflow verifies source hashes, module syntax and the focused tests. The Uri fixture includes an owner's pending request to check that its fields also remain scoped to that owner.


## Candidate for distinct verified customers

The deployed snapshots remain the baseline. Two additional baseline modules, gateway.mjs and identity-verification.mjs, were retrieved from the same Booking QA version and added to the hash manifest. The candidate adapter and customer-identity module live under candidate/private-handoff. candidate/gateway-patch.mjs applies three exact replacements to the captured gateway and refuses an unexpected source.

For a future reviewed QA build, apply patchGateway to gateway.mjs and overlay the two candidate Private Handoff modules onto the existing Booking QA module set. Keep the existing surface and core Worker. This repository's partial snapshots still require the rest of that Worker for deployment.

The gateway passes the LINE-verified subject into the private session linkage. The adapter reads that linkage and validates its digest, customer ID and expiry against the active approved mapping before dispatching to the unchanged job reader. The primary QA subject retains its existing fixture customer ID when no explicit mapping is supplied. A second subject is accepted only when QA and Private Handoff are enabled, the mapping is valid, and the resulting customer ID differs from the primary. More than two effective customer identities, invalid subject or ID formats, and duplicate customer IDs are rejected.

Configure PRIVATE_QA_CLIENT_BY_SUBJECT only through the existing approved server-side configuration channel after both test identities are verified. Preserve the owner's existing client ID for the Uri reference and choose a separate QA-only client ID for the second account. This change has no actual second-subject configuration or credentials. Explicit owner approval is still required for a QA configuration change and deployment.

Run node --test qa-private-handoff/*.test.mjs. The customer-session tests assemble a temporary copy of the captured gateway and candidate adapter. LINE verification, Auth's fixture resolver, R2 and page rendering are mocked. Tests exercise /qa/session, session cookies and the served Private Handoff reader for both identities, including denied identities, spoofed body fields, revoked links and expired sessions. These local results do not establish authenticated LINE QA acceptance.

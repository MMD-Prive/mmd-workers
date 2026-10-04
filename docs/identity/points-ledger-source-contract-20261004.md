# Base points writer source contract

Read-only production schema inspection found `MMD — Points Ledger.source` is a single select with existing choices `web`, `system`, `admin`, `line`, `line_ofc_history`. The Phase 1 writer sent `payments-worker`, without `typecast`. That mismatch is a potential Airtable write rejection; it was not probed through a real award or schema mutation.

This code-only repair sends the existing `system` choice for automated base-points entries. The existing note retains `Writer: payments-worker` for worker provenance. It adds no select choices, fields or typecast; does not edit old records; does not retry payments or grant points during development. Identity guards from merged #2223 remain unchanged, as do points calculation, remainder, payment-ref idempotency, eligible stages and lot expiry.

A fixture emulates the observed production source choices, rejecting a writer's POST if its source is unsupported. It exercises the actual award/coordinator/ledger path without credentials or real data and verifies one source-compatible ledger write and unchanged accounting. Root payments tests and the dedicated Phase 1 CI run this test.

The two existing Members missing `member_id` can be aligned separately to their already-existing linked Entitlement IDs, subject to exact data approval. This PR makes no such update. Unknown payment identity coverage still needs review before asserting complete production award acceptance. Draft only; release requires separate approval.

# Kenji Phase 4F — Identity Evidence Recovery Queue

Phase 4F turns the Phase 4E readiness projection into a bounded owner recovery queue. The queue explains which identity evidence needs attention and hands the selected canonical Client to Customer 360. It never verifies a customer, merges identities, writes evidence, changes `Clients.Verification Status`, grants rights, or sends customer content.

## Production baseline

The Phase 4E authenticated observation on 23 September 2026 inspected 24 recent canonical Clients:

- 23 were `insufficient_evidence`;
- 1 was `review_required`;
- all 24 required reviewed LINE OFC evidence; and
- all 24 required a verified LIFF session linked to the same canonical Client.

No conflict, endpoint degradation, or readiness contract violation was observed. These aggregate counts define the initial Phase 4F recovery lanes; names, record IDs, LINE tails, credentials, session values, and customer content remain outside workflow output.

## Recovery contract

Client Intelligence exposes `identity.recovery` under schema `mmd.kenji_identity_evidence_recovery.v1`.

| Recovery status | Priority | Queue behavior | Owner handoff |
| --- | --- | --- | --- |
| `conflict_locked` | `p0_conflict` | Stop and keep Kenji locked | Resolve conflicting evidence in Customer 360 |
| `unavailable_locked` | `p0_unavailable` | Stop and keep Kenji locked | Restore the evidence read path |
| `evidence_review` | `p1_evidence_review` | Put reviewed-but-incomplete evidence first | Inspect LINE OFC / LIFF evidence |
| `evidence_required` | `p2_evidence_collection` | Show missing evidence lanes | Collect and review evidence through existing owner processes |
| `owner_review_ready` | `p3_owner_decision` | Evidence is aligned; no automatic decision | Per reviews authoritative `Verification Status` |
| `complete` | `complete` | Remove from the default recovery queue | No recovery action |

The projection contains allowlisted recovery actions only:

- `restore_canonical_line_identity`;
- `review_line_ofc_evidence`;
- `review_liff_identity_evidence`;
- `owner_review_verification_status`;
- `resolve_identity_conflict`; and
- `retry_identity_evidence_read`.

Every projection declares `automatic_recovery_allowed`, `automatic_verification_allowed`, `verification_status_mutated`, `identity_mutated`, `customer_send_allowed`, access grants, membership grants, and points grants as false.

## Owner queue

Member Intelligence scans at most 24 canonical Clients from the authenticated recent-client projection, with three bounded concurrent reads. Results are ordered fail-closed:

1. conflict or unavailable evidence;
2. evidence requiring owner review;
3. missing evidence;
4. evidence ready for Per's authoritative decision; and
5. complete identity evidence.

Filters separate **all pending**, **evidence required**, **evidence review**, **ready for Per**, and **blocked/system**. Each row shows only the next recovery steps and opens the existing read-only Customer 360 evidence view scoped to that Client. There is no recovery mutation control in the queue.

## Acceptance

1. Open `/internal/admin/member-intelligence` through the owner session.
2. Confirm the queue is bounded to 24 and shows aggregate LINE OFC / LIFF action counts.
3. Select a queue row and confirm its recovery status and next steps match the Phase 4E readiness evidence.
4. Open Customer 360 from the selected row and confirm the same canonical Client is revealed read-only.
5. Manually dispatch **Kenji Verified Identity Readiness** on `main` after deployment. Its aggregate result now validates both readiness and recovery contracts.
6. Stop on conflict, unavailable evidence, endpoint degradation, or contract violation. Never infer identity, bulk-verify, merge records, or promote membership/access from this queue.

# Kenji Phase 4H — Owner Evidence Review Adoption & Weekly Observation

Phase 4H turns the Phase 4G protocol into an owner routine. It adds a weekly, aggregate-only observation on **Monday 09:15 Asia/Bangkok** and emits one `owner_review_adoption` summary under `mmd.kenji_identity_evidence_owner_review_adoption.v1`.

The observation has no individual customer output. It never includes names, client IDs, LINE tails, credentials, session values, evidence text, or private notes.

## What Per sees

The GitHub Actions summary reports only:

| Aggregate | Meaning | Owner action |
| --- | --- | --- |
| `owner_review_due` | Evidence is aligned but `Clients.Verification Status` still needs Per's decision | Open Member Intelligence, select the scoped item, re-read Customer 360, then use the existing authoritative verification process |
| `evidence_work_pending` | LINE OFC and/or LIFF evidence needs its real source-owner flow | Open the bounded recovery queue and follow the protocol steps; refresh after source work is complete |
| `no_owner_action` | All sampled identities are complete | No action |
| `blocked_conflict` | Source evidence conflicts | Stop. Resolve the conflicting source evidence before any review decision |
| `observation_degraded` | A protected read or contract is unavailable/invalid | Stop. Restore the safe read path or investigate the contract |
| `no_current_candidates` | No eligible canonical Client was returned in the bounded scan | No action |

The report is a pointer to the existing owner surfaces, never a permission to bulk-verify or infer identity.

## Weekly operating loop

1. Open **Actions → Kenji Verified Identity Readiness** and read that week's aggregate summary.
2. When `owner_review_due` or `evidence_work_pending` is non-zero, open `/internal/admin/member-intelligence` through the owner session.
3. Select one bounded recovery item, read its Owner Protocol, then open the same scoped Client in Customer 360.
4. Perform only the source-owner work specified by the protocol, refresh the projection, and re-read it.
5. Only when the protocol says `owner_review_required`, decide `Clients.Verification Status` through its existing authority.
6. Stop immediately for `blocked_conflict`, `observation_degraded`, or `contract_violation`.

## Guardrails

The scheduled workflow authenticates only to read bounded projections (maximum 24 canonical Clients). It does not write evidence, set verification, merge identities, grant rights, change membership or points, send customers a message, or create an automatic recovery task. Expected evidence-pending states remain healthy observations; conflict and degraded states fail closed.

Manual dispatch remains available from `main` with a scan limit of 8, 16, or 24 for a post-deploy or owner-requested check.

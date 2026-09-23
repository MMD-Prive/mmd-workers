# Kenji Phase 4K — Source Evidence Capture Owner Workbench

## Purpose

Phase 4K turns the Phase 4J backlog lane into a bounded, one-client owner workbench inside Member Intelligence. It gives the owner the current source-evidence protocol for one canonical Client, directs that owner to the existing Customer 360 evidence surface, and forces a fresh re-read before any owner decision.

The workbench is an observation and handoff surface, not an evidence-entry, verification, or identity-resolution system.

## Contract

The browser derives `mmd.kenji_source_evidence_owner_workbench.v1` only after all of these existing same-origin projections pass their contracts:

- `mmd.kenji_verified_identity_readiness.v1`
- `mmd.kenji_identity_evidence_recovery.v1`
- `mmd.kenji_identity_evidence_owner_review_protocol.v1`

The workbench accepts only the protocol's allowlisted steps:

1. `capture_canonical_line_identity`
2. `review_line_ofc_evidence`
3. `capture_verified_liff_session`
4. `reread_identity_evidence`
5. `owner_review_verification_status`
6. `resolve_identity_conflict`
7. `restore_identity_evidence_read`

Any missing, contradictory, stale, or unavailable contract locks the workbench. A locked workbench has no client-scoped Customer 360 handoff and no re-read control.

## Owner flow

1. In the bounded recovery queue, select the highest-priority canonical Client. Evidence review is presented before source capture when the protocol reports `evidence_review_required`.
2. Read the rendered sequence for that Client only. The workbench never aggregates customer evidence into the queue.
3. Open the existing client-scoped Customer 360 surface to perform the human source-evidence review or source-system capture allowed by that surface.
4. Return to Member Intelligence and use **RE-READ LATEST EVIDENCE**. This deletes only the browser's cached GET projection and reloads the same Client Intelligence view.
5. When the protocol reaches `owner_review_required`, the owner decides `Clients.Verification Status` in its authoritative system. Kenji neither makes nor records that decision.

## Read-only guardrails

Phase 4K adds no endpoint, table, queue mutation, or evidence-write path. It explicitly permits none of the following:

- automatic evidence capture or evidence writeback;
- automatic verification or Verification Status mutation;
- identity merge or identity mutation;
- entitlement, membership, or points changes;
- customer messaging; or
- bulk owner actions.

Customer 360 remains the source handoff. `Clients.Verification Status` remains owner authority. My MMD Resolver remains entitlement authority.

## Operational state mapping

| Protocol state | Workbench state | Owner action |
| --- | --- | --- |
| `evidence_review_required` | `EVIDENCE REVIEW FIRST` | Review existing LINE OFC / LIFF evidence, then re-read. |
| `evidence_capture_required` | `SOURCE CAPTURE REQUIRED` | Complete permitted source-system evidence work, then re-read. |
| `owner_review_required` | `OWNER REVIEW READY` | Owner reviews and decides in the authoritative system. |
| `complete` | `EVIDENCE COMPLETE` | No workbench action is performed. |
| `conflict_locked` | `CONFLICT · LOCKED` | Resolve at the source of truth before proceeding. |
| `unavailable_locked` | `UNAVAILABLE · LOCKED` | Restore safe source reads before proceeding. |

## Verification

Run the targeted browser contract test and the existing readiness suite:

```bash
node --check immigrate-worker/public/a/member-intelligence.js
node --test immigrate-worker/test/member-intelligence-runtime.test.mjs
node --test scripts/kenji-verified-identity-readiness-observation.test.mjs
```

The workflow remains read-only on pull requests. Production readiness observation is limited to `main` through the existing manual or scheduled workflow path.

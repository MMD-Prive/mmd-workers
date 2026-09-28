# Kenji Phase 4J — Evidence Capture Backlog Triage

Phase 4J translates the healthy aggregate evidence-pending observation into a bounded owner work order. It emits `evidence_backlog_triage` under `mmd.kenji_identity_evidence_backlog_triage.v1` alongside the existing readiness, recovery, protocol, and weekly-adoption summaries.

The triage is aggregate-only. It never emits a name, Client record ID, LINE tail, credential, LIFF session, evidence text, or private note. It is not a task creator or write API.

## Triage order

| Priority | Triage status | Meaning | Owner action |
| --- | --- | --- | --- |
| `p0_stop` | `blocked_conflict` | Source identity evidence conflicts | Stop. Resolve the conflicting source evidence through the existing owner process. |
| `p0_stop` | `observation_degraded` | Safe read, endpoint, or contract is unavailable | Stop. Restore the read path or investigate the contract. |
| `p1_evidence_review` | `evidence_review_first` | Some reviewed source evidence still needs owner review | Start with the scoped evidence-review row in Member Intelligence, then re-read. |
| `p2_evidence_capture` | `evidence_capture_backlog` | Source evidence must be created or linked through its actual flow | Complete the scoped Canonical Client, LINE OFC, and/or LIFF source work, then re-read. |
| `p3_owner_decision` | `owner_review_due` | Evidence aligns and Per's authoritative decision is due | Re-read all three sources, then use the existing `Clients.Verification Status` process. |
| `complete` | `no_backlog` | No pending work in the bounded sample | No action. |

The highest available priority is only a starting lane. Each selected Client remains individually scoped and must be re-read before moving to the next one.

## Aggregate fields

`queue` contains case counts, not a list of people:

- `evidence_review_required` — cases needing reviewed source evidence first;
- `evidence_capture_required` — cases that need a real source capture/link flow;
- `owner_review_due` — aligned cases awaiting Per's authoritative decision;
- `conflict_locked` and `unavailable_locked` — stop conditions; and
- `active_work_items` — the sum of non-locked review, capture, and owner-decision cases.

`source_steps` shows the workload by permitted step:

- Canonical Client identity capture;
- LINE OFC review;
- verified LIFF-session capture;
- fresh re-read after source work; and
- the existing authoritative owner-verification decision.

Step counts can overlap: one scoped Client may need both LINE OFC and LIFF work, followed by a re-read. They must never be interpreted as a bulk action or an identity match.

## First weekly triage baseline

The first Phase 4I observation inspected 24 bounded canonical Clients and was healthy. Its aggregate backlog is:

- 1 evidence-review case;
- 23 evidence-capture cases;
- 24 LINE OFC reviews;
- 23 Canonical Client captures;
- 23 LIFF-session captures; and
- 24 fresh re-reads after the permitted source work.

Therefore the first working lane is `evidence_review_first` (`p1_evidence_review`), followed by the capture backlog. There is no automatic verification or contact action after this triage.

## Owner routine

1. Open the weekly **Kenji Verified Identity Readiness** summary and take its highest permitted triage lane.
2. Open `/internal/admin/member-intelligence` with the owner session.
3. Select one recovery item only; read its Owner Protocol and the scoped Customer 360 evidence view.
4. Perform the real source-owner work required by that one protocol, then refresh/re-read the projection.
5. Continue only when its fresh state allows the next step. Use `Clients.Verification Status` only when the protocol says `owner_review_required`.
6. Stop immediately on a conflict, unavailable read, degradation, or contract violation.

## Guardrails

Phase 4J explicitly declares: no evidence write, automatic capture, automatic verification, identity mutation, membership/access mutation, customer send, identifier emission, or bulk owner action. A human decision remains required for every scoped Client.

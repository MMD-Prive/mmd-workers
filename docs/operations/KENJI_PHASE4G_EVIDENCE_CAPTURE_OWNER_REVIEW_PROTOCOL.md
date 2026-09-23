# Kenji Phase 4G — Evidence Capture & Owner Review Protocol

Phase 4G makes the permitted identity-evidence sequence explicit and checks it against the existing Phase 4E readiness and Phase 4F recovery projections. It exposes `identity.evidence_protocol` under `mmd.kenji_identity_evidence_owner_review_protocol.v1`.

This is a read-only protocol. It does not create a LIFF session, write a LINE OFC review, edit Canonical Client identity, change `Clients.Verification Status`, merge records, send a message, or grant membership, access, or points.

## Authority and capture boundary

The protocol has three distinct responsibilities:

| Stage | Authoritative source | What Per does | What Kenji does |
| --- | --- | --- | --- |
| Canonical identity | Canonical Client | Ensure the actual Client record has the correct LINE identity through the existing owner process | Shows whether the source is ready; does not edit it |
| LINE OFC evidence | Reviewed, committed LINE OFC link | Review the actual link in the existing Customer 360 process | Requires a matched source record; does not create one |
| LIFF evidence | Verified LIFF session linked to the same Client | Wait for or inspect the authenticated session created by its real flow | Requires the linked session; does not create or link one |
| Verification decision | `Clients.Verification Status` | After a fresh re-read, make the decision through the existing authoritative owner process | Remains locked until the authoritative status is already Verified |

`identity.evidence_protocol` declares `evidence_written: false`, no automatic recovery or verification, no identity mutation, no customer send, and no grants. It is intentionally not a write API and has no submit control.

## Protocol states

| Protocol status | Required Owner sequence | Kenji continuity |
| --- | --- | --- |
| `conflict_locked` | Stop; resolve the conflicting source evidence | Locked |
| `unavailable_locked` | Stop; restore the safe evidence read path | Locked |
| `evidence_review_required` | Review actual LINE OFC / LIFF evidence, then re-read | Locked |
| `evidence_capture_required` | Capture evidence through the existing source-owner flows, then re-read | Locked |
| `owner_review_required` | Re-read the three sources, then Per reviews `Clients.Verification Status` | Locked until the authoritative status is already Verified |
| `complete` | No further evidence action | Eligible only when the Phase 4E Verified gate is also valid |

The `steps` array is allowlisted and derived from the fresh recovery state. It can only ask to capture a canonical LINE identity, review LINE OFC evidence, capture a verified LIFF session through its real flow, re-read, complete Per's authoritative review, resolve conflict, or restore the read path.

## Owner surface

Customer 360 now has a compact **Evidence Capture & Owner Review** panel for the selected Canonical Client. It explains the next permitted step but supplies no mutation action. Member Intelligence includes the same protocol state in the identity readiness card and locks its operator draft when the protocol contract is absent or malformed.

The existing Phase 4F queue remains bounded to 24 records and continues to hand the selected Client to Customer 360. Refreshing the queue clears stale detail and draft state before the fresh projection is read.

## Observation and acceptance

The **Kenji Verified Identity Readiness** manual workflow now validates all three contracts: readiness, recovery, and owner-review protocol. Its result contains aggregate protocol-state and allowlisted-step counts only. It never prints names, record IDs, LINE tails, credentials, session values, raw evidence, or customer content.

1. Open Member Intelligence with the owner session and select a recovery item.
2. Read the **Owner Protocol** field; stop if it is locked or invalid.
3. Open Customer 360 for the same scoped Client and perform any real evidence work only through the existing source-owner process.
4. Refresh/re-read the Client Intelligence projection.
5. When the protocol says `owner_review_required`, Per decides `Clients.Verification Status` through its existing authoritative path.
6. Dispatch **Kenji Verified Identity Readiness** from `main` and inspect aggregate output only.

Stop on `conflict_locked`, `unavailable_locked`, `observation_degraded`, or `contract_violation`. Do not infer identity, paste customer content as evidence, bulk-verify, merge records, or use the protocol as an access or membership decision.

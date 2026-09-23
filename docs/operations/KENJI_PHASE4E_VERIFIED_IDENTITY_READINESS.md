# Kenji Phase 4E — Verified Identity Readiness

Phase 4E adds a read-only, fail-closed readiness projection between canonical identity evidence and Kenji Continuity. It does not verify a customer, merge identities, or change membership and access truth.

## Authority boundary

`Clients.Verification Status` remains the only authoritative Verified decision. The readiness projection compares that decision with three bounded evidence sources:

- the canonical Client LINE identity;
- a reviewed, committed LINE OFC link; and
- a verified LIFF session linked to the same canonical Client.

The comparison is exposed as `identity.readiness` under schema `mmd.kenji_verified_identity_readiness.v1`. It is read-only and always declares that automatic verification, identity mutation, access grants, membership grants, and points grants are false.

## Readiness truth table

| Readiness status | Required evidence | Kenji continuity | Owner action |
| --- | --- | --- | --- |
| `verified` | Authoritative Verified plus exact three-way alignment | Ready | None |
| `ready_for_owner_verification` | Exact three-way alignment, but authoritative status is not Verified | Locked | Per reviews and decides Verification Status |
| `review_required` | Partial evidence requires human review | Locked | Review identity evidence |
| `conflict` | Evidence disagrees | Locked | Resolve the identity conflict |
| `insufficient_evidence` | Required evidence is missing | Locked | Collect verified evidence |
| `unavailable` | Evidence could not be read safely | Locked | Restore the evidence read path and retry |

Member Intelligence accepts a continuity draft only when the readiness contract is valid, the status is `verified`, and `kenji_continuity_ready` is true. Missing, malformed, conflicting, or unavailable readiness locks the draft UI. Customer 360 displays the same status and evidence summary for owner review; it provides no verification or merge mutation control.

The Phase 4D authenticated draft observer applies the same Verified-only readiness gate. It therefore cannot report a draft as acceptance-ready when the Phase 4E identity contract would keep that draft locked.

## Authenticated observation

The **Kenji Verified Identity Readiness** workflow can be manually dispatched from `main`. It creates a credential-bound owner session, proves the unauthenticated recent-client boundary remains closed, and inspects at most 24 recent canonical candidates.

Its output contains only aggregate counts, allowlisted blocker codes, static health states, and guardrail booleans. Names, customer record IDs, LINE tails, credentials, session values, and customer content stay out of logs and job summaries.

From Phase 4F onward the same observation also validates the read-only `identity.recovery` projection and reports aggregate recovery-status and allowlisted-action counts. A missing or mutation-capable recovery contract is a contract violation.

The workflow classifies results as follows:

- `owner_review_ready`: at least one exact match is ready for Per's Verification Status decision;
- `verified_identity_ready`: all sampled valid projections are already Verified and aligned;
- `identity_evidence_pending`: valid projections need more evidence or review;
- `no_current_candidates`: the bounded recent-client sample is empty;
- `identity_conflict_detected`: at least one sampled identity conflicts and the workflow fails closed;
- `observation_degraded`: an endpoint, projection, or evidence read is unavailable and the workflow fails closed; or
- `contract_violation`: a projection breaks the schema or a safety invariant and the workflow fails closed.

## Runbook

1. Open **Actions → Kenji Verified Identity Readiness**.
2. Choose **Run workflow** on `main`.
3. Keep the default scan limit of 24 unless a smaller bounded sample is preferred.
4. Read only the aggregate job summary.
5. If the result is `owner_review_ready`, open Customer 360 and inspect each candidate's actual evidence. Per then makes any Verification Status decision through the existing authoritative owner process.
6. Stop on conflict, degraded observation, or contract violation. Do not infer identity, bulk-verify, or merge records from the aggregate result.

Pull requests and ordinary pushes run only local contract tests. Production observation is available only through a manual dispatch from `main`; this Phase 4E change does not run it during deployment.

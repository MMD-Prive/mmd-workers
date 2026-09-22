# Kenji Continuity Phase 4D — Authenticated Observation

Phase 4D adds a production acceptance bridge for Kenji Continuity without replacing the owner's judgment.

## What it proves

The manually dispatched workflow establishes a credential-bound owner session and then verifies:

- the unauthenticated recent-client boundary remains closed;
- recent canonical candidates can be read through the authenticated owner session;
- Client Intelligence projections satisfy the operator-draft safety contract;
- Conversation Matrix context is live, fresh, context-only, and subordinate to live truth;
- runtime kill switches permit copy only when both controls are clear; and
- at least one current draft is ready for human acceptance, when eligible data exists.

The workflow reports `no_current_eligible_draft` as a healthy observation. The absence of a suitable current conversation is not a deployment failure. Endpoint failure or any available draft that violates the safety contract fails closed.

## Privacy and authority boundary

The runner keeps candidate IDs, customer fields, and draft text only in process memory. Its output is limited to bounded counts, allowlisted reason codes, and static status values.

It never calls the Client Intelligence audit endpoint. Therefore it cannot:

- record `accepted`, `needs_edit`, or `rejected` feedback;
- mint a feedback receipt;
- perform or audit a copy action;
- send a LINE message; or
- mutate payment, membership, booking, access, availability, or other business truth.

Human acceptance remains an explicit action by Per inside Member Intelligence.

## Runbook

1. Open **Actions → Member Intelligence Authenticated Observation**.
2. Choose **Run workflow** on `main`.
3. Keep the default bounded scan of 24 unless a smaller sample is desired.
4. Read the job summary:
   - `human_acceptance_ready` means a safely gated draft exists for Per to inspect.
   - `safe_draft_not_copy_ready` means a safe draft exists but runtime or projection state keeps copy locked.
   - `no_current_eligible_draft` means the authenticated path is healthy but no current candidate qualifies.
   - `contract_violation` or `observation_degraded` fails the workflow and requires investigation before human acceptance.
5. If ready, Per opens `/internal/admin/member-intelligence`, reviews the actual customer context, re-checks live truth, and records the honest outcome manually.

The workflow can access the production credential only when manually dispatched from `main`. Pull requests and ordinary pushes run contract tests without production credentials.

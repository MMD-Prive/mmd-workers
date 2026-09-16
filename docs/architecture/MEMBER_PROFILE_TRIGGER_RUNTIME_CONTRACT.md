# Member profile trigger runtime contract

This source-only contract keeps the four approved trigger names consistent across
runtime owners. Calls default to dry-run, accept only canonical staging and member
references, use a bounded service-binding request, and return sanitized outcomes.

The binding is intentionally not configured by this PR. No Worker can activate
materialization until a separate deployment review approves the materializer
runtime, Airtable credential boundary, binding, and production trigger.

Operational order remains Session, Points, Activity audit, then staging receipt.
The reviewed store in PR #376 owns approval, exact-member match, idempotency
cardinality, cancellation audit-only behavior, and partial-resume checks.

Readiness reporting is count-only: no names, emails, LINE IDs, raw notes, or
Airtable record IDs are part of the public aggregate contract.

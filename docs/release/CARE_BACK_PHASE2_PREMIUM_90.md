# CARE BACK Phase 2: Premium renewal +90 days

Draft only. This PR adds an offline planner and synthetic contracts. It does not read
production records, activate a route, add a privileged workflow, update any expiry,
change payment truth, publish copy or send LINE messages. Do not deploy this PR as
a fulfillment release.

## Existing evidence

The serving Payments version 13198cf8-ff02-474a-a2c5-0e487e9a77ad was verified
at 100% traffic on Nov 28. Its extracted settlement helpers return the original
two-year combined benefit and zero extra bonus days in eligible October and November
synthetic cases. Public campaign copy already advertises the separate 90-day
adjustment. No historical grant receipt was confirmed.

## Launch gates for the next patch

1. Use the same server-owned grant path after successful verified Premium
   renewal and for historical reconciliation. Require the canonical linked
   member, payment, proof and renewal/session; use independently attributable
   original verification, not a bare paid date, a customer clock, projected
   timestamp or retry time. Treat the October-November interval as Bangkok local
   dates; Dec 1 midnight is exclusive. Keep the separate ordinary renewal policy
   and its internal cutoff unchanged. Unknowns remain in review. No first-time
   signup, Standard, reversed, blocked or protected members in this scoped pass.
2. Use one grant per canonical member and campaign, not per payment. Apply
   a revision-guarded effective-expiry update with atomic grant ownership or a
   proven durable retry protocol. Prove no partial write can create a lost or
   double bonus, including a concurrent ordinary renewal. Preserve the original
   paid row and replay evidence; do not post a second paid entitlement, even
   with a different payment reference. The intended adjustment augments the
   current effective Premium expiry, not a sequential row that introduces grace.
3. Before a write, compare a read-only authoritative cohort preview with control
   counts and expiry before/after. Include already-adjusted, ambiguous, skipped
   and recoverable cases. Report counts only in engineering logs; keep member
   identifiers/dates in a restricted operator review, not public artifacts.
4. Stage end-to-end against a verified historical fixture and a newly confirmed
   fixture; check exact expiry in My Status, reruns, split writers and future
   renewals. Read actual downstream access decisions at old expiry +1 second,
   +14 days inclusive and +14 days +1 second. Control cases must preserve
   unrelated grace, blocked and protected access. Verify before production
   approval; keep historical application opt-in by separate guarded operation.

Run: node --test scripts/care-back-phase2-premium-preview.test.mjs

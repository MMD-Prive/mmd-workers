# CARE BACK +90: server-owned renewal evidence adapter

This draft connects the offline planner to the shapes used by canonical Airtable Payments, verified proofs, LIFF renewals, Members, Member Entitlements, and Admin payment-review journal. It has no network, route, Worker binding, grant writer, token handling, or production release workflow.

## Inputs and deliberately conservative coverage

Only use restricted operator-provided snapshots with complete matched rows for the intended cohort. Do not use browser/request payloads, or exports missing proof linkage, payment records, member entitlements or the admin audit trail. The JSON input contains `members`, `payments`, `proofs`, `renewals`, `entitlements` and `audits` arrays of Airtable `{id, fields}` entries, and an operator-attested `complete: true`. Do not commit any export.

A paid/verified canonical Premium membership payment, verified proof bound to the exact member and LIFF renewal, and matching durable successful Admin approval must agree. A canonical full payment timestamp is a lower bound. The production schema uses date-only Payment Date and proof paid_at: only matching dates may use Bangkok day start as a conservative lower bound, never as the actual verification time; the successful Admin approval timestamp is an upper bound for original confirmation, not itself assumed to be the original verification timestamp. The full interval must fit before December 1 midnight Bangkok. A late journal entry without earlier corroboration, missing/conflicting payment date, date-only approval timestamp, or unsupported evidence lane stays in review. The adapter favors false negatives over speculative grants.

Start at one current Premium term. If there is an advance Premium successor, require a continuous, nonoverlapping chain with exact verified renewal-to-entitlement and unique payment-reference evidence for each successor. Use the terminal earned expiry or leave the account in review, including unsupported future renewal evidence. A separately proven later ordinary renewal can extend the chain, but cannot earn or restart the campaign grant; eligibility still requires independent in-window evidence. Duplicate, interrupted, or overlapping chains and protected/blocked accounts are not adjusted. The fingerprint detects preview input changes, not an atomic storage revision. The CLI deliberately does not infer that a grant is absent, so it prints aggregate classifications with unknown grant state and no identities, customer dates or write plans.

Run:

    node --test scripts/care-back-phase2-premium-evidence.test.mjs
    node scripts/care-back-phase2-premium-evidence.mjs RESTRICTED_SNAPSHOT.json AS_OF_ISO

## Before enabling any production grant

Verify a complete cohort against the real source; validate evidence coverage and known exceptions with the owner. Wire a durable server-owned grant adapter with one authoritative claim and expiry-effect receipt per campaign and member. Prove the original payment replay, a lost acknowledgment on either side, a concurrent ordinary renewal and replay after a later renewal. Test My Status and new Drive/Telegram grant continuity immediately past old expiry, at the end of grace and after grace. No live operation has been performed by this draft.

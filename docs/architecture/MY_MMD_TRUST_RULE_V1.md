# MY MMD Trust Rule v1

Status: **Canonical**
Effective: **2026-09-19**
Authority owner: **MMD Owner / MY MMD entitlement + recovery runtime**

## Canonical rule

> **MY MMD Trust Rule:** Verified LINE + protected/canonical evidence never resolves to Guest. Historical reconstruction is governed only by recovery KV state; terminal states are `reconciled` or `review_required`. Protected VIP/SVIP/Black Card without canonical expiry receives a durable first-connect +2y active-through. Owner QA uses `/internal/admin/my-mmd/recovery`, not repeated customer E2E.

## Required interpretation

1. **Guest is a proven negative state, not a fallback.**
   - A verified LINE identity with protected/canonical evidence MUST NOT resolve to Guest.
   - Guest is allowed only after a successful negative canonical lookup confirms both:
     - no Canonical Client/member truth, and
     - no protected marker/evidence.
   - Resolver/storage failures remain checking/recovery/fail-closed and must not become Guest/signup.

2. **Historical reconstruction authority is the recovery KV state.**
   - `checking` / `in_progress` => recovery is still running.
   - `reconciled` => reconstruction is terminal and complete.
   - `review_required` => reconstruction is terminal, with bounded items requiring manual review.
   - `blocked` => fail-closed terminal/system-review state; never infinite loading.
   - Missing `membership_start`, historical expiry, or other legacy metadata by itself MUST NOT create or prolong `recovery_pending`.

3. **Protected active-through is durable.**
   - Active VIP / SVIP / Black Card without canonical expiry receives first-successful-connect `+2y` active-through.
   - The anchor is persisted server-side and reused.
   - It MUST NOT slide forward on every request.

4. **Points cannot finalize before recovery truth permits it.**
   - While recovery is `checking` / `in_progress`, missing points stay pending/null.
   - Temporary `0` MUST NOT be presented as a final verified balance.
   - After `reconciled` or `review_required`, the confirmed balance may be shown, including a real zero.

5. **Owner QA replaces repeated customer QA.**
   - Canonical Owner diagnostic: `/internal/admin/my-mmd/recovery`
   - Owner checks canonical client, tier/lifecycle, active-through, recovery state, points, acceptance evidence, counters and timestamps server-side.
   - Customer LINE session is not required for owner diagnostic.
   - Do not repeatedly ask a member to reopen MY MMD merely for QA when owner-side diagnostic/log/KV evidence is sufficient.
   - Re-contact a customer only for a real customer-visible blocker that cannot be verified internally.

## Acceptance evidence

- Evidence id format: `mmdacc_<HMAC fingerprint>`
- No raw LINE User ID in browser-visible diagnostic output.
- No customer session token in acceptance evidence.
- Canonical and Fast Trust paths may both record successful protected-member acceptance evidence.

## Precedence

This rule overrides older presentation logic that inferred `recovery_pending` merely because legacy membership metadata was absent.

## Implementation references

- False Guest hardening: PR #1316
- Canary / observability / acceptance evidence: PR #1323
- Canonical acceptance evidence: PR #1324
- Durable protected active-through + history projection: PR #1329
- Recovery KV authority + points terminal behavior: PR #1336
- Owner-only Recovery Diagnostic: PR #1341

## Operational non-goal

This rule does not widen entitlement, create membership history, invent points, or grant access. It governs trust-state projection and QA behavior around already verified/canonical evidence.

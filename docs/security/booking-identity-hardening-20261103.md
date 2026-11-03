# Booking identity hardening: source proposal, not a release

Base: cc4b4ba16fdb73281f6dd5e83b2c70f64a2a3561. No production records, sessions, deployments, membership capabilities, or Webflow publication are changed by preparing this patch.

## Boundaries addressed

1. An entitlement grants access only when its `member` link is exactly the current Member record. `[A, B]`, duplicate links, missing links, and malformed values fail closed. Any ambiguous row in the inverse-linked inventory denies the entire snapshot, including when another valid active entitlement exists.
2. Internal confirmation no longer derives identity from an unsigned booking's email, LINE/contact value, or cached resolver snapshot. Missing ownership returns `booking_owner_review_required` before entitlement/payment lookup or mutation. Invalid signed ownership remains rejected. Valid signed owners still require current entitlement and payment checks.
3. Auth's email-derived LINE recovery cannot PATCH Members, certify an existing email-derived link, or retry the profile resolver after a repair. Recovery evidence remains a read-only hint for owner review. Existing normally resolved profiles and Fast Trust behavior remain unchanged.
4. Booking discovery rechecks the current unique Members-to-verified-LINE binding before trusting the session's cached Member ID. The check is read-only and does not revoke, rotate, delete, or rewrite sessions. The SIGIL consumer requires an explicit internal freshness marker, so an older service cannot silently satisfy the new contract.

## Explicit compatibility impact

- Unsigned Public and Private confirmations pause for ownership review. Legacy `member_booking_owner_v2` proves a request marker but does not bind a canonical Members record and is insufficient for this endpoint. Already-Confirmed rows are left unchanged; attempting this endpoint again also pauses rather than re-authorizing from contact fields.
- This is not an automatic legacy migration. No new ownership marker is manufactured for old records. A separate reviewed remediation workflow must establish the owner before those requests can confirm.
- Missing, ambiguous, contradictory, or unavailable current session binding cannot authorize protected booking access. Anonymous browsing and existing unspecified discovery context retain their prior behavior.
- The paid-capability list, Private entitlement policy, payment-verification algorithm, and budget policy are not changed.

## Residual risks: do not describe this as complete historical repair

Historical recovery wrote no binding provenance. A previously incorrect `Members.line_id` that still agrees with the cached session can pass a fresh read. Freshness is not independent identity proof. Existing signed ownership created from an already-mislinked session is likewise not retroactively repaired. Targeted owner review needs independent canonical evidence or record history; do not blanket-unlink records or invalidate sessions.

`Members.Clients` is a hosting relationship, not same-customer proof. Do not use it as an identity bridge. Email equality alone cannot authorize a LINE/Member repair.

The existing confirmation record lookup can choose a first/fallback match; the existing payment lookup can accept a supplied payment reference without a strong booking association. Those are separate unresolved boundaries, not fixed or certified by this proposal.

## Release constraints

Keep this PR draft until compatibility and historical remediation scope are accepted. No merge or deploy is authorized by this preparation task. A later release must review the actual current production overlays and settings independently. Do not repin or rerun historical code-only artifact contracts: their source/baseline hashes intentionally differ. The new member service guard must be present before the SIGIL freshness contract is enabled. Auth, member service, and SIGIL are separate deployment surfaces.

All tests use synthetic records and mocked external calls. No real bookings, confirmations, payment actions, customer messages, session deletions, or identity-record writes were performed.

## Verification evidence

- Combined SIGIL runtime, member binding/session/booking, and auth bridge regression command: 224/224 passing on Node24.22.1.
- Includes actual KV-session stale A/B tests, complete-body timeouts, duplicate/paginated binding reads, synthetic canonical IDs, old-service downgrade rejection, zero-write unsigned confirmation, valid signed confirmation, and ambiguous entitlement ownership.
- Full auth suite:119/120; the sole partner-present assertion also fails on untouched base because its broad `/SIGIL/i` regex matches the existing `membership_worlds.sigil` key. This unrelated baseline failure is not fixed or hidden here.
- CI explicitly runs the new member binding and auth bridge tests. Source-level review is not deployment approval.

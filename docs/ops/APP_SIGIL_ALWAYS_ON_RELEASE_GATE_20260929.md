# APP + SIGIL Search Always-on Campaign Release Gate

Owner intent: performance and UI work are not enough to call the APP campaign ready. The campaign can become always-on only after genuine production acceptance proves the customer and Model paths that the ad will send traffic into.

## Required order

1. Production route/deploy smoke is green.
2. A genuine LINE -> LIFF -> verified session chain completes without synthetic identity.
3. MY MMD reads the same customer's current history, Points and Customer Requests from canonical backend truth.
4. MMD APP preserves a real Job Board/job handoff into the exact authenticated Model job.
5. SIGIL Search returns the expected Models with approved public-safe media linked to those exact canonical Model records.
6. SIGIL Search proves that private/pending/unapproved media is not exposed.
7. The actual campaign destination is smoke-tested from the ad entry URL through the intended app surface.
8. Only then may the release manifest move from `hold` to `ready` and `campaign_enabled=true`.

## Evidence rule

Real-event gates must use genuine production evidence. Unit tests, staging fixtures, synthetic LINE IDs, fake payments, or fabricated media cannot satisfy the gate.

Record each proof in `ops/release-gates/app-sigil-always-on.json`. A `pass` row must include an evidence reference. The checker rejects a ready/enabled decision if any required proof is missing.

## Current status

`HOLD`.

The historical SIGIL Search hardening work proved renderer/privacy behavior but did not itself attach approved public-safe media to the currently returned Models. That data condition must be resolved with owner-reviewed media before the campaign is called ready.

## Non-goals

This gate does not create customer data, upload media, approve payment, grant entitlement, or manufacture acceptance evidence. It only prevents the launch decision from outrunning production truth.

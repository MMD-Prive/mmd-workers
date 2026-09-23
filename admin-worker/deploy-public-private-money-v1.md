# Public / Private Money Deployment Marker

Date: 2026-09-22

This marker intentionally triggers the `Deploy admin-worker` workflow after the
`model-session-runtime-v1a` policy-version regression was corrected on `main`.

Deployment acceptance requires the selected admin-worker validation suite to
prove all of the following before production upload:

- `public_model` may use only its matched Public package/session payout policy;
- `private_model` remains case-locked and never inherits Public package, OT, or
  after-midnight matrices;
- `needs_review` fails closed without model payout terms;
- model-visible payout data excludes customer price, MMD margin, commissions,
  payment references, banking data, and slip evidence.

This file has no runtime authority. Runtime authority remains in
`admin-worker/src/index.js` and the canonical Session fields.

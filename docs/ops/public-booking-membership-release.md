# Public booking membership / remembered-name release

Source-only change. This PR does not deploy or publish Webflow.

## Dependencies and order

1. Review a scoped member-pages production overlay containing the booking discovery context, customer-identity reader, strict session-read option and verified-nonmember discovery alias. Preserve every unrelated live member-pages export, binding, migration and runtime setting. No new bindings, schema, credentials or migrations are required.
2. Publish the reviewed booking frontend changes with known page-specific scope. The actual `/booking` head embeds the canonical bridge; `/sigil/booking` has a separate footer. Do not substitute a whole-site publish without reviewing all included drafts.
3. Deploy the reviewed sigil-booking overlay after the member context exists. New booking against the old member endpoint fails closed with 503; do not deploy booking first.
4. Verify exact active artifact/version/deployment hashes and unchanged configuration. Preserve live Telegram secrets, service binding and service secret, R2 binding, routes and runtime settings. A repository build is not proof that all live overlays were preserved.

Public model browsing retains its existing visibility policy. Public client-resolve/draft submission now requires current paid membership. Guest Pass alone is insufficient; Private-lane entitlement rules remain separate. A logged-in nonmember receives 403 signup, missing/invalid session 401 login, and unavailable authority 503 retry. Existing sessions may need a fresh verified login to issue the same-site discovery alias. Cross-site aliases are deliberately not broadened to mmdprive.com, Webflow preview, or Lovable.

Per Rename is an internal display projection from exact verified LINE identity, complete index/staging evidence and canonical Client agreement. Ambiguous, stale or unavailable evidence renders unknown; it never changes entitlements or identity links. Submitted contact/name remains unverified contact information, not booking authority.

New Public requests carry an HMAC owner marker bound to request reference and verified member identity. Preserve the existing booking/member service secret; rotating it requires an explicit marker migration strategy. Unsigned existing references are not silently adopted. Final confirmation for signed requests rechecks that owner's current entitlement rather than submitted email/LINE fields. This change does not assert bank verification or bypass existing payment/approval checks.

## Validation

Run the focused booking/member/frontend tests and repository check on supported Node18/20/22. Tests mock all writes and notifications. Do not create real customer drafts, payment entries, or Telegram messages as release smoke tests. Use authenticated read-only context checks and unsigned rejection checks only after checking that the exact request cannot mutate.

Rollback must preserve compatible member discovery support for signed owners already written. Do not roll back to a booking artifact that discards ownership markers or resumes contact-derived authorization for those new requests. Do not automatically retry an uncertain production upload or Webflow publish.

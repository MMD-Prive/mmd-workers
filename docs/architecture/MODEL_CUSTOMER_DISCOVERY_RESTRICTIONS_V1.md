# Model customer discovery restrictions V1

Status: backend foundation. Do not present this as an enabled MY MODEL control.

## Storage and ownership

Proposed Models long-text field: `customer_discovery_policy_json`. It is server-only.
An absent/blank value preserves the existing catalog policy. A malformed/nonblank
value denies discovery. No records or schema are automatically changed by this PR.

```json
{
  "schema_version": "model_customer_discovery_v1",
  "require_verified_customer": true,
  "blocked_member_refs": ["64-character lowercase hex member binding"]
}
```

Refs must come from MY MMD's server-verified `memberRef`, never from a customer
email, phone, display name, browser-supplied member ID or booking reference.
The current implementation caps the list at 500 refs and the JSON at 40 KB.

An owner-authenticated MY MODEL writer must resolve a customer choice from an
owned historical booking, validate the canonical identity, and update only that
Model's policy. It must reject cross-Model writes, use an audit/revision check,
and never offer arbitrary memberRef entry. This writer/UI is not in this PR.

## Booking search and media

The existing MEMBER_PAGES_WORKER service binding validates the session cookie
through /api/member/app/profile. Only a matched, LINE-connected, non-blocked
profile with an opaque memberRef establishes the viewer. IDs in body/query/header
are not accepted. Unavailable identity service or expired/unmatched sessions
cannot view a restricted Model.

Both search sanitization and every media GET/HEAD apply the policy. A denied
Model is omitted, and media returns the same generic 404 as missing media.
Policy JSON, refs, counts, and individual deny reasons are never projected.
The policy can only narrow existing tier/approval rules; it grants no tier.

Restricted Models also require a verified customer when the deny list is
nonempty, even if require_verified_customer is false, so signing out is not a
bypass. Each request rereads current Model state; media uses no-store.

## Required integration gates before enabling real blocks

1. Provision the proposed field and the authenticated MY MODEL writer/UI.
2. Verify the member session is available on the canonical booking host.
   __Host cookies from mmdbkk.com are NOT inherited by sigil.mmdbkk.com,
   Webflow or Lovable origins. Missing sessions intentionally fail closed;
   no cross-host identity bridge is created here.
3. Migrate restricted Models off anonymous public promotion/catalog and direct
   public CDN storage. The separate /sigil/api/models/search/public-catalog
   endpoint is application/consent based and uses public URLs; it is not a
   private audience gate. Existing public URLs cannot provide individual
   revocation. Block activation must first withdraw public promotion and serve
   restricted assets only through the authenticated media endpoint.
4. Audit customer detail, recommendation, legacy catalog and other discovery
   surfaces for the same Model restrictions before promising complete hiding.
5. Smoke a real allowed, blocked and signed-out viewer on mobile, including
   saved media URLs, GET/HEAD/ranges and revocation.

This PR deliberately does not create fake customer identities, populate a real
deny list, alter promotion consent, or modify already-confirmed jobs/payments.

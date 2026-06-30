# MEMBER_STATUS_RESOLVER Binding Plan

Status: planning/checklist only. Do not deploy from this document. Do not publish LINE Rich Menu, Webflow, or Airtable changes from this document.

This plan defines the production contract that must exist before LINE OA Rich Menu buttons can treat a member as active/current. The binding is a trusted backend resolver. Public LIFF payloads, Memberstack state, Webflow redirects, query strings, and page scripts are not membership truth.

## Binding Purpose

`MEMBER_STATUS_RESOLVER` resolves a LINE/member identity into customer-safe membership routing state. It must be bound to the worker that handles:

```text
POST /member/api/liff/identify
```

The resolver is read-only for LINE OA publish readiness. It may read Airtable-backed truth, but it must not let a LIFF body create or promote member status.

## Resolver Request Contract

The caller sends the resolver a normalized server-side request. Only identity and intent fields are inputs; status claims from the public body are ignored.

```json
{
  "line_user_id": "Uxxxxxxxx",
  "line_display_name": "optional customer display name",
  "entry_route": "public_membership | member_status | renewal | booking_request | pay_membership | sigil_membership | dashboard",
  "source": "line",
  "request_context": {
    "origin_route": "/member/membership",
    "preserved_query": {
      "t": "optional",
      "code": "optional",
      "promo": "optional"
    }
  }
}
```

Rules:

- `line_user_id` is the primary lookup key for LINE OA flow.
- `entry_route` selects a safe routing intent only; it is not proof of status.
- `t`, `code`, and `promo` may be preserved to customer routes.
- Public request fields such as `membership_state`, `package_state`, `is_active`, `is_current`, `has_first_job`, `session_id`, `session_status`, `points`, `tier`, `payment_status`, or `dashboard_unlock` must be discarded before resolution.

## Resolver Response Contract

The resolver returns a customer-safe routing result and an audit-oriented reason. It must not expose Airtable record IDs, internal notes, payment internals, admin flags, raw session internals, or risk fields.

```json
{
  "ok": true,
  "identity_match": "matched | unmatched | ambiguous",
  "membership_state": "active | expired | no_paid_package | unknown | review_required",
  "package_state": "current | expired | none | unknown",
  "rich_menu_target": "public_member | private_member | renewal_required",
  "next_route": "/member/profile?status=active",
  "safe_next": {
    "membership": "/member/membership",
    "renewal": "/sigil/pay/renewal",
    "booking": "/sigil/booking",
    "dashboard": null
  },
  "dashboard_unlock": {
    "allowed": false,
    "reason": "waiting_for_first_real_job_or_session"
  },
  "evidence": {
    "membership_source": "member_entitlements | member_packages | clients | none",
    "session_source": "sessions | jobs | none"
  }
}
```

Allowed active/current result:

- `membership_state: active`
- `package_state: current`
- `rich_menu_target: private_member`
- `safe_next.booking: /sigil/booking`
- `safe_next.dashboard` remains `null` unless trusted first real job/session evidence also passes.

Fail-closed result:

```json
{
  "ok": false,
  "identity_match": "unmatched",
  "membership_state": "unknown",
  "package_state": "unknown",
  "rich_menu_target": "public_member",
  "next_route": "/member/membership",
  "safe_next": {
    "membership": "/member/membership",
    "renewal": "/sigil/pay/renewal",
    "booking": null,
    "dashboard": null
  },
  "dashboard_unlock": {
    "allowed": false,
    "reason": "resolver_unavailable_or_no_trusted_match"
  }
}
```

## Airtable Truth-Source Mapping

The resolver must read existing truth sources. This plan does not create tables, fields, schema, or records.

| Truth question | Airtable source | Lookup keys | Trusted fields | Rule |
| --- | --- | --- | --- | --- |
| Who is this LINE user? | `Clients` and/or `MMD - Member Entitlements` | `line_user_id`, then linked client/member references | `line_user_id`, `member_email`, `memberstack_id`, display name fields | Match only. A public LIFF identify call may not create active status. |
| Is membership active? | `MMD - Member Entitlements` | `line_user_id`, `member_email`, `memberstack_id` | `member_status`, `access_status`, `expire_at`, `package_code`, `tier` | Active requires allowed status plus no expired access window. |
| Is package current? | `member_packages` | `member_email`, `memberstack_id`, linked member/client | `status`, `package_code`, `start_date`, `end_date`, `payment_ref` | Current requires backend/payment-owned package state; proof alone does not count. |
| Should renewal be offered? | `member_packages` and payment review records | member identity plus package/payment references | expired/missing package state, review status | Expired, none, unknown, or review-required routes to `/sigil/pay/renewal` or `/member/membership` depending on intent. |
| Can dashboard unlock? | `Sessions` / Jobs equivalent operational table | trusted member/client/session relation | real job/session ID, status, member link, package link | Unlock only after trusted first real job/session evidence; no public body claim can unlock it. |
| Should points/tier be displayed? | `MMD - Points Ledger`, entitlements, package truth | trusted member/client references | verified points/tier fields | Display only after trusted lookup; never accept points/tier from LIFF body. |

## Resolver-Unavailable Fallback

If `MEMBER_STATUS_RESOLVER` is missing, throws, times out, returns malformed JSON, returns ambiguous identity, or cannot reach Airtable:

- Do not infer active/current.
- Do not assign private Rich Menu eligibility.
- Do not unlock `/member/dashboard`.
- Return or render a safe public route, normally `/member/membership`.
- For renewal intent, use `/sigil/pay/renewal` as evidence-only payment proof collection, not as membership activation.
- For booking intent, do not route to `/sigil/booking` unless active/current came from trusted resolver evidence.
- Log or stage the attempt only if the existing logging path is available and non-blocking.

## Public LIFF Body Cannot Fake Active/Current

The LIFF request body must be treated as identity and intent only. The following body fields, if present, are ignored and must not influence resolver output:

- `membership_state`
- `package_state`
- `is_active`
- `is_current`
- `active`
- `current`
- `tier`
- `points`
- `payment_status`
- `payment_ref` as proof of verified payment
- `session_id`
- `session_status`
- `has_first_job`
- `first_real_session_exists`
- `dashboard_unlock`

Acceptance check before publish: submit a LIFF identify request that claims active/current and dashboard unlock in the body while Airtable truth is missing or expired. Expected result is public/renewal routing, `safe_next.dashboard: null`, and no private Rich Menu eligibility.

## Dashboard Unlock Rule

Membership active/current is not enough to unlock `/member/dashboard`.

Dashboard unlock requires all of:

- trusted resolver result,
- active/current membership/package truth,
- first real job/session evidence from a backend-owned source,
- allowed real-session status such as `confirmed`, `en_route`, `arrived`, `met`, `work_started`, or `completed`.

Dashboard remains locked for:

- Rich Menu click alone,
- LIFF identity alone,
- known LINE identity alone,
- paid proof upload alone,
- pending verification,
- package signup without trusted first real job/session.

## `/sigil/pay/renewal` Evidence-Only Status

`/sigil/pay/renewal` is a renewal evidence route. It may collect or show payment proof state, but proof is not payment truth.

Rules:

- Uploading proof does not activate membership.
- URL parameters must not turn renewal into verified payment.
- Resolver output may route expired or renewal-required users here.
- Member status changes only after backend/payment-owner verification updates Airtable truth.

## `/sigil/booking` Ownership and Pass-Through Note

`/sigil/booking` is a booking destination for active/current members, not a membership resolver. Ownership remains with the route owner documented in `docs/sigil-route-ownership-registry.md`.

Rules:

- LINE OA may route active/current booking intent to `/sigil/booking` only after trusted resolver status.
- The status resolver does not own booking page rendering.
- Do not move `/sigil/booking` into LINE OA, Webflow redirects, or member-pages status logic.
- Preserve the booking owner's pass-through/redirect behavior and safe query allowlist.

## LINE OA Pre-Publish Checklist

Complete all items before publishing Rich Menu changes in LINE OA Manager:

- [ ] Confirm production worker has `MEMBER_STATUS_RESOLVER` bound.
- [ ] Confirm resolver reads Airtable truth without creating or promoting status from LIFF identity.
- [ ] Confirm resolver response matches the request/response contract in this document.
- [ ] Confirm active/current cannot be faked by public LIFF request body fields.
- [ ] Confirm dashboard remains locked without trusted first real job/session evidence.
- [ ] Confirm expired/current/unknown test identities route to expected safe destinations.
- [ ] Confirm `/sigil/pay/renewal` remains evidence-only and does not mark membership active from proof alone.
- [ ] Confirm `/sigil/booking` owner/pass-through behavior remains unchanged.
- [ ] Confirm no LINE Rich Menu button points directly to `/member/dashboard`.
- [ ] Confirm only `t`, `code`, and `promo` are preserved into safe customer routes.
- [ ] Confirm unknown or resolver-unavailable states fail closed to public membership/renewal routes.
- [ ] Confirm no deploy, Webflow publish, Airtable schema/data change, or LINE OA publish happens until owner approval.

## Blockers Before LINE OA Publish

- Production binding name and target worker must be confirmed.
- Airtable field names used by resolver must be verified against live base configuration.
- Test identities for active/current, expired, no paid package, unknown, and first-real-job/session states must be prepared.
- Owner must approve LINE OA publish after checks pass.

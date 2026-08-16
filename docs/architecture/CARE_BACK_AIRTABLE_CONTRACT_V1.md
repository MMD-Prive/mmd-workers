# CARE BACK Airtable Contract V1

Status: DRAFT / NOT READY TO DEPLOY  
Campaign ID: `6-years-care-back`  
Public route: `/promotion/6-years-care-back`  
LIFF ID: `2010298002-mbx9kqQn`

## Locked customer flow

1. The public preview route is viewable before login.
2. The preview explains CARE BACK without revealing a discount amount or personal code.
3. The primary CTA starts LIFF identity verification.
4. A Worker verifies identity and eligibility.
5. Only after successful verification may HYPE issue or reveal a six-character personal code.
6. A code is personal, single-use, and subject to MMD verification.
7. Approval and benefit application remain Worker/admin actions. The browser never writes to Airtable directly.

Telegram `/start preview` is an entry point only. It must not issue a code, claim eligibility, or write a campaign claim before LIFF verification.

## Airtable owner

Base: `MMD Commerce Operating System` (`appsV1ILPRfIjkaYg`)

The `MMD Client Identity Seed` base is migration/identity evidence only and is not the campaign transaction owner.

### MMD — Campaign Claims

Table ID: `tblTH1LGJikBI0rly`

Worker-owned durable state for:

- identity match
- eligibility classification
- review
- approval
- personal-code linkage
- benefit application status

Required creation fields after verified identity:

- `claim_id`
- `campaign_id = 6-years-care-back`
- `line_user_id_hash` (hash only)
- `match_status`
- `review_status`
- `claim_status`
- `created_at`
- redacted `payload_json`

Never store a raw LIFF token or signed route token.

### MMD — LIFF Renewal Sessions

Table ID: `tblXjQFwo0A2cHseh`

Use the existing LIFF session as the identity/flow audit record. Link the verified session to the Campaign Claim through:

- `campaign_code`
- `campaign_claim_id`
- `Campaign Claim`
- `liff_intent`
- `hype_decision_status`
- `signed_route_token_hash` (hash only)

Opening the preview or LIFF alone must not materialize membership, points, history, entitlements, or benefits.

### MMD — Promo Codes

Table ID: `tblPLRsw2Rl0mXfTW`

Personal codes are promotion codes, not login/security codes. Create a code only after successful verification and claim creation.

Required fields:

- `code` — six characters from the approved non-ambiguous alphabet
- `campaign_code = 6-years-care-back`
- `campaign_name = 6 YEARS CARE BACK`
- `issued_channel = LIFF`
- `landing_path = /promotion/6-years-care-back`
- `status`
- `expires_at`
- `max_uses = 1`
- `used_count = 0`
- benefit fields only after MMD policy is approved

The code must not be used as authentication.

### MMD — Campaign Benefit Applications

Table ID: `tblc2iGQJs2b9XpgA`

Apply benefits idempotently after approval. One logical record per claim and benefit type.

Idempotency key:

```
6-years-care-back:{claim_id}:{benefit_type}
```

A retry must return the existing result and must never duplicate months, points, discounts, or any other benefit.

## API boundary

`/api/care-back-wish` remains closed and returns 404 until a separate approved API contract and canonical owner exist.

The verified claim endpoint must live under the established member/LIFF API boundary and must:

- require a valid LIFF/member session
- validate origin and method
- hash identity before storage
- create or return one claim idempotently
- fail closed when Airtable or identity verification is unavailable
- never return an approved benefit before review/approval state permits it
- never expose Airtable IDs, tokens, internal notes, or raw payloads

## State guard

Minimum safe progression:

```
preview
  -> verification_required
  -> identity_verified
  -> eligibility_pending
  -> review_required | eligible
  -> approved
  -> code_issued
  -> benefit_applied
```

Blocked, unmatched, expired, rejected, and error states must not issue a code or apply a benefit.

## Deployment gate

This contract does not authorize production deployment. Before merge/deploy:

- tests prove Telegram cannot issue a pre-verification code
- the verified LIFF endpoint has a canonical Worker owner
- Airtable select option names are validated against live schema
- campaign benefit amount/type and validity are explicitly approved
- preview and verified states are visually distinct
- live smoke tests prove single-use and idempotent behavior

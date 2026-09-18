# CARE BACK Airtable Contract V1

Status: SUPERSEDED IN PART / NOT READY TO DEPLOY
Campaign ID: `6-years-care-back`  
Public route: `/promotion/6-years-care-back`  
LIFF ID: `2010298002-mbx9kqQn`

Policy precedence: `docs/knowledge/CARE_BACK_2026_FINAL_LOCK.md` is authoritative for campaign eligibility, Birthday Wish, coupon, Membership, Points, and lifecycle rules. If this architecture draft conflicts with that lock, the final lock wins.

## Locked customer flow

1. The public preview route is viewable before login.
2. The preview explains CARE BACK without revealing a discount amount or personal code.
3. The primary CTA starts LIFF identity verification.
4. A Worker verifies identity and eligibility.
5. The canonical Birthday Wish service must confirm that the member's Wish was saved successfully.
6. Only after the Wish is saved may the Worker activate or reveal a personal coupon code. Identity verification alone must never issue or reveal one.
7. A code is personal and single-use. It gives up to 10% off according to the approved Model level × job format matrix, expires 2 months after activation, and must be redeemed to confirm a booking before expiry. The service date may be up to 90 days from the original booking date.
8. Approval and benefit application remain canonical owner actions. The browser never writes to Airtable directly.

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

Personal codes are promotion codes, not login/security codes. Create or activate a code only after successful verification, idempotent claim creation, and a successfully saved canonical Birthday Wish.

Required fields:

- `code` — six characters from the approved non-ambiguous alphabet
- `campaign_code = 6-years-care-back`
- `campaign_name = 6 YEARS CARE BACK`
- `issued_channel = LIFF`
- `landing_path = /promotion/6-years-care-back`
- `status`
- `model_level`
- `job_format` — `PN` or `VIP`; this is a job format, not customer membership status
- `approved_discount_percent`
- `activated_at`
- `expires_at`
- `booked_at`
- `original_booking_at`
- `service_date`
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
  -> wish_required
  -> wish_saved
  -> review_required | eligible
  -> approved
  -> coupon_active
  -> benefit_applied
```

Blocked, unmatched, expired, rejected, revoked, invalid, and error states must not issue a code or apply a benefit. Coupon lifecycle must distinguish `draft`, `active`, `used`, `expired`, `revoked`, and `invalid`.

## Deployment gate

This contract does not authorize production deployment. Before merge/deploy:

- tests prove Telegram cannot issue a pre-verification code
- tests prove identity verification without a saved Birthday Wish cannot issue or reveal a code
- the canonical Birthday Wish owner is connected and can authoritatively confirm `wish_saved`
- the verified LIFF endpoint has a canonical Worker owner
- Airtable select option names are validated against live schema
- campaign benefit amount/type and validity match `CARE_BACK_2026_FINAL_LOCK.md`
- tests prove the approved discount follows the Model level × job format matrix and is not inferred from coupon color
- tests prove booking occurs within 2 months from activation and the service date remains within 90 days from the original booking date
- preview and verified states are visually distinct
- live smoke tests prove single-use and idempotent behavior

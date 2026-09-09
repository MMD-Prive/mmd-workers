# CARE BACK Trusted Booking Approval V1

Status: implementation candidate
Owner boundary: SIGIL Booking confirmation -> member-pages CARE BACK authority

## Canonical production path

```text
trusted POST /__internal/booking/confirm
-> SIGIL Booking Worker verifies canonical entitlement snapshot
-> SIGIL Booking Worker verifies payment/deposit
-> booking becomes Confirmed
-> stored booking supplies LINE identity + canonical model reference
-> trusted server caller supplies explicit job_format = PN | VIP
-> service binding MEMBER_PAGES_WORKER
-> POST /__internal/care-back/approve-booking
-> member-pages-worker re-resolves member through mmd-auth-worker
-> member-pages-worker re-fetches canonical Models record
-> member-pages-worker validates model level + model job compatibility
-> CARE BACK claim/Wish/customer-eligibility gates re-run
-> care-back-claim-store approveCouponDiscount()
-> approved_discount_percent + activated_at + expires_at
-> My MMD coupon wallet readback
```

## Authority rules

- Browser `job_class`, membership tier, card color, discount fields and free-form model names are not discount authority.
- `/__internal/booking/confirm` is already server-to-server and independently verifies entitlement plus payment/deposit before the CARE BACK hook runs.
- The trusted confirmation caller must provide exact `job_format` of `PN` or `VIP`; the CARE BACK hook will not infer it from a browser request.
- Model identity is re-read from the persisted booking and then resolved against canonical Airtable `Models`.
- Model level is derived only from the canonical Models record.
- If `Models.job_types` is populated, the requested PN/VIP format must be present there.
- Customer eligibility is re-evaluated by the CARE BACK claim store using the member profile re-resolved from `mmd-auth-worker`.
- The caller cannot supply `approved_discount_percent` or `discount_percent`.
- `member-pages-worker` remains the only owner that writes the CARE BACK approved percentage.
- For Public Models, backend policy defaults to 5% unless an explicit canonical CARE BACK public rate is stored; any explicit rate must remain inside 3–5%.
- Missing/ambiguous identity, Model level, job format, service auth or upstream state fails closed to `review_required`; a valid already-confirmed booking is not rolled back merely because its optional CARE BACK coupon still needs review.

## Service authentication

`sigil-booking-worker` calls `member-pages-worker` only through the Cloudflare service binding:

```text
MEMBER_PAGES_WORKER -> member-pages-worker
```

Both Workers require the same 32+ character secret:

```text
AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES
```

The request header is:

```text
x-mmd-sigil-booking-secret
```

No browser receives this secret.

## Deployment prerequisite

Before deployment, provision `AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES` with the same value on:

- `sigil-booking-worker`
- `member-pages-worker`

Do not enable/claim production PASS if the service secret is absent. The confirmed booking response will remain fail-closed with `care_back_approval.status = review_required`.

## Remaining #583 production proof

Landing this code closes the missing trusted invocation *implementation* gap. Issue #583 still requires one fresh real production trace after deployment:

```text
real LINE
-> LIFF verified session
-> My MMD / CARE claim
-> Wish saved
-> trusted booking confirmation with PN/VIP
-> CARE BACK approval
-> coupon wallet
-> approved_discount_percent
-> backend activated_at / expires_at
```

Synthetic staging or CI does not count as that final proof.

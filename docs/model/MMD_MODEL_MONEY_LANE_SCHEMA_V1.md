# MMD Model Money Lane Schema V1

Status: Canonical field and authority lock  
Date: 2026-09-22

## Three separate decisions

The system must keep these independent:

1. **Profile visibility** — whether a person has a Public Profile.
2. **Offer confidentiality** — whether the job details are disclosed publicly or handled confidentially.
3. **Money lane** — whether the Session uses Public Money or Private Money.

A confidential offer does not automatically become Private Money. MMD must explicitly assign the Session money lane.

## Sessions fields

### `model_work_lane`

Canonical money authority gate:

- `public_model` — Public Money. An approved Public package/payout matrix may apply.
- `private_model` — Private Money. Case-priced and case-locked; Public matrices never apply automatically.
- `needs_review` — fail closed. No matrix or extension price may be inferred.

### `model_package_code`

Canonical model-service package key, for example:

- `pick_me_up`
- `airport_please`
- `cook_with_me`
- `night_out`

This field may be used only after `model_work_lane=public_model`, and only when the key is allowlisted by the deployed Public package policy.

### `package_code`

Membership/access package code only:

- `7days`
- `standard`
- `premium`
- `blackcard`

It must never be used to resolve model-service price, worker payout, OT, after-midnight premium, or extension terms.

### `pay_model_thb`

Session-locked base payout for the assigned worker/model. It is model-visible through an authenticated MMD MODEL projection, but remains forbidden on Public and Member surfaces.

It must never be inferred by subtracting a percentage from the customer-facing price in the browser.

## Runtime binding

The admin-worker entrypoint binds the model-money package reader to `model_package_code` through:

`AT_SESSIONS__PACKAGE_CODE = AT_SESSIONS__MODEL_PACKAGE_CODE || "model_package_code"`

Any legacy environment binding to Membership `package_code` is intentionally ignored for model-money resolution.

## Public Money

Public matrices require all gates:

- `model_work_lane=public_model`;
- allowlisted `model_package_code`;
- Session-locked `pay_model_thb`;
- approved policy version.

Missing or unsupported package policy fails closed to the Session-locked payout plus manual review. No OT/add-on matrix is invented.

## Private Money

For `model_work_lane=private_model`:

- customer price is an approved case quote;
- worker payout is locked for the specific Session;
- Public package price, payout percentage, OT table, and after-midnight formula do not apply automatically;
- extensions and scope changes require a new MMD case quote, Model approval, and MMD confirmation.

## Extension coverage

Official flow:

`MY MMD request → MMD MODEL approve/decline → payment verified where required → MMD confirmation → official end time changes`

Until the final MMD confirmation, the original end time and scope remain authoritative.

# MMD Non-Member Profile Image Consent V1

Status: Canonical consent and publication contract  
Date: 2026-09-22  
Consent version: `mmd-public-promo-consent-v1-20260922`

## Decision

A Public Model application, an approved Public Role, an approved image, and consent to show that image to a non-member are four separate authorities.

No single checkbox, application approval, R2 folder, public-profile flag, or Role selection may replace the other gates.

## What the applicant may choose

The applicant may optionally permit MMD to show MMD-approved profile images to visitors who are not logged in and are not yet MMD members on `/profiles`.

The applicant must choose the exact service Roles for which that visual promotion is allowed.

This consent:

- is optional and must not affect application acceptance;
- is off by default;
- applies only to MMD-owned Public surfaces;
- applies only to MMD-approved Public-safe profile images;
- applies only to the intersection of applicant-consented Roles and MMD Approved Public Roles;
- does not include Private images, documents, contact details, legal identity, credentials, internal notes, or client/job details;
- does not grant use outside MMD or for unrelated campaigns;
- can be withdrawn later.

## Public catalog gate

A photo may appear to non-members only when all gates are true:

1. application type is `public_model`;
2. review status is accepted;
3. intake status is approved;
4. `MMD Public Profile Approved=true`;
5. the applicant explicitly granted non-member image consent;
6. consent status is `granted`;
7. consent version is the current allowlisted version;
8. consent has a valid server/application timestamp and approved source;
9. consent has not been revoked;
10. at least one consented promo Role intersects MMD Approved Public Roles;
11. the image is located inside the public-safe R2 policy;
12. audience and credential gates pass.

The catalog exposes only the Role intersection. It never exposes consent timestamps, consent versions, raw Airtable fields, R2 keys, documents, or internal review evidence.

## Existing profiles

Existing profiles are not backfilled into consent.

No prior photo upload, prior public listing, application consent, generic media consent, or historical publication may be interpreted as current consent for non-member promotion.

Until a person explicitly re-consents, their image must fail closed for non-member `/profiles` display. They may request grant, scope change, or withdrawal through `https://t.me/mmdapply` until an authenticated MMD MODEL self-service mutation is released.

## Withdrawal

Operational withdrawal sets:

- `MMD Public Promo Consent Status=revoked`;
- `MMD Public Promo Consent Revoked At=<server timestamp>`;
- `MMD Non-Member Image Consent=false` where appropriate.

Withdrawal affects non-member visual promotion only. It does not by itself cancel a Model relationship, erase historical audit evidence, revoke an internal profile, change Public/Private money classification, or cancel confirmed work.

## Airtable fields

Table: `Model Applications` (`tblwUa8ySWln8OfaJ`)

- `MMD Non-Member Image Consent` — `fldUMJEUVK3GNmomA`
- `MMD Non-Member Promo Roles` — `fldQgqdiVPTMRfawj`
- `MMD Public Promo Consent Status` — `fldsD2K6T1UGyggvp`
- `MMD Public Promo Consent At` — `fld8M8tXWQsDpsouB`
- `MMD Public Promo Consent Version` — `fldbI0gUNjwtIUXd2`
- `MMD Public Promo Consent Revoked At` — `fld1A7uvWaJIhwjOg`
- `MMD Public Promo Consent Source` — `fldB5TqIGAOvF01uj`

The signed/submitted application payload may preserve the original explicit choice. Dedicated Airtable fields support later reviewed grant/revocation and audit. Blank legacy fields mean no consent.

## Separation from other MMD decisions

### Role authority

Applicant Requested Roles are claims. MMD Approved Public Roles remain service authority.

### Media authority

Consent does not approve a photo. MMD media review/Public-safe status remains required.

### Confidential work

A person may allow a public image and still receive confidential work. Confidential handling controls disclosure of a job; it is not automatic Private Money classification.

### Public and Private money

Image consent never changes `model_work_lane`.

- `public_model` may use approved Public package/payout rules.
- `private_model` remains case-priced and case-locked.
- `needs_review` fails closed.

## Customer-facing language

Recommended application copy:

> สะดวกให้คนที่ยังไม่เป็นสมาชิกเห็นรูปคุณใน `/profiles` ไหม? คุณเลือกได้เองและไม่กระทบผลสมัคร หากยินยอม MMD จะใช้เฉพาะรูปที่ผ่าน Public-safe review และแสดงเฉพาะบริการที่คุณยอมพร้อมกับ MMD อนุมัติแล้วเท่านั้น

Recommended existing-profile copy:

> รูปของคุณ คุณเป็นคนเลือกว่าจะให้ใครเห็น ยืนยัน Role ที่อนุญาตให้ใช้รูปสำหรับผู้ที่ยังไม่เป็นสมาชิก หรือขอถอนการแสดงรูปได้ที่ MMD Apply

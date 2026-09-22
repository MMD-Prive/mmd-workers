# MMD Public Profile Role Taxonomy V1

Status: Canonical draft for Public Profiles + Public Model Application  
Date: 2026-09-22

## Core principle

**เลือกบทบาทก่อน เลือกคนทีหลัง / Choose the role first, choose the person second.**

`/profiles` must never start by exposing the full public-model roster. A visitor first chooses a role/service context, then audience scope, and only then sees models explicitly approved by MMD for that role.

## Canonical public role keys

| key | TH display | purpose |
| --- | --- | --- |
| `everyday_companion` | เพื่อนคู่ใจ | Cafe, movie, shopping, everyday companion |
| `driver_companion` | คนขับรถหล่อ | Driver, pickup/drop-off, day trip |
| `culinary_companion` | เชฟหล่อ | Cooking, private dining, kitchen experience |
| `social_appearance` | คู่หูออกงาน | Dinner, event, social appearance |
| `bangkok_companion` | เพื่อนเที่ยวกรุงเทพ | Bangkok/local day companion |
| `sport_activity` | หนุ่มสายกีฬา | Running, sport, outdoor activity |
| `wellness_companion` | หนุ่มสายสุขภาพ | Wellness and fitness-oriented activity |
| `business_companion` | หนุ่มออฟฟิศ | Business dinner, meeting companion, smart casual |
| `nightlife_companion` | เพื่อนสายปาร์ตี้ | Night out, concert, celebration |
| `creative_companion` | เพื่อนสายศิลป์ | Gallery, music, photo walk, creative day |
| `medical_professional` | บุรุษทางการแพทย์ | Verified regulated/medical professional only |

`custom_brief` is a client intake route, not a model eligibility role. It routes to `/public/access?from=profiles&role=custom_brief`.

MMS / Male Massage is a separate product lane and routes to `/male-massage/home`. MMS therapists must not be merged into the Public Model roster.

## Applicant claim vs MMD authority

Applicant selection is never publication authority.

- `MMD Requested Public Roles`: applicant-declared capability/interests.
- `MMD Approved Public Roles`: MMD-reviewed authority used by the public catalog.
- `MMD Public Profile Approved`: explicit public publication gate.
- `MMD Public Booking Mode`: `curated`, `direct`, or `brief_only`.
- `MMD Credential Verification Status`: `not_required`, `pending`, `verified`, or `rejected`.
- `MMD Credential Review Notes`: internal only.

For `medical_professional`, the catalog must fail closed unless credential status is exactly `verified`.

## Public catalog eligibility

A model is eligible for `/profiles` only when all of the following are true:

1. application type is `public_model`;
2. review status is `accepted`;
3. intake status is `approved`;
4. `MMD Public Profile Approved` is true;
5. at least one valid `MMD Approved Public Role` exists;
6. at least one supported public customer gender exists;
7. the R2 image is in the public-safe folder policy;
8. regulated role rules pass, including credential verification where required.

No legacy R2 folder fallback may create role eligibility. No service role may be inferred from gender.

## Customer flow

`/profiles → Role → Audience → Eligible Models → Profile/Booking`

Gender/audience is a second-stage filter, not the service taxonomy.

Female-specific CTA routing may still use the BELIEVE flow where required by MMD policy.

## Application flow

`/apply/public-model` collects:

- identity/contact/profile basics;
- requested public roles (multi-select);
- audience/customer scope;
- experience and proof;
- boundaries and privacy;
- credential evidence when relevant;
- consent.

Submission stores requested roles. MMD review separately decides approved roles, booking mode, publication approval, and credential state.

## Authority by system

- **Airtable**: operational role/publication/credential authority.
- **GitHub / Workers**: validation, catalog contract, fail-closed behavior.
- **Webflow**: customer and applicant UI; never publication authority.
- **Google Drive**: human-readable canonical product/operations reference.
- **R2**: public-safe model media only; folder presence alone grants no eligibility.

## Safety locks

- Applicant-selected role never auto-publishes.
- Gender never implies service eligibility.
- Public image presence never implies profile eligibility.
- Medical/professional labels never imply credentials unless verified.
- Private notes, credentials, identity evidence, rates, payout, and internal review notes are never exposed by the public catalog.

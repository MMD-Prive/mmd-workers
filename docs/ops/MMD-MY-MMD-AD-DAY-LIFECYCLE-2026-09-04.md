# MMD Memory — My MMD Ad-Day Lifecycle Canon

Date: 2026-09-04
Status: implementation baseline for ad-day launch

## Goal

LINE/LIFF is the simplest customer entry into My MMD. After verified LINE identity, a customer must reach a customer-safe state instead of a member-not-found dead end.

## Lifecycle contract

`GET /api/member/app/dashboard` and `/api/member/app/membership` expose backend-owned lifecycle and next action:

- `active` — canonical member is active/grace; show verified tier/status, canonical Points/expiry when available; while CARE BACK is open, primary CTA may be `care_back_wish`.
- `expired` — canonical member is expired; primary CTA is `renew`.
- `new` — LINE identity is verified, no canonical Member exists, and no exact-LINE legacy signal indicates prior membership; return HTTP 200 and primary CTA `signup`.
- `checking` — identity/history needs review or only historical display evidence is available; no automatic signup/renew grant.

The browser renders `nextAction`; it does not choose lifecycle or infer the action.

## Legacy LINE OFC fallback

`LINE OFC Client Import Staging` may provide an exact verified `line_user_id` display fallback when canonical entitlement/member profile data is absent or incomplete.

Allowed display fields:

- `parsed_client_level`
- `parsed_membership_tier`
- `parsed_membership_status`
- `parse_confidence`

Rules:

1. Match by server-owned verified LINE user ID only.
2. Require exactly one staging match; zero, ambiguous, timeout, or malformed results fail neutral.
3. Legacy data is `displayOnly` and must never be labelled verified.
4. Legacy data cannot create, infer, widen, or promote entitlement, access, membership, Points, coupon, discount, payment truth, model visibility, or CARE BACK approval.
5. A prior-member legacy signal produces `checking`, not automatic `new` signup.
6. Points remain canonical Points Ledger only.

## CTA contract

- `signup` -> `/sigil/member/membership?source=line&intent=signup`
- `renew` -> `/sigil/member/membership?source=line&intent=renew`
- `care_back_wish` -> `/promotion/6-years-care-back/wish`
- `checking` / `none` -> no primary mutation CTA

CARE BACK wish/coupon rules remain independently backend-authoritative. `approved_discount_percent` is the only actual discount field surfaced to the customer.

## Authority

- LINE/LIFF session: identity authority.
- Canonical Member / Customer 360 / My MMD entitlement resolver: member truth.
- Points Ledger: Points truth.
- CARE BACK backend: campaign/coupon/extension/bonus authority.
- LINE OFC staging: historical display evidence only.
- Lovable: pixels/presentation only.
- GitHub/Cloudflare Workers: behavior/runtime/security.
- Webflow: fallback presentation only; not production My MMD owner.

## Ad-day smoke gate

Before calling the flow ready/live, verify four cohorts:

1. Active — verified tier/status + Points/expiry when present + CARE BACK CTA while eligible/open.
2. Expired — expired status + renew CTA.
3. New — LINE-verified non-member receives HTTP 200 + signup CTA, not 404/dead end.
4. Legacy-only — historical tier/status may display with `ข้อมูลเดิม · กำลังตรวจสอบ`; no verified label, signup inference, entitlement, or Points grant.

Automated/synthetic four-state tests are necessary but do not substitute for real production LIFF/account smoke. Production readiness claims require fresh deployment and production evidence.
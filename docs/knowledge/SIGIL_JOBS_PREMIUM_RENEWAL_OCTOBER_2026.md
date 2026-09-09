# SIGIL Jobs — Premium Renewal October 2026 Bonus

Status: canonical business-policy note for `/sigil/jobs` Assisted Renewal.

## Rule

For an **existing MMD member** who renews **Premium** and whose payment is **Official Verified between 1 October 2026 and 31 October 2026, Asia/Bangkok time**, grant an additional **365 days (1 year) free membership validity**.

Policy code:

`premium_existing_member_october_2026_bonus`

## Qualification authority

The browser and `/sigil/jobs` Job Create step do not decide final eligibility.

Final qualification requires:

- canonical member history proves the customer is an existing member;
- renewal package is Premium;
- Official Payment Verification timestamp is inside `2026-10-01T00:00:00+07:00` through `2026-10-31T23:59:59.999+07:00`;
- entitlement materialization remains under the canonical membership/payment resolver flow.

Until those conditions are verified, `/sigil/jobs` stores this only as a promotion candidate with `candidate_pending_official_verify`.

## Duration semantics

The promotion contributes **+365 bonus days** only. It does **not** redefine or hard-code the base Premium renewal duration. Base duration must come from the current canonical membership policy/resolver, and the bonus is added after qualification.

## Safety boundary

- Job creation must not activate membership.
- Browser hints must not prove existing-member status.
- Promotion bonus does not count as service spend, Base Points, or referral reward.
- Existing `membership_action_v1` money-truth separation remains unchanged.

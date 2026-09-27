# MY MMD Existing Member Verify +1 Year — Canonical Lock

Status: **CANONICAL / OWNER DECISION**  
Effective: **2026-09-28 Asia/Bangkok**  
Owner / final authority: **Per**

## Precedence

This lock restores the original MY MMD Existing Member Verify benefit and supersedes conflicting status-based Verify rules that granted +180 days, +90 days, or required a renewal/payment before an existing expired member could receive the Verify membership extension.

The customer-facing summary is canonical:

> กด Verify เพื่อรับสิทธิ์ต่ออายุสมาชิก 1 ปี ทั้งสมาชิกปัจจุบันและสมาชิกที่หมดอายุแล้ว เมื่อสมัครหรือต่ออายุอีกครั้ง ระบบจะรวมสิทธิ์ให้เป็น 2 ปี

This lock applies to the **Existing Member Verify benefit**. It does not rewrite separately priced Private Standard/Premium signup/renewal package terms or protected VIP/SVIP/Black Card recovery rules.

## Eligible identity

The benefit requires a canonical existing MMD member resolved by the verified LINE/LIFF identity.

For the automatic one-year write, the backend must resolve an existing Private Standard or Private Premium membership. Protected VIP/SVIP/Black Card entitlement recovery remains governed by its stronger protected-member policy and must not be downgraded or double-extended by this path.

Browser claims, customer-entered tier/status, display names, localStorage, URL parameters, and unverified chat text are never authority.

## Membership benefit

For an eligible existing member:

- Current / active / grace: add **1 calendar year (12 months)** from the real existing membership expiry.
- Former / expired: restore **1 calendar year (12 months)** from the successful canonical Verify date when no future canonical expiry exists.
- The benefit is **one-time and idempotent** for the exact canonical member/LINE identity.
- Repeated login or repeated Verify must not add another year.
- The canonical backend writes the resulting active-through date; the browser does not calculate or grant it.

## Relationship to later signup / renewal

The Verify year is an existing-member launch benefit. A later paid signup/renewal is a separate transaction and follows the package policy current at that time.

Do not erase or silently convert a previously applied Verify year when processing a later paid membership transaction. The membership owner must calculate the later term from the canonical resulting active-through according to the approved package policy.

## Points, coupon, payment, and access boundaries

Existing Member Verify +1Y:

- **does grant** the one-year membership extension through the canonical backend owner;
- **does not** grant Points by itself;
- **does not** verify or approve payment;
- **does not** unlock a CARE BACK coupon without its own Wish/coupon rules;
- **does not** grant VIP, SVIP, Black Card, Red Card, private Model access beyond the membership entitlement being restored;
- **does not** turn historical payment evidence into current payment truth.

Historical Points may still be reconstructed from MMD-owned LINE Official / Per Notes evidence under the separate Points policy.

## Runtime contract

MY MMD Verify flow:

1. LINE ID token is verified server-side.
2. Canonical existing member is resolved from the exact LINE identity.
3. The membership owner applies or returns the idempotent MY_MMD_EXISTING_VERIFY_1Y benefit.
4. Standard/Premium member package and entitlement truth are materialized server-side.
5. MY MMD session receives only the bounded result, including resulting active_through.
6. A second Verify sees the same applied benefit and must not extend again.

If the canonical benefit write cannot be completed safely, the Verify completion must fail closed rather than representing the one-year benefit as applied.

## Migration rule

Any **pending, unapplied** Existing Member Verify benefit request still carrying a 180-day or 90-day duration must be migrated to:

- requested_extension_days = 365 for compatibility fields;
- requested_extension_months = 12;
- policy MY_MMD_EXISTING_VERIFY_1Y.

Already-applied historical records are evidence and must not be rewritten merely to make old data resemble the new policy.

## Separate policies that remain intact

These are not deleted by this lock:

- Private Standard base term: 1 year.
- Private Premium base term: 2 years.
- Tier-specific paid signup/renewal CARE BACK bonuses, where currently approved.
- Protected VIP/SVIP/Black Card Fast Trust / entitlement recovery.
- Coupon Wish gate and discount matrix.
- Points verification/reconstruction policy.

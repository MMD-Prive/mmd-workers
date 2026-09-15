# MMD Payment Proof Smart Topic Routing v1

Payment proof notifications are operational routing only. They never create money truth, membership, points, booking confirmation, or access.

## Canonical routing

- Explicit Membership / Renewal proof -> `MMD • Payments (Membership)` thread `20`.
- Explicit service payment (`deposit`, `final`, `balance`, `tips`, `full`, booking/service fee) -> `MMD • Payments (Confirm)` thread `22`.
- Amount-only membership-price matches without membership context remain in thread `22` until context is confirmed.
- Conflicting service + membership context, or a membership amount/package mismatch, remains in thread `22` and additionally alerts `MMD • Alerts` thread `9`.
- Official Verify remains mandatory before any entitlement mutation.

## Channel coverage

The same classifier policy applies to web payment-proof intake and MMD LINE OFC payment-proof capture.

LINE context may establish a Membership / Renewal route from explicit customer language such as membership or renewal wording. A generic transfer/slip message does not become Membership solely because the amount happens to match a membership price.

## Authority boundary

Telegram is notification only. `mmd_payment_ops_route_v1` may select an operations inbox, but `may_activate_membership` remains false. Membership materialization continues through the canonical payments-worker Official Verify and My MMD Entitlement Resolver flow.

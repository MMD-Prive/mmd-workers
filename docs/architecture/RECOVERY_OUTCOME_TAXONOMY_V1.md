# MMD Recovery Outcome Taxonomy V1

Version: `mmd-recovery-outcome-taxonomy-v1-20260919`

## Purpose

This taxonomy gives MMD Shop, Booking/Job and MMS recovery cases one bounded outcome language while preserving existing business-truth authorities.

A Recovery Case has two separate dimensions:

1. **Lifecycle state** — `prepared → sent → acknowledged → reviewing → resolved → customer_notified`
2. **Recovery outcome** — the bounded result recorded by an allowed operator/owner

An outcome never replaces Order, Payment, Fulfillment, Job, Calendar, Therapist, MMS booking, membership or entitlement truth.

## Domains

- `mmd_shop`
- `booking`
- `mms`
- `unclassified` until the lane can be grounded

## Shared outcomes

Non-terminal:

- `intake_received`
- `awaiting_customer`
- `awaiting_operations`

Terminal:

- `information_confirmed`
- `no_adjustment_required`
- `closed_duplicate`
- `closed_withdrawn`

## MMD Shop terminal outcomes

- `replacement_arranged`
- `reshipment_arranged`
- `refund_route_opened`

`refund_route_opened` records that recovery routed/opened the refund process. It does not assert that a refund was approved, paid or completed.

## Booking terminal outcomes

- `rebooking_arranged`
- `schedule_adjustment_arranged`
- `service_credit_route_opened`

## MMS terminal outcomes

- `therapist_replacement_arranged`
- `rebooking_arranged`
- `service_adjustment_arranged`
- `service_credit_route_opened`

## Authority locks

- A Recovery Case cannot enter `resolved` or `customer_notified` without a valid terminal outcome for its domain.
- Terminal outcomes require an explicit allowed operator/owner write.
- HYPE may preserve and display the written state/outcome but cannot infer a final outcome from chat.
- HENNA may intake MMS recovery and preserve context, but it does not invent or write final outcome state from MMS chat.
- The taxonomy intentionally excludes `refund_completed`, `payment_confirmed`, `delivered`, and similar protected-truth completion claims.
- Every recovery mutation stores `business_truth_mutated=false`.

## Shop Order picker lock

When Shop recovery has multiple eligible recent owned Orders:

1. the Case Reference is created/preserved before Order selection;
2. the customer sees at most five customer-safe options;
3. Telegram callback data carries only Case Reference + option index;
4. admin-worker resolves that stored option and re-checks exact ownership against canonical Shop authority;
5. a selected Order is bound to the existing Case Reference;
6. the current handoff lifecycle state is preserved;
7. Order, Payment and Fulfillment records are not mutated.

This prevents both guessing and client-controlled foreign Order IDs.

# Phase 3 — Analytics Canon + Owner Dashboard

Status: CANON LOCKED / DASHBOARD WRITE BLOCKED BY CONNECTOR SCOPE

## 1. Canon rules

MMD uses browser events for intent and server authority events for completed business facts.

Do not emit duplicate synonyms:
- `booking_submitted` is deprecated. Canon = `booking_received`.
- `payment_completed` is deprecated. Canon = `payment_verified`.

Canonical schema: `mmd_analytics_canon_v1`.

## 2. Owner funnels

### Public → Booking → Payment
1. `profile_viewed`
2. `booking_started`
3. `booking_received`
4. `payment_started`
5. `payment_verified`

### Membership
1. `$pageview` route contains `/member/membership`
2. `payment_started` with `flow=membership` when available
3. `payment_verified` with `flow=membership` when available
4. `membership_activated`

### MY MMD
1. `$pageview` route contains `/member/login`
2. `my_mmd_session_started`

### MMS
1. `$pageview` route contains `/male-massage/home`
2. `mms_prebooking_received`
3. `payment_started` with `flow=mms` when available
4. `payment_verified` with `flow=mms` when available

### Shop
1. `$pageview` route contains `/mmd-shop`
2. `shop_order_created`
3. `payment_started` with `flow=shop` when available
4. `payment_verified` with `flow=shop` when available

### Partner
1. `$pageview` route contains `/partner/referral`
2. `partner_terms_accepted`

## 3. Owner Dashboard tiles

Create one dashboard named **MMD Owner — Conversion & Revenue** with:
- Public → Booking → Payment funnel
- Membership funnel
- MY MMD login-to-session funnel
- MMS funnel
- Shop funnel
- Partner funnel
- payment_verified count, sum(amount_thb), and trend
- membership_activated trend
- analytics_runtime_health by authority
- top conversion routes
- 7d vs previous 7d conversion comparison

Default dashboard window: 30 days.
Operational comparison: last 7 days vs previous 7 days.

## 4. Current production baseline observed 2026-09-22

Observed funnel:
- profile_viewed: 5
- booking_started: 1
- payment_started: 0

The server authorities currently reporting `analytics_runtime_health` are:
- sigil-booking-worker
- mms-worker
- payments-worker
- partners-worker
- himai-chat-worker
- member-pages-worker

Authority conversion events are wired in code, but may not appear in the recent event taxonomy until a matching production action occurs.

## 5. Acceptance

Phase 3 is CLOSED only when:
- all six funnels can be executed against production data;
- no deprecated duplicate conversion names are emitted;
- the Owner Dashboard exists in PostHog and refreshes from production;
- at least one real production event is observed for each authority completion event when the corresponding business action occurs;
- dashboard write access is available to the automation/connector used for setup.

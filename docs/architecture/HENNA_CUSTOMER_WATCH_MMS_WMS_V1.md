# HENNA Customer Watch · MMS / WMS V1

**Status:** OWNER-AUTHORIZED PHASE 1  
**Date:** 2026-10-01  
**Owner / final authority:** Per  
**Runtime truth:** `mms-worker`

## Purpose

HENNA now watches customer activity entering the MMS LINE ingress and raises privacy-safe Telegram operating signals for both:

- **MMS** — the default Male Massage customer lane.
- **WMS** — the explicit Women Massage lane represented by the current `women_massage` service inside `mms-worker`.

WMS is **not** introduced as a second source of truth or a separate worker in this phase.

## Flow

```
LINE OA · MMS
  -> /webhooks/line/mms
  -> member-dashboard-chat-worker
  -> HENNA Customer Watch observer
  -> telegram-worker
  -> existing Alerts destination
  -> Per / authorized operator review when needed
```

Customer-facing replies continue through the existing MMS LINE runtime. The watcher is an internal notification observer only.

## WMS classification

HENNA may label an event `WMS` only when the current customer message/postback explicitly indicates Women Massage / female recipient context.

HENNA must not infer WMS from:

- display name
- profile photo
- historical gender assumptions
- prior bookings
- inferred orientation or preference

Without an explicit WMS signal, the lane remains `MMS`.

## Signals

Phase 1 emits only meaningful operating signals:

- `booking_interest`
- `therapist_options`
- `wms_interest`
- `service_interest`
- `live_truth_request`
- `human_handoff`
- `service_recovery`

Greeting-only or unrelated text is not mirrored into Telegram.

## Privacy contract

Telegram Customer Watch notifications contain no raw customer message and no raw LINE user ID.

Only bounded metadata is sent:

- lane
- signal
- priority
- language
- hashed customer reference
- hashed event reference
- source
- operating mode
- truth authority marker

## Truth and mutation boundary

HENNA Customer Watch is notification-only.

It must never independently:

- confirm a Therapist or booking
- state live availability
- invent or approve a price
- mark payment confirmed
- resolve a recovery case
- issue refund/rebooking/service credit
- modify membership/access
- mutate canonical MMS/WMS records

Every notification records `business_truth_mutated=false`.

For current operational truth, use `mms-worker` and the owning backend contract. Per remains final authority where owner judgment is required.

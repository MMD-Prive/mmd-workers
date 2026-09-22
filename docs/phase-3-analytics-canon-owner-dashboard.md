# Phase 3B — Analytics Canon + Owner Dashboard

Status: **MMD OWNER DASHBOARD IMPLEMENTED / POSTHOG-NATIVE WRITE MIRROR BLOCKED BY CONNECTOR SCOPE**

Canonical analytics schema: `mmd_analytics_canon_v2`.

## 1. Identity rule

MMD analytics has two deliberately separate identity layers.

### Intent

Browser/client events use the PostHog client-person identity.

Examples:
- `profile_viewed`
- `booking_started`
- `payment_started`
- `my_mmd_login_started`
- route `$pageview`

Person funnels are allowed only inside this layer when the steps share the same client identity.

### Business Truth

Server authority events use a record/session-scoped hashed authority identity.

Examples:
- `booking_received`
- `payment_verified`
- `membership_activated`
- `my_mmd_session_started`
- `mms_prebooking_received`
- `shop_order_created`
- `partner_terms_accepted`

These are the source of truth for completed business facts.

**Do not calculate a person conversion rate across Intent and Business Truth.** Their distinct IDs are intentionally different. Until an explicit privacy-safe correlation key exists, cross-layer comparison is volume/trend only and must not be labelled a conversion rate.

## 2. Six canonical lanes

### Public → Booking

Intent:
1. `profile_viewed`
2. `booking_started`

Business Truth:
- `booking_received` · `flow=booking_intake`
- `payment_verified` · `flow=booking_payment`

### Membership

Intent routes:
- `/member/membership`
- `/pay/membership`

Business Truth:
- `payment_verified` · `flow=membership_payment`
- `membership_activated` · `flow=membership_activation`

### MY MMD

Intent:
- `/member/login`
- `my_mmd_login_started`

Business Truth:
- `my_mmd_session_started` · `flow=my_mmd_login`

### MMS

Intent routes:
- `/male-massage/home`
- `/male-massage/member/mms-booking`

Business Truth:
- `mms_prebooking_received` · `flow=mms_prebooking`
- `payment_verified` · `flow=mms_payment`

### Shop

Intent routes:
- `/mmd-shop`
- `/shop`
- `/mmd-shop/order`

Business Truth:
- `shop_order_created` · `flow=shop_checkout`
- `payment_verified` · `flow=shop_payment`

### Partner

Intent routes:
- `/partner`
- `/partner/terms`

Business Truth:
- `partner_terms_accepted` · `flow=partner_onboarding`

## 3. MMD Owner Dashboard

Canonical surface: `/internal/admin/control-room`.

Authenticated data route:
`GET /v1/admin/dashboard/analytics`.

The Control Room presents three explicit sections:

1. **Intent** — client-side entry and intent volumes.
2. **Business Truth** — server-authority completion counts and verified revenue.
3. **Authority Health** — `analytics_runtime_health` for the six production authorities.

The endpoint is read-only. It never mutates Payment, Membership, Job, entitlement, Shop, Partner, or analytics source data.

Runtime rules:
- missing/unobserved event = `null` / UI `—`, never fabricated `0`;
- the PostHog project ingest token is never used as a read credential;
- read access comes only from backend `POSTHOG_READ_API_KEY` or `POSTHOG_PERSONAL_API_KEY`;
- if a read credential is unavailable, endpoint state = `read_scope_missing`;
- browser receives aggregate metrics only and never receives the PostHog credential.

Default window: 30 days.
Comparison window: current 7 days vs previous 7 days.

## 4. Current production baseline observed on 22 Sep 2026

Recent PostHog data observed during Phase 3B:

| Event | Events (30d) | People | Notes |
|---|---:|---:|---|
| `profile_viewed` | 7 | 6 | client intent |
| `booking_started` | 5 | 3 | client intent |
| `payment_started` | 7 | 7 | global client intent; not yet lane-safe |
| `my_mmd_login_started` | 14 | 14 | client intent |
| `my_mmd_session_started` | 7 | 7 | server authority identity |

Validated client-only person funnel:
- `profile_viewed → booking_started`: 6 → 1 people, 16.67% conversion.
- average and median conversion time observed: 2m 14s.

A test query of `my_mmd_login_started → my_mmd_session_started` returned 14 → 0 matched people even though seven session events exist. This is expected evidence of the separate identity namespaces and **must not be interpreted as a 0% MY MMD success rate**.

At Phase 3B construction time, the following authority completion events had not yet occurred in the recent PostHog taxonomy:
- `booking_received`
- `payment_verified`
- `membership_activated`
- `mms_prebooking_received`
- `shop_order_created`
- `partner_terms_accepted`

They remain `—` until a real corresponding production action occurs. Synthetic business transactions are not created to populate the dashboard.

Operational analytics health was observed from all six required authorities:
- `sigil-booking-worker`
- `payments-worker`
- `member-pages-worker`
- `mms-worker`
- `himai-chat-worker`
- `partners-worker`

## 5. PostHog-native mirror

The connected PostHog integration currently has read/query access but lacks:
- `dashboard:write`
- `insight:write`
- `data_catalog:write` / `data_catalog:read` where saved catalog metrics are desired.

Therefore the canonical Owner Dashboard is implemented in MMD Control Room first.

When those PostHog scopes are granted, create/mirror one native dashboard named:

**MMD Owner — Intent & Business Truth**

It must preserve the same identity separation and must not introduce a mixed client/server person funnel.

## 6. Acceptance

Phase 3B Control Room implementation is accepted when:
- canon v2 tests pass;
- `/v1/admin/dashboard/analytics` is authenticated and fail-closed;
- unauthenticated access remains 401;
- Control Room renders Intent, Business Truth, and Authority Health separately;
- unobserved truth events render `—`, not zero;
- no cross-layer person conversion is computed;
- production deploy/smoke passes.

The PostHog-native mirror remains a separate scope-dependent acceptance item and does not change MMD business truth.

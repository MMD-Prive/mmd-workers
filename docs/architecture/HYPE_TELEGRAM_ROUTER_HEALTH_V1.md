# HYPE Telegram Router Health V1

Status: **ACTIVE CANONICAL CONTRACT**

Owner: **telegram-worker**

Purpose: give HYPE and Owner Control Room one read-only view of Telegram notification routing health without turning Telegram into business-truth authority.

## Authority lock

Telegram is downstream notification transport only.

It never creates or widens:

- payment truth;
- Membership / Entitlement;
- Points;
- Booking / Session truth;
- Model availability;
- VIP / SVIP / Black Card;
- Coupon or discount authority.

Canonical owners remain unchanged:

- Money Truth → `payments-worker`
- Entitlement → `my_mmd_entitlement_resolver_v1`
- Booking / Session → canonical booking / events / admin runtime
- Telegram route owner → `telegram-worker`

## Canonical route registry

| Lane | Source worker(s) | Canonical topic | Current thread | Fallback | Migration state |
|---|---|---:|---:|---|---|
| Booking / draft | sigil-booking-worker, events-worker, admin-worker | booking | 1399 | alerts | canonical internal send |
| Membership / renewal | member-dashboard-chat-worker, payments-worker, admin-worker | membership | 20 | alerts | canonical internal send |
| Payment proof / verified | member-dashboard-chat-worker, payments-worker, admin-worker | payment | 22 | alerts | canonical internal send |
| Points | payments-worker, member-pages-worker | points | 17 | alerts | canonical registry |
| System / auth / recovery incidents | admin-worker, member-dashboard-chat-worker, auth/studio | alerts | 9 | none | canonical registry |
| Public Model applications | sigil-worker, partners-worker | public_model | 155 | alerts | canonical internal send |
| MMS Therapist applications | mms-worker | public_model (shared) | 155 | alerts | canonical internal send |
| MMS operational handoff | mms-worker | alerts | 9 | none | canonical internal send |
| Partner confirmation/review | partners-worker | partner | 61 | alerts | canonical internal send |
| CARE BACK / Membership Ops | member-pages-worker, admin-worker | membership | 20 | alerts | canonical registry |
| HIMAI orders | himai-chat-worker | himai_orders | 157 | himai_alerts | canonical internal send |
| HIMAI payments | himai-chat-worker, payments-worker | himai_payments | 158 | himai_alerts | canonical internal send |
| HIMAI alerts | himai-chat-worker | himai_alerts | 159 | alerts | canonical internal send |
| MMD Shop orders | himai-chat-worker | mmd_shop_orders | 160 | mmd_shop_alerts | canonical internal send |
| MMD Shop payments | payments-worker, himai-chat-worker | mmd_shop_payments | 161 | mmd_shop_alerts | canonical internal send |
| MMD Shop alerts | himai-chat-worker | mmd_shop_alerts | 162 | alerts | canonical internal send |
| Model rules | telegram/member dashboard | rules_model | 39 | alerts | canonical registry |
| Customer rules | telegram/member dashboard | rules_customer | 29 | alerts | canonical registry |
| Legacy/system archive | telegram/migration | legacy_archive | 134 | alerts | canonical registry |

Thread IDs are internal routing configuration. Owner Summary / Control Room projections expose readiness and topic labels, not raw destination IDs.

## Health states

### configured

- Telegram bot credential configured;
- Ops chat configured;
- webhook secret configured;
- internal service authentication configured;
- every migrated domain lane has its required service credential configured;
- every required canonical topic destination configured;
- no degraded live probe;
- no remaining lane flagged as legacy/direct bypass.

### partial

Canonical transport is usable, but at least one lane still has a legacy/direct sender outside the unified internal-send route.

`partial` is a governance / observability condition. It does **not** imply the message failed.

### degraded

At least one core transport requirement is missing or a live read-only Telegram probe fails:

- bot unavailable;
- Ops chat unavailable;
- webhook secret unavailable;
- internal auth unavailable;
- a migrated lane service credential unavailable;
- canonical topic destination unavailable;
- canonical webhook mismatch / Telegram API probe failure.

## Runtime diagnostic

Internal authenticated endpoint:

`GET /telegram/internal/router/health`

Alias:

`GET /v1/internal/router/health`

Optional:

`?probe=1`

The live probe calls Telegram `getMe` and `getWebhookInfo` only. It sends no message and performs no business mutation.

Response deliberately omits raw:

- bot tokens;
- service credentials;
- chat IDs;
- thread IDs;
- customer/member identifiers.

## Control Room

`admin-worker` reads the router diagnostic through the `TELEGRAM_ROUTER` service binding.

`GET /v1/admin/dashboard` now projects bounded `telegram_router_health` and derives the existing Telegram system status from that projection instead of assuming Telegram is always ready.

Control Room marker:

`x-mmd-control-room-telegram-status: unified-router-health-v1-read-only`

## HYPE Owner Summary

Private Owner Summary includes:

- Telegram Router Health
- configured / partial / unavailable lane counts
- remaining legacy direct sender count
- bounded causes
- Incident Root-Cause Digest

No destination IDs are shown.

## Incident Root-Cause Digest

Schema:

`mmd.hype_incident_root_cause_digest.v1`

Inputs:

- Payment Observer Health
- Telegram Router Health
- Recovery Queue operational metadata

Examples:

### Silence + healthy/partial Telegram

Diagnosis favors LINE payment ingress / classification.

Telegram being usable does not explain why accepted Payment Proofs stopped appearing.

### Silence + extractor degradation

Extractor degradation outranks silence because it is stronger causal evidence.

### Durable outbox terminal failures + degraded Telegram Router

Diagnosis favors Telegram delivery chain.

Notification retry still cannot rerun `payments-worker` or create Money Truth.

### Router partial

`partial` is reserved for a future explicitly-declared migration/bypass state. The current active runtime registry is expected to have zero legacy direct senders.

### Recovery overdue

Reported as operational queue pressure only.

## Active runtime sender migration

Migration is complete for the production sender paths declared by this registry:

- `mms-worker` — Therapist applications and HENNA manual/recovery handoff;
- `sigil-worker` — Public Model application notifications;
- `partners-worker` — Partner requests, review/approval, terms acceptance, job response, and Public Model application notifications;
- `himai-chat-worker` — HIMAI and MMD Shop orders/payments/alerts;
- `payments-worker` — Payment, slip-evidence, confirmation, Points, and MMD Shop payment notifications.

Each migrated runtime uses a `TELEGRAM_WORKER` service binding and a domain-scoped `AUTH_SERVICE_*_TO_TELEGRAM` credential. Production deploy workflows rotate/provision both ends of the credential.

An active-runtime CI guard fails if any declared sender path reintroduces a direct `api.telegram.org/bot...` call.

The following are outside this business-notification registry and do not change the configured state:

- deployment/CI notification helpers;
- explicitly separate owner-only follow-up automation using its own bot;
- archived/inactive source copies;
- legacy staging/Netlify code that is not the canonical production LINE payment ingress.

If one of those paths is promoted into a canonical business-notification lane later, it must first be added to this registry and migrated to `telegram-worker`.

## Production closure gate

A fully unified release is accepted only when:

1. all declared active sender files pass the no-direct-Bot-API guard;
2. every migrated worker has a `TELEGRAM_WORKER` binding;
3. every domain service credential is provisioned on both sender and `telegram-worker`;
4. Router Health reports `status=configured`, `partial=0`, `unavailable=0`, and `legacy_direct_senders=0`;
5. `?probe=1` confirms Telegram Bot API reachability and canonical webhook state;
6. HYPE closed-loop production smoke still reports business-truth mutation `NONE`.

The router registry remains an observability/governance contract; it is never permission to change business authority.

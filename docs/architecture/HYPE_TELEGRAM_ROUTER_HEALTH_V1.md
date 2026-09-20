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
| Public Model applications | sigil-worker | public_model | 155 | alerts | legacy direct sender remains |
| MMS Therapist applications | mms-worker | public_model (shared) | 155 | alerts | legacy direct sender remains |
| MMS operational handoff | mms-worker | alerts | 9 | none | legacy direct sender remains |
| Partner confirmation/review | partners-worker | partner | 61 | alerts | legacy direct sender remains |
| CARE BACK / Membership Ops | member-pages-worker, admin-worker | membership | 20 | alerts | canonical registry |
| HIMAI orders | himai-chat-worker | himai_orders | 157 | himai_alerts | legacy direct sender remains |
| HIMAI payments | himai-chat-worker, payments-worker | himai_payments | 158 | himai_alerts | legacy direct sender remains |
| HIMAI alerts | himai-chat-worker | himai_alerts | 159 | alerts | legacy direct sender remains |
| MMD Shop orders | himai-chat-worker | mmd_shop_orders | 160 | mmd_shop_alerts | legacy direct sender remains |
| MMD Shop payments | payments-worker, himai-chat-worker | mmd_shop_payments | 161 | mmd_shop_alerts | legacy direct sender remains |
| MMD Shop alerts | himai-chat-worker | mmd_shop_alerts | 162 | alerts | legacy direct sender remains |
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

### Router partial only because of legacy direct senders

This is governance attention, not a payment/business incident.

### Recovery overdue

Reported as operational queue pressure only.

## Legacy sender migration

Current registry intentionally reports these as migration-required while direct Bot API paths remain:

- `mms-worker`
- `sigil-worker`
- `himai-chat-worker`
- legacy helpers in `payments-worker`

Do not claim full unified routing until each active sender is migrated to the canonical `telegram-worker` internal-send contract or formally retired.

The router registry is the migration checklist; it is not permission to change business authority.

# Cal.com Scheduling Bridge V1 — 2026-09-14

## Decision

Cal.com is a scheduling engine, not MMD business truth.

MMD keeps ownership of:
- canonical Client identity
- Job / Session lifecycle
- membership and entitlement
- payments, deposits, credit, refunds and payout
- MY MMD history
- model / therapist business assignment

Cal.com may own:
- availability
- calendar slots
- booking time windows
- reschedule / cancel of calendar slots
- calendar reminders

## V1 safety rule

V1 runs in `CAL_SHADOW_MODE=true`.

The worker may receive and verify Cal.com webhooks and normalize scheduling events, but it MUST NOT mutate canonical Sessions, payments, membership, credits or model assignment until the mapping contract is approved.

This preserves repository production truth: `events-worker` remains session lifecycle truth and Airtable remains back-office truth.

## Worker

`cal-sync-worker`

Endpoints:
- `GET /health`
- `POST /webhooks/cal`

Required secrets:
- `CAL_WEBHOOK_SECRET`
- `CAL_API_KEY` (reserved for outbound Cal API operations; not needed for inbound-only shadow verification)

Required vars:
- `MMD_TIMEZONE=Asia/Bangkok`
- `CAL_SHADOW_MODE=true`

## Cal.com webhook setup

Create a webhook in Cal.com pointing to the deployed worker endpoint:

`https://<cal-sync-worker-host>/webhooks/cal`

Initial trigger set:
- `BOOKING_CREATED`
- `BOOKING_RESCHEDULED`
- `BOOKING_CANCELLED`
- `BOOKING_CONFIRMED`
- `BOOKING_REJECTED`
- `BOOKING_NO_SHOW_UPDATED`

Use a dedicated webhook secret. The same value must be provisioned to Cloudflare as `CAL_WEBHOOK_SECRET`.

## ChatGPT / Codex MCP setup

Cal.com hosted MCP endpoint:

`https://mcp.cal.com/mcp`

In ChatGPT, enable Developer mode and add a custom connector using the hosted MCP URL, then complete Cal.com OAuth authorization. No Cal.com API key should be pasted into ChatGPT for the hosted OAuth flow.

## MMD account setup order

1. Confirm Cal.com account timezone is `Asia/Bangkok`.
2. Connect the operational calendar(s) used for conflict checking.
3. Create or normalize schedules for MMD operators / models / therapists that will expose availability.
4. Create private/internal event types first. Do not expose public booking pages yet.
5. Connect the hosted MCP endpoint to ChatGPT / Codex and authorize OAuth.
6. Deploy `cal-sync-worker` in shadow mode.
7. Configure webhook URL + secret in Cal.com.
8. Run webhook smoke cases: create, reschedule and cancel a test booking.
9. Verify shadow events arrive without mutating canonical MMD data.
10. Only after mapping approval, implement outbound booking and Session lifecycle synchronization.

## Proposed canonical mapping for V2

Every Cal booking synchronized to MMD should carry non-sensitive metadata references where supported:
- `mmd_session_id`
- `mmd_job_id`
- `canonical_client_id`
- `model_id` or `therapist_id`
- `service_lane` (`public`, `private`, `mms`, etc.)

Do not place payment proof, private photos, secrets, LINE tokens or raw sensitive client notes into Cal metadata.

## Lifecycle intent for V2

Cal event -> cal-sync-worker -> explicit mapping validation -> events-worker -> Airtable / downstream surfaces.

Examples:
- Cal booking created: attach scheduling reference to an existing approved MMD Session, or create only through an approved MMD command path.
- Cal rescheduled: update Session schedule only after canonical mapping succeeds.
- Cal cancelled: do not decide money/credit policy in Cal; call MMD cancellation policy and preserve deposit / credit rules there.
- No-show: feed status into MMD lifecycle policy rather than directly mutating payments.

## Rollout gate

Do not change `CAL_SHADOW_MODE` to `false` until all are true:
- event type IDs/slugs are mapped
- Session mapping is deterministic
- duplicate webhook idempotency exists
- reschedule chain behavior is tested
- cancellation policy is delegated to MMD
- Telegram / admin observability is wired
- production smoke test succeeds

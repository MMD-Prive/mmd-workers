# MMD Internal Hold on Model Confirm v1

Date: 2026-09-14

## Trigger

Canonical trigger is a successful `POST /v1/model/session/action` with `action=accept_job` whose resulting MMD model session state is `confirmed`.

The canonical MMD confirmation is committed first. Failure to project the hold into Cal.com must never roll back, rewrite, or weaken MMD Session truth.

## Hold creation

After confirmation, `admin-worker` reads the canonical Session row and creates a booking using Cal.com event type `7057823` (`MMD Internal Hold`) only when:

- the model state is confirmed/accepted/acknowledged/ready;
- start and end time are valid;
- the deposit is not already verified;
- there is no existing Cal booking UID mapped to the MMD `session_id`.

Cal.com is explicitly allowed to create this internal projection outside the public scheduling window and alongside unrelated MMD model jobs. Same-model overlap remains an MMD conflict rule, not a central Cal host-calendar rule.

## Metadata contract

Every newly-created hold carries these Cal metadata keys from its first API call:

- `session_id`
- `job_id`
- `source=mmd_model_confirm`
- `hold_kind=internal_hold`

Do not place client identity, contact data, entitlement data, payment proof, or pricing truth in Cal metadata.

## Identity ledger

On successful Cal creation, `admin-worker` immediately writes the external booking identity to `MMD — Cal Booking Links` (`tbl6saWYEQrEdnMIK`). The Cal webhook may later update the same external identity context, but neither path owns MMD Session, Payment, Membership, Client, pricing, cancellation, or entitlement truth.

## Runtime configuration

Required on production `admin-worker`:

- `AIRTABLE_API_KEY` (already canonical admin dependency)
- `CAL_API_KEY` as a Cloudflare Worker secret

Optional overrides:

- `CAL_INTERNAL_HOLD_EVENT_TYPE_ID` (defaults to `7057823`)
- `CAL_INTERNAL_ATTENDEE_NAME` (defaults to `MMD Privé Internal Hold`)
- `CAL_INTERNAL_ATTENDEE_EMAIL` (defaults to the current MMD Cal account)
- `MMD_TIMEZONE` (defaults to `Asia/Bangkok`)

Cal API requests use API v2 with `cal-api-version: 2026-02-25`.


## Production live-write ownership — 2026-09-20

Outbound Internal Hold creation is now owned by `cal-sync-worker`, not by the browser and not by a direct Cal call from the admin presentation layer.

Production command path:

`Model Confirm -> admin-worker -> CAL_SYNC_WORKER service binding -> /internal/holds/ensure -> CalInternalHoldCoordinator -> Cal API -> MMD — Cal Booking Links`

Safety locks:

- `CAL_SHADOW_MODE=true` remains unchanged for inbound Cal webhook lifecycle handling.
- `CAL_INTERNAL_HOLD_WRITE_ENABLED=true` authorizes only MMD Internal Hold creation/linking.
- No public Worker route exposes `/internal/holds/*`; the hostname gate is `cal-sync.internal`.
- The Durable Object coordinator serializes by canonical `session_id` and prevents concurrent duplicate creation.
- A 15-minute scheduled reconciler self-heals future confirmed/unpaid Sessions that remain unlinked.
- `payments-worker`/Payments verification remains the deposit authority. Verified deposits are skipped.
- Past/started, unconfirmed, unsupported-duration, or ambiguous sessions fail closed.
- Cal cancellation/reschedule/payment signals do not mutate MMD Session, Payment, Client, Membership, pricing, credit, or cancellation truth.
- Owner reconciliation is exposed only behind the existing credential-bound admin gate at `/v1/admin/calendar/reconcile`.
- `GET /v1/admin/calendar/reconcile` previews bounded candidates; `POST` reconciles the bounded queue, or targets exactly one Session when `session_id` is supplied.
- Production live-write verification uses `Calendar Live Write Smoke`, creates a uniquely named future fixture, verifies the Cal UID and ledger mapping, then cancels the Cal booking and deletes all smoke fixture records.

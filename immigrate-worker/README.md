# immigrate-worker

Migration-layer worker for bringing legacy LINE Official data into the canonical MMD system.

This worker is part of the Migration Layer only. It ingests legacy LINE identity data, preserves migration traceability, and can promote into canonical Airtable records without redefining core production truth.

## What this worker does

- accepts LINE legacy intake payloads
- infers membership hints from nickname + legacy tags
- preserves raw migration trace through `admin-worker` inbox writer
- links to an existing canonical member/client when found
- creates a canonical member only when no safe match exists

## Safety rules

- do not overwrite canonical records without a safe match
- preserve raw source data for audit
- LINE legacy data is migration input, not source of truth
- do not move core business logic into `immigrate-worker`
- membership hints inferred from LINE legacy data must remain traceable migration metadata unless promoted by canonical logic
- LINE legacy inferred membership, tier, and member-since values are migration hints only
- LINE legacy hints do not grant entitlement, access, tier, or canonical member status automatically
- canonical promotion requires safe match logic or admin/canonical system review

## Current endpoints

### `GET /ping`
Health check.

### `POST /v1/immigrate/line/preview`
Preview normalized LINE legacy inference without writing to Airtable.

### `POST /v1/immigrate/line/intake`
Run the full LINE legacy intake flow:
1. normalize legacy tags and nickname signals
2. write inbox trace to `admin-worker`
3. lookup canonical member/client by LINE ID, email, or phone
4. link to the existing canonical record when a safe match exists
5. create a canonical member/client only when no safe match exists

This endpoint requires write authentication with one of:
- `Authorization: Bearer <INTERNAL_TOKEN>`
- `X-Internal-Token: <INTERNAL_TOKEN>`
- `X-Confirm-Key: <CONFIRM_KEY>`

## Canonical routes

- `GET /ping`
- `GET /v1/immigrate/health`
- `POST /v1/immigrate/line/preview`
- `POST /v1/immigrate/line/intake`
- `GET /v1/immigrate/line-inbox`
- `POST /v1/immigrate/line-inbox/refresh-status`
- `POST /v1/immigrate/line-inbox/sync-airtable`
- `POST /v1/immigration/intake`
- `POST /v1/immigration/promote`
- `GET /v1/immigration/:id`

## Control Room compatibility routes

- `GET /internal/admin/control-room/health`
- `GET /internal/admin/control-room/line-inbox`
- `POST /internal/admin/control-room/refresh-status`
- `POST /internal/admin/control-room/sync-airtable`
- `GET /internal/admin/control-room/logs`
- `GET /internal/admin/control-room/sessions/live`
- `POST /internal/admin/control-room/sessions/refresh`
- `POST /internal/jobs/create-links`

## Legacy inference rules

### Base membership
- nickname containing `lite` infers base membership `standard`
- otherwise, `#client`, `#purchased`, and `#mem...`-style legacy signals infer base membership `premium`

### Badge tier
- `-vip-` infers badge tier `vip`
- `-svip-` infers badge tier `svip`

### Relationship flags
- `#client` indicates prior membership/client relationship
- `#purchased` indicates prior purchase/service history

### Membership start inference
Reads markers like:
- `#mem2025`
- `#memFeb26`
- `#mem25`

## Migration trace rules

- legacy inference stays in raw migration trace, not canonical entitlement truth
- raw legacy tags, nickname signals, inferred base membership, inferred badge tier, inferred member-since hints, raw LINE ID, operator summary, manual note, and original payload snapshot must be preserved for audit
- migration inbox writes go through `admin-worker` into `MMD — Console Inbox`
- invalid scaffold defaults such as `line_official` and `immigration_intake` must not replace the migration intake trace path
- inferred membership, tier, and member-since values may be copied into notes only as legacy inferred hints; they must not be written as canonical entitlement fields by this worker

## Notes

- `POST /v1/immigrate/line/preview` returns normalized inference without writing
- `POST /v1/immigrate/line/intake` performs safe lookup/link/create behavior and writes migration trace
- `POST /v1/immigration/intake` and `POST /v1/immigration/promote` remain older promotion-layer scaffolds
- when `ADMIN_WORKER_BASE_URL` is configured, `promote` forwards to `admin-worker /v1/admin/members/promote-immigration`
- without `ADMIN_WORKER_BASE_URL`, `promote` falls back to a local projected response
- accepts either `Authorization: Bearer <INTERNAL_TOKEN>` or `X-Internal-Token: <INTERNAL_TOKEN>`
- line inbox reads from Airtable when `AIRTABLE_API_KEY` is configured; otherwise it falls back to seed data
- sessions read from `REALTIME_SESSIONS_URL` when configured, otherwise from Airtable sessions table when available, otherwise seed data
- logs and sessions can use placeholder responses if upstream services are not configured yet
- `sync-airtable` writes migration payloads into Airtable table `MMD — Console Inbox`
- set `CREATE_LINKS_URL` to an exact upstream endpoint for confirmation-link creation
- legacy fallback: set `JOBS_WORKER_BASE_URL` to proxy create-link requests to jobs-worker
- set `REALTIME_SESSIONS_URL` to proxy session reads to a real live-session endpoint when available
- when `ENABLE_AIRTABLE_SYNC=false`, sync route returns mock sync results
- when `CREATE_LINKS_URL` points to `payments-worker /v1/confirm/link`, `POST /internal/jobs/create-links` supports a simplified booking payload without `opt1/opt2/opt3`

## Simplified booking payload for `POST /internal/jobs/create-links`

- required: `client_name`, `model_name`, `job_type`, `job_date`, `start_time`, `end_time`, `location_name`, `amount_thb`
- optional: `google_map_url`, `payment_type` defaults to `deposit`, `payment_method` defaults to `promptpay`, `note`, `confirm_page`, `model_confirm_page`
- recommended `job_type` for this flow: `private_vip`

## Required env

```txt
ADMIN_WORKER_BASE_URL
CONFIRM_KEY
AIRTABLE_API_KEY
AIRTABLE_BASE_ID
```

For write-capable intake, configure at least one auth secret:
- `INTERNAL_TOKEN`
- `CONFIRM_KEY`

## Optional env overrides

```txt
ALLOWED_ORIGINS
CANONICAL_MEMBER_TABLE
CANONICAL_NAME_FIELD
CANONICAL_NICKNAME_FIELD
CANONICAL_CLIENT_NAME_FIELD
CANONICAL_LINE_ID_FIELD
CANONICAL_LINE_USER_ID_FIELD
CANONICAL_EMAIL_FIELD
CANONICAL_PHONE_FIELD
CANONICAL_LEGACY_TAGS_FIELD
CANONICAL_NOTES_FIELD
CANONICAL_STATUS_FIELD
CANONICAL_DEFAULT_STATUS
AIRTABLE_TABLE_MEMBERS
```

## Example payload

```json
{
  "display_name": "Jay -vip- #memFeb26",
  "nickname": "Jay lite 12/02/26 -vip- #memFeb26",
  "line_user_id": "Uxxxxxxxx",
  "line_id": "jay_line",
  "member_email": "jay@example.com",
  "member_phone": "0812345678",
  "legacy_tags": "#client,#purchased",
  "manual_note": "ลูกค้าเก่าจาก LINE OA"
}
```

## Response shape

```json
{
  "ok": true,
  "layer": "migration",
  "action": "linked_to_existing_member",
  "inbox_record_id": "rec...",
  "member": {
    "id": "rec...",
    "fields": {}
  },
  "inferred": {
    "base_membership": "standard",
    "badge_tier": "vip"
  }
}
```

## Production checklist

- set secret `INTERNAL_TOKEN`
- set secret `AIRTABLE_API_KEY`
- change `ENABLE_AIRTABLE_SYNC` to `"true"` in `wrangler.toml` or via environment-specific vars
- for the current account/zone, bind routes on `mmdbkk.com`
- keep `CREATE_LINKS_URL` pointed at `payments-worker` unless you intentionally replace that upstream
- set `REALTIME_SESSIONS_URL` to a real live sessions endpoint if you do not want placeholder session data
- set `JOBS_WORKER_BASE_URL` to your real jobs-worker base URL if you do not want mock create-link responses
- bind a route on a domain/zone you control and point Control Room traffic there

## Deployment

- bind this worker to a domain/zone you control, not directly to `*.webflow.io`
- current production routes:
- `mmdbkk.com/internal/admin/control-room*`
- `mmdbkk.com/internal/jobs*`

## Smoke test

- from `mmd-workers`, run `INTERNAL_TOKEN=... ./scripts/smoke-test-immigrate.sh`
- the smoke script exercises `health -> intake -> promote -> get`
- test preview before intake against known LINE legacy records
- verify the inbox trace and canonical member/client result

## Netlify LINE webhook

- scaffolded function: `netlify/functions/webhook.js`
- target URL after Netlify deploy: `https://<your-site>.netlify.app/.netlify/functions/webhook`
- required Netlify environment variables:
- `LINE_CHANNEL_SECRET`
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- optional: `AIRTABLE_SYNC_TABLE` defaults to `MMD — Console Inbox`
- optional: `LINE_CHANNEL_ACCESS_TOKEN` required for auto-reply and fetching LINE profile names
- optional: `LINE_AUTO_REPLY_ENABLED` defaults to `false`
- optional: `ADMIN_WORKER_BASE_URL` plus one admin auth secret, `CONFIRM_KEY`, `ADMIN_BEARER`, or `INTERNAL_TOKEN`, for model lookup
- optional: `LINE_MODEL_LOOKUP_DEBUG=true` to log safe model lookup metadata only
- the function verifies `x-line-signature` and writes each LINE event into Airtable as a new inbox record
- only messages tagged with `#client` are marked as manual immigrate candidates and eligible for profile lookup / optional auto-reply
- model availability messages first query `admin-worker /v1/admin/models/list`; if Airtable has no match, the webhook calls `admin-worker /v1/admin/models/resolve-source` with `source_owner=lonelysomething`
- R2 fallback replies are preliminary source matches only: they do not expose URLs/media/private notes and never confirm availability

# SIGIL Availability Snapshot V1

Status: docs/spec only. This document defines the API contract for a future
sanitized availability layer. It does not implement worker code, deploy workers,
publish Webflow, alter Airtable schema, or authorize Kenji to read raw Model
Console data.

## Purpose

SIGIL Availability Snapshot V1 is the safe boundary between Model Console /
Model App operational state and any downstream matching or chat intelligence.

Model Console / Model App may contain sensitive operational data:

- live session state
- location, ETA, exact zone movement, or route context
- customer identity
- payment state
- model decision notes
- admin notes
- contact information
- internal job context

Kenji must never read that raw source directly. Kenji may only read sanitized
availability snapshots produced by this layer.

## Architecture Position

```text
Model Console / Model App
  -> SIGIL Availability Snapshot V1
  -> Safe Availability KV / Index
  -> Kenji Safe Match Layer V1
  -> LINE / Member Dashboard / Admin Assist
```

## Proposed Endpoint Contracts

Internal write endpoint:

```http
POST /v1/sigil/availability-snapshot
```

Internal read endpoint:

```http
GET /v1/sigil/availability-snapshot
```

These names are contract placeholders. Final worker ownership, route paths, and
bindings must be approved before implementation.

## Auth Rules

- Write access requires internal service auth from trusted Model Console /
  Model App infrastructure.
- Internal read access requires admin/service auth.
- Public LINE, member chat, Webflow browser code, and Kenji reply code must not
  call the write endpoint.
- Secrets, bearer tokens, confirm keys, service tokens, and route ownership keys
  must never be returned by this layer.

## Write Request Shape

```json
{
  "source": "model_console",
  "source_event_id": "evt_20260716_001",
  "snapshot_generated_at": "2026-07-16T10:00:00.000Z",
  "models": [
    {
      "model_key": "model_public_001",
      "availability_state": "available_today",
      "availability_window": {
        "date": "2026-07-16",
        "starts_at": "2026-07-16T13:00:00.000Z",
        "ends_at": "2026-07-16T18:00:00.000Z",
        "timezone": "Asia/Bangkok"
      },
      "location_scope": {
        "city": "Bangkok",
        "zones": ["sukhumvit"]
      },
      "operational_flags": {
        "burn": false,
        "mk": false,
        "live": true
      },
      "confidence": "operator_confirmed",
      "expires_at": "2026-07-16T10:10:00.000Z"
    }
  ]
}
```

## Sanitized Snapshot Shape

```json
{
  "model_key": "model_public_001",
  "safe_availability_state": "available_today",
  "availability_bucket": "today",
  "city": "Bangkok",
  "zones": ["sukhumvit"],
  "operational_flags": {
    "burn": false,
    "mk": false,
    "live": true
  },
  "confidence": "operator_confirmed",
  "updated_at": "2026-07-16T10:00:00.000Z",
  "expires_at": "2026-07-16T10:10:00.000Z"
}
```

## Allowed Availability States

- `available_now`
- `available_today`
- `available_soon`
- `limited`
- `unavailable`
- `unknown`

Raw Model Console states may normalize into these values, but raw labels must
not be exposed downstream.

## Safe Availability KV / Index

The future storage layer should be optimized for short-lived lookup by
`model_key` and safe filter fields.

Suggested key:

```text
availability:v1:{model_key}
```

Suggested secondary indexes:

- `city`
- `zones[]`
- `availability_bucket`
- `safe_availability_state`
- `operational_flags`
- `updated_at`
- `expires_at`

## Filtering Rules

- Expired snapshots must be treated as `unknown`.
- Missing snapshots must be treated as `unknown`.
- Hidden, blocked, archived, suspended, paused, or review-only states must never
  normalize to available.
- `available_now` must be short-lived and require `expires_at`.
- Operational flags are filters only. They must never grant membership, private
  access, or model folder access.
- The layer may remove a model from the safe index rather than publish
  `unavailable` when the source state is sensitive.

## Forbidden Output Fields

Never expose these through the snapshot:

- customer name, member identity, LINE ID, Telegram ID, phone, or email
- raw session ID unless separately approved as a safe public/session reference
- exact live GPS, hotel, room, travel route, ETA details, or private address
- payment state, payment reference, slip/proof URLs, bank/private data
- model decision notes, admin notes, risk flags, complaints, or operator comments
- raw Airtable record IDs
- R2 private object keys
- tokens, bearer values, confirm keys, service secrets

## Consumer Rules

Kenji Safe Match Layer V1 may read only the sanitized snapshot or a sanitized
index derived from it. It must not query Model Console / Model App directly.

Admin Assist may read richer operator state only through authenticated internal
admin routes, not through Kenji public/member chat context.

## Non-Goals

- No booking confirmation.
- No payment confirmation.
- No membership/access mutation.
- No Model Console writeback from Kenji.
- No raw model operational feed to LINE.
- No Webflow publish.
- No worker deployment.

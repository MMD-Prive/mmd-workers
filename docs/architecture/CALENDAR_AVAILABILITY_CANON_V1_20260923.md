# Calendar Availability Canon V1

Status: production candidate
Date: 2026-09-23

## Goal

Calendar must show Model availability from the same sanitized live availability authority used by Model Console / Model App.

It must not infer that a Model is available from:

- Active profile status
- an old Airtable availability label
- a Job or Session existing
- recent booking history
- a Cal event
- a missing availability value

Missing or expired live availability remains unconfirmed until Model Console or Model App publishes a fresh snapshot.

## Canonical Flow

```text
Model Console
  -> POST /v1/console/models/:id/availability-snapshot
  -> admin-worker sanitized availability writer

Model App
  -> explicit available_now / availability_status change
  -> shared sanitized availability writer

Both
  -> SIGIL_AVAILABILITY_SNAPSHOTS
  -> availability:v1:{model_key}
  -> Calendar owner read projection
```

Calendar is a read-only consumer.

## Source of Truth

Live Model availability:
- `SIGIL Availability Snapshot V1`
- KV binding: `SIGIL_AVAILABILITY_SNAPSHOTS`
- key: `availability:v1:{model_key}`

Model identity:
- canonical Models record
- `unique_key` is the join to the sanitized snapshot key

Therapist availability remains owned by MMS.

## Freshness

Only a snapshot with a valid future `expires_at` is live availability truth.

Allowed safe states:

- `available_now`
- `available_today`
- `available_soon`
- `limited`
- `unavailable`
- `unknown`

Expired, missing, invalid, or unreadable snapshots fail closed.

Calendar projection uses:

- `fresh`
- `missing`
- `stale`
- `invalid_expiry`
- `identity_missing`
- `source_unavailable`

Anything other than a fresh allowed state is rendered as unconfirmed, not available.

## Owner UI

The Calendar roster maps fresh canonical states to concise owner-facing labels:

- `available_now` -> ว่างตอนนี้
- `available_today` -> ว่างวันนี้
- `available_soon` -> ว่างเร็วๆ นี้
- `limited` -> จำกัด
- `unavailable` -> ไม่ว่าง
- stale -> รอยืนยันใหม่
- missing / unconfirmed -> รอยืนยัน
- identity missing -> ยังไม่ผูก Model

Unconfirmed Models stay collapsed by default so the owner view is operational rather than a long Unknown list.

## Confidence

The sanitized snapshot confidence remains bounded:

- `model_confirmed` -> Model App
- `operator_confirmed` -> Model Console
- `system_derived` -> System

Confidence does not grant access, booking, payment, or assignment authority.

## Deployment Lock

Normal `admin-worker` deploys must preserve the availability KV binding.

The deployment workflow resolves or creates:

`MMD_SIGIL_AVAILABILITY_SNAPSHOTS_V1`

and injects it into the production Wrangler config as:

```toml
[[kv_namespaces]]
binding = "SIGIL_AVAILABILITY_SNAPSHOTS"
id = "<resolved namespace id>"
```

This prevents a normal admin-worker deployment from silently removing the live availability store.

## Non-Goals

This canon does not:

- mark a Model available automatically
- derive availability from a confirmed Job
- derive availability from Cal
- write back from Calendar
- confirm a booking
- verify a payment
- grant customer access
- expose exact Model location or private operational notes

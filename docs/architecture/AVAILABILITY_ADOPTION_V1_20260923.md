# Availability Adoption V1 — Model Status Reminder + Coverage Recovery

Status: production candidate
Date: 2026-09-23

## Goal

Move Model availability coverage from passive `missing / stale` reporting to a safe adoption workflow without ever inventing that a Model is available.

The canonical live state remains SIGIL Availability Snapshot V1. This layer only helps the owner recover missing coverage and ask the Model to confirm current status.

## Authority

```text
Model App / Model Console
  -> sanitized availability writer
  -> SIGIL_AVAILABILITY_SNAPSHOTS
  -> Calendar / owner coverage read

Owner adoption action
  -> one explicit reminder or identity recovery
  -> Model opens MMD MODEL
  -> Model confirms availability
  -> sanitized availability writer
```

Calendar and Adoption V1 never write an availability state for the Model.

## Coverage states

Owner surfaces distinguish:

- Fresh — current snapshot is still valid.
- Missing — canonical Model key exists but no snapshot exists.
- Stale — a previous snapshot expired.
- Identity missing — Model record has no usable canonical `unique_key`.
- Source unavailable — snapshot storage cannot be read.
- Excluded — inactive / blocked / suspended / paused / archived / retired inventory.

Missing, stale and identity gaps never normalize to available.

## Reminder policy

Availability reminders are:

- owner-triggered only;
- one Model at a time;
- sent only after the backend re-checks that the snapshot is not fresh;
- LINE-only in V1;
- allowed only for a canonical Models record with a valid canonical `line_user_id`;
- protected by a 24-hour per-Model cooldown;
- audited through Model Console when initiated there.

There is no automatic bulk send in V1.

Reminder receipts are stored separately from availability truth:

```text
availability-adoption:v1:reminder:{model_key}
```

TTL: 24 hours.

The reminder receipt never becomes availability truth.

## Reminder copy rule

The message asks the Model to open MMD MODEL and update current Availability.

It explicitly tells the Model not to choose “available” when they are not available. The system waits for an explicit Model confirmation.

## Coverage recovery

### Canonical key exists + LINE connected

Owner may press **เตือน LINE**.

Backend re-checks freshness before sending. A fresh Model is not reminded.

### Canonical key exists + LINE not connected

Calendar may issue the existing first-time Model activation flow:

```http
POST /v1/admin/model/activation/issue
```

The owner receives a short-lived LINE activation URL to send to that exact Model. The activation flow binds a real verified LINE identity; it does not infer identity from a name.

### Canonical key missing

No reminder and no availability state is generated.

Owner is sent to Model identity cleanup / canonical Model review. Test, ghost, duplicate or ambiguous records remain fail-closed until explicitly resolved.

## Owner surfaces

### Calendar

`/internal/admin/calendar`

The hidden-by-default “รอยืนยัน” inventory can be expanded. Each unresolved Model shows a recovery action when safe:

- **เตือน LINE** — canonical key + LINE already connected;
- **สร้าง LINE link** — canonical key exists, LINE is not connected;
- **ผูก Model Key** — canonical availability identity is missing.

### Model Console coverage

`GET /v1/console/availability/coverage`

Returns safe adoption metadata only:

- `line_connected` boolean;
- `telegram_connected` boolean;
- `reminder_eligible`;
- `reminder_channel`;
- `recovery_action`.

Raw LINE User ID, Telegram User ID and private notes are not returned in the adoption projection.

`POST /v1/console/models/:id/availability-reminder`

re-resolves the canonical Model and delegates to the owner-safe reminder boundary.

## Internal reminder boundary

```http
POST /v1/internal/sigil/availability-adoption/remind
```

Trusted callers:

- `model-console-worker`
- `calendar-owner` relay after credential-bound owner/admin authentication

The Calendar owner relay is:

```http
POST /v1/admin/calendar/availability-reminder
```

It accepts only `model_key`.

Model App cannot use the reminder endpoint.

The reminder boundary cannot publish or mutate an availability snapshot.

## Current migration snapshot

Observed against the current Models inventory on 2026-09-23:

- 100 records read in the owner inventory sample;
- 91 have a canonical `unique_key`;
- 9 have an identity-key gap;
- 8 have a canonical LINE User ID usable for direct V1 reminder;
- no verified Telegram identity was observed in that sample.

These are operational observations, not permanent policy constants. Coverage changes as Models connect identity and publish fresh status.

## Non-goals

Availability Adoption V1 does not:

- bulk-message all Models automatically;
- infer availability from Airtable profile state;
- infer availability from Jobs, Sessions or Cal;
- mark a Model available after sending a reminder;
- grant booking, membership or private access;
- expose raw LINE / Telegram identity;
- send customer-facing availability messages;
- modify payment or Session truth.

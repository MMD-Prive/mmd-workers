# Availability Adoption Phase 2 — Identity Recovery Queue + Outcome Tracking

Status: implementation candidate
Date: 2026-09-23

## Goal

Close the owner recovery loop without inventing identity or availability:

```
identity gap -> canonical key repair -> LINE link issued -> verified LINE connected
  -> Model confirms Availability -> fresh SIGIL snapshot -> coverage recovered
```

Every transition is either an existing canonical fact or an explicit owner action. Missing evidence stays unresolved.

## Recovery queue

Model Console coverage now projects a safe `recovery_stage`:

- `identity_recovery_required` — no valid canonical key. No link, reminder, or snapshot is created.
- `line_link_required` — canonical key exists; LINE is not connected; no activation link has been issued in the tracking window.
- `line_link_issued_waiting_for_connection` — owner explicitly issued an activation link; verified LINE connection is still pending.
- `availability_confirmation_required` — canonical LINE is connected; no fresh SIGIL snapshot exists.
- `reminder_sent_waiting_for_confirmation` — an owner sent the manual LINE reminder; the Model has not yet published a fresh snapshot.
- `coverage_recovered` — a fresh snapshot arrived after a tracked recovery action.
- `coverage_current` — fresh snapshot exists with no tracked recovery action.
- `excluded` — blocked/inactive inventory remains excluded.

The public-safe projection contains booleans and timestamps only. It never returns LINE IDs, activation URLs, tokens, private notes, or owner identity.

## Evidence

Recovery evidence is stored separately from live Availability truth:

```
availability-adoption:v1:recovery:{model_key}
```

Retention: 90 days.

It may contain only:

- activation-link issue time and expiry;
- reminder send time and channel;
- model key and updated time.

The activation URL is returned only to the credential-bound owner request and is never persisted in recovery evidence. The original 24-hour reminder cooldown receipt remains separate.

## Calendar activation boundary

Calendar no longer calls the activation endpoint directly for Adoption recovery. It calls:

```
POST /v1/admin/calendar/availability-activation
```

The owner-gated relay issues the existing 24-hour Model LINE activation link, then records the event only after verifying that the submitted record ID still matches the canonical model key. It does not create identity, mutate availability, or auto-message any Model.

If evidence recording is unavailable after an activation URL is issued, the URL remains available to the owner and the response explicitly reports `tracking_state: evidence_failed`; availability stays unresolved.

## Outcome rule

LINE connection and fresh availability are observed again from canonical Models data and SIGIL Availability Snapshot. A prior action alone never advances the Model to connected, available, or recovered.

## Non-goals

- no automatic reminder or bulk send;
- no inferred canonical key or LINE identity;
- no automatic availability publication;
- no activation URL, raw LINE ID, Telegram ID, or private notes in browser projections;
- no booking, payment, membership, or customer-facing effect.

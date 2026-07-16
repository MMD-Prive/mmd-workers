# Kenji Safe Match Layer V1

Status: docs/spec only. This document defines a future safe matching contract
for Kenji in LINE/member chat. It does not implement worker code, deploy workers,
publish Webflow, alter Airtable schema, or authorize Kenji to expose private
model data.

## Purpose

Kenji Safe Match Layer V1 lets Kenji search model names, summarize customer
specs, and suggest candidate groups using only safe sources:

- sanitized Model Catalog fields
- SIGIL Availability Snapshot V1
- backend permission gate

Kenji must never read raw Model Console data directly. Kenji must never treat
LINE text, member chat text, local storage, or frontend claims as access truth.

## Architecture Position

```text
Model Console / Model App
  -> SIGIL Availability Snapshot V1
  -> Safe Availability KV / Index
  -> Kenji Safe Match Layer V1
  -> LINE / Member Dashboard / Admin Assist
```

## Proposed Endpoint Contract

Primary match endpoint:

```http
POST /v1/kenji/safe-match
```

Optional match detail endpoint:

```http
GET /v1/kenji/safe-match/:match_id
```

These route names are contract placeholders. Final worker ownership and route
bindings must be approved before implementation.

## Auth Rules

- Endpoint access requires Kenji backend/service auth.
- Public LINE clients must not call this endpoint directly.
- Member Dashboard callers must go through the approved backend path.
- The endpoint must require a backend permission gate result before returning
  private candidates.
- No bearer token, confirm key, service token, or internal route key may be
  returned in the response.

## Request Shape

```json
{
  "request_id": "kenji_match_20260716_001",
  "channel": "line",
  "locale": "th-TH",
  "query": "หุ่น athletic ว่างวันนี้ แถวสุขุมวิท",
  "customer_specs": {
    "lane": "gay",
    "city": "Bangkok",
    "zones": ["sukhumvit"],
    "date": "2026-07-16",
    "time_bucket": "today",
    "budget_thb": {
      "min": 6000,
      "max": 12000
    },
    "preferences": ["athletic", "friendly"],
    "operational_filters": {
      "burn": false,
      "mk": false,
      "live": true,
      "available": true
    }
  },
  "identity_context": {
    "trust": "backend_matched"
  },
  "permission_scope": {
    "source": "backend_permission_gate",
    "booking_visibility": "public",
    "private_access_folders": []
  },
  "limit": 5
}
```

## Response Shape

```json
{
  "ok": true,
  "layer": "kenji_safe_match_v1",
  "request_id": "kenji_match_20260716_001",
  "match_policy": {
    "booking_visibility": "public",
    "permission_gate_applied": true,
    "availability_snapshot_applied": true,
    "private_access_applied": false
  },
  "customer_spec_summary": {
    "lane": "gay",
    "city": "Bangkok",
    "zones": ["sukhumvit"],
    "time_bucket": "today",
    "safe_summary": "Looking for gay-compatible candidates around Sukhumvit today."
  },
  "candidate_groups": [
    {
      "group_id": "available_today_sukhumvit",
      "label": "Available today around Sukhumvit",
      "safe_next_action": "continue_to_booking_review",
      "candidates": [
        {
          "match_id": "safe_match_001",
          "model_key": "model_public_001",
          "safe_display_name": "Ken",
          "booking_visibility": "public",
          "model_lane": "both",
          "safe_availability_state": "available_today",
          "city": "Bangkok",
          "zones": ["sukhumvit"],
          "summary": "Athletic style, available today in Sukhumvit.",
          "match_reasons": ["lane_compatible", "zone_match", "available_today"],
          "safe_next_action": "continue_to_booking_review"
        }
      ]
    }
  ],
  "fallback": null,
  "generated_at": "2026-07-16T10:00:00.000Z"
}
```

## Matching Rules

Kenji Safe Match must:

- Search only sanitized Model Catalog fields and sanitized Availability Snapshot
  fields.
- Apply backend permission scope before returning private candidates.
- Apply booking visibility before ranking.
- Apply lane compatibility:
  - `straight` request matches `straight` and `both`.
  - `gay` request matches `gay` and `both`.
- Treat `both` as internal model compatibility only, not a customer lane option.
- Apply operational filters independently from membership or private folder access.
- Treat missing or expired availability as `unknown`, not available.
- Prefer candidate groups and safe next actions over definitive booking claims.
- Escalate or return `no_safe_candidates` when the safe data is insufficient.

## Private Candidate Rules

Private candidates may be returned only when all conditions are true:

- Permission gate source is `backend_permission_gate`.
- Permission gate is fresh and not expired.
- Caller is authorized for private matching.
- Requested private folder is within authoritative allowed folders.
- Candidate model access folder is within authoritative allowed folders.
- Candidate `booking_visibility` is `private`.
- Candidate lane matches requested lane or `both`.
- Candidate is active and not hidden, blocked, archived, paused, suspended, or
  review-only.

Inactive, expired, guest, unknown, unresolved, or missing membership must result
in no protected private model names.

## Safe Candidate Fields

Allowed fields:

- `match_id`
- `model_key`
- `safe_display_name`
- `booking_visibility`
- `model_lane`
- `safe_availability_state`
- `availability_bucket`
- `city`
- `zones`
- `safe_image_url`
- `public_profile_url`
- `summary`
- `match_reasons`
- `safe_next_action`

Forbidden fields:

- phone, email, LINE ID, Telegram ID, Telegram username in LINE/member chat
- raw Airtable record ID
- raw session ID unless separately approved as a safe session reference
- R2 private object key
- exact live GPS, hotel, room, private address, travel route, or ETA details
- model decision notes, admin notes, risk flags, complaints, or operator comments
- payment status, payment reference, slip/proof URLs, banking details
- membership/package raw records
- tokens, bearer values, confirm keys, service secrets

## Error Shape

```json
{
  "ok": false,
  "layer": "kenji_safe_match_v1",
  "error": {
    "code": "permission_unresolved",
    "message": "Safe model matching requires a backend permission check."
  },
  "safe_next_action": "continue_public_flow_or_escalate"
}
```

Suggested error codes:

- `invalid_request`
- `permission_unresolved`
- `permission_denied`
- `catalog_unavailable`
- `availability_snapshot_unavailable`
- `no_safe_candidates`
- `internal_error`

## Reply Boundary

Kenji may use this layer to say safe things like:

- "I found a few public candidates that may fit your request."
- "I can help continue this into a booking review."
- "I cannot confirm private availability from chat alone."
- "This needs MMD review before any private access or booking decision."

Kenji must not say:

- "This model is secretly available."
- "I confirmed your booking."
- "I unlocked private access."
- "I verified your payment."
- "I found your LINE ID / phone / Telegram."

## Non-Goals

- No booking creation.
- No payment confirmation.
- No membership unlock.
- No private access mutation.
- No Model Console writeback.
- No raw availability exposure.
- No direct public LINE access to internal endpoints.
- No Webflow publish.
- No worker deployment.

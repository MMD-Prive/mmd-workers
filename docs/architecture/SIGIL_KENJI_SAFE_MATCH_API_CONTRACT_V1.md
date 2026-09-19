# SIGIL / Kenji Safe Match API Contract V1

Status: docs/spec only. This architecture contract links SIGIL Availability
Snapshot V1 and Kenji Safe Match Layer V1. It does not implement worker code,
deploy workers, publish Webflow, alter Airtable schema, or authorize runtime
route changes.

## Locked System Names

1. SIGIL Availability Snapshot V1
2. Kenji Safe Match Layer V1

## Architecture

```text
Model Console / Model App
  -> SIGIL Availability Snapshot V1
  -> Safe Availability KV / Index
  -> Kenji Safe Match Layer V1
  -> LINE / Member Dashboard / Admin Assist
```

## Core Principle

Kenji must never read raw Model Console data directly.

Kenji can only read sanitized availability snapshots and safe catalog fields
after permission checks. This protects sensitive operational data that may exist
inside Model Console / Model App, including live session state, location, ETA,
customer identity, payment state, model decision notes, admin notes, contact
information, and internal job context.

## Source Of Truth Boundaries

| Data | Source of Truth | Kenji Access |
| --- | --- | --- |
| model catalog identity | sanitized Model Catalog / R2 catalog | safe fields only |
| raw model operational state | Model Console / Model App | no direct access |
| safe availability | SIGIL Availability Snapshot V1 | yes, sanitized only |
| private model access | backend permission gate | yes, result only |
| membership/package truth | members + member_packages backend authority | gate result only |
| payment truth | payment verification backend | no direct safe-match use |
| booking/session truth | session backend | no direct booking confirmation |

## Endpoint Family

SIGIL Availability Snapshot V1:

```http
POST /v1/sigil/availability-snapshot
GET /v1/sigil/availability-snapshot
```

Kenji Safe Match Layer V1:

```http
POST /v1/kenji/safe-match
GET /v1/kenji/safe-match/:match_id
```

These are proposed API contracts only. Final route ownership, worker placement,
auth bindings, and storage bindings require separate implementation approval.

## Permission Gate Contract

Kenji Safe Match requires a backend permission gate. Chat text, LINE profile,
frontend claims, local storage, and member-submitted labels are never access
truth.

```json
{
  "ok": true,
  "source": "backend_permission_gate",
  "identity_trust": "backend_matched",
  "booking_visibility": "private",
  "private_access_folders": ["standard", "premium"],
  "member_status": "active",
  "expires_at": "2026-07-16T10:05:00.000Z"
}
```

If the gate is missing, expired, unresolved, inactive, guest, unknown, or missing
membership:

- `private_access_folders` must be empty.
- Protected private model names must not be returned.
- Matching must fall back to public-safe candidates or return no safe candidates.

## Availability Snapshot Contract Summary

SIGIL Availability Snapshot V1 receives trusted model availability signals and
publishes a sanitized lookup keyed by `model_key`.

Allowed safe states:

- `available_now`
- `available_today`
- `available_soon`
- `limited`
- `unavailable`
- `unknown`

Required safety behavior:

- Expired snapshots become `unknown`.
- Hidden or blocked operational states never normalize to available.
- `available_now` requires short TTL and `expires_at`.
- No raw session, location, payment, customer, contact, note, or secret fields.

## Kenji Safe Match Contract Summary

Kenji Safe Match combines:

- sanitized Model Catalog fields
- sanitized Availability Snapshot fields
- backend permission gate
- customer specs from chat/member context

It returns:

- `customer_spec_summary`
- `candidate_groups`
- safe candidate summaries
- safe next actions
- fallback/escalation direction

It must not return:

- raw identifiers
- hidden availability
- internal notes
- payment truth
- membership raw records
- private contact data
- private R2 object keys
- mutation authority

## Lane Compatibility

Customer lane options:

- `straight`
- `gay`

Model compatibility values:

- `straight`
- `gay`
- `both`

Rules:

- `straight` request matches `straight` and `both`.
- `gay` request matches `gay` and `both`.
- `both` is internal model compatibility only and must not be shown as a customer
  lane choice.

## Candidate Group Examples

```json
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
      "summary": "Athletic style, available today in Sukhumvit.",
      "match_reasons": ["lane_compatible", "zone_match", "available_today"]
    }
  ]
}
```

## Security And Privacy Locks

- Kenji cannot confirm booking, payment, membership, VIP, Black Card, or private
  access from chat.
- Kenji cannot mutate model availability.
- Kenji cannot mutate membership, session, payment, or model records.
- Kenji cannot expose raw Model Console state.
- Kenji cannot expose raw LINE ID, Telegram ID, email, phone, or Airtable record
  IDs.
- Kenji cannot expose exact live location, route, ETA, hotel, room, or private
  address.
- Kenji cannot expose model decision notes or admin/operator notes.

## Required Future Tests

Before implementation ships, add tests proving:

- Kenji does not query raw Model Console data.
- expired availability snapshots return `unknown` or no safe candidate.
- hidden/blocked/archived/paused models are excluded.
- public matching works without private permission.
- private matching requires backend permission gate.
- inactive/expired/guest/unknown members receive no private model names.
- straight/gay lane matching includes `both`.
- operational filters do not grant access.
- forbidden fields are redacted.
- no mutation occurs through safe-match endpoints.

## Related Specs

- `docs/sigil/SIGIL_AVAILABILITY_SNAPSHOT_V1.md`
- `docs/kenji/KENJI_SAFE_MATCH_LAYER_V1.md`
- `docs/kenji/KENJI_AI_V1_CONTEXT_CONTRACT.md`
- `docs/kenji/KENJI_AI_V1_REPLY_BOUNDARIES.md`
- `docs/r2-model-catalog-airtable-template.md`

## Non-Goals

- No worker implementation in this contract.
- No deploy.
- No Webflow publish.
- No Airtable schema change.
- No Model Console rewrite.
- No Kenji LLM implementation.

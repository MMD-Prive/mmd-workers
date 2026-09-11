# Client Intelligence Contract v1

Canonical read endpoint:

`GET /v1/admin/clients/intelligence?client_id=rec...`

## Purpose

This endpoint is the read-only intelligence facade for MMD Member Intelligence. It combines existing internal projections from Customer Memory, Conversation Matrix and recent conversation events into one operator brief for Per.

It is not a payment, membership, access, entitlement or messaging authority.

## Boundary

- Browser ingress stays same-origin on `mmdbkk.com` / `www.mmdbkk.com`.
- `immigrate-worker` owns only the narrow public ingress route and forwards through the `ADMIN_WORKER` service binding.
- `admin-worker` requires the credential-bound owner/admin session.
- `mms_partner` is explicitly forbidden from this MMD Privé customer-intelligence route.
- No service credential is accepted from browser code.
- The endpoint is read-only.

## Response shape

```json
{
  "ok": true,
  "client_id": "rec...",
  "generated_at": "2026-09-08T...Z",
  "identity": {
    "status": "canonical",
    "display_name": "...",
    "confidence": 1
  },
  "relationship": {
    "summary": "...",
    "last_interaction_at": "...",
    "relationship_state": "..."
  },
  "current_state": {
    "membership": {},
    "payment": {},
    "access": {},
    "session": {}
  },
  "ai": {
    "summary": "...",
    "notices": [],
    "next_best_action": null,
    "suggested_reply": {
      "available": false,
      "text": null,
      "channel": "",
      "send_allowed": false,
      "reason": "reply_generation_not_connected"
    },
    "follow_up": {
      "recommended": false,
      "reason": "no_verified_follow_up_signal",
      "timing": null
    },
    "advisory_only": true,
    "analysis_basis": "deterministic_context_v1"
  },
  "unresolved": [],
  "sources": [],
  "authority": {
    "payment": "canonical_backend",
    "membership": "resolver",
    "access": "resolver",
    "ai": "advisory"
  }
}
```

## v1 intelligence rules

The first implementation is deterministic and evidence-backed. It may surface:

- Conversation Matrix open loops.
- Explicit handoff requirements.
- Explicit live-truth requirements.
- Restricted access snapshots.
- Expired/inactive membership snapshots.
- Payment-related conversation context that still requires canonical payment truth.
- Explicit Conversation Matrix pending actions as `ready_for_per` recommendations.

Every important recommendation includes evidence references when available.

The endpoint must not generate a customer reply yet. `send_allowed` remains `false` until a separate approved messaging contract exists.

## Authority rule

AI output is derived advisory context only.

Canonical truth continues to come from the existing backend authorities:

- payment -> canonical payments backend
- membership -> resolver/canonical membership state
- access -> resolver/canonical access state
- AI -> advisory only

When evidence is missing or ambiguous, the endpoint returns unknown/review states rather than fabricating truth.

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
    "confidence": 1,
    "verified": true
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
      "schema": "mmd.kenji_continuity_operator_draft.v1",
      "mode": "operator_draft",
      "available": true,
      "text": "customer-safe deterministic draft for owner review",
      "channel": "line_ofc",
      "send_allowed": false,
      "requires_owner_review": true,
      "reason": "operator_review_required",
      "guardrails": {
        "customer_auto_send": false,
        "business_truth_claims": false,
        "memory_is_context_only": true,
        "protected_truth_refresh_required": true
      }
    },
    "continuity_status": {
      "source": "conversation_matrix",
      "source_status": "live",
      "matrix_status": "active",
      "matrix_version": 7,
      "updated_at": "2026-09-08T...Z",
      "expires_at": "2026-09-15T...Z",
      "freshness": "fresh",
      "context_only": true,
      "live_truth_wins": true
    },
    "runtime_controls": {
      "status": "live",
      "line_oa_kill_switch": "clear",
      "all_mutations_kill_switch": "clear",
      "operator_copy_allowed": true,
      "reason": "clear"
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

## Phase 4A operator draft

`KENJI_CONTINUITY_PHASE4_MODE=operator_draft` may expose a deterministic customer-safe draft inside this credential-bound operator view. It is not connected to LINE delivery, a message queue, or a customer auto-reply path. `send_allowed` and `customer_auto_send` remain hard-coded `false`.

A draft is available only when all gates pass:

- Exact canonical Client identity is explicitly verified with high confidence.
- The preferred name passes identifier, contact-data, credential, and control-character filters.
- Conversation Matrix marks a reviewed returning relationship.
- The Matrix is active, versioned, unexpired, context-only, and explicitly declares that live truth wins.
- An open non-review stage has evidence of a continuing thread.
- The channel is an allowlisted LINE/LIFF channel.

The copy uses only an allowlisted topic label. It never interpolates Matrix summaries, open loops, pending actions, pending references, payment artifacts, canonical status values, credentials, or customer identifiers. Protected topics always tell the operator/customer that the latest status must be checked with the owning system before confirmation.

`off` and every unknown mode fail closed with no draft. Moving beyond operator review requires a separate approved messaging contract, explicit owner approval, shadow evidence, and a production rollback plan.

## Phase 4B operator view and copy audit

The Member Intelligence browser runtime reads the facade above and may render an available Phase 4A draft. It must validate the complete safety envelope again before showing copy controls. The UI displays Matrix source/freshness and the canonical Kenji runtime-control snapshot. Missing runtime controls, an active LINE kill switch, or an active global mutation kill switch keeps copy locked.

Copy requires all of the following:

- a credential-bound owner/admin session;
- a successful safe view audit;
- explicit operator review confirmation in the current browser view;
- a fresh server-side re-read of the same eligible draft;
- live runtime controls with no applicable kill switch;
- a successful copy-authorization audit before clipboard mutation.

Audit events use `POST /v1/admin/clients/intelligence/audit` and write only `Event ID`, `Action`, and normalized `Result` to the canonical `System — Access Log`. Client, actor, and draft references appear only as bounded keyed HMAC-SHA-256 prefixes inside the event ID. The raw Client record ID, name, draft text, Matrix notes, payment artifacts, credentials, and business-state values are never stored in this audit event.

This UI has no LINE reply/push adapter and no send button. `send_allowed=false`, `customer_auto_send=false`, and `requires_owner_review=true` remain mandatory. The audit route reports `customer_delivery_attempted=false` and `business_truth_mutated=false`.

## Authority rule

AI output is derived advisory context only.

Canonical truth continues to come from the existing backend authorities:

- payment -> canonical payments backend
- membership -> resolver/canonical membership state
- access -> resolver/canonical access state
- AI -> advisory only

When evidence is missing or ambiguous, the endpoint returns unknown/review states rather than fabricating truth.

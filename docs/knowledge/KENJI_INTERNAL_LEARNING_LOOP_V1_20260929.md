# Kenji Internal Learning Loop V1 — 2026-09-29

Status: owner-authorized Internal Kenji capability  
Owner: Boss Per  
Surface: `/internal/admin/kenji`

## Goal

Make Kenji learn quickly from real owner corrections and real customer context without turning chat history, memory, aliases, or AI inference into payment, membership, booking, availability, pricing, access, or approval truth.

## Internal Knowledge — Per Correction Loop

The Single Owner "Teach Kenji" surface supports a **Correction** mode.

A correction contains:

- customer/example message;
- optional previous Kenji answer as a negative example;
- Per's corrected answer as the preferred example;
- optional owner reason;
- category, audience and current Knowledge workflow metadata.

The structured Knowledge payload stores:

`payload_json.per_correction`

with:

- `customer_example`
- `previous_answer`
- `corrected_answer`
- `correction_reason`
- `learning_rule=prefer_current_owner_correction_when_context_matches`
- `protected_truth_override=false`

Correction cards still use the canonical Knowledge draft -> Review -> QA -> Publish pipeline. Sensitive categories remain handoff/protected and a correction never overrides live backend truth.

## Internal Knowledge — Customer History Retrieval

Internal Kenji can inspect a bounded owner-only history projection through:

`GET /v1/admin/kenji/control/conversations?view=history&...`

Supported identity lookup follows the existing Kenji control contract:

- Client record/name
- member ID
- LINE user ID
- email through the existing authenticated internal endpoint contract

The owner UI also reads:

- `/v1/admin/kenji/control/memory`
- `/v1/admin/kenji/control/conversations?view=matrix`

History returns only the bounded internal teaching projection assembled from current Console Inbox and proven-delivered AI Message Events. It is marked:

- `context_only=true`
- `live_truth_wins=true`
- `full_legacy_line_archive=false`

The owner can pull a real customer turn into Correction mode. If a proven-delivered assistant turn follows it, that reply may be prefilled as the negative example.

History retrieval is not proof of current price, payment, membership, booking, access, availability or approval.

## Internal Model — Identity Memory

The Models tab exposes the dedicated canonical Models field:

`private_real_name`

Rules:

- owner-reviewed internal identity only;
- blank means unknown/unverified;
- Kenji may use it to resolve code / alias / working name / real name to one canonical Model;
- never customer-facing by default;
- never grants access;
- never determines rate or availability;
- never infer or auto-fill from social media, chat, folder names or notes.

The owner writes it through:

`POST /v1/admin/kenji/models/:model_id/identity`

The write requires the credential-bound Internal Kenji session and an idempotency key. In the Single Owner UI it is applied only after the owner confirms the Model summary.

## Separation of concerns

```
Per correction / reviewed knowledge
          |
          v
Published Knowledge
          |
Customer Memory + bounded History
          |
Model Identity Memory
          |
Live Truth / protected authorities
          |
Authority Guard
          |
Per Voice renderer
          |
Delivery Gate
```

The Delivery Gate remains independent. Adding learning, history or identity memory does not enable Kenji model replies or widen customer-visible access.

## Current history boundary

This Internal Kenji history view is intentionally bounded and is not the entire legacy LINE OA archive.

The live LINE conversation runtime still maintains its own bounded recent context. Historical retrieval is for owner inspection/teaching and future relevance retrieval; it must not be copied wholesale into every model prompt.

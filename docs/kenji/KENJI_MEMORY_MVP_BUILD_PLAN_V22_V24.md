# Kenji Memory MVP Build Plan V2.2-V2.4

## Status

Draft internal build plan.

This plan covers the first MMD-owned Kenji Memory MVP steps after `KENJI_MEMORY_INTELLIGENCE_LAYER_V21.md`.

No runtime customer-facing memory is included yet. No auto-reply from memory is included yet. No production mutation should happen unless explicitly approved.

## Scope

This plan covers:

- LINE event store design
- sanitized event schema
- memory summary draft schema
- admin review workflow
- test plan
- implementation steps

This plan does not include:

- customer-facing memory replies
- auto-reply from memory summaries
- automatic approval
- direct raw chat exposure
- paid external inbox dependency
- changes to Knowledge Card policy

## Phase Map

### V2.2: Event Store Foundation

Goal: safely capture new LINE webhook events going forward under MMD control.

Outputs:

- raw event storage design
- redacted event storage design
- retention class fields
- write audit shape
- feature flag plan
- synthetic test fixtures

Runtime rule:

- event capture must not change customer replies
- event capture must not expose extra logs
- event capture must not write secrets or full credential-bearing payloads

### V2.3: Memory Summary Drafts

Goal: create draft-only safe memory summaries from redacted events.

Outputs:

- memory summary draft schema
- behavior / intent tag schema
- review flag schema
- summarizer input/output contract
- draft-only review queue design

Runtime rule:

- Kenji must not use draft summaries in customer replies
- AI-generated summaries must never auto-publish
- sensitive cases must route to MMD review

### V2.4: Admin Review Workflow

Goal: let MMD review, approve, expire, or reject memory summaries before any runtime use.

Outputs:

- read-only admin viewer first
- manual approval action design
- approved memory card schema
- expiry/review rules
- audit log design
- rollback flag design

Runtime rule:

- approved memory remains context only
- Knowledge Cards remain the answer source
- MMD / Boss Per remains final authority

## LINE Event Store Design

The first MVP should use MMD-owned LINE webhook events going forward.

Recommended store layers:

1. Raw Conversation Event
   - internal only
   - restricted access
   - not used directly for customer-facing answers

2. Redacted Conversation Event
   - internal only
   - suitable for safe summarization
   - masks unnecessary PII and sensitive content

3. Memory Summary Draft
   - draft only
   - safe, short, structured
   - not customer-facing until reviewed

4. Approved Memory Card
   - MMD-reviewed
   - expiring
   - safe runtime context only in later phases

Candidate storage choices:

- D1 for relational event/review workflow
- R2 for encrypted raw transcript/import files if needed
- KV only for small config or feature flags, not primary history
- Airtable-style table only if MMD accepts external operational dependency

V2.2 should decide storage before implementation.

## Raw Event Schema

```json
{
  "event_id": "raw_event_example_001",
  "customer_ref": "customer_ref_placeholder",
  "source_channel": "line",
  "direction": "inbound",
  "message_type": "text",
  "text_raw_storage_ref": "raw_storage_ref_placeholder",
  "received_at": "YYYY-MM-DDT00:00:00Z",
  "privacy_level": "internal_restricted",
  "ingest_status": "stored_for_redaction",
  "retention_class": "limited_internal",
  "source_event_ref": "source_event_ref_placeholder",
  "created_at": "YYYY-MM-DDT00:00:00Z"
}
```

Rules:

- do not store token values
- do not expose LINE user IDs in logs
- do not use raw events in Kenji replies
- do not store full request bodies unless explicitly approved
- keep customer references pseudonymous where possible

## Sanitized Event Schema

```json
{
  "event_id": "redacted_event_example_001",
  "raw_event_ref": "raw_event_example_001",
  "customer_ref": "customer_ref_placeholder",
  "source_channel": "line",
  "direction": "inbound",
  "message_type": "text",
  "text_redacted": "Customer asked a general renewal question.",
  "redaction_notes": ["removed_private_identifiers"],
  "detected_sensitive_types": ["none"],
  "safe_for_summary": true,
  "created_at": "YYYY-MM-DDT00:00:00Z"
}
```

Sensitive types to detect:

- payment proof
- bank detail
- credential
- private identifier
- private model reference
- admin note
- complaint or allegation
- exact location
- unknown sensitive content

If `safe_for_summary` is false, the event should create a review flag instead of entering the summarizer.

## Memory Summary Draft Schema

```json
{
  "summary_id": "memory_summary_draft_example_001",
  "customer_ref": "customer_ref_placeholder",
  "source_event_refs": ["redacted_event_example_001"],
  "language": "th",
  "known_context": "Customer has asked repeated general questions about renewal.",
  "safe_preferences": ["prefers_short_answer"],
  "repeated_topics": ["Renewal"],
  "current_open_threads": ["renewal_status_needs_mmd_review"],
  "risk_flags": ["needs_mmd_review"],
  "recommended_next_step": "Route to official member dashboard and explain that MMD must review status.",
  "kenji_allowed_use": ["personalize_safe_intro", "choose_relevant_knowledge_lane"],
  "kenji_forbidden_use": ["confirm_status", "unlock_access", "approve_payment"],
  "review_status": "draft",
  "created_by": "summarizer_draft",
  "created_at": "YYYY-MM-DDT00:00:00Z",
  "expires_at": "YYYY-MM-DDT00:00:00Z"
}
```

Rules:

- draft summaries are not runtime context
- draft summaries can be wrong and must be reviewed
- do not include raw quotes unless explicitly safe and useful
- do not include payment, booking, membership, renewal, or model availability status claims
- do not include admin notes

## Behavior / Intent Tag Schema

```json
{
  "tag_event_id": "intent_tag_example_001",
  "customer_ref": "customer_ref_placeholder",
  "source": "line_forward_memory",
  "tag": "renewal_question",
  "confidence": 0.82,
  "evidence_type": "summarized_recent_messages",
  "safe_note": "Customer repeatedly asks general renewal next-step questions.",
  "created_at": "YYYY-MM-DDT00:00:00Z",
  "expires_at": "YYYY-MM-DDT00:00:00Z"
}
```

Allowed early tags:

- `interested_membership`
- `interested_booking`
- `payment_waiting`
- `renewal_question`
- `rules_question`
- `needs_human_review`
- `repeated_payment_issue`
- `prefers_thai`
- `prefers_short_answer`
- `high_sensitivity_case`

Tags are hints, not truth.

## Review Flag Schema

```json
{
  "review_flag_id": "review_flag_example_001",
  "customer_ref": "customer_ref_placeholder",
  "flag": "needs_mmd_review",
  "severity": "medium",
  "reason_safe": "Customer has an open renewal question that requires MMD review.",
  "created_by": "system_or_admin_placeholder",
  "created_at": "YYYY-MM-DDT00:00:00Z",
  "expires_at": "YYYY-MM-DDT00:00:00Z",
  "required_action": "manual_mmd_review"
}
```

Review flags should be short-lived unless renewed.

## Approved Memory Card Schema

```json
{
  "card_id": "approved_memory_card_example_001",
  "customer_ref": "customer_ref_placeholder",
  "title": "Renewal Guidance Preference",
  "summary": "Customer prefers short Thai renewal guidance with official links.",
  "allowed_use": ["personalize_safe_reply", "route_to_member_dashboard"],
  "forbidden_use": ["claim_renewal_success", "restore_access", "confirm_payment"],
  "related_routes": ["/member/dashboard", "/member/membership"],
  "review_status": "approved",
  "reviewed_by": "mmd_admin_placeholder",
  "reviewed_at": "YYYY-MM-DDT00:00:00Z",
  "expires_at": "YYYY-MM-DDT00:00:00Z"
}
```

Approved Memory Cards are not Knowledge Cards. They can provide context only in a later runtime phase.

## Admin Review Workflow

### V2.3 Draft Workflow

1. Redacted events enter draft summarizer.
2. Summarizer creates a Memory Summary Draft.
3. System creates behavior tags and review flags.
4. Draft appears in admin viewer as read-only first.
5. MMD/admin can inspect safe summary, not raw chat by default.

### V2.4 Approval Workflow

1. Admin opens a draft summary.
2. Admin reviews safe context and flags.
3. Admin can approve, reject, edit, expire, or mark as sensitive.
4. Approved summary becomes an Approved Memory Card.
5. Audit log records who approved, when, and why.
6. Expired cards leave runtime eligibility.

Required actions:

- approve
- reject
- edit safe summary
- mark sensitive
- expire
- renew expiry
- set `do_not_auto_reply`

## Test Plan

### Unit Tests

- raw event schema validation
- redacted event schema validation
- memory summary draft schema validation
- review flag schema validation
- approved memory card schema validation
- safe redaction behavior
- sensitive type detection
- expiry handling

### Integration Tests

- LINE event enters store without changing reply behavior
- raw event creates redacted event
- redacted safe event creates draft summary
- unsafe event creates review flag
- draft summary does not reach runtime
- approved card remains hidden from runtime until memory runtime feature is explicitly enabled in a future phase

### Safety Tests

- no token values in logs
- no full LINE user IDs in diagnostics
- no raw request body logging
- no payment slip text in summary
- no bank detail in summary
- no admin notes in summary
- no private model names in summary
- no status confirmation from memory

### Regression Tests

- existing Knowledge Card replies still work
- Payment lane still answers from published cards
- Membership lane still answers from published cards
- Renewal lane still answers from published cards
- Booking lane still answers from published cards
- Rules lane still answers from published cards
- no memory summary affects customer-facing replies

## Implementation Steps

### Step 1: Data Contract

- finalize schema names
- decide storage engine
- define retention classes
- define redaction rules
- define review statuses

### Step 2: Storage Migration

- create storage tables/buckets only after approval
- add synthetic fixtures
- add schema validation tests
- do not connect production webhook yet

### Step 3: Forward Event Capture

- add feature flag for event capture
- write inbound LINE event metadata safely
- do not change reply behavior
- do not log secrets or user IDs
- test with synthetic and allowlisted events

### Step 4: Redaction Layer

- create redaction function
- detect sensitive fields
- write redacted event
- route unsafe events to review flags

### Step 5: Draft Summaries

- create draft-only summarizer contract
- use synthetic data first
- write Memory Summary Draft
- never auto-approve

### Step 6: Admin Viewer

- build read-only viewer first
- show safe summaries, tags, and flags
- hide raw events by default
- add audit trail

### Step 7: Manual Approval

- add approve/reject/edit/expire actions
- write Approved Memory Card only after admin action
- require expiry

### Step 8: Future Runtime Planning

- design separate runtime feature flag
- require approved memory cards only
- require Knowledge Card answer source
- require `answer_safe`
- run controlled LINE live verification before any customer-facing memory use

## Required Feature Flags

Suggested names only:

- `KENJI_MEMORY_EVENT_CAPTURE_ENABLED`
- `KENJI_MEMORY_REDACTION_ENABLED`
- `KENJI_MEMORY_DRAFT_SUMMARY_ENABLED`
- `KENJI_MEMORY_ADMIN_REVIEW_ENABLED`
- `KENJI_MEMORY_RUNTIME_CONTEXT_ENABLED`

Default for runtime context must remain off until explicitly approved later.

## Safety Lock

V2.2-V2.4 must produce memory infrastructure and review workflow only.

Kenji must not use memory to approve, confirm, unlock, mark paid, decide model availability, decide tier, or bypass Boss Per / MMD review.

Memory is context, not permission.

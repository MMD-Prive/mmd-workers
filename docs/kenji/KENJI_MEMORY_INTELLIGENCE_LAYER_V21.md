# Kenji Memory Intelligence Layer V2.1

## Status

- Draft internal architecture document.
- Not live runtime behavior yet.
- No current runtime changes.
- Defines future safe design for Kenji memory, historical chat reading, customer behavior summary, and MMD-reviewed intelligence.
- respond.io was evaluated but is not the required core for Phase 1.

## Purpose

Kenji currently answers from published Knowledge Cards.

This future layer lets Kenji understand customer continuity through safe summaries. Kenji should not directly use raw uncontrolled chat to answer customers.

The goal is to help MMD understand context, reduce repeated explanation, and guide customers better without giving Kenji authority to approve, confirm, unlock, or expose sensitive data.

## Core Principle

Memory is context, not permission.

A memory summary may help Kenji understand what the customer asked before, but it must not become proof that payment, booking, membership, renewal, model availability, VIP, SVIP, or Black Card status is confirmed.

## respond.io Evaluation Lesson

respond.io may be useful as an external inbox/history tool later. It may support shared inbox, tags/custom fields, workflow routing, AI summaries, and suggested replies.

Export/history access and real-time webhook or data warehouse automation may be plan-limited. Growth and Advanced levels are too high for current MMD Phase 1 testing, and MMD should avoid buying an expensive platform before validating the memory workflow.

Kenji Memory should begin with MMD-owned webhook/event storage and safe summaries. External platforms can be integrated later as optional data sources.

For Phase 1, MMD should build a small owned memory pipeline before committing to external platform costs.

## What This Layer Is

Kenji Memory Intelligence is a controlled memory and summarization layer that may:

- ingest LINE customer events from the MMD webhook going forward
- ingest Telegram or Webflow form events if later connected
- import approved chat transcript files manually
- summarize customer context
- classify safe intents
- detect repeated questions
- capture safe preferences
- flag cases needing MMD review
- create draft memory summaries
- provide Kenji with approved safe context summaries only

## What This Layer Is Not

This layer is:

- not a payment approver
- not a booking confirmer
- not a model availability checker
- not a private model search engine
- not an admin note exposure system
- not a raw chat replay tool for customers
- not a replacement for Boss Per / MMD review
- not a system that gives Kenji authority to decide tier, access, VIP, SVIP, Black Card, exceptions, model status, payment status, booking status, or renewal status
- not a system that can read old LINE history unless MMD has stored or imported that history
- not dependent on respond.io or any other paid external platform as the Phase 1 core

## Canonical Flow

```text
LINE / Telegram / Webflow / imported transcript
-> Conversation Ingest
-> Raw Event Store with access control
-> Redaction / Sanitization
-> Safe Summarizer
-> Customer Memory Summary
-> MMD Review / Approval where needed
-> Approved Memory Card / Safe Context
-> Kenji Runtime may use safe context with Knowledge Cards
-> Kenji replies only within boundary
```

## Two Modes of Memory

### Forward Memory

- From messages received after MMD starts storing webhook events.
- Cleanest and safest path.
- Should be the MVP.
- Works even without respond.io.

### Imported History Memory

- From exported LINE / Telegram / chat files, pasted transcripts, CSV exports, or admin-uploaded records.
- Must be explicitly imported by MMD.
- Must be summarized and reviewed before runtime use.
- Must not expose raw transcript to customers.
- Should support source metadata and import batch tracking.

## Phase 1 Data Source Decision

- Primary Phase 1 source should be MMD-owned LINE webhook events going forward.
- Secondary later sources may include Telegram events, Webflow forms, manual imported transcripts, CSV exports, or external inbox exports.
- respond.io may be a future optional provider, not the first dependency.
- The first MVP should not require Advanced external webhook subscriptions.

## Memory Object Types

### 1. Raw Conversation Event

A raw inbound/outbound message or event.

Raw Conversation Events:

- are access restricted
- are not directly used for customer-facing Kenji answers
- may contain sensitive data
- must be filtered or summarized before Kenji uses them

### 2. Redacted Conversation Event

A sanitized version of a raw event.

Redacted Conversation Events remove or mask PII, tokens, bank details, payment slips, private identifiers, private model references, and unnecessary sensitive details.

They may be used for AI summarization, but they are still internal only.

### 3. Safe Customer Memory Summary

A short, structured, non-sensitive summary of customer continuity.

It can include language, general intent, repeated topics, safe route preference, and support needs.

It cannot include secrets, raw payment details, private model lists, admin notes, or sensitive allegations.

### 4. Behavior / Intent Tags

Example tags:

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

### 5. Review Flags

Example flags:

- `needs_mmd_review`
- `payment_claim_requires_admin`
- `booking_specific_person_request`
- `possible_confusion`
- `possible_complaint`
- `sensitive_personal_info`
- `do_not_auto_reply`

### 6. Approved Memory Card

An MMD-reviewed safe context card.

It can be used by Kenji runtime only after review. It must be concise and non-sensitive. It must have `allowed_use` and `forbidden_use` fields. It must expire or be reviewed periodically.

## Suggested Schema

### Raw Conversation Event

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

### Redacted Conversation Event

```json
{
  "event_id": "redacted_event_example_001",
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

### Safe Customer Memory Summary

```json
{
  "customer_ref": "customer_ref_placeholder",
  "source_channels": ["line"],
  "language": "th",
  "last_seen_at": "YYYY-MM-DDT00:00:00Z",
  "known_context": "Customer has asked repeated general questions about renewal.",
  "safe_preferences": ["prefers_short_answer", "prefers_link_first_guidance"],
  "repeated_topics": ["Renewal", "Membership"],
  "current_open_threads": ["renewal_status_needs_mmd_review"],
  "risk_flags": ["needs_mmd_review"],
  "recommended_next_step": "Route to official member dashboard and explain that MMD must review status.",
  "kenji_allowed_use": ["personalize_safe_intro", "choose_relevant_knowledge_lane"],
  "kenji_forbidden_use": ["confirm_status", "unlock_access", "approve_payment"],
  "review_status": "draft_review_required",
  "updated_at": "YYYY-MM-DDT00:00:00Z",
  "expires_at": "YYYY-MM-DDT00:00:00Z"
}
```

### Behavior Intent Tag Event

```json
{
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

### Review Flag

```json
{
  "customer_ref": "customer_ref_placeholder",
  "flag": "needs_mmd_review",
  "severity": "medium",
  "reason_safe": "Customer has an open renewal status question that requires MMD review.",
  "created_by": "system_or_admin_placeholder",
  "created_at": "YYYY-MM-DDT00:00:00Z",
  "expires_at": "YYYY-MM-DDT00:00:00Z",
  "required_action": "manual_mmd_review"
}
```

### Approved Memory Card

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

All schemas use placeholder IDs only. Do not include real customer PII, phone numbers, emails, LINE IDs, Telegram IDs, payment references, bank details, or model names.

## What Kenji May Remember

Kenji may remember only safe summaries such as:

- preferred language
- preferred support channel
- repeated general questions
- whether customer often asks about membership, renewal, booking, rules, or payment waiting
- safe preference such as wants short answers or link-first guidance
- whether the case should be escalated to MMD
- last safe next step previously given
- if the customer has an open thread that still needs MMD review
- general non-sensitive continuity, such as "customer previously asked about renewal steps"

## What Kenji Must Never Remember or Use Directly

Kenji must never remember or use directly:

- raw payment slips
- full bank details
- tokens
- secrets
- passwords
- admin bearer / internal tokens
- raw private chat logs shown to the customer
- private model lists
- admin notes
- internal scoring
- sensitive preference details beyond safe route-level wording
- allegations or accusations without MMD review
- exact location data unless explicitly needed and approved
- personal identifiers not needed for the response
- direct claims that payment, booking, membership, renewal, or model availability is confirmed unless backend truth route verifies it
- commercial platform private metadata that is not approved for Kenji runtime

## Authority Boundaries

Kenji can:

- explain process
- route user
- summarize safe known context
- say that MMD must review
- ask for official channel confirmation
- hand off to human support
- mention that a topic was previously discussed only if memory summary is approved and safe

Kenji cannot:

- approve payment
- mark paid
- unlock membership
- confirm booking
- confirm model availability
- decide user tier
- decide Black Card / VIP / SVIP
- waive rules
- expose private data
- override Boss Per / MMD
- use memory as proof of operational status

## Relationship to Knowledge Cards

- Knowledge Cards remain the source of truth for general answers.
- Memory summaries only personalize safe context.
- If Knowledge Card and memory conflict, Knowledge Card / MMD policy wins.
- If no published Knowledge Card exists for the topic, Kenji should not invent policy.
- Sensitive memory can trigger escalation, not direct answer.
- Memory may choose which Knowledge Card is likely relevant, but it must not rewrite policy.
- Memory cannot grant authority that Knowledge Cards deny.

## Relationship to Kenji Mini

Kenji Mini may display safe memory-derived guidance only if:

- backend route is designed for it
- customer is authenticated or safely identified
- data is sanitized
- no raw private data is shown
- no admin notes are shown
- status claims come from backend truth, not frontend assumptions

Kenji Mini must not show:

- raw chat history
- raw admin notes
- private model lists
- hidden risk scoring
- raw payment or identity details
- unreviewed AI summaries

## Relationship to Kenji AI 20

Kenji AI 20 gives persona, voice, and continuity style.

Memory Intelligence gives safe context.

Knowledge Cards give approved answers.

LINE Adapter gives runtime delivery.

Boss Per / MMD gives final authority.

## Relationship to External Platforms

External tools such as respond.io may later act as:

- optional inbox UI
- optional exported conversation source
- optional CSV import source
- optional workflow source

But they must not become:

- the only source of truth
- an uncontrolled memory authority
- a reason to bypass MMD review
- a requirement for the first Kenji Memory MVP

## Privacy and Data Minimization

- Store only what is useful and safe.
- Summarize instead of replaying raw chat.
- Prefer short-lived review flags for volatile issues.
- Expire stale behavioral assumptions.
- Keep sensitive records out of Kenji runtime.
- Let MMD/admin review sensitive or high-impact memory.
- Logs must not contain PII, tokens, raw private messages, or payment details.
- Avoid storing external platform metadata unless needed.

## Retention and Expiry Draft

This document does not define exact legal retention. MMD should set policy later with the right operational and legal review.

Suggested draft approach:

- raw events: limited retention, internal-only
- redacted events: longer but still access-controlled
- safe summaries: refreshable, time-bounded
- review flags: expire unless renewed
- approved memory cards: expire or require review
- behavior tags: confidence and expiry required
- imported transcripts: delete or archive after summary if MMD policy allows
- external platform exports: treated as temporary import files unless MMD approves retention

## Risk Controls

- allowlist during early testing
- feature flag
- safe summary only
- no raw chat exposure
- no PII in logs
- no secrets in logs
- `answer_safe` guard
- `do_not_auto_reply` flag
- manual MMD review for sensitive cases
- audit logs for memory writes
- rollback flag
- draft-only AI summarizer until approved
- no auto-publish memory
- no external platform dependency for core memory
- test with synthetic data before real customer data

## MVP Proposal

Phase 1: Docs and schema only.

Phase 2: Forward-only LINE event store for new messages.

Phase 3: Redaction layer for stored events.

Phase 4: Read-only memory summary viewer for MMD/admin.

Phase 5: Manual memory summary/card creation by MMD/admin.

Phase 6: Kenji can use approved memory summaries in LINE for safe personalization.

Phase 7: Imported chat transcript summarizer draft only.

Phase 8: Automated summarizer draft only, never auto-publish.

Phase 9: Review queue and expiry controls.

Phase 10: Optional external platform import/export integration if cost and utility justify it.

## Non-Goals for MVP

- no autonomous approvals
- no auto-unlock
- no auto-booking
- no private model recommendation from raw chat
- no customer-facing raw chat history viewer
- no automatic sensitive profiling
- no historical LINE access unless MMD has imported or stored the data
- no raw transcript exposure to customers
- no paid external platform requirement for initial memory
- no respond.io Advanced dependency for V2.1

## Example Safe Response Patterns

### 1. Payment Waiting

Customer asks:

```text
ผมส่งสลิปแล้ว ทำไมยังไม่ขึ้น
```

Kenji may say:

```text
ผมเห็นว่าเรื่องนี้เกี่ยวกับการตรวจยอดครับ สถานะชำระเงินต้องให้ MMD ตรวจจากระบบทางการก่อน ระหว่างนี้ยังไม่ถือว่ายืนยันการชำระเงินเรียบร้อยครับ
```

Kenji must not say:

```text
จ่ายแล้วครับ
ระบบยืนยันแล้ว
สิทธิ์เปิดแล้ว
```

### 2. Renewal Follow-Up

Customer asks:

```text
ครั้งก่อนผมถามเรื่องต่ออายุไว้
```

Kenji may say:

```text
ถ้าก่อนหน้านี้คุณถามเรื่องต่ออายุ ผมช่วยพาไปขั้นตอนต่ออายุได้ครับ แต่สถานะจริงต้องให้ระบบ MMD ตรวจอีกครั้งก่อนนะครับ
```

Kenji must not say:

```text
ผมจำได้ว่าคุณต่ออายุสำเร็จแล้ว
```

The blocked statement above must remain blocked unless backed by a verified backend truth route.

### 3. Booking Follow-Up

Customer asks:

```text
คนที่เคยถามไว้ยังจองได้ไหม
```

Kenji may say:

```text
ผมช่วยพาไปขั้นตอนส่งคำขอจองหรือให้ MMD ตรวจเคสต่อได้ครับ แต่ผมยังยืนยัน availability หรือการจองแทน MMD ไม่ได้ครับ
```

Kenji must not say:

```text
ยังจองได้ครับ
model พร้อมครับ
จองสำเร็จแล้วครับ
```

### 4. Prior Conversation Context

Customer asks:

```text
ผมเคยคุยเรื่องนี้แล้ว จำได้ไหม
```

Kenji may say:

```text
ผมช่วยดูจากข้อมูลสรุปที่ MMD อนุมัติไว้ได้ครับ ถ้าเป็นเรื่องสถานะจริง เช่น ชำระเงิน จอง หรือสมาชิก ยังต้องให้ MMD ตรวจจากระบบทางการอีกครั้งนะครับ
```

Kenji must not say:

```text
ผมอ่านแชททั้งหมดของคุณแล้ว
ผมยืนยันจากประวัติว่าเรียบร้อยแล้ว
```

## Open Questions

- Which channels are included first: LINE, Telegram, Webflow forms?
- Where should raw events live: KV, D1, R2, Airtable-style table, or CRM?
- Where should safe summaries live?
- Who can approve memory cards?
- What expiry period should be used?
- Should customer be able to request memory deletion?
- Which fields are allowed in Kenji Mini?
- How should conflict between memory and live backend status be handled?
- Should imported transcript summaries be allowed into runtime only after manual approval?
- Should memory be per LINE user, member account, phone, email, or merged identity?
- What is the minimum useful memory MVP that avoids paid external platform cost?
- Which part of existing member-dashboard-chat-worker webhook can safely emit sanitized events later?

## Current Implementation Status

- Not implemented yet.
- No runtime behavior changed by this document.
- respond.io evaluation is paused and not part of the required core.
- Next recommended tasks:
  1. create safe memory data contract
  2. decide storage
  3. decide approval workflow
  4. build read-only admin viewer before any customer-facing memory use
  5. only then add runtime memory context to Kenji

## Final Safety Lock

Kenji Memory Intelligence may help MMD remember context, but it must never become an unchecked authority system. Memory is context, not permission. Boss Per / MMD remains the final authority.

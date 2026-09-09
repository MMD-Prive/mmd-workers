# Kenji CEO Control — Action Contract V1

Status: Proposed contract only
Owner: admin-worker
Surface: Webflow `/internal/ceo/kenji-control`
Read contract: `KENJI_CEO_CONTROL_ENDPOINTS_V1.md`
Implementation: not enabled by this document

This contract is intentionally separate from the read-only endpoints in PR #443. It defines controlled mutations for approval decisions, conversation takeover, customer-message sending, and the emergency kill switch.

## Non-negotiable rules

- Every mutation is authenticated and actor-bound.
- Every mutation requires `Idempotency-Key`.
- Every record mutation requires `expected_version`.
- Every mutation writes an audit event before returning success.
- A stale `expected_version` fails with HTTP 409 `version_conflict`.
- Customer messages never send directly from the browser to LINE.
- Approval actions never imply payment confirmation, entitlement, VIP, SVIP, Black Card, or booking approval unless the authoritative workflow separately confirms it.
- Kill switch changes are owner-only and require a reason.
- No endpoint accepts the legacy query/body field name `token`; use `t` only where a signed flow requires it.

## 1. Approval decision

### Endpoint

`POST /v1/admin/kenji/control/approvals/:record_id/decision`

### Request

```json
{
  "expected_version": 3,
  "decision": "approve",
  "reason": "ตรวจข้อมูลครบและพร้อมส่งต่อ",
  "next_status": "approved"
}
```

Headers:

- `Idempotency-Key: <unique mutation key>`
- `Content-Type: application/json`

Allowed decisions:

- `approve`
- `reject`
- `request_changes`
- `escalate`

The Worker must validate the current record, source table, actor role, and allowed state transition. The browser cannot choose an arbitrary Airtable table or write arbitrary fields.

### Response

```json
{
  "ok": true,
  "operation": "approval_decision",
  "record_id": "rec...",
  "decision": "approve",
  "status": "approved",
  "version": 4,
  "audit_id": "audit_..."
}
```

## 2. Conversation takeover

### Endpoint

`POST /v1/admin/kenji/control/conversations/:conversation_id/takeover`

### Request

```json
{
  "expected_version": 8,
  "action": "claim",
  "owner": "boss-per",
  "reason": "ต้องตอบเคสนี้ด้วยการตรวจสอบจากเปอร์"
}
```

Allowed actions:

- `claim`
- `release`
- `pause_kenji`
- `resume_kenji`

Rules:

- `claim` and `pause_kenji` stop automatic customer replies for that conversation.
- `release` does not automatically send a customer message.
- `resume_kenji` is allowed only after a fresh QA/access check.
- The endpoint may not expose or overwrite raw conversation bodies.

## 3. Customer-message workflow

Customer-message sending is split into two actions so a message cannot be sent accidentally from a preview click.

### Create draft

`POST /v1/admin/kenji/control/messages/draft`

```json
{
  "conversation_id": "conv_...",
  "reply": "ผมรับเรื่องไว้แล้วครับ เดี๋ยวผมตรวจรายละเอียดให้ก่อน",
  "channel": "line_oa",
  "reason": "manual_review"
}
```

Returns a draft ID and privacy/access validation result. It does not send.

### Send approved draft

`POST /v1/admin/kenji/control/messages/:draft_id/send`

```json
{
  "expected_version": 1,
  "confirmation": "send_customer_message"
}
```

Additional rules:

- Owner or explicitly delegated operator only.
- Fresh confirmation is required.
- Must have an active conversation takeover or approved manual-send state.
- Must pass customer-safe copy validation.
- Must be idempotent by `Idempotency-Key`.
- Every send records channel, actor, timestamp, draft hash, and delivery result.
- No payment, access, booking, or privilege guarantee wording may pass validation.

## 4. Emergency kill switch

### Endpoint

`POST /v1/admin/kenji/control/runtime/kill-switch`

### Request

```json
{
  "expected_version": 2,
  "enabled": true,
  "scope": "line_oa_auto_reply",
  "reason": "หยุดตอบอัตโนมัติเพื่อตรวจ incident"
}
```

Allowed scopes:

- `line_oa_auto_reply`
- `model_keyword_auto_reply`
- `all_kenji_mutations`

Rules:

- Owner-only.
- The response must include the active state and version.
- Enabling the switch fails closed: automatic replies and selected mutations stop.
- Disabling the switch requires a new explicit owner action and audit event.
- The kill switch must not delete data or alter customer records.

## Authentication and authorization

The existing signed admin session remains the browser authentication method.

Service calls must use a bearer matching `INTERNAL_TOKEN` or `ADMIN_BEARER`, or a confirmation key matching `CONFIRM_KEY`. Arbitrary presence of an Authorization or confirmation header is not authentication.

Role requirements:

| Action | Required role |
|---|---|
| Approval decision | reviewer; publish-like decisions may require owner |
| Claim/release takeover | owner or delegated operator |
| Create message draft | reviewer |
| Send customer message | owner or explicit delegate |
| Kill switch | owner |

## Error contract

- `400 invalid_request`
- `401 unauthorized`
- `403 insufficient_role`
- `404 record_not_found`
- `409 version_conflict` or `idempotency_conflict`
- `422 transition_not_allowed` or `unsafe_customer_copy`
- `423 kill_switch_active`
- `503 mutation_not_ready`

Error responses must not include secrets, raw customer content, Airtable credentials, or internal bearer values.

## Audit minimum

Every successful or rejected mutation records:

- `audit_id`
- actor ID and role
- operation
- target record/conversation/draft
- expected and actual version
- reason
- result
- created timestamp
- request correlation ID
- no raw message body; store a redacted summary or content hash

## Explicitly out of scope

- Direct Airtable writes from Webflow
- Automatic pricing decisions
- Granting VIP, SVIP, Black Card, or private access
- Payment verification
- Booking confirmation
- Flash preview authorization
- Telegram or LINE sends without the message workflow above
- Implementing these endpoints in `immigrate-worker`

## Implementation gate

This contract is ready for review only. A separate implementation PR must:

1. Add route handlers to `admin-worker`.
2. Reuse the existing atomic/audit patterns where applicable.
3. Add tests for authentication, role checks, idempotency, stale versions, kill switch, unsafe copy, and duplicate retries.
4. Run CI and Wrangler dry-run.
5. Deploy only after explicit approval.

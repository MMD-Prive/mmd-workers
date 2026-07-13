# Kenji LINE Knowledge Adapter V1.5C.1

## Purpose

V1.5C.1 lets allowlisted LINE test users ask customer-facing Kenji Knowledge questions without needing to type internal phrases such as `Kenji AI`.

The adapter remains controlled mode only. It does not open Kenji Knowledge answers to all LINE users.

## Source Lock

Kenji answers only from reviewed and published Kenji Knowledge cards returned by:

```text
GET /v1/internal/kenji/knowledge/published
```

The LINE adapter must not read Airtable directly and must not call draft, review, archive, publish, list, metadata, or mutation endpoints.

## Required Gates

- `LINE_KENJI_AI_ENABLED=true`
- `LINE_KENJI_KNOWLEDGE_ENABLED=true`
- `LINE_KENJI_KNOWLEDGE_ALLOWLIST` contains the LINE user ID
- Message is a text message
- Message is a safe direct intent or an approved customer-facing trigger with an actual question

## Supported Customer-Facing Messages

- `ส่งสลิปแล้วต้องรอไหม`
- `MMD ช่วยเช็กเรื่องสลิปหน่อย`
- `Hi MMD ส่งสลิปแล้วต้องรอไหม`
- `สมัครสมาชิกต้องทำยังไง`
- `ต่ออายุสมาชิกยังไง`
- `จองยังไง`

Backward-compatible controlled prompts remain supported:

- `Kenji AI ส่งสลิปแล้วต้องรอไหม`
- `Per AI ส่งสลิปแล้วต้องรอไหม`
- `เปอร์ ai ส่งสลิปแล้วต้องรอไหม`

Trigger-only text such as `Hi MMD` does not force a knowledge answer. Owner/human routing text such as `คุยกับเปอร์` remains outside the knowledge adapter.

## Safety

If no published card matches, Kenji returns no knowledge answer and the LINE worker falls back to the existing safe scripted path or human-support route.

Kenji must never:

- approve payment
- unlock membership
- grant access
- expose PII
- expose tokens, secrets, Airtable record IDs, LINE user IDs, or internal admin routes
- mutate backend state

Unsafe card answers fall back to a safe Thai message that says MMD must check the official system first.

## Diagnostics

Allowed safe log names:

- `line_kenji_knowledge_probe`
- `line_kenji_knowledge_match`
- `line_kenji_knowledge_fallback`
- `line_kenji_knowledge_blocked`

Allowed fields are booleans/enums only: feature enabled, knowledge enabled, allowlisted, has question, matched, reason, lane, language, and answer safety.

Diagnostics must not log full LINE user IDs, full message text, token values, Authorization headers, card IDs, customer PII, backend URLs, or secret/env values.

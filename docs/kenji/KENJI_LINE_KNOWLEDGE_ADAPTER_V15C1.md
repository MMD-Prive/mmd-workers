# Kenji LINE Knowledge Adapter V1.5C.1

## Purpose

V1.5C.1 keeps the internal Kenji Knowledge Adapter name, but allows controlled LINE tests to use customer-facing messages. Customers do not need to know or type "Kenji AI".

The adapter remains controlled mode only. It still requires both feature flags and an allowlisted LINE user.

## Customer-Facing Triggers

Supported controlled-test messages include:

- `ส่งสลิปแล้วต้องรอไหม`
- `MMD ช่วยเช็กเรื่องสลิปหน่อย`
- `Hi MMD ส่งสลิปแล้วต้องรอไหม`
- `สมัครสมาชิกต้องทำยังไง`
- `ต่ออายุสมาชิกยังไง`
- `จองยังไง`

Backward-compatible internal phrases still work:

- `Kenji AI ส่งสลิปแล้วต้องรอไหม`
- `Per AI ส่งสลิปแล้วต้องรอไหม`
- `เปอร์ ai ส่งสลิปแล้วต้องรอไหม`

Trigger-only `Hi MMD` does not force a knowledge answer. `คุยกับเปอร์` stays on the owner/human-facing path and does not become a generic knowledge answer.

## Gates

The adapter runs only when:

- `LINE_KENJI_AI_ENABLED=true`
- `LINE_KENJI_KNOWLEDGE_ENABLED=true`
- `LINE_KENJI_KNOWLEDGE_ALLOWLIST` contains the LINE user id
- the event is a LINE text message
- the message has a safe direct intent or approved customer-facing trigger plus a real question

Non-allowlisted users and feature-off states remain unchanged.

## Diagnostics

Safe diagnostic log names:

- `line_kenji_knowledge_probe`
- `line_kenji_knowledge_match`
- `line_kenji_knowledge_fallback`
- `line_kenji_knowledge_blocked`

Allowed fields only:

- event name
- enabled
- knowledge_enabled
- allowlisted
- has_question
- matched
- fallback reason enum
- lane
- language
- answer_safe

Diagnostics must not log full user id, full message text, token values, authorization headers, card id, customer PII, backend URLs, or secret/env values.

## Safety

Kenji may guide, explain, route, and summarize safe next steps.

Kenji must not:

- approve payment
- mark paid
- unlock membership
- grant VIP, SVIP, Black Card, or any privilege
- expose backend/private data, admin notes, PII, tokens, keys, or internal worker details

## Deployment Lock

- No deploy in V1.5C.1 build task.
- No LINE publish.
- No Webflow publish.
- No push.
- No merge.
- No public rollout.

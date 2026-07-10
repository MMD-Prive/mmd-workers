# Kenji LINE Knowledge Adapter V1.5A

## Purpose

Kenji LINE Knowledge Adapter V1.5A connects the LINE-side `member-dashboard-chat-worker` to published Kenji Knowledge Room cards in controlled mode only.

The adapter is read-only and deterministic. It does not call mutation endpoints, does not approve anything, and does not replace Boss Per or official MMD system checks.

## Architecture

- LINE worker module: `member-dashboard-chat-worker/src/kenji-knowledge-adapter.js`
- LINE integration point: `handleLineWebhook` in `member-dashboard-chat-worker/src/index.js`
- Knowledge source: `GET /v1/internal/kenji/knowledge/published`
- Auth method: worker internal token via `Authorization: Bearer ...`
- Mutation endpoints: never called from LINE worker

## Controlled Flags

- `LINE_KENJI_AI_ENABLED`
- `LINE_KENJI_KNOWLEDGE_ENABLED`
- `LINE_KENJI_KNOWLEDGE_ALLOWLIST`
- `KENJI_KNOWLEDGE_BASE_URL`
- `KENJI_KNOWLEDGE_INTERNAL_TOKEN` or existing `INTERNAL_TOKEN`
- `KENJI_KNOWLEDGE_TIMEOUT_MS`, default `1500`
- `KENJI_KNOWLEDGE_CACHE_TTL_MS`, default `60000`
- `LINE_KENJI_KNOWLEDGE_DRY_RUN`, optional

`LINE_KENJI_KNOWLEDGE_ENABLED` should remain off by default until controlled allowlist testing is approved.

## Activation Rules

The adapter can reply only when all of these are true:

- LINE Kenji AI flag is enabled.
- Knowledge adapter flag is enabled.
- Sender LINE userId is in the allowlist.
- Event is a text message.
- Text contains a Kenji trigger or a safe known intent.
- Text is not only a trigger phrase.
- A published, non-internal card matches with sufficient confidence.
- The selected answer passes runtime safety filtering.

If any condition fails, the adapter returns `null` and existing LINE behavior continues.

## Matching

The adapter uses deterministic scoring:

- Exact or contained match against `customer_question_examples`
- Strong token overlap with examples
- Title overlap
- Lane keyword support
- Language preference, Thai for Thai/unknown messages and English for English messages

Lane-only weak matches are not enough to reply.

## Runtime Safety

The runtime filter blocks answers that claim payment success, paid status, membership activation, unlocks, VIP/SVIP/Black Card approval, backend/admin details, tokens, private keys, emails, phone numbers, bearer credentials, or long token-like strings.

If an otherwise matched answer fails this filter, Kenji returns a safe Thai fallback:

`ผมช่วยอธิบายขั้นตอนเบื้องต้นให้ได้ครับ แต่เคสนี้ต้องให้ MMD ตรวจจากระบบทางการก่อนนะครับ`

## Customer Reply Rules

- Reply primarily uses `kenji_safe_answer`.
- One customer-safe route may be appended.
- Admin, internal, and versioned admin/internal routes are never appended.
- Replies must not mention card IDs, KV, admin-worker, internal routes, or private system details.

## Test Commands

```sh
node --check member-dashboard-chat-worker/src/index.js
node --check member-dashboard-chat-worker/src/kenji-knowledge-adapter.js
node --test member-dashboard-chat-worker/test/kenji-knowledge-adapter.test.mjs
node --test member-dashboard-chat-worker/test/line-webhook.test.mjs
git diff --check -- member-dashboard-chat-worker docs/kenji
```

## Locks

- No deploy.
- No LINE publish.
- No Webflow publish.
- No merge.
- No broad public Kenji consume.
- No backend mutation from Kenji.

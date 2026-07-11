# Kenji LINE Knowledge Adapter V1.5A

## Purpose

Kenji LINE Knowledge Adapter V1.5A lets the LINE-side Kenji scripted flow read published Kenji Knowledge Room cards in controlled mode only.

V1.5A does not open Kenji to all LINE users. It only replies when the feature flags are enabled and the LINE user is explicitly allowlisted.

## Source

Published knowledge is read from:

```text
GET /v1/internal/kenji/knowledge/published
```

The LINE adapter must not call admin mutation routes. It does not create, patch, publish, archive, list, or edit knowledge cards.

## Runtime Flags

- `LINE_KENJI_AI_ENABLED=true`
- `LINE_KENJI_KNOWLEDGE_ENABLED=true`
- `LINE_KENJI_KNOWLEDGE_ALLOWLIST=U...`
- `KENJI_KNOWLEDGE_BASE_URL=https://...`
- `KENJI_KNOWLEDGE_INTERNAL_TOKEN=...`

Optional:

- `KENJI_KNOWLEDGE_TIMEOUT_MS`
- `KENJI_KNOWLEDGE_CACHE_TTL_MS`
- `LINE_KENJI_KNOWLEDGE_DRY_RUN=true`

## Safety

Kenji may guide clients through next steps, renewal, payment guidance, booking guidance, membership support, and escalation.

Kenji must not:

- approve payment
- mark paid
- unlock membership
- grant VIP, SVIP, or Black Card
- expose backend or private data
- expose tokens, keys, Airtable record IDs, LINE user IDs, or internal admin routes

Unsafe answers fail closed to a safe Thai fallback telling the client that MMD must check the official system first.

## Integration Point

`member-dashboard-chat-worker/src/index.js` imports `maybeBuildKenjiKnowledgeReply` and calls it inside `handleLineWebhook` for LINE text messages before the existing scripted fallback reply.

## Test Coverage

- Adapter feature flags and allowlist
- Published endpoint fetch
- Failure closed on missing config or fetch failure
- Card scoring and language matching
- Unsafe answer fallback
- Internal/admin route stripping
- LINE webhook allowlisted reply using a published safe answer

## V1.5A Locks

- Controlled mode only.
- No public LINE trigger expansion.
- No Rich Menu changes.
- No admin-worker changes.
- No deploy.
- No LINE publish.
- No Webflow publish.

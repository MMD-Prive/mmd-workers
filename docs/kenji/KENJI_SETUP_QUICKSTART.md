# Kenji Setup Quickstart

## Purpose

This quickstart gives a beginner-safe way to orient, run focused checks, tail the worker, test LINE, and verify published Knowledge Cards.

Do not paste credential values into terminal output, docs, commits, issues, screenshots, or chat.

## Check Branch

```sh
git branch --show-current
git status --short
```

Expected branch for this work:

```text
feat/kenji-line-knowledge-v15c1
```

## Run Focused Tests

From the repo root:

```sh
node --check member-dashboard-chat-worker/src/kenji-knowledge-adapter.js
node --test member-dashboard-chat-worker/test/kenji-knowledge-adapter.test.mjs
node --test member-dashboard-chat-worker/test/line-webhook.test.mjs
git diff --check -- docs/kenji member-dashboard-chat-worker
```

These checks are focused on Kenji Knowledge and the LINE adapter. Do not run broad suites unless the task calls for them.

## Tail Worker

From the chat worker directory:

```sh
cd member-dashboard-chat-worker
npx wrangler tail --format json
```

Watch only for safe diagnostic events such as:

- `line_kenji_knowledge_probe`
- `line_kenji_knowledge_fetch_start`
- `line_kenji_knowledge_fetch_debug`
- `line_kenji_knowledge_match`
- `line_kenji_knowledge_fallback`

Do not log or publish LINE user IDs, token values, Authorization headers, full request bodies, admin notes, or private data.

## Test LINE Messages

Use an allowlisted LINE account.

Safe live verification messages:

- ส่งสลิปแล้วต้องรอไหม
- สมัครสมาชิกต้องทำยังไง
- ต่ออายุสมาชิกยังไง
- จองยังไง
- มีกฎอะไรบ้าง

Expected result:

- feature flags enabled
- allowlist passes
- question is detected
- matching lane is correct
- `answer_safe` is true
- webhook status is 200

## Verify Published Endpoint

Use the protected published endpoint only. Do not read Airtable directly from the LINE adapter.

Required env names:

- `KENJI_KNOWLEDGE_BASE_URL`
- `KENJI_KNOWLEDGE_INTERNAL_TOKEN`

Use the existing protected endpoint check flow from the Kenji publish verification tasks. Keep credentials local and do not paste request headers or token values into docs or reports.

When reporting results, summarize only:

- HTTP status
- `ok`
- top-level keys
- card count
- titles
- lanes
- language
- audience
- status

Do not print token values or headers with credential values.

## Environment Names

Names only:

- `LINE_AUTO_REPLY_ENABLED`
- `LINE_KENJI_AI_ENABLED`
- `LINE_KENJI_KNOWLEDGE_ENABLED`
- `LINE_KENJI_KNOWLEDGE_ALLOWLIST`
- `KENJI_KNOWLEDGE_BASE_URL`
- `KENJI_KNOWLEDGE_INTERNAL_TOKEN`
- `KENJI_KNOWLEDGE_TIMEOUT_MS`
- `KENJI_KNOWLEDGE_CACHE_TTL_MS`
- `KENJI_KNOWLEDGE_STALE_CACHE_TTL_MS`

## Safety Reminder

Kenji answers from published Knowledge Cards only. If no published card matches, Kenji should fall back safely or route to human support.

Kenji must not approve, confirm, unlock, mark paid, grant access, expose private data, or mutate backend state.

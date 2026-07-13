# Kenji Chatbot AI File Map

## Purpose

This map explains which files belong to the live LINE chatbot path, which files are tests, which files are Knowledge Card source material, and which files are alignment/reference docs.

Kenji is layered. A file being named Kenji does not mean it is the chatbot brain.

## Runtime Adapter

```text
member-dashboard-chat-worker/src/kenji-knowledge-adapter.js
```

This is the LINE Knowledge Adapter logic. It:

- checks feature flags
- checks the LINE allowlist
- fetches published Knowledge Cards
- filters usable published cards
- matches safe customer questions
- applies answer safety rules
- emits safe diagnostics

It must read only from the published Knowledge endpoint. It must not read drafts, review cards, archived cards, internal-only cards, Airtable directly, admin notes, or raw backend state.

## Webhook Route

```text
member-dashboard-chat-worker/src/index.js
```

This file owns the broader member dashboard chat worker and LINE webhook route. It receives LINE events and calls the adapter when Kenji Knowledge is enabled and the event is eligible.

Do not change this file for documentation, card seed, Kenji Mini, or starter-kit work.

## Tests

```text
member-dashboard-chat-worker/test/kenji-knowledge-adapter.test.mjs
member-dashboard-chat-worker/test/line-webhook.test.mjs
```

These tests cover:

- feature flags and allowlist behavior
- published-card fetching and fail-closed behavior
- stale cache reliability behavior
- answer matching
- answer safety
- webhook reply behavior

Run these before deploying `member-dashboard-chat-worker`.

## Seed Card Source

```text
docs/kenji/seed-cards/*
```

Seed card files are source material for review. They are not live just because they exist in Git.

Cards become live only after controlled admin review, publish, protected endpoint verification, and LINE live verification.

## Alignment Docs

```text
docs/kenji/KENJI_SYSTEM_ALIGNMENT_V20.md
```

This is the canonical alignment document for:

- Kenji 7.0
- Kenji Mini
- Kenji AI 20
- Kenji Knowledge Cards
- LINE Knowledge Adapter
- Boss Per / MMD authority

Read it before deciding whether a new request belongs to chatbot runtime, Knowledge Cards, Kenji Mini, board visibility, or authority policy.

## Live Verified Lanes

Current live verified Knowledge lanes:

- Payment
- Membership
- Renewal
- Booking
- Rules

Safe exported card content is available at:

```text
docs/kenji/exports/kenji-live-verified-cards-v1.json
```

That export intentionally omits internal card IDs, tokens, backend URLs, admin notes, and private data.

## What Not To Mix

Do not mix these in one change unless explicitly approved:

- LINE adapter runtime behavior
- Knowledge Card content
- Kenji Mini UI
- admin-worker publishing flow
- Webflow files
- Rich Menu files
- payment, membership, booking, or model availability authority logic

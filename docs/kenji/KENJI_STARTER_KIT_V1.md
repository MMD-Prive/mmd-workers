# Kenji Starter Kit V1

## What Kenji Is

Kenji is not one downloadable chatbot file.

Kenji is a layered system made of:

- a runtime LINE adapter
- published Knowledge Cards
- a persona / voice layer
- optional page surfaces such as Kenji Mini
- internal alignment and safety rules
- Boss Per / MMD as final authority

For the canonical layer map, open:

```text
docs/kenji/KENJI_SYSTEM_ALIGNMENT_V20.md
```

## What Is Already Live

Kenji Knowledge is live verified for these lanes:

- Payment
- Membership
- Renewal
- Booking
- Rules

The customer-facing LINE adapter reads from the protected published Knowledge endpoint and answers only from published cards. Draft, review, archived, and internal-only cards are not live answer sources.

## What Is Not Yet Built

These pieces are not complete live products in this repo:

- Kenji Mini public/member page
- downloadable standalone chatbot bundle
- full Memory Intelligence product UI
- direct Airtable-reading LINE chatbot
- automatic approval or confirmation workflow

V1.5F draft candidates that are not live verified unless later published:

- Booking Model Preference Guide
- Payment Proof Waiting Guide
- Human Support Escalation Guide

## File Map

Open these files first:

- `docs/kenji/KENJI_SYSTEM_ALIGNMENT_V20.md` - canonical layer boundaries.
- `docs/kenji/KENJI_CHATBOT_AI_FILE_MAP.md` - which files belong to chatbot runtime, tests, cards, and alignment.
- `docs/kenji/KENJI_SETUP_QUICKSTART.md` - beginner-safe local commands and test flow.
- `docs/kenji/KENJI_MINI_PAGE_BRIEF.md` - future Kenji Mini page brief.
- `docs/kenji/exports/kenji-live-verified-cards-v1.json` - safe export of live verified card content.

Runtime files are listed for orientation only. Do not edit runtime code during starter-kit review.

## Quick Start

1. Confirm the branch:

```sh
git branch --show-current
```

2. Read the alignment doc:

```text
docs/kenji/KENJI_SYSTEM_ALIGNMENT_V20.md
```

3. Read the file map:

```text
docs/kenji/KENJI_CHATBOT_AI_FILE_MAP.md
```

4. Use the quickstart only when checking live runtime behavior:

```text
docs/kenji/KENJI_SETUP_QUICKSTART.md
```

## Testing LINE

LINE testing should use an allowlisted account and safe customer-facing messages.

Current live verified examples include:

- ส่งสลิปแล้วต้องรอไหม
- สมัครสมาชิกต้องทำยังไง
- ต่ออายุสมาชิกยังไง
- จองยังไง
- มีกฎอะไรบ้าง

Expected safe behavior:

- the adapter logs safe diagnostics
- a published card matches
- `answer_safe` is true
- Kenji explains process only
- Kenji does not approve, confirm, unlock, or mutate state

## Safety Boundaries

Kenji must never:

- approve payment
- mark paid
- unlock membership
- confirm booking
- confirm model availability
- grant VIP / SVIP / Black Card
- expose private model lists
- expose admin notes
- expose backend routes, tokens, keys, or secrets
- override Boss Per or MMD review
- promise exact response times
- waive rules or exceptions

Kenji can:

- explain safe process
- route to official pages
- summarize safe next steps
- ask the user to wait for MMD review
- explain that payment, membership, booking, or model availability is not confirmed until MMD checks it

## Rollback Notes

If Kenji Knowledge behavior needs to be paused, use operational feature flags rather than changing cards or runtime code first.

Useful control flags by name only:

- `LINE_KENJI_AI_ENABLED`
- `LINE_KENJI_KNOWLEDGE_ENABLED`

Do not paste secrets or token values into docs, issues, chats, commits, or screenshots.

## Next Recommended Work

- Review and commit this starter kit.
- Keep Kenji Mini as a separate UI task.
- Keep new Knowledge lanes as draft cards first.
- For every new live answer lane, follow: draft cards, review, controlled publish, protected endpoint verification, then LINE live verification.
- Avoid mixing chatbot runtime, Knowledge Card content, Kenji Mini UI, and Memory Intelligence work in one change.

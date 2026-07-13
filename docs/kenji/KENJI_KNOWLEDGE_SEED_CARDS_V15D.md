# Kenji Knowledge Seed Cards V1.5D

## Status

Review draft only. This pack is not published and does not change production LINE behavior by itself.

## Sources Used

- Google Drive: `Kenji Knowledge Seed Sources V1`
- Google Drive: `Kenji LINE Knowledge Adapter - Live Test Passed`
- GitHub repo: `MMD-Prive/mmd-workers`

The Drive source inventory sets the core rule: Kenji answers only from published Kenji Knowledge cards. If no reviewed card is published, Kenji should not invent an answer.

The live-test handoff confirms the current adapter path, feature gates, allowlist gate, safe diagnostics, and rollback switch: `LINE_KENJI_KNOWLEDGE_ENABLED=false`.

## Created Draft Cards

The seed file is:

```text
docs/kenji/seed-cards/kenji-knowledge-seed-cards-v15d.json
```

Cards created:

- Payment: `Payment Slip Verification`
- Membership: `Membership Signup Guide`
- Renewal: `Membership Renewal Guide`
- Booking: `Booking Request Guide`
- Rules: `Rules and Service Boundaries`
- Support: `Human Escalation to MMD`

All cards use:

- `language: th`
- `status: draft`
- customer-facing question examples
- safe answer text
- do/don't rules
- escalation rule
- related public route hints

## Safety Locks

These cards are written for review before publishing. They do not approve or change any real customer state.

Kenji may:

- explain the next safe step
- clarify payment, membership, renewal, booking, rules, and support routes
- route customer-specific questions to MMD review

Kenji must not:

- verify a payment result
- change membership state
- open access
- approve premium tiers
- confirm a booking or model schedule
- expose private customer data
- expose backend routes, tokens, admin notes, Airtable IDs, KV keys, or operational data

## Publish Path

This repo update creates draft seed content only.

Do not publish automatically. Publication should happen only through the existing Kenji Knowledge Room/admin-worker review flow after human approval.

## Runtime Preservation

The current production adapter behavior should remain unchanged:

- `member-dashboard-chat-worker` reads only the published knowledge endpoint.
- Feature flags and allowlist remain required.
- Non-allowlisted users, feature-off state, random text, trigger-only `Hi MMD`, and `คุยกับเปอร์` should not receive a knowledge-card answer.
- Diagnostics remain limited to safe booleans/enums.

## Review Checklist

- Confirm each card is still draft.
- Confirm each answer avoids customer-specific status claims.
- Confirm related routes are public-safe route hints only.
- Confirm no source text copied raw from internal documents.
- Confirm no secret, user ID, token, admin note, Airtable record ID, or private backend detail appears.

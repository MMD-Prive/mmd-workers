# Kenji Knowledge Seed Cards V1.5F

## Status

Review draft only. This pack is not published and does not change production LINE behavior by itself.

## Current Baseline

Kenji Knowledge Publish Verification V1.5E is live checked for:

- Payment
- Membership
- Renewal

The new V1.5F seed pack prepares the next review batch only:

- Booking
- Rules
- Support

## Seed File

```text
docs/kenji/seed-cards/kenji-knowledge-seed-cards-v15f-booking-rules-support.json
```

## Created Draft Cards

- Booking: `Booking Request Guide`
- Booking: `Booking Model Preference Guide`
- Rules: `Customer Rules Guide`
- Support: `Payment Proof Waiting Guide`
- Support: `Human Support Escalation Guide`

All cards use:

- `language: th`
- `audience: public_member`
- `status: draft`
- customer-facing question examples
- safe answer text
- do/don't rules
- escalation rule
- related public or member-safe route hints

## Safety Boundaries

These cards are written for review before publishing. They do not approve or change any real customer state.

Kenji may:

- explain how to start a booking request
- explain that model preferences can be shared as context
- guide users to customer rules
- explain that payment proof needs MMD review
- route sensitive cases to MMD support

Kenji must not:

- give final booking acceptance
- state model schedule status
- promise a specific model
- quote final price
- clear payment
- open membership access
- waive rules
- expose private model lists
- expose private customer data
- expose backend routes, tokens, admin notes, Airtable IDs, KV keys, or operational data

## Publish Path

This repo update creates draft seed content only.

Do not publish automatically. Publication should happen only through the existing Kenji Knowledge Room/admin-worker review flow after human approval.

## Runtime Preservation

No worker behavior changes are included. The current production adapter behavior remains unchanged:

- `member-dashboard-chat-worker` reads only the published knowledge endpoint.
- Feature flags and allowlist remain required.
- Draft cards are not live answers.
- Diagnostics remain limited to safe booleans/enums and fetch-shape counts.

## Review Checklist

- Confirm each card is still draft.
- Confirm each answer avoids customer-specific status claims.
- Confirm related routes are public or member-safe route hints only.
- Confirm no source text copied raw from internal documents.
- Confirm no secret, user ID, token, admin note, Airtable record ID, or private backend detail appears.

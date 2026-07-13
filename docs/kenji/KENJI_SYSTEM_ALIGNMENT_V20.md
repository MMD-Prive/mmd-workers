# Kenji System Alignment V2.0

## Status

- Draft / internal alignment document.
- Purpose: prevent future confusion between Kenji board, mini page, persona/intelligence layer, knowledge source, and runtime adapter.

## Canonical Layer Map

### 1. Kenji 7.0

Kenji 7.0 is the board / command-board era.

It is a read-only operational visibility layer for queue, status, signals, command cards, and the operator view. It is not customer-facing chatbot intelligence.

Kenji 7.0 must not mutate booking, payment, or member state. It must not approve, unlock, or confirm customer outcomes.

### 2. Kenji Mini

Kenji Mini is the lightweight Kenji page/interface layer.

It is a small public/member-facing entry page or mini assistant surface. It can display quick guidance, route users, explain safe next steps, and introduce Kenji.

Kenji Mini does not own intelligence by itself. If it gives process answers, it must use approved Knowledge Cards or safe static copy. It must not approve, confirm, unlock, mark paid, reveal private data, or override MMD.

### 3. Kenji AI 20

Kenji AI 20 is the persona + intelligence layer.

It defines Kenji's voice, continuity, assistant identity, and client/member care style. It can explain, guide, summarize, route, and preserve continuity.

Kenji AI 20 must stay bounded by MMD authority and published knowledge. It must not invent policy, expose backend details, or act as final authority.

### 4. Kenji Knowledge Cards

Kenji Knowledge Cards are the approved source of truth.

Cards are written, reviewed, and published by the MMD / Per / admin flow. Kenji may answer from published cards only. Draft, review, and archived cards are not live answer sources.

No published card means no knowledge answer.

Current live verified lanes:

- Payment
- Membership
- Renewal
- Booking
- Rules

### 5. LINE Knowledge Adapter

The LINE Knowledge Adapter is the customer-facing runtime channel.

It receives LINE webhook events and uses feature flags, allowlist, published Knowledge Cards, fetch diagnostics, and answer safety. It must enforce the safety guard and `answer_safe`.

It must not expose internal card IDs, backend URLs, tokens, user IDs, admin notes, or private data. It must not mutate admin state.

### 6. Boss Per / MMD Authority

Boss Per / MMD is the final decision and approval layer.

Only MMD / Boss Per / admin review can approve payment, booking, model availability, VIP / SVIP / Black Card, exceptions, or sensitive cases. Kenji can guide but cannot decide.

## One-Line Metaphor

Kenji 7.0 = control room.  
Kenji Mini = small window.  
Kenji AI 20 = persona and voice.  
Knowledge Cards = approved memory.  
LINE Adapter = customer-facing mouth.  
Boss Per / MMD = final authority.

## Permission Matrix

| Layer | Can Display | Can Explain | Can Route | Can Answer from Knowledge | Can Mutate Backend | Can Approve / Confirm | Customer Facing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kenji 7.0 | Yes | Limited | Internal maybe | No | No | No | No |
| Kenji Mini | Yes | Yes, if safe | Yes | Only if wired to published Knowledge Cards | No | No | Yes |
| Kenji AI 20 | No, not by itself | Yes | Yes | Yes, through published Knowledge Cards | No | No | Through runtime only |
| Knowledge Cards | As content source | Through adapter or safe UI | Through related routes | Source of truth | No | No | Not directly unless rendered through safe UI |
| LINE Adapter | Yes, as reply | Yes | Yes | Yes | No | No | Yes |
| Boss Per / MMD | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

## Hard Boundaries

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

- explain process
- guide the next step
- route to an official page
- summarize safe status
- ask the user to wait for MMD review
- explain that a request, payment, or proof is not confirmed until MMD checks it

## Current Live Knowledge State

Kenji Knowledge V1.5E:

- Payment: LIVE VERIFIED
- Membership: LIVE VERIFIED
- Renewal: LIVE VERIFIED

Kenji Knowledge V1.5F Batch 1:

- Booking Request Guide: LIVE VERIFIED
- Customer Rules Guide: LIVE VERIFIED

Published cards total after V1.5F Batch 1:

- 5

Visible live lanes:

- Payment
- Membership
- Renewal
- Booking
- Rules

Booking Model Preference Guide, Payment Proof Waiting Guide, and Human Support Escalation Guide exist as V1.5F draft seed candidates. They are not live verified unless later published through the controlled review and verification flow.

## Kenji Mini Rules

Kenji Mini can:

- introduce Kenji
- explain safe public/member flow
- link to `/member/dashboard`
- link to `/sigil/booking`
- link to `/rules/customer`
- show safe status language
- hand off to LINE / Telegram / MMD support

Kenji Mini cannot:

- show internal admin data
- show private model lists
- expose raw member records
- say payment verified
- say booking confirmed
- say membership active unless verified by a backend route designed for that purpose
- decide user tier
- decide model availability

## Relationship to Future Work

- If building UI, ask whether it belongs to Kenji 7.0, Kenji Mini, or LINE Adapter.
- If building answers, use Knowledge Cards.
- If building tone/personality, use Kenji AI 20.
- If building status visibility, use Kenji 7.0 / board layer.
- If building customer-facing mini page, use Kenji Mini but keep it non-authoritative.
- If adding a new live answer lane, create draft cards first, review, controlled publish, protected endpoint verification, then LINE live verification.

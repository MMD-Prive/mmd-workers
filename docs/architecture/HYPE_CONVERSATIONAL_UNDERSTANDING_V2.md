# HYPE Conversational Understanding V2

Status: implementation contract

Runtime owners:

- Telegram transport and bounded language routing: `telegram-worker`
- Canonical identity and bounded Conversation Matrix context: `admin-worker`
- Conversation history/context store: existing Kenji Conversation Matrix
- Payment, Membership/Entitlement, Booking, Coupon, Points, Shop and MMS truth: their existing canonical owners

## Purpose

V2 lets a customer talk to HYPE in ordinary Thai without requiring exact slash commands. It improves the existing P4 router in three bounded ways:

1. normalize common colloquialisms, spelling variants and one-edit domain typos;
2. understand explicit corrections such as `ไม่ใช่เรื่องสมาชิก หมายถึงสลิปที่ส่งไป`;
3. resolve references such as `เรื่องเดิมถึงไหนแล้ว` from a fresh, allowlisted Conversation Matrix topic.

This is conversational understanding, not a new business authority and not an unrestricted generative agent.

## Runtime order

1. Explicit owner, handoff and slash commands win.
2. P5 transaction-start detection wins for new Booking, Payment Proof, Renewal and MMS drafts.
3. V2 attempts a direct, bounded semantic route.
4. The shared HYPE/HENNA capability pack may route supported specialist lanes.
5. An unfinished private Transaction Draft resumes before general continuity lookup.
6. A deictic follow-up may read the bounded context endpoint in private chat only.
7. The resolved domain always refreshes its canonical authority before HYPE answers.
8. Safe small talk receives deterministic copy; an unsupported private message asks for a domain instead of being guessed.

## Context contract

Internal endpoint:

`POST /__internal/hype/conversation-context`

The endpoint is reachable only over the `admin-worker.internal` service binding with `x-mmd-service-binding: telegram-worker`.

It resolves verified Telegram identity to the existing LINE-keyed Matrix and returns only:

- allowlisted command and topic;
- open-thread flag;
- Matrix version;
- update and expiry timestamps;
- mandatory `requires_live_truth_refresh=true`.

It never returns:

- raw customer messages or conversation bodies;
- continuity summaries, open-loop text or pending references;
- canonical Client, LINE or Telegram identifiers;
- payment artifacts, coupon codes, internal notes or unrestricted Matrix payloads;
- any cached business status that could be mistaken for current truth.

Unlinked identity, missing Matrix, expired Matrix, unversioned Matrix, unsupported topic and storage failure all fail closed to clarification.

## Privacy

- A group message such as `เรื่องเดิมถึงไหนแล้ว` never reads Conversation Matrix or Client data.
- HYPE asks the customer to continue in private chat without revealing the prior topic.
- Points, Coupons, Payment, Membership, Booking, Orders, cases and other private domains retain their existing private-chat rules.
- Context is used only to choose the authority. It is never rendered as customer truth.

## Authority lock

- `payments-worker` remains Money Truth.
- The canonical entitlement resolver remains Membership/Entitlement truth.
- Booking/Session/Job authorities remain Booking truth.
- Coupon Wallet and Points Ledger remain Coupon/Points truth.
- MMD Shop and MMS remain their own domain authorities.
- Conversation Matrix and memory are context only.
- Every context-derived route requires a fresh canonical read.
- Ambiguous protected domains ask for clarification before any authority read.
- No payment, entitlement, booking, coupon, identity or Airtable business truth is mutated by V2.

## Safe conversation

V2 may answer only bounded social intents such as greeting, thanks, acknowledgement, identity/help and wellbeing. Replies are deterministic and contain no business claims.

Arbitrary knowledge chat remains out of scope. In private chat HYPE asks the customer to name the relevant supported domain. In groups it stays quiet unless a supported HYPE route is detected.

## Explicit non-goals

- voice-note transcription or speech understanding;
- unrestricted LLM classification of protected domains;
- model-generated payment, membership, availability, pricing or eligibility claims;
- LINE auto-reply enablement;
- customer auto-send from Customer Continuity Phase 4A operator drafts.

`send_allowed=false` and the Sep-16 LINE auto-reply pause remain unchanged.

## Production acceptance

- V2 version is visible from Telegram Worker health as `mmd.hype_conversational_understanding.v2`.
- Direct colloquial/typo routes pass without weakening protected-domain ambiguity.
- A fresh private Matrix topic can resolve `เรื่องเดิม` and then causes a canonical live read.
- Stale/missing/unlinked context asks for clarification and does not guess.
- Group follow-ups perform no context read.
- Telegram output contains no raw Matrix or identity identifiers.
- Existing P4/P5, privacy and authority tests remain green.

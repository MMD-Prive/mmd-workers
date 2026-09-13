# Kenji Knowledge Seed Pack V1

Status: **NORMALIZED · QA READY · NOT PUBLISHED · ROUTES SUPERSEDED 2026-09-11**  
Owner / final authority: **Per**  
Count: **30 cards**  
Machine-readable source: `docs/knowledge/KENJI_KNOWLEDGE_SEED_PACK_V1.normalized.json`

> Route/payment override (2026-09-11): customer status and next-action guidance uses `/member/dashboard`; membership selection, signup, renewal and upgrade use `/sigil/member/membership`; generic payment list/status/navigation uses `/member/payments`; a canonical signed `/sigil/pay?t=...` URL may be used only when the current payment intent supplies it. `/confirm/payment-proof` is legacy/manual no-ref evidence compatibility only and must not be emitted as the default new-payment CTA. Payment- and membership-related cards in the normalized JSON must be regenerated against this lock before publication.

## Purpose

Prepare the first customer-support expansion for Kenji in the approved rollout order:

`Knowledge Seed Pack → Customer Memory / Conversation Matrix → deterministic Model Access → LLM canary`

This pack does **not** enable LLM generation, Model Access, payment authority, booking authority, membership mutation, entitlement mutation, or publication by itself.

## Review decision

Per approved proceeding with normalization and final QA on 2026-09-07. The 30 cards were rewritten to:

- use Per Voice customer copy without internal implementation jargon;
- fail closed for payment, booking, availability, membership, access and special-tier decisions;
- use `/member/dashboard` for customer-facing membership status / next-action guidance while keeping `/my-mmd/*` as the Worker-owned app runtime where applicable;
- use `/sigil/member/membership` for membership selection, signup, renewal and upgrade;
- replace stale `/recovery` with `/sigil/recovery`;
- remove `/profiles` and `/public/access` from this pack because the current route-owner registry does not support using them as confident new customer CTAs here;
- separate public `/booking` guidance from protected/private `/sigil/booking` use;
- use current MMS navigation from `MMS_WEBSITE_NAVIGATION_KNOWLEDGE_V1.md`, including `/male-massage/home`, `/male-massage/member/mms-booking`, and `/male-massage/therapists/relax-spa`;
- keep all customer-facing decisions non-authoritative until the appropriate Worker-backed truth confirms them.

## Route normalization lock

| Intent | Route used by this pack |
| --- | --- |
| Member status / next-action hub | `/member/dashboard` |
| Membership selection / signup / renew / upgrade | `/sigil/member/membership` |
| Payment status / generic payment handoff | `/member/payments` |
| Canonical payment + proof | signed `/sigil/pay?t=...` from the current payment intent only |
| Legacy/manual evidence compatibility | `/confirm/payment-proof` only when explicitly handling a legacy/manual no-ref case |
| MY MMD app runtime | `/my-mmd/*` only for app-specific navigation; not the generic Kenji status CTA |
| Points app view | `/my-mmd/points` when the user is already in MY MMD runtime |
| History app view | `/my-mmd/history` when the user is already in MY MMD runtime |
| Profile app view | `/my-mmd/profile` when the user is already in MY MMD runtime |
| Public booking intake / MMD Companion | `/booking` |
| SIGIL/private booking request | `/sigil/booking` |
| Customer rules | `/rules/customer` |
| Complaint / recovery | `/sigil/recovery` |
| MMS home | `/male-massage/home` |
| MMS pre-booking | `/male-massage/member/mms-booking` |
| MMS Partner Venue / Relax Spa | `/male-massage/therapists/relax-spa` |

Do not emit stale `/my-mmd/membership`, `/member/membership`, `/sigil/member/dashboard`, generic `/confirm/payment-proof`, legacy `/member/mms-booking`, or `/recovery` as new customer CTAs. `/my-mmd/*` remains valid only for app-runtime navigation where the user is already inside MY MMD and the route is actually owned by that runtime.

## Pack composition

- Payment: 8
- Membership / Renewal: 6
- Booking / How it works: 6
- Route guidance: 4
- Privacy / Boundaries: 3
- Support escalation: 3
- Total: 30

## Customer-copy rules

Every card in the normalized manifest follows these rules, subject to the 2026-09-11 route/payment override above:

1. Short answer first; one next step when possible.
2. Use `MMD` or `เปอร์/MMD` for human/authority handoff; do not expose internal operators.
3. Payment proof is evidence only.
4. Deposit is not booking confirmation.
5. Availability is protected live truth.
6. Membership signup / identity verification / entitlement / Private Access are separate states.
7. VIP / SVIP / Black Card are never auto-granted.
8. Model private contacts and other-customer data are never disclosed.
9. If truth conflicts or is missing, stop confirming and hand off.
10. Do not publish from this PR automatically.
11. Never mint or imply a replacement payment reference from Kenji. Reuse the canonical payment context; if no signed pay URL is available, route to `/member/payments`.
12. Never ask a customer to resubmit proof when the current payment/ref is already pending verification.
13. Membership status goes to `/member/dashboard`; membership actions go to `/sigil/member/membership`.

## Final QA contract

The normalized manifest is intended to be processed only through the signed Worker contract:

`Draft → Review → QA Passed`

For every card, QA must prove:

- required fields are present;
- source / production policy path has been checked;
- customer copy does not contain prohibited approval/success language;
- a real sample question is recorded;
- blocked information is recorded;
- privacy check is true for critical cards;
- audit contains `submit_review` and `record_qa`;
- final stage is `qa_passed`;
- **no `publish` event exists**;
- payment cards do not default to `/confirm/payment-proof` and do not create duplicate payment/proof flows;
- membership cards do not default to `/my-mmd/membership`, `/member/membership`, or `/sigil/member/dashboard`.

Publication remains a separate explicit Per action after the Review/QA queue is inspected. The current normalized JSON must not be published until its payment- and membership-related cards are regenerated against the 2026-09-11 canonical route lock.

## Source precedence

1. Current Worker-backed truth and current route ownership.
2. `docs/knowledge/UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md` for payment/ref/proof routing.
3. Current customer route lock: `/member/dashboard` for status, `/sigil/member/membership` for membership actions, `/member/payments` for generic payment navigation.
4. Current My MMD endpoint canon for app-runtime-only `/my-mmd/*` navigation.
5. Current MMS navigation canon (`docs/knowledge/MMS_WEBSITE_NAVIGATION_KNOWLEDGE_V1.md`).
6. Current Kenji runtime / knowledge contract.
7. MMD Core Knowledge — Production V1.
8. Historical Drive prompts only after safety rewrite; never verbatim authority.

## Next gate

After all 30 cards are regenerated and verified at `qa_passed`, keep them unpublished and continue to **Customer Memory / Conversation Matrix**. Deterministic Model Access and LLM canary stay off until their later gates are explicitly approved.

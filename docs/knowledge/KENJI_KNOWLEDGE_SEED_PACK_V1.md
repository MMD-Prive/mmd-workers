# Kenji Knowledge Seed Pack V1

Status: **NORMALIZED · QA READY · NOT PUBLISHED**  
Owner / final authority: **Per**  
Count: **30 cards**  
Machine-readable source: `docs/knowledge/KENJI_KNOWLEDGE_SEED_PACK_V1.normalized.json`

## Purpose

Prepare the first customer-support expansion for Kenji in the approved rollout order:

`Knowledge Seed Pack → Customer Memory / Conversation Matrix → deterministic Model Access → LLM canary`

This pack does **not** enable LLM generation, Model Access, payment authority, booking authority, membership mutation, entitlement mutation, or publication by itself.

## Review decision

Per approved proceeding with normalization and final QA on 2026-09-07. The 30 cards were rewritten to:

- use Per Voice customer copy without internal implementation jargon;
- fail closed for payment, booking, availability, membership, access and special-tier decisions;
- remove stale `/my-mmd` generic routing in favor of the current My MMD child routes;
- replace stale `/recovery` with `/sigil/recovery`;
- remove `/profiles` and `/public/access` from this pack because the current route-owner registry does not support using them as confident new customer CTAs here;
- separate public `/booking` guidance from protected/private `/sigil/booking` use;
- use current MMS navigation from `MMS_WEBSITE_NAVIGATION_KNOWLEDGE_V1.md`, including `/male-massage/home`, `/male-massage/member/mms-booking`, and `/male-massage/therapists/relax-spa`;
- keep all customer-facing decisions non-authoritative until the appropriate Worker-backed truth confirms them.

## Route normalization lock

| Intent | Route used by this pack |
| --- | --- |
| Payment proof | `/confirm/payment-proof` |
| My MMD home | `/my-mmd/` |
| Membership | `/my-mmd/membership` |
| Points | `/my-mmd/points` |
| History / status context | `/my-mmd/history` |
| Profile / verified-self context | `/my-mmd/profile` |
| Public booking intake / MMD Companion | `/booking` |
| SIGIL/private booking request | `/sigil/booking` |
| Customer rules | `/rules/customer` |
| Complaint / recovery | `/sigil/recovery` |
| MMS home | `/male-massage/home` |
| MMS pre-booking | `/male-massage/member/mms-booking` |
| MMS Partner Venue / Relax Spa | `/male-massage/therapists/relax-spa` |

`/profiles`, `/public/access`, `/member/dashboard`, generic `/my-mmd`, legacy `/member/mms-booking`, and `/recovery` are not emitted as new CTAs by this seed pack.

## Pack composition

- Payment: 8
- Membership / Renewal: 6
- Booking / How it works: 6
- Route guidance: 4
- Privacy / Boundaries: 3
- Support escalation: 3
- Total: 30

## Customer-copy rules

Every card in the normalized manifest follows these rules:

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
- **no `publish` event exists**.

Publication remains a separate explicit Per action after the Review/QA queue is inspected.

## Source precedence

1. Current Worker-backed truth and current route ownership.
2. Current My MMD endpoint canon (`docs/ops/MMD-MY-MMD-ENDPOINT-MEMORY-2026-09-06.md`).
3. Current MMS navigation canon (`docs/knowledge/MMS_WEBSITE_NAVIGATION_KNOWLEDGE_V1.md`).
4. Current Kenji runtime / knowledge contract.
5. MMD Core Knowledge — Production V1.
6. Historical Drive prompts only after safety rewrite; never verbatim authority.

## Next gate

After all 30 cards are verified at `qa_passed`, keep them unpublished and continue to **Customer Memory / Conversation Matrix**. Deterministic Model Access and LLM canary stay off until their later gates are explicitly approved.

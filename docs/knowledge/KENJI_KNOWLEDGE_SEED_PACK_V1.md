# Kenji Knowledge Seed Pack V1

Status: **NORMALIZED · QA READY · NOT PUBLISHED · PAYMENT ROUTES SUPERSEDED 2026-09-11**  
Owner / final authority: **Per**  
Count: **30 cards**  
Machine-readable source: `docs/knowledge/KENJI_KNOWLEDGE_SEED_PACK_V1.normalized.json`  
Canonical payment-lane replacement: `docs/knowledge/KENJI_KNOWLEDGE_SEED_PACK_V1_PAYMENT_OVERRIDE_20260911.json`

> Payment-routing override (2026-09-11): `docs/knowledge/MMD_CANONICAL_PAYMENT_MEMORY_20260911.md` and `docs/knowledge/UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md` are authoritative. Generic Kenji replies must use `/member/payments` as the payment list/status/navigation handoff. A canonical signed `/sigil/pay?t=...` URL may be used only when the current payment intent supplies it. `/confirm/payment-proof` is legacy/manual evidence compatibility only and must not be emitted as the default new-payment CTA. The eight payment cards in the old normalized JSON are superseded by `KENJI_KNOWLEDGE_SEED_PACK_V1_PAYMENT_OVERRIDE_20260911.json` and must be replaced/merged from that file before any publication.

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
| Payment status / generic payment handoff | `/member/payments` |
| Canonical payment + proof | signed `/sigil/pay?t=...` from the current payment intent only |
| Legacy/manual evidence compatibility | `/confirm/payment-proof` only when explicitly handling a legacy/manual no-ref case |
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

`/profiles`, `/public/access`, `/member/dashboard`, generic `/my-mmd`, legacy `/member/mms-booking`, and `/recovery` are not emitted as new CTAs by this seed pack. `/confirm/payment-proof` is also not emitted as a generic new-payment CTA.

## Pack composition

- Payment: 8
- Membership / Renewal: 6
- Booking / How it works: 6
- Route guidance: 4
- Privacy / Boundaries: 3
- Support escalation: 3
- Total: 30

## Customer-copy rules

Every card in the normalized manifest follows these rules, subject to the 2026-09-11 payment-routing override above:

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

## Payment-lane merge rule

Before this Seed Pack can be submitted for publication, replace the eight `lane=payment` cards from `KENJI_KNOWLEDGE_SEED_PACK_V1.normalized.json` with the eight cards from `KENJI_KNOWLEDGE_SEED_PACK_V1_PAYMENT_OVERRIDE_20260911.json`. The override is not itself a publish artifact; it is the canonical source for regenerating the complete 30-card manifest.

The regenerated manifest must preserve all 22 non-payment cards unchanged unless they are separately reviewed, and its payment cards must satisfy these checks:

- no default customer route to `/confirm/payment-proof`;
- `/member/payments` for generic payment continuation/status;
- signed `/sigil/pay?t=...` only from current backend intent context;
- no new/replacement `payment_ref` from chat/knowledge;
- no proof resubmission when evidence is already pending;
- no paid/verified/approved language before Official Verify/backend truth.

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
- payment cards do not default to `/confirm/payment-proof` and do not create duplicate payment/proof flows.

Publication remains a separate explicit Per action after the Review/QA queue is inspected. The old normalized JSON must not be published until its payment-related cards are replaced from the canonical payment override and the regenerated 30-card manifest passes QA again.

## Source precedence

1. Current Worker-backed truth and current route ownership.
2. `docs/knowledge/MMD_CANONICAL_PAYMENT_MEMORY_20260911.md` and `docs/knowledge/UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md` for payment/ref/proof routing.
3. `docs/knowledge/KENJI_KNOWLEDGE_SEED_PACK_V1_PAYMENT_OVERRIDE_20260911.json` for the eight payment seed cards pending full-manifest regeneration.
4. Current My MMD endpoint canon (`docs/ops/MMD-MY-MMD-ENDPOINT-MEMORY-2026-09-06.md`).
5. Current MMS navigation canon (`docs/knowledge/MMS_WEBSITE_NAVIGATION_KNOWLEDGE_V1.md`).
6. Current Kenji runtime / knowledge contract.
7. MMD Core Knowledge — Production V1.
8. Historical Drive prompts only after safety rewrite; never verbatim authority.

## Next gate

After the full regenerated 30-card manifest is verified at `qa_passed`, keep it unpublished and continue to **Customer Memory / Conversation Matrix**. Deterministic Model Access and LLM canary stay off until their later gates are explicitly approved.

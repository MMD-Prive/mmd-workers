# MMD Canonical Payment Memory — 2026-09-11

Status: **ACTIVE LOCK**  
Owner / final authority: **Per**  
Scope: MY MMD, LIFF, Kenji AI, payments-worker, Airtable package catalog, payment proof, membership materialization.

## Canonical customer flow

`LINE / MY MMD → LIFF identity + package gate → canonical Airtable package → payments-worker pending intent → one payment_ref → signed /sigil/pay?t=... → proof/evidence once → pending_verification → Official Verify → entitlement/member state → My MMD`

## Hard rules

1. `payment_ref` is canonical per session + payment stage. Reload/retry must reuse it; never mint a replacement because the customer revisits a page.
2. Proof is evidence only. Uploading a slip never means paid, verified, approved, active membership, points granted, booking confirmed, or Private Access granted.
3. `/sigil/pay?t=...` is the canonical combined payment + proof surface when the backend has supplied a valid signed token.
4. `/member/payments` is the generic member payment list/status/navigation handoff. Kenji should use this when no signed canonical pay URL is available.
5. `/confirm/payment-proof` is legacy/manual no-ref compatibility only. It is not the default CTA for new payment flows and must not create a replacement payment reference.
6. Once a payment/proof is pending verification, do not ask the customer to submit proof again.
7. Only Official Verify / backend money truth can materialize membership, points, booking/access consequences.
8. LIFF payment binding is non-granting. It may create/reuse a pending intent and return the signed `/sigil/pay` handoff; it must not grant membership/points/access.
9. Standard and Premium normal package selection resolve from Airtable `packages` (`tblg2z8dENx75yHka`). Contextual/HYPE package rules remain separate.
10. Standard base term = **1 calendar year**. Premium base term = **2 calendar years**. Do not model Premium as a one-year entitlement plus a blind second-year patch in the canonical materializer.
11. `duration_days=730` for Premium in package catalog/resolver data is compatibility metadata. Official expiry uses calendar-year logic.
12. CARE BACK and other promotional extensions are separate policy layers. Never fold a campaign bonus into the base package term or silently double-apply it.

## Airtable canonical package records

- `standard`: new 1,199 THB; renewal 1,000 THB; active; tier `standard`; compatibility duration 365.
- `premium`: new 2,999 THB; renewal 2,500 THB; active; tier `premium`; compatibility duration 730; official term 2 calendar years.

## Routing precedence for Kenji

1. Current signed `customer_payment_url` from payments-worker → use that exact `/sigil/pay?t=...` URL.
2. No signed URL but customer needs payment/status continuation → `/member/payments`.
3. Explicit legacy/manual no-ref evidence case only → `/confirm/payment-proof`.
4. If proof already exists/pending → continue the existing thread/status; never request resubmission.

## Authority boundary

Customer UI, LIFF, Webflow, Kenji, OCR, screenshot parsing, and proof upload are not money truth. `payments-worker` reviewed/verified state plus the downstream entitlement authority is the only path that can convert evidence into canonical paid/materialized state.

## Supersession

This lock supersedes older knowledge or runtime guidance that treats `/confirm/payment-proof` as the default payment CTA, treats Premium as a one-year base membership, or treats slip submission as payment completion. Historical documents may remain for audit, but current runtime and new knowledge must follow this lock and `UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md`.

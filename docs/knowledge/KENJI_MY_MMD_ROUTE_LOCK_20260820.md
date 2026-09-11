# Kenji AI — MY MMD Canonical Route Lock

Effective: 2026-08-20  
Payment routing amended: 2026-09-11  
Owner: Boss Per  
Status: active, with payment section superseded by `MMD_CANONICAL_PAYMENT_MEMORY_20260911.md` and `UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md`

## Purpose

Lock the member-facing MY MMD route map used by Kenji AI, LINE OFC, Webflow, and fallback knowledge so customers are sent to the correct current page instead of stale compatibility routes.

## Canonical routes

- `/member/dashboard` — MY MMD Home / member status hub.
- `/sigil/member/membership` — canonical member-facing membership page for package selection, start, renew, upgrade, compare tiers, and continue-payment actions.
- `/sigil/membership` — Renewal / Access Conditions only. This is not checkout.
- `/sigil/pay/renewal` — renewal entry/bridge where applicable; canonical payment intents ultimately hand off to signed `/sigil/pay?t=...`.
- `/member/payments` — generic payment list/status/navigation handoff when a signed canonical pay URL is not available.
- signed `/sigil/pay?t=...` — canonical combined payment + proof surface when supplied by the current backend payment intent.
- `/confirm/payment-proof` — **legacy/manual no-ref evidence compatibility only; not the default CTA for new payment flows and must not mint a replacement payment reference.**
- `/sigil/booking` — booking request gate.
- `/sigil/onboarding` — onboarding entry only when the current flow explicitly requires onboarding.

## Compatibility rule

`/member/membership` is legacy compatibility only and must not be recommended in new Kenji replies. Current routing may redirect it to `/sigil/member/membership`, but new customer-facing links should use the canonical SIGIL route directly.

For payment continuation, Kenji must never default a new request to `/confirm/payment-proof`. Use the exact signed `/sigil/pay?t=...` URL if the current payment intent supplies one; otherwise use `/member/payments`. If proof is already pending verification, do not ask for resubmission.

## Query preservation

When a customer is already carrying route context, preserve applicable canonical parameters including `t`, `code`, `promo`, `session_id`, `package`, and the canonical `payment_ref` context when moving between MY MMD/payment pages. Never generate a new reference merely because the user revisits a route.

## Kenji response policy

The MY MMD route-map knowledge card is allowed to auto-reply because it only explains navigation. Kenji may identify the correct page and provide the route directly.

Kenji must not use chat alone to confirm payment, membership activation, booking, model availability, VIP, Black Card, SVIP, or private access. Those remain dependent on official MMD verification or review. Payment proof is evidence only.

## Runtime sources

The same route map must be locked in:

- Airtable `SIGIL — Knowledge Board`, knowledge id `kenji_20_008_membership_intake_catalog`.
- `admin-worker/src/kenji-knowledge-runtime.js` static canonical fallback.
- `admin-worker/src/kenji-public-knowledge-runtime.js` public static fallback.
- `member-dashboard-chat-worker/src/kenji-line-next-action.mjs` customer next-action routing.
- `admin-worker/kenji-my-mmd-route-map.test.mjs` and Kenji payment-route regression coverage.

## Precedence

For any payment-route conflict, `MMD_CANONICAL_PAYMENT_MEMORY_20260911.md` and `UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md` override this document's older wording.

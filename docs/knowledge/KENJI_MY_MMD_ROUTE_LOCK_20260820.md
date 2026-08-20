# Kenji AI — MY MMD Canonical Route Lock

Effective: 2026-08-20
Owner: Boss Per
Status: active

## Purpose

Lock the member-facing MY MMD route map used by Kenji AI, LINE OFC, Webflow, and fallback knowledge so customers are sent to the correct current page instead of stale compatibility routes.

## Canonical routes

- `/member/dashboard` — MY MMD Home / member status hub.
- `/sigil/member/membership` — canonical member-facing membership page for package selection, start, renew, upgrade, compare tiers, and continue-payment actions.
- `/sigil/membership` — Renewal / Access Conditions only. This is not checkout.
- `/sigil/pay/renewal` — renewal payment flow.
- `/sigil/booking` — booking request gate.
- `/confirm/payment-proof` — payment evidence submission.
- `/sigil/onboarding` — onboarding entry only when the current flow explicitly requires onboarding.

## Compatibility rule

`/member/membership` is legacy compatibility only and must not be recommended in new Kenji replies. Current routing may redirect it to `/sigil/member/membership`, but new customer-facing links should use the canonical SIGIL route directly.

## Query preservation

When a customer is already carrying route context, preserve applicable canonical parameters including `t`, `code`, `promo`, `session_id`, and `package` when moving between MY MMD pages.

## Kenji response policy

The MY MMD route-map knowledge card is allowed to auto-reply because it only explains navigation. Kenji may identify the correct page and provide the route directly.

Kenji must not use chat alone to confirm payment, membership activation, booking, model availability, VIP, Black Card, SVIP, or private access. Those remain dependent on official MMD verification or review.

## Runtime sources

The same route map is locked in:

- Airtable `SIGIL — Knowledge Board`, knowledge id `kenji_20_008_membership_intake_catalog`.
- `admin-worker/src/kenji-knowledge-runtime.js` static canonical fallback.
- `admin-worker/src/kenji-public-knowledge-runtime.js` public static fallback.
- `admin-worker/kenji-my-mmd-route-map.test.mjs` regression coverage.

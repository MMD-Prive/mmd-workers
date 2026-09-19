# MMD Payment Route + Surface Lock — 2026-09-19

## Decision

MMD uses **one payment authority with two customer presentation surfaces**.

`payments-worker` is the sole owner of money truth: amount due, payment reference, PromptPay / bank / PayPal-card instructions, signed payment token, proof review state and Official Verify. Browser pages never become payment authority.

The signed customer surface is selected by **server-owned payment context**, never by browser amount or query parameters:

- Public Membership and TMIB purchases -> signed `/pay/checkout?t=<token>`
- Private Membership, Black Card and service/job payments -> signed `/sigil/pay?t=<token>`

Both surfaces use the same Payment Instructions and proof pipeline.

## Customer routes

| Route | Purpose | Authority |
| --- | --- | --- |
| `/pay/membership` | Public Membership selection: MMD Member / Elite / Red Card | Selection UI only; server re-resolves package + amount |
| `/pay/tmib?episode=...` | TMIB episode purchase entry | Episode catalog + access gate owned by member-pages Worker |
| `/pay/checkout?t=...` | Signed public payment + proof surface | `payments-worker` |
| `/sigil/member/membership` | Private Membership selection / renewal / upgrade | Membership UI; backend owns payment intent |
| `/sigil/pay?t=...` | Signed private/service payment + proof surface | `payments-worker` |
| `/member/payments` | Payment history / status / continuation | Read/status navigation |
| `/sigil/pay/membership` | Private legacy compatibility bridge only | No payment authority |

## Public package lock

Server-owned catalog:

| Package code | Display | Amount | Base term |
| --- | --- | ---: | --- |
| `mmd_member` | MMD Member | 690 THB | 365 days / 1 year |
| `elite` | Elite | 4,990 THB | 730 days / 2 years |
| `red_card` | Red Card | 11,499 THB | 365 days / 1 year |
| `tmib_act_001` | TMIB ACT 001 Single Episode | 299 THB | episode access after verification |

Public Membership prices are mirrored in `shared/payment-intelligence.mjs`. TMIB price/package/stage is owned by `member-pages-worker/src/tmib-episode-catalog.js`.

## Public Membership purchase contract

Entry:
- `GET /member/api/liff/public-membership/catalog`
- `POST /member/api/liff/public-membership/purchase`

The browser may submit only `package_code`. Browser-supplied amount, payment reference, bank/PromptPay destination, PayPal URL, entitlement or verification state must be rejected or ignored.

A verified LINE/MY MMD session is required before a payment intent is created. The member-pages Worker derives amount server-side, calls `payments-worker`, and accepts only a signed `https://mmdbkk.com/pay/checkout?t=...` handoff.

Creating an intent never grants membership.

## TMIB purchase contract

`POST /member/api/liff/tmib/episodes/<episode>/purchase`

The server-owned catalog supplies `package_code`, `payment_stage=tmib_story` and amount. ACT 001 remains 299 THB.

The backend-issued signed handoff is `/pay/checkout?t=...`. Active eligible verified members continue to receive story access without purchasing the single episode.

Payment proof alone never grants story access; Paid + Verified/Approved canonical state is required.

## Private / SIGIL contract

Private membership and private/service payment flows keep `/sigil/pay?t=...`.

`/sigil/pay/membership` remains a compatibility bridge:
- signed `t` -> `/sigil/pay?t=...`
- no `t` -> `/sigil/member/membership`
- safe non-money membership-entry context only

`/pay/membership` is **not** a legacy bridge after this lock. It is the canonical Public Membership entry page.

## Proof + verification

Both public and SIGIL surfaces:
1. read server-verified Payment Instructions;
2. show only server-returned amount and destination;
3. accept proof as evidence;
4. create/attach one canonical proof to one canonical `payment_ref`;
5. notify the existing operational payment flow;
6. remain pending until Official Verify;
7. materialize membership / entitlement / story access only after canonical verification.

## Fail-closed rules

Never:
- trust browser `amount`, `package_code` as final truth, payment destination or QR;
- mint payment references in Webflow/browser code;
- convert a public signed payment URL to SIGIL or vice versa in browser code;
- grant entitlement from proof upload alone;
- recreate a payment intent because the customer revisits the page;
- ask for duplicate proof when one is already pending.

## Current executable ownership

- `payments-worker/unified-payment-proof.js` — selects public vs SIGIL signed payment presentation and owns payment/proof contract.
- `shared/payment-intelligence.mjs` — canonical Public Membership catalog + presentation-lane classifier.
- `member-pages-worker/src/public-membership-payment.js` — verified LINE public membership intent API.
- `member-pages-worker/src/tmib-story-access.js` — TMIB access/purchase and signed public handoff validation.
- Webflow `/pay/membership` — Public Membership UI.
- Webflow `/pay/checkout` — public signed payment presentation.
- Webflow `/sigil/pay` — SIGIL signed payment presentation.
- Webflow `/sigil/pay/membership` — private compatibility bridge only.

## Supersession

This 2026-09-19 lock supersedes the payment-route portions of:
- `docs/locks/MMD_PAYMENT_ROUTE_BRIDGE_LOCK_20260913.md` before this rewrite;
- `docs/locks/MMD_ROUTE_OWNER_LOCK_20260701.md`;
- `docs/locks/MMD_DIRTY_PATCH_QUARANTINE_20260702.md`;
- `docs/knowledge/UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md` where it says `/pay/membership` is a compatibility bridge or that every signed customer payment must use `/sigil/pay`;
- historical route inventory snapshots.

Those files remain useful for dated migration evidence where not contradicted by this lock.

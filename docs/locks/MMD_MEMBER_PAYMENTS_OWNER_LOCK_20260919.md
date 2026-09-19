# MMD /member/payments Owner Lock

Status: LOCKED TARGET ARCHITECTURE  
Updated: 2026-09-19

## Canonical customer route

`/member/payments` is the canonical **member-facing payment status / history / navigation** surface.

It is not:
- a payment authority;
- an admin review console;
- a second proof-intake surface;
- a membership package selector;
- a browser-owned checkout;
- a place to mint or replace `payment_ref`.

## Ownership split

### Presentation owner
- Webflow static page `/member/payments`
- Webflow page id: `69dfd6c51dd636056fdb35ea`
- canonical root: `#mmd-payments-maxx`

The page renders customer-safe payment state and navigation only.

### Member-facing status BFF
- target owner: `member-pages-worker`
- contract: authenticated member/session read, customer-safe payment records only
- the BFF must never expose admin review controls, internal notes, fraud/risk fields, raw Airtable records, or backend credentials.

The current Webflow page declares `data-payments-endpoint="/v1/member/payments"`; that endpoint contract must be served by the member-facing BFF before any legacy/admin delegation is removed.

### Money truth
- `payments-worker` is the sole payment authority for amount, payment reference, payment destination, QR, card fee, proof verification and official payment state.
- Official Verify remains final truth.

## Signed handoff

If the current backend record supplies an exact signed payment URL:
- Public Membership / TMIB -> `/pay/checkout?t=<signed token>`
- Private Membership / Service -> `/sigil/pay?t=<signed token>`

The status page may expose that exact server-issued URL only. It must never convert one signed payment lane into another or construct a token.

Without a signed payment URL, `/member/payments` remains status/history/navigation only.

## Proof boundary

- Existing proof is reused; do not request duplicate proof.
- Proof is evidence until Official Verify.
- `/confirm/payment-proof` is legacy/manual no-ref compatibility only.
- `/member/payments` must not become a second generic proof uploader.

## Route guards

Fresh customer CTAs may use `/member/payments` for payment status/history.

They must not use:
- `/pay/membership` for payment status;
- `/sigil/pay/renew`;
- `/sigil/pay/renewal`;
- `/pay/renewal`;
- admin review URLs.

## Webflow boundary

Webflow may:
- render server-provided customer-safe records;
- show status/history;
- link to My MMD;
- expose an exact safe signed payment action supplied by the backend.

Webflow must not:
- calculate amount;
- decide paid/verified state;
- create or rewrite payment references;
- generate QR or bank destinations;
- expose admin authority;
- infer entitlement activation.

## Migration rule

Legacy/admin-worker page delegation is not the canonical architecture. Route migration must converge on:
`Webflow presentation -> member-pages-worker member-safe BFF -> payments-worker money truth`.

Do not remove a legacy production bridge until the member-safe BFF endpoint and route ingress have passed production smoke.

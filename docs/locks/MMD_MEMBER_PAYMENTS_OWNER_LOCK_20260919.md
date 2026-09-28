# MMD Payment Center Owner Lock

Status: **LOCKED ARCHITECTURE · PRODUCTION ACCEPTED**  
Updated: 2026-09-22

## Canonical customer route

`/my-mmd/payments` is the canonical **member-facing payment status / history / navigation** surface inside My MMD.

`/member/payments` is retained as a compatibility presentation during migration. Both use the same member-safe BFF and neither is payment authority.

The Payment Center is not:
- a payment authority;
- an admin review console;
- a second proof-intake surface;
- a membership package selector;
- a browser-owned checkout;
- a place to mint or replace `payment_ref`.

## Ownership split

### Presentation owner
- canonical public route: `/my-mmd/payments`;
- presentation source: Lovable My MMD app, internal route `/payments`;
- production proxy owner: `member-dashboard-chat-worker`;
- My MMD presentation origin: `my-mmd-member-profile.lovable.app`;
- legacy compatibility: Webflow `/member/payments`, page id `69dfd6c51dd636056fdb35ea`.

The presentation renders customer-safe state only. It reads the same-origin BFF and does not own payment decisions.

### Member-facing status BFF
- owner: `member-pages-worker`;
- source: `member-pages-worker/src/member-payments-bff.js`;
- public ingress: exact `/v1/member/payments` through `member-dashboard-chat-worker`;
- transport: `MEMBER_PAGES_WORKER` service binding;
- schema: `mmd_member_payments_v1`;
- verified LINE/member session only;
- customer-safe records only.

The BFF never exposes admin review controls, internal notes, fraud/risk fields, raw Airtable records or backend credentials.

### Money truth
- `payments-worker` is the sole payment authority for amount, payment reference, payment destination, QR, card fee, proof verification and official payment state;
- Official Verify remains final truth.

## Read model

The BFF combines:
1. the current backend-created payment intent remembered in the short-lived signed LIFF session;
2. verified historical payments from the safe member profile / Customer 360 projection.

A pending intent may be visible before a canonical Member row exists. This does not grant membership.

The browser cannot select member identity, `payment_ref`, amount, package, payment lane or verification state through query/body fields.

## Signed handoff

If the backend supplies an exact signed payment URL:
- Public Membership / TMIB -> `/pay/checkout?t=<signed token>`;
- Private Membership / Service -> `/sigil/pay?t=<signed token>`.

Payment Center may expose that exact server-issued URL only. It must never convert lanes, construct a token, or show a pay CTA while the record is `pending_review`.

## LIFF continuation

`continue_payment` is an auth-bridge-only LIFF intent. After the verified LINE/session gate it returns to `/my-mmd/payments`.

The LIFF bridge does not create money truth, grant entitlement, or infer paid state.

## Proof boundary

- existing proof is reused; do not request duplicate proof;
- proof is evidence until Official Verify;
- `/confirm/payment-proof` is legacy/manual no-ref compatibility only;
- Payment Center is not a generic proof uploader.

## Production acceptance

Accepted on source SHA `d29f81c84d71e891e31ebdf8bfa451417166e9b8` on 2026-09-22.

Production acceptance proved:
- unauthenticated 401 fail-closed with expected owner/upstream headers;
- real verified LINE member session;
- customer-safe authenticated records;
- exact backend-issued signed Public handoff;
- no entitlement from pending intent;
- pending-review CTA suppression;
- browser-selected payment context rejection;
- `/my-mmd/payments` presentation route;
- LIFF `continue_payment -> /my-mmd/payments`.

See `docs/ops/MMD_MEMBER_PAYMENTS_PRODUCTION_ACCEPTANCE_20260919.md`.

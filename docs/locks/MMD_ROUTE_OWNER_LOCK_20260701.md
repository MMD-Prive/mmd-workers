# MMD Route Owner Lock - 2026-07-01

> **2026-09-19 Public/Private lane override:** `/pay/membership` is the canonical Public Membership entry for Member / Elite / Red Card. `/sigil/member/membership` is the canonical Private Membership selection / renewal / upgrade entry. `/member/payments` is payment status/history navigation. `/sigil/pay/renewal` and `/pay/renewal` are redirect-only compatibility routes; they render no payment or renewal fallback UI. Signed Public checkout is `/pay/checkout?t=...`; signed Private/Service payment is `/sigil/pay?t=...`.


Status: historical incident lock. **Membership-payment ownership statements in this file are superseded by `MMD_PAYMENT_ROUTE_BRIDGE_LOCK_20260913.md`.**

## Incident Summary

`/sigil/pay/membership` was returning a `308` redirect to `/sigil/pay/renewal`.
The response identified `x-mmd-route-source: member-dashboard-chat-worker:sigil-pay-renewal`.

This was not caused by `member-pages-worker` source logic and was not caused by
`mmd-redirect-worker` source logic. The root cause was a wrong Cloudflare Worker
route binding that sent the membership payment route to `member-dashboard-chat-worker`.

## Deleted Route Bindings

The following Cloudflare Worker routes were deleted:

| Pattern | Route ID | Former owner |
| --- | --- | --- |
| `mmdbkk.com/sigil/pay/membership*` | `bc9521436bf74261a42d3bce97d25fa8` | `member-dashboard-chat-worker` |
| `www.mmdbkk.com/sigil/pay/membership*` | `372a30bf70da4f64bcb5de6a62e64501` | `member-dashboard-chat-worker` |

Do not recreate these bindings merely to restore an old payment page. Any new edge ownership requires an explicit current owner decision and must preserve the 2026-09-13 bridge contract.

## Current Canonical Ownership Override — 2026-09-13

- Public Membership selection (Member / Elite / Red Card): `/pay/membership`.
- Private Membership selection / signup / renewal / upgrade (Standard / Premium / private access): `/sigil/member/membership`.
- Exact payment + proof: signed `/sigil/pay?t=...` only after a backend-owned payment intent exists.
- Payment history/status/navigation: `/member/payments`.
- `/pay/membership`: canonical Public Membership selection UI only; never payment authority.
- `/sigil/pay/membership`: Private legacy compatibility bridge only; unsigned traffic may hand off to `/sigil/member/membership`, signed `t` may hand off only to `/sigil/pay?t=...`.
- `/sigil/pay/renewal` and `/pay/renewal`: redirect-only compatibility routes. Signed `t` -> `/sigil/pay?t=...`; unsigned -> `/sigil/member/membership?intent=renew`. They render no fallback UI.
- `/sigil/pay/renew`: compatibility alias; signed `t` must hand off to `/sigil/pay?t=<same token>`, unsigned to `/sigil/member/membership?intent=renew`.
- `/sigil/pay/payment`: retired generic payment alias; signed `t` may hand off to `/sigil/pay?t=...`, otherwise use `/member/payments`.
- `payments-worker` remains the sole authority for amount due, payment destination, PromptPay QR, canonical payment reference and payment verification.

## Historical Ownership Rule Preserved

The July incident established an important negative lock that remains valid:

- `member-dashboard-chat-worker` must not accidentally absorb `/sigil/pay/membership` into the renewal route family.
- `/sigil/pay/membership` and `/pay/membership` must never be redirected to `/sigil/pay/renewal` as if membership checkout were manual renewal evidence.
- Unknown routes must never redirect to `/default`, `/autodirect`, or `/sigil/pay/renewal`.

`member-dashboard-chat-worker` may continue to own only the explicit renewal evidence routes configured in its current Wrangler file, including:

- `mmdbkk.com/pay/renewal*`
- `www.mmdbkk.com/pay/renewal*`
- `mmdbkk.com/sigil/pay/renewal*`
- `www.mmdbkk.com/sigil/pay/renewal*`

Do not infer from this historical list that `/pay/membership` or `/sigil/pay/membership` is still a canonical checkout surface.

## Redirect Worker Lock

The current `mmd-redirect-worker` is hard-disabled and transparent pass-through only. This historical lock must not be used as justification to restore routing logic there. Server-side retirement of compatibility aliases requires a separately approved live route owner and must not collide with `/sigil/pay/renewal*`.

## Updated Smoke Checklist

- `/sigil/member/membership`: canonical membership selection route.
- `/sigil/pay/membership`: safe compatibility alias; never renewal authority.
- `/sigil/pay/membership?t=...`: may bridge only to signed `/sigil/pay?t=...`; browser amount/account/package query values are not authority.
- `/pay/membership`: same compatibility behavior as `/sigil/pay/membership`.
- `/sigil/pay/renewal`: manual renewal evidence route; Worker renderer may own this explicit route.
- `/pay/renewal`: manual renewal evidence route.
- `/sigil/pay/renew`: compatibility alias to `/sigil/pay/renewal`.
- `/sigil/pay/payment`: retired generic alias; no standalone browser payment authority.
- `/member/api/liff/identify`: legacy browser-supplied identity bridge remains disabled (`410 LEGACY_LIFF_IDENTITY_DISABLED`).
- `/member/api/liff/payment-intent`: verified LIFF session may obtain a backend-minted signed `/sigil/pay?t=...` handoff; browser-provided amount is not authoritative.
- `/unknown-test-route-mmd`: safe 404/recovery behavior, no default/autodirect redirect.

## Historical Evidence

Redacted Worker route snapshot from the July repair:

`/Users/Hiright_1/.mmd-secrets/codexmin-backups/mmd-route-lock-worker-routes-after-fix-20260701.json`

The snapshot asserted at that time:

- no `mmdbkk.com/sigil/pay/membership*` route was assigned to `member-dashboard-chat-worker`;
- no `www.mmdbkk.com/sigil/pay/membership*` route was assigned to `member-dashboard-chat-worker`;
- `member-dashboard-chat-worker` pay routes were explicit renewal routes only;
- no global catch-all sent membership routes to `member-dashboard-chat-worker`.

Treat that snapshot as incident evidence, not as the current payment architecture specification.

## Remaining Audit Gap

Cloudflare Page Rules, Rulesets, and Bulk Redirect API checks returned `403` for
the local OAuth token used during the July incident review. A complete external redirect audit requires
read-only permissions equivalent to:

- Zone Rulesets Read
- Zone Page Rules Read
- Account Bulk Redirects Read

The current canonical payment-route contract is defined by the 2026-09-13 payment bridge lock and current production source, not by this July snapshot alone.

# MMD Payment Route Bridge Lock — 2026-09-13

## Decision

Customer payment truth is owned by `payments-worker`. Legacy Webflow payment pages are compatibility bridges only and must not contain production payment authority.

Membership selection, signup, renewal and upgrade entry is `/sigil/member/membership`. Exact payment + proof starts only after a backend-owned intent has produced a signed `/sigil/pay?t=...` URL. Generic payment history/status/navigation remains `/member/payments`.

## Route behavior

| Legacy route | Canonical behavior |
| --- | --- |
| `/sigil/pay/renew` | Bridge to `/sigil/pay/renewal`, preserving query/hash so the canonical renewal renderer can validate or ignore context server-side. |
| `/sigil/pay/membership` | With signed `t`: `/sigil/pay?t=...`. Without signed `t`: `/sigil/member/membership` with safe membership-entry context only. |
| `/pay/membership` | Same bridge behavior as `/sigil/pay/membership`. |
| `/sigil/pay/payment` | With signed `t`: `/sigil/pay?t=...`. Without signed `t`: `/member/payments`. The old generic payment UI is retired. |

## Authority lock

The bridge must never:

- forward browser `amount` as payment truth;
- hard-code PromptPay IDs, bank accounts, card destinations, or QR URLs;
- call legacy browser verification endpoints;
- generate a payment reference/session in browser code;
- mark money, membership, entitlement, or Points state.

The canonical signed customer payment route is `/sigil/pay?t=<signed token>`. Payment Instructions v1 remains owned by `payments-worker`.

## Current executable ownership

- `payments-worker`: payment amount, destination, PromptPay QR, canonical payment reference, signed payment handoff and verification authority.
- `member-pages-worker/src/liff-payment-binding.js`: verified LIFF session binding; validates package/amount server-side and accepts only a canonical customer URL shaped as `https://mmdbkk.com/sigil/pay?t=...` with no additional payment-authority query keys.
- `member-dashboard-chat-worker/src/renderers/single-renewal-renderer.js`: explicit `/sigil/pay/renewal*` and `/pay/renewal*` legacy renewal renderer only.
- `mmd-redirect-worker`: hard-disabled transparent pass-through. It is not a payment-route owner and must not be reactivated implicitly by an architecture document or old test.
- `immigrate-worker`: current Wrangler ownership is internal/admin only; legacy member/payment render helpers inside historical source are not public route authority.
- Webflow legacy aliases: compatibility bridge presentation only until an explicit safe edge owner is approved.

## Webflow implementation

The active bridge source is:

```text
webflow/payment/legacy-payment-route-bridge-v1.js
```

Webflow page-level head code mirrors this source. Legacy page-level footer payment scripts and legacy payment HtmlEmbeds are removed from the four routes above.

## Regression ownership

Canonical regression coverage is split by owner:

- `webflow/payment/legacy-payment-route-bridge-v1.test.mjs` — alias behavior and no browser payment authority.
- `member-dashboard-chat-worker/test/renewal-route.test.mjs` — canonical legacy renewal renderer.
- `member-pages-worker/test/liff-identity.test.mjs` and LIFF payment tests — verified member identity/payment handoff.
- `mmd-redirect-worker/test/hard-disabled.test.mjs` — transparent pass-through only.
- `telegram-worker/test/webhook-secret-token.test.mjs` — customer CTA points to `/sigil/member/membership`, never `/pay/membership`.
- `tools/mmd-route-governance-connector.mjs` — read-only production smoke and current route assertions.

The old `mmd-redirect-worker/test/redirect.test.mjs` suite is superseded and must not be restored while the redirect worker remains hard-disabled.

## Historical lock supersession

Older route-lock and architecture documents that describe `/sigil/pay/membership` or `/pay/membership` as permanent browser-rendered payment pages describe the pre-2026-09-13 architecture. They must not be used to restore browser-owned payment logic.

This lock specifically supersedes payment-route conclusions in:

- `docs/locks/MMD_ROUTE_OWNER_LOCK_20260701.md`;
- `docs/locks/MMD_DIRTY_PATCH_QUARANTINE_20260702.md` while preserving its quarantine decision;
- `docs/checklists/MMD_ROUTE_LOCK_SMOKE_CHECKLIST_20260701.md` where old LIFF/payment expectations appeared;
- `docs/sigil-start-route-migration-audit.md` for membership-payment route ownership;
- `docs/architecture/ROUTE_INVENTORY_NORMALIZED.md`, `docs/architecture/ROUTE_OWNER_DECISION_LOG.md`, `docs/architecture/ROUTE_CANONICAL_OWNER_LOCK.md`, `docs/architecture/route-canonical-owner-lock.json`, and `docs/architecture/mmd-redirect-worker-route-inventory-20260720.json` wherever those snapshots conflict with current executable ownership.

Those architecture files remain useful as dated migration evidence, not as permission to recreate retired browser payment authority or reactivate `mmd-redirect-worker`.

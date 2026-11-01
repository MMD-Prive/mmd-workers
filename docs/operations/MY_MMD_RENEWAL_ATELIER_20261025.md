# MY MMD Renewal Atelier — in-app implementation

Date: 25 October 2026 (Asia/Bangkok)
Status: draft source implementation; no production merge/deploy/flag enablement.
Builds on PR #2733 / `08853105aa7e67974ef7137afd0b02254522d5ff`.

## Owner request

Clicking the supplied MY MMD renewal link or `/sigil/pay/renewal` must open a premium mobile-first Renewal screen **inside MY MMD**, not a new marketing page before the app. Present Standard and Premium and hand approved purchases to the existing signed checkout. Retired 799 / 1,999 prices remain removed.

## Implemented

- `liff-renewal-view.js`: MMD-only branding, high-contrast obsidian/ivory/champagne theme, two selectable package cards, verified current package/expiry, verified spend, progressive loading percentages, server-dated renewal preview, separate promotion line, fixed checkout action and Home escape.
- `liff-renewal-page-response.js`: narrow response composition at the existing runtime boundary. Only authenticated-shell Renewal entries are enhanced, including initial `liff.state`. The normal Home, signup and promotion shells remain unchanged. The redundant welcome click is skipped by entering the **existing** auth/boot flow; no identity verification is skipped.
- `runtime-index.js`: connects the page composer and eligibility guard on the normal and bootstrap retry lanes. Original runtime content was checked byte-for-byte against blob `ece5173d9c87ee67128d77e94483b7067423dca9` after reversing only these edits.
- `liff-renewal-eligibility.js`: read-only guard around existing offer/purchase endpoints using `readMyMmdVerifiedPointsContext` with strict canonical identity. Same-package Standard renewal requires verified eligible spend >=10,000 THB, price 1,000 THB; Premium >=20,000 THB, price 2,500 THB. Price is rechecked before delegation; the existing owner still creates the payment and verifies settlement.
- Known zero, incomplete/empty history and missing classifications never create an invented full-price renewal or CARE BACK exception. Empty ledger data without explicit coverage remains unknown. No retrospective slips are requested by this UI.
- Package switching is selectable, but the existing backend does not support reviewed tier-change settlement: it explicitly shows owner review and cannot reuse the current package quote. No silent downgrade or fabricated upgrade dates.
- The client sends only `package_code` on purchase and opens only the existing allowed signed checkout returned by the backend. It rejects stale selections, mismatched package/amount, unsafe redirects and duplicate taps. Server copy is inserted with textContent.

## Verification actually executed

Node 22.16.0:

```sh
node --check member-pages-worker/src/runtime-index.js
node --check member-pages-worker/src/liff-renewal-view.js
node --check member-pages-worker/src/liff-renewal-eligibility.js
node --check member-pages-worker/src/liff-renewal-page-response.js
node --test member-pages-worker/test/liff-renewal-eligibility.test.mjs member-pages-worker/test/liff-renewal-page.test.mjs
```

**20 tests passed, 0 failed.** These use bounded synthetic session/response fixtures, no bindings or transactions.

Offline Chromium/Playwright: **18 checks passed, 0 page errors**. Tested verified offer, package-change review, unknown/zero history, 401, disabled flag, old policy rejection, double-tap and handoff guards, foreign checkout rejection, mismatched package rejection, out-of-order responses, text-only labels and layouts at 320/360/390/430/768/1280 px.

A real-shell contract test was added (`liff-renewal-runtime-contract.test.mjs`) but **not executed locally** because the complete repository and its imports could not be fetched into this runtime. Full CI and real iOS/Android LINE login/return remain release acceptance requirements. The offline preview uses this exact UI module with clearly labelled synthetic data; it is not a live customer screenshot.

## Release boundaries

No merge, deployment, purchase-flag enablement, customer message, real payment intent, Points write, membership extension or historical record change was performed. `LIFF_RENEWAL_CARD_ENABLED` remains unchanged. A source default is not proof of the live Cloudflare value.

Before rollout: run the real-shell test and full relevant CI; inspect the compiled worker output; verify the existing guard source has the member history needed; test LINE login/return on iOS and Android; review tier-change settlement separately. Zero-spend/below-threshold renewal prices and the proposed CARE BACK exception are still not owner-approved. The page must keep review states until those decisions are implemented, not charge signup fees by default.

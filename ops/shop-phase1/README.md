# Shop Phase 1: reliable ordering

Implementation scope: `/shop` (Himai) and `/mmd-shop`. This is not the later supplier/admin or product/order-detail UI phase.

## Canonical contract

- One physical stock pool: existing active shared inventory batches and movement ledger. No data migration or quantity changes in this implementation.
- Separate backend-owned Himai/MMD pricing, brand labels and notification topics. Stored order evidence decides payment branding; browser-supplied brand/price/identity is not authority.
- The existing `mmd_shop_himai_v1` receiving profile is unchanged. Payment instructions, receiving accounts, signed `t`, official verification and money authority stay with `payments-worker`.
- Proof received is pending review, never a paid grant.

## Checkout protocol

`POST /shop/api/checkout` and `POST /mmd-shop/api/checkout` now require a cryptographically random `checkout_request_id` and an explicit observed price quote. The quote is compared with freshly loaded server prices; it cannot set the actual order price. Missing protocol fields fail before business writes.

The existing Durable Object namespace hosts a separate instance per shop/request key. A persistent claim is written before customer/order/reservation/payment side effects. The same key and same semantic payload returns the original creation result. Scope/identity/payload conflicts fail closed. A network retry must retain the same key.

Recovery uses the same POST endpoint with `{ checkout_request_id, recover: true }`. A creation response lost to the browser can be replayed with the exact signed payment URL. A worker crash or ambiguous external-write failure is held for operator reconciliation using the deterministic order reference; it is **not** blindly re-executed. There is no promise of a distributed transaction across Airtable and Workers. An expired key is never reusable. Cached payment URLs are removed by a 24-hour alarm, retaining a non-secret anti-reuse tombstone.

The browser stores its unresolved request in tab-scoped sessionStorage (customer/shipping inputs already entered by that customer); no signed payment token is written to browser storage by the new core. Both stores use their existing cart storage keys. New creation requires working storage so a lost response does not silently become a new request. Pending requests are resumed rather than replaced when form/cart changes. Clearing browser storage or using a different browser loses this recovery key; those cases require contacting the shop, not assuming there is no prior order.

## Cart fixes

Catalog-not-ready and catalog-failed states preserve saved items. Reconciliation refreshes prices, SKU/name and quantities only after a validated complete catalog. Duplicate rows consolidate; quantities are capped; unavailable/restricted items remain unorderable. Each new submission refreshes prices and requires the customer to review material changes. Same-request double clicks do not issue a second creation POST. Failed catalog requests expose a retry control, and empty catalogs have a visible empty state.

## Presentation delivery

No redesign. Existing Himai structure/CSS and MMD copy/i18n are preserved. Run `node ops/shop-phase1/build-presentation.mjs` after editing original storefront sources; CI checks generated assets are exact.

- Himai Embed: `webflow/himai-shop/shop-phase1.html` (HTML only).
- Himai head: `webflow/himai-shop/shop-phase1-head.html` (stylesheet loader).
- Himai footer: `webflow/himai-shop/shop-phase1-footer.html` (ordered scripts).
- MMD footer: `webflow/mmd-shop/phase1-footer-loader.html` (ordered scripts). Preserve existing MMD head/CSS and Embed.

The worker serves exact allowlisted runtime/script/style paths inside the existing shop API routes. No new route ownership wildcard, external app, public admin endpoint, credentials, or private media is added.

## Verification

Run the command in `.github/workflows/shop-phase1-reliability-ci.yml`. Local focused suite: **162 passed, 0 failed** on the implementation snapshot. Tests exercise actual business executors with mocked Airtable/service bindings, concurrent same-key calls, worker restart/storage uncertainty, signed payment details, proof routing, both brand prices and generated presentation syntax.

Real Chromium navigation was attempted but this environment rejected the target origin with `ERR_BLOCKED_BY_ADMINISTRATOR` before fixture interception. Therefore this receipt is **not** a rendered-browser/live-production E2E pass. No real order, stock reservation, payment, refund, customer message or Telegram test send was performed.

## Release gate / coordinated cutover

Do not treat staged Webflow or a green PR as deployed. Production merge/deploy/publish requires the owner's explicit release instruction. Deploy Telegram proof-lane support, payments branding and the commerce worker runtime; then publish the prepared Webflow changes and run read-only production smoke followed by an explicitly authorized controlled transaction test. Existing old storefront scripts do not send the new quote/key protocol, so checkout deliberately fails closed during an incomplete backend/frontend cutover. Existing signed payment pages remain usable. Avoid leaving this interval open; release in a coordinated window.

Confirm runtime assets return JavaScript/CSS (not HTML), actual pages contain the ordered loaders, both catalog pricing sources match, and old MMD routes still pass. Any missing dependency or uncertain state is a release blocker, not an automatic bypass.

Rollback: restore the matching previous storefront and commerce backend version together. Retain attempt tombstones/order references; do not erase them to retry a transaction. No financial destination rollback or stock rewrite is part of this change.

## Remaining phases

Supplier stock projection and manual admin shop selection/discounts; customer order lookup/product detail UI; final browser/real-payment/fulfillment acceptance remain outside this Phase 1 implementation.

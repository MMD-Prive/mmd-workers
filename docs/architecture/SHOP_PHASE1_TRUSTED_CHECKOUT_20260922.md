# Shop Phase 1 - Trusted Checkout (2026-09-22)

## Scope and release state

PR #1545 implements Phase 1 for Himai `/shop/` and MMD `/mmd-shop/`.
This record describes implemented source and isolated verification, not production acceptance.
No production orders, payments, stock counts, destinations or customer notifications were changed by the tests.
Production merge/deploy and Webflow publishing require the explicit owner release instruction.

## Canonical inputs read

- Notion MMD Canon: https://app.notion.com/p/f10d58251cc44c56a06cbdd29928ef12
- Notion Identity / Payment / Confirmation Notification Canon: https://app.notion.com/p/3e1581443cc281ccb4abd03ab6c5e402
- Drive MMD Shop Ops Contract: https://docs.google.com/document/d/1sDWOqdw4Yg7fTxBDMm-s2EStPzBQVtZQ3loXMe7DuF4
- Baseline PR #1533 deploy validated routes only; that receipt is not a transaction E2E receipt.

The older Drive reservation-deferred note predates the implemented coordinator. Current repository code, not that historical note, establishes the existing reservation implementation. The latest shared payment destination lock remains unchanged.

## Preserved authority

Airtable retains product, independent brand-price, inventory, customer, order and payment truth.
Himai price never falls back to MMD price. Both stores use the existing physical inventory pool and global reservation coordinator.
`payments-worker` remains the sole money authority. `payment_ref` and signed `t` are preserved. Evidence receipt never grants paid/verified status.
Financial destination stays in the existing server-side payment instruction profile, never in these frontend patches.
Browser source_path, member/LINE IDs, brand labels and prices cannot override server truth.
Restricted products remain closed to online checkout. No new routes, namespaces, migrations, catalog enablement or stock migrations are introduced.

## 1. Correct cart and quote

A shared head script is required before either commerce runtime. Existing brand presentation, cart keys and languages remain intact.
The cart is not reconciled against an unloaded or failed catalog. Empty/error/retry states are explicit. Price-only changes update the stored cart and require a fresh confirmation.
The catalog must identify the correct shop and pricing source. Quantity is normalized, merged and capped to policy/available stock. An unapproved blank brand remains visible for legacy compatibility but cannot advertise checkout eligibility.
Checkout re-reads price and stock; expected_unit_price_thb is a stale-quote check, not pricing authority. Price mismatch is rejected before customer/order writes.

## 2. Brand-safe payment and messaging

`shared/shop-brand-context.mjs` resolves brand from persisted Shop Brand, order/payment Notes and established order ID prefixes. Conflicting or unknown explicit evidence fails closed. Historical records without any brand evidence retain MMD compatibility.
Payment details and verify enrichment expose canonical shop name. Existing payment references are not regenerated.
Proof documents and verified-payment messages route to Himai payment/alert topics 158/159 or MMD topics 161/162 as appropriate.
The Telegram proof-document gateway permits Himai topic 158 only behind its existing payments-service authentication and target-chat checks. Membership/job routes are unchanged.
Verified-payment notification delivery failure is reported in the settlement response; it does not undo verified money or claim successful delivery.

## 3. Durable replay protection

Public POST checkout requires `Idempotency-Key: sc1_<32 lowercase hex characters>` (or the same checkout_key body value). Missing keys return 428 with refresh_required; there is no unsafe legacy bypass.
Request body is bounded to 16 KiB. The normalized customer/shipping/items plus server-verified identity and route-derived brand form a SHA-256 fingerprint.
The existing MMD_SHOP_STOCK_COORDINATOR namespace is reused with a separate `checkout:v1:<hash>` object per key. Stock stays on the existing `global` instance. No global stock lock is held during checkout orchestration.
A durable transaction claims the attempt before any domain write. The same key/payload returns the original order/payment URL; changed payload or brand returns 409. Parallel duplicates never start a second execution.
The browser persists the exact pending draft before POST, reuses it on retry/reload, and blocks editing unresolved attempts. Completed receipts support continuation without claiming current payment status. A deliberate new cart clears only a completed attempt.
Receipt continuation is bounded by 45 minutes or reservation expiry, whichever is earlier. An alarm removes cached receipt data and retains a tombstone, so expiry cannot re-run an old key.
If processing crashes or its external outcome is uncertain, the claim is retained and reports recovery_required plus the attempt order reference. Automatic re-execution is deliberately forbidden. Manual review is needed for partial outcomes; this is not an autonomous repair engine.
Session storage denial blocks checkout before POST; cart browsing has an in-memory fallback. The per-tab draft contains customer-entered delivery data and a short-lived receipt, not backend credentials.

## Verification

Run `node scripts/test-shop-phase1.mjs` from repository root.
The combined suite covers Phase 1 plus existing commerce/payment instructions/refund/proof tests. Chromium generated-document tests run using `python scripts/test-shop-phase1-browser.py` with Playwright installed.
Browser tests use actual Himai embed markup and real store scripts, but MMD markup is a DOM-contract fixture. Network, storage and navigation are mocked; an isolated SHA-256 bridge is used for non-secure generated documents. They are not production E2E, full-page visual QA or a real browser-persistence audit.
CI also dry-runs the actual Himai, merged payments and Telegram Worker bundles, without production secrets.
Test artifacts record the tested commit. Source validation and release acceptance are separate.

## Webflow placement and coordinated release

1. Back up/read current page code, preserving all unrelated scripts.
2. Append `webflow/shared/shop-checkout-safety.head.html` once to the heads of both shop pages; keep existing head code and enforce the total Webflow limit.
3. Update the existing Himai Embed from `webflow/himai-shop/shop-v3.html` and the MMD page footer from `webflow/mmd-shop/mmd-shop-commerce-footer.html`.
4. Apply the small shop-stage label change from `webflow/pay/checkout/footer.html` without changing existing financial-instruction scripts.
5. Verify source readback, then publish the approved frontend before activating mandatory-key ingress. Old cached frontend requests fail safely with 428 and require refresh.
6. Deploy the tested Telegram/payment/Himai source through the existing owner-approved workflows. Shared-module path watches are included. Do not deploy from an unrecorded local tree.
7. Run the existing route smoke for both hosts and a controlled, explicitly authorized transaction acceptance test. Do not force a paid state to make acceptance pass.

Release rollback must preserve unresolved idempotency claims. Do not downgrade to unprotected checkout; hold new ordering or restore a key-aware version. No Phase 2 supplier/manual-order changes or Phase 3 navigation are included here.

# Isolated LIFF commerce mock staging

Test URL: https://mmd-liff-commerce-mock-staging.malemodel-bkk.workers.dev/

QR: https://mmd-liff-commerce-mock-staging.malemodel-bkk.workers.dev/qr.svg

This separate Worker serves the exact offline customer-card fixture from PR
#2551. It has no secrets, service bindings, databases, storage, scheduled jobs,
customer identity or production routes. Only GET/HEAD are supported. Network
connections and form submissions are blocked by CSP; all server mutation
methods fail with 405. The payment buttons display a local mock receipt.

The existing shared CARE BACK staging environment is not redeployed or reused.
Its datastore/R2 bindings are unnecessary for this write-disabled review.
The production LINE app endpoint and both production purchase flags stay unchanged.

## Mobile LINE check

1. Open the URL from your own LINE Keep Memo on the phone. The QR can also open
   the HTTPS preview; verify whether it opened inside LINE or a system browser.
2. Confirm the address ends in `malemodel-bkk.workers.dev` and the page shows
   the synthetic-data banner. There is no LINE identity or login in this fixture.
3. Standard: verify 1,000 THB, 1 purchased year + 180 bonus days, old/new expiry,
   and the announced CARE BACK deadline of 31 October 2026.
4. Premium: verify 2,500 THB, 1 purchased year + 1 bonus year (2 total), and dates.
5. Double Moment: verify 20,000 paid service credit + two 3,500 bonuses = 27,000,
   180-day credit validity, different confirmed bookings of at least 20,000 THB,
   one package per verified member per campaign and non-refundable terms.
6. Tap each payment CTA. It should display a mock receipt and stay on this test
   URL. It must not open real checkout or issue credits/coupons.
7. Record iOS/Android version, LINE version, in-LINE versus system browser,
   clipping/readability, back/reopen behavior, and the CTA result. Actual mobile
   observations must come from the tester; desktop emulation is not acceptance.

## Scope and remaining prerequisite

This validates customer-card layout and inert CTA behavior inside the LINE browser.
It does not validate LIFF SDK login, cookie rotation or signed real checkout.
Authenticated LIFF testing requires an already authorized **separate test LIFF
app** and its staging endpoint configuration. The current CARE BACK staging
channel uses synthetic fixtures; the production LIFF app must not be repointed.
No new login credentials or persistent permissions are created by this Worker.

## Verification and deployment

`node --test liff-commerce-staging-worker/test/*.test.mjs` verifies host isolation,
zero bindings, method restrictions, no cookies/outbound requests, and fixture hash.
`/healthz` reports `mock_only`, writes/intents disabled, no live LIFF auth, an empty
binding list and the exact SHA-256 of the served HTML.

Local Wrangler authentication was expired. Deployment uses the existing authorized
Cloudflare connection with a multipart module upload, empty bindings, and only
the dedicated workers.dev subdomain enabled. No credentials are exported or added.

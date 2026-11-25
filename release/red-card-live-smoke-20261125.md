# Red Card live smoke — 25 November 2026

Read-only browser checks used Cloudflare Browser Rendering because the execution environment's outbound CONNECT proxy blocks the custom domains. The only POST to the application was an empty, unauthenticated request (`{}`) to the reviewed-proof endpoint, rejected before any proof or identity lookup. No real payment, customer message, customer record lookup, entitlement write, Webflow edit or publication occurred.

## Observed results

- Live `https://mmdbkk.com/member/api/liff/public-membership/catalog`: HTTP 200, `ok=true`, Red Card amount 11499, duration 730. Member remains 690/365; Elite remains 4990/730. Route headers identify member-dashboard-chat-worker forwarding to member-pages-worker.
- Live `/pay/membership` redirects to `https://www.mmdbkk.com/pay/membership` and returns 200.
- JavaScript-disabled initial HTML retains the known Red Card fallback defects: `11,499 THB · 1 ปี`, `11,499 · 1Y`, scoped one-year badges, and `958 THB / เดือน`.
- After JavaScript hydration at 1440px, the desktop Red Card shows 2 years, 11,499 THB and 479 THB/month. Mobile-only markup stays one-year in the desktop DOM.
- After JavaScript hydration at 390px, mobile Red Card fact, term and buy metadata show 2 years; desktop card also hydrates to 2 years and 479 THB/month.
- Payments health returns 200, ready=true, signed_token_required=true, and configured Airtable/R2/Telegram/confirmation-token bindings.
- On `payments-worker.malemodel-bkk.workers.dev`, POST `/v1/internal/payments/reviewed-proof` without authentication returns 401 `service_auth_required`.
- The same internal path on sigil.mmdbkk.com returned 522. Repository routes expose `/v1/pay/*`, `/v1/payments/*`, `/v1/confirm/*`; `/v1/internal/*` is not a configured public route, so that response is not evidence that the internal service endpoint is broken.

## Authenticated write smoke remains blocked

The production payments-worker is configured for live base `appsV1ILPRfIjkaYg`. The deployed member-pages-worker-staging also uses that live base. `mmd-renewal-isolated-test` has isolated KV/sandbox configuration, but no Airtable writer binding. No deployed Payments staging service with the isolated smoke base was found among Workers, and no service credential is available in the execution environment. Cloudflare settings expose secret names, not their values.

Do not test an approved proof against production merely to turn this result green. The prior isolated Airtable adapter test (receipt in release/red-card-smoke-20261122.json) does not establish deployed service authentication, actual REST upsert semantics, or production writer credential access. A dedicated Payments staging endpoint with test credentials and the isolated Airtable base is required for that remaining check.

Customer signup-link distribution stays paused pending the authenticated isolated write test and Webflow initial-copy correction. This report does not impose a server-side purchase block.

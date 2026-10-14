# KBank sandbox OAuth smoke

This adds a server-side credential check to payments-worker. It does not implement payouts, schedules, token delivery to a browser, or production banking.

POST `/v1/internal/payments/kbank/sandbox/smoke` through the existing PAYMENTS_WORKER service binding with `x-internal-token` set to AUTH_SERVICE_ADMIN_TO_PAYMENTS. No body is needed. The public admin UI is not wired yet. Do not put service credentials into browser JavaScript.

Deployment uses payments-worker/wrangler.merged.toml, including the new Durable Object binding and migration. The route is disabled by default. Provision KBANK_SANDBOX_CONSUMER_ID and KBANK_SANDBOX_CONSUMER_SECRET using the existing setup helper, then deliberately enable KBANK_SANDBOX_ENABLED=true for a sandbox smoke deployment.

One Durable Object serializes calls and durably limits this endpoint to one OAuth request per 30 minutes, including failed attempts. Manual portal requests share the bank's credential quota but are outside this limiter; wait 30 minutes after the latest portal OAuth request before the first Worker smoke. A 429 is a cooldown, not a fresh connectivity result. No automatic retry is performed.

Success returns `{ok:true,environment:"sandbox",oauth:"connected",expires_in:1799,transfers_enabled:false}` (expires_in comes from KBank). The access token is discarded after validation. Bank error payloads and credentials are neither returned nor logged. Redirects are rejected and requests time out after 15 seconds.

Validation: `node --test payments-worker/kbank-sandbox.test.mjs`. These use mocked upstream responses. A successful test is not proof of deployed credentials or a live bank connection. Before enabling, run the existing payments deployment gates and verify the new migration with Wrangler. Live Worker smoke remains pending until deployment and secret provisioning are confirmed.

# KBank Sandbox admin smoke

The existing `/v1/admin/payment-issuer-diagnostic` page now includes a KBank Sandbox button. It uses the credential-bound admin/owner session and the same-origin POST gate. GET never calls the bank.

POST accepts only `{ "mode": "kbank_sandbox_oauth" }`. The admin worker uses its existing PAYMENTS_WORKER binding and AUTH_SERVICE_ADMIN_TO_PAYMENTS secret, with a fixed path and no public fallback. The browser receives only allowlisted diagnostic fields. No bank credentials or access tokens are returned.

Rollout:
1. Deploy this admin-worker change through the existing admin deployment workflow. No route or secret changes are required on admin-worker.
2. On the already deployed payments-worker, set the text variable KBANK_SANDBOX_ENABLED to `true` and deploy that setting. Keep both existing KBANK_SANDBOX secrets. Do not enter credentials again.
3. Wait at least 30 minutes after any manual portal OAuth request for this app, then sign in to the MMD admin site and open https://www.mmdbkk.com/v1/admin/payment-issuer-diagnostic . Click the KBank button once.
4. Success explicitly says Sandbox connected. A cooldown is not a new successful connection. No automatic retries; the button remains disabled after the attempt.
5. Set KBANK_SANDBOX_ENABLED back to `false` after this one-off credential check.

This change does not implement scheduled payouts or money transfers. Live OAuth verification remains pending until deployed and clicked by an authenticated admin. Local tests use mocked upstream responses.

Validation: `node --test admin-worker/kbank-sandbox-diagnostic.test.mjs payments-worker/kbank-sandbox.test.mjs`.

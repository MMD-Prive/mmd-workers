# Payment issuer transport and diagnostic

Status: patch authorized for GitHub PR review; HOLD / NO DEPLOY. Do not rerun Job 1, Job 2 or Create Job as a connectivity test. No production probe or payment mutation was performed while preparing this patch.

## Problem and change

The checked main source uses HTTP for `callPaymentsCreateLink`, points `PAYMENTS_BASE_URL` to the legacy workers.dev origin and has no `PAYMENTS_WORKER` service binding in admin-worker's Wrangler config. The historical blockers were a 522 transport failure and a later 401 service-auth failure. A source inspection cannot establish the currently provisioned production secret values.

The issuer now uses the `PAYMENTS_WORKER` binding first and retains the dedicated `AUTH_SERVICE_ADMIN_TO_PAYMENTS` credential. If the binding is absent, it uses HTTPS with `https://sigil.mmdbkk.com` as the default and replaces the known obsolete workers.dev origin with that canonical origin. Explicit alternative HTTPS origins remain configurable through the existing environment variables. Redirects are not followed. Binding failures and HTTP errors are never retried through a second transport because the first attempt may already have created a record.

`POST /v1/admin/payment-issuer-diagnostic` is an exact admin route on apex and www, behind the existing credential-bound session gate. It additionally requires an admin/owner role and a matching production Origin. Bare service/admin bearer headers and spoofed actor headers do not bypass the browser gate. The caller must send `{}`; all nonempty payloads are rejected before reaching payments.

The diagnostic always sends a fresh `{}` to `POST /v1/confirm/link` through the same transport as the issuer. In the current payments implementation, `400 client_name_required` proves service authentication and validation were reached before durable writes. Only that exact validation failure counts as a successful diagnostic. An unexpected 2xx is an error, not permission to proceed with real jobs.

Responses distinguish admin authentication, configuration, transport, upstream service authentication and validation. They never echo the service token, session cookie, raw upstream body, minted links or identifiers. Upstream validation may instead report `airtable_not_ready`, because payments checks configuration before validating the client name; that is not a green diagnostic.

## Validation

Tests call the active admin wrapper and the actual payments-worker entrypoint with synthetic credentials and in-memory doubles. They verify the expected empty-payload validation, no Airtable/KV/network side effects, role/Origin/session enforcement, service credential mismatch, missing credentials, safe error projection, normal issuer response compatibility and no fallback retry.

The patch adds those tests to the admin deploy gate and a PR-only contract workflow. Tests do not access production or read real secrets.

## Release boundary

The authorized scope is a code patch and PR review. This patch does not provision credentials, rotate secrets, run a diagnostic in production or authorize a merge/deploy. Production readiness remains unverified until a separately approved rollout and authenticated diagnostic. Both workers must have the same dedicated admin-to-payments credential; do not replace it with a browser session credential or legacy confirm key.

Merging files under `admin-worker/**` triggers the existing production deployment workflow. Keep the PR unmerged until that rollout is authorized. No payments-worker code, membership/points logic or financial records are changed by this patch.

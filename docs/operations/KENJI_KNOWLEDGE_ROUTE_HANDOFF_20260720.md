# Kenji Knowledge Route Handoff — 2026-07-20

## Status

- Repository owner: `admin-worker`
- Previous owner: `mmd-redirect-worker`
- Migration state: `prepared_not_live_verified`
- Production state: **PRODUCTION VERIFICATION REQUIRED**
- Next phase: PR B2 after live verification

PR B1 changes repository ownership only. It does not deploy or mutate Cloudflare. The configured production entry point is `admin-worker/src/dashboard-worker.js`, which delegates non-dashboard requests to `admin-worker/src/index.js`; the existing Kenji handler therefore serves GET and HEAD for the normalized exact/trailing-slash path.

PR B1 moves the six Kenji-specific patterns from `mmd-redirect-worker/wrangler.toml` to `admin-worker/wrangler.toml`. The two global catch-alls remain and are not changed. The post-B1 repository state is six narrow Kenji patterns in the admin-worker config and zero Kenji-specific patterns in the redirect-worker config.

Authentication behavior is intentionally unchanged. PR B1 adds no auth gate, bypass, cookie, token, or secret handling. Production verification must confirm that the observed behavior matches the previously served route before any cleanup.

## Prepared route patterns

All use `zone_name = "mmdbkk.com"`:

- `mmdbkk.com/internal/admin/kenji-knowledge`
- `mmdbkk.com/internal/admin/kenji-knowledge/`
- `mmdbkk.com/internal/admin/kenji-knowledge*`
- `www.mmdbkk.com/internal/admin/kenji-knowledge`
- `www.mmdbkk.com/internal/admin/kenji-knowledge/`
- `www.mmdbkk.com/internal/admin/kenji-knowledge*`

No `/internal/admin/*`, `/internal/*`, apex catch-all, or www catch-all is assigned to admin-worker.

## Expected response contract

- HTTP 200 for GET and HEAD on exact and trailing-slash URLs
- `content-type: text/html; charset=utf-8`
- bodyless HEAD
- root element `#mmdKenjiKnowledgeV9`
- CSS: `https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-board-bridge.css`
- deferred loader: `https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-1-webflow-loader-board196.js`
- `x-mmd-route-owner: admin-worker`
- `x-mmd-page: kenji-knowledge-admin`
- `x-mmd-origin: admin-worker:kenji-knowledge-shell`
- `x-mmd-worker: admin-worker`
- `cache-control: no-store, no-cache, must-revalidate, max-age=0`
- no `x-mmd-front-gate`

## Approved deployment order for a later task

No step below was executed in PR B1.

1. Deploy `admin-worker` first with the existing production entry point.
2. Test apex and www hosts.
3. Test exact, trailing-slash, and query-string variants.
4. Confirm HTTP 200.
5. Confirm HTML content type and bodyless HEAD.
6. Confirm the root, CSS, and deferred loader load successfully.
7. Confirm authentication behavior is unchanged.
8. Confirm `x-mmd-route-owner: admin-worker` and the other owner headers.
9. Confirm `x-mmd-front-gate` is absent.
10. Only then deploy the `mmd-redirect-worker` configuration with its six Kenji-specific routes removed. Do not alter its global catch-alls.
11. Repeat every smoke test.
12. Observe both Worker logs, response status/content type, asset failures, authentication results, and route traffic before authorizing PR B2.

Use non-secret test data. Record live route identifiers and sensitive operational evidence outside the repository.

## Rollback

1. Restore the exact and wildcard Kenji patterns to `mmd-redirect-worker`.
2. Deploy `mmd-redirect-worker` without changing either global catch-all.
3. Confirm the previous page response is restored on apex and www, including trailing slash and query string.
4. Keep the admin-worker handler intact for diagnosis and a later retry.
5. Do not broaden either Worker’s ownership.

## PR B2 gate

PR B2 is allowed only after production evidence confirms the admin-worker route wins for all six patterns, assets and auth are unchanged, no front-gate header is present, logs are healthy through the observation window, and rollback configuration is captured. PR B2 may then remove any confirmed rollback-only front-gate fallback; none exists in the audited front-gate source used for PR B1.

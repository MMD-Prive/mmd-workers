# Kenji Knowledge Route Handoff — 2026-07-20

## Status

- Repository owner: `admin-worker`
- Previous owner: `mmd-redirect-worker`
- Canonical route: `/sigil/internal/admin/kenji-knowledge`
- Temporary alias: `/internal/admin/kenji-knowledge`
- Alias status: `temporary_compatibility_alias`
- Migration state: `prepared_not_live_verified`
- Production state: **PRODUCTION VERIFICATION REQUIRED**
- Next phase: PR B2 after live verification

PR B1.2 adds the canonical SIGIL path while retaining the old path as a temporary compatibility alias. It does not deploy or mutate Cloudflare. The configured production entry point is `admin-worker/src/dashboard-worker.js`, which delegates non-dashboard requests to `admin-worker/src/index.js`; both normalized exact/trailing-slash paths use the same shell implementation.

PR B1.2 keeps the six old compatibility patterns and adds six canonical patterns to `admin-worker/wrangler.toml`. The two redirect-worker global catch-alls remain unchanged. There are zero Kenji-specific patterns in the redirect-worker config.

The terminating wildcard declarations are required because Cloudflare route matching includes the query string and an exact pattern does not match a query-bearing URL. Inside `admin-worker`, pathname classification remains exact: only the normalized canonical and compatibility-alias pathnames receive the shared shell. A request captured by either wildcard with any other suffix or subpath is returned directly from `fetch(request)`, which uses Cloudflare Route origin semantics. It preserves the destination, query, method, headers, body, status, content type, and response body without adding Kenji ownership headers or substituting the admin JSON fallback. With `global_fetch_strictly_public` absent, same-zone global fetch targets the zone origin and ignores Worker routes, preventing recursion through admin-worker or the redirect-worker catch-all.

Suffix URLs such as `-other` and `/foo` are not Kenji Knowledge-owned surfaces. They pass through to the application origin, so sibling paths remain available to their actual owner without a redirect or a pass-through proxy binding.

PR B1.3 prepares the missing browser session issuer in `admin-worker`; it does not deploy it. The canonical login page is `GET /internal/admin/login`, session creation is `POST /internal/admin/login/session`, and logout is `DELETE /internal/admin/login/session`. Successful server-side authentication issues `mmd_admin_gate_v1` with `Path=/`, `Max-Age=28800`, `HttpOnly`, `Secure`, and `SameSite=Lax`, without a `Domain` attribute. The cookie is never returned in HTML or JSON.

Login submissions require an exact same-origin `Origin`, form-encoded POST body, a current approved server secret, and an allowlisted relative `next` target. The default target is `/sigil/internal/admin/kenji-knowledge`. Apex and www sessions are issued and validated separately: the session base URL must equal the request origin. Invalid, malformed, empty, cross-origin, expired, future-dated, or tampered sessions are rejected without setting a cookie or revealing which credential failed. No persistent login-failure rate-limit binding exists in the current admin-worker configuration, so PR B1.3 adds no process-local limiter that could provide misleading protection.

The login owner is limited to six exact apex/www route declarations for `/internal/admin`, `/internal/admin/login`, and `/internal/admin/login/session`. No `/internal/admin/*` route is added. The `/private` path is not a canonical login route and is not linked from the restored UI. `mmd-redirect-worker` and `immigrate-worker` are not expanded or modified.

## Prepared route patterns

All use `zone_name = "mmdbkk.com"`.

Canonical:

- `mmdbkk.com/sigil/internal/admin/kenji-knowledge`
- `mmdbkk.com/sigil/internal/admin/kenji-knowledge/`
- `mmdbkk.com/sigil/internal/admin/kenji-knowledge*`
- `www.mmdbkk.com/sigil/internal/admin/kenji-knowledge`
- `www.mmdbkk.com/sigil/internal/admin/kenji-knowledge/`
- `www.mmdbkk.com/sigil/internal/admin/kenji-knowledge*`

Temporary compatibility alias retained:

- `mmdbkk.com/internal/admin/kenji-knowledge`
- `mmdbkk.com/internal/admin/kenji-knowledge/`
- `mmdbkk.com/internal/admin/kenji-knowledge*`
- `www.mmdbkk.com/internal/admin/kenji-knowledge`
- `www.mmdbkk.com/internal/admin/kenji-knowledge/`
- `www.mmdbkk.com/internal/admin/kenji-knowledge*`

No `/sigil/*`, `/sigil/internal/admin/*`, `/internal/admin/*`, apex catch-all, or www catch-all is assigned to admin-worker.

The four terminating Kenji wildcards cover query-string variants only at the routing layer. They do not expand shell ownership because runtime pathname classification rejects non-exact suffixes and subpaths before the core admin router.

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
- `x-mmd-route-canonical: /sigil/internal/admin/kenji-knowledge`
- canonical: `x-mmd-route-kind: canonical`
- old alias: `x-mmd-route-kind: compatibility-alias`
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

## Compatibility alias removal gate

Do not remove `/internal/admin/kenji-knowledge` until all of the following pass: canonical production deploy; authenticated apex and www smoke; exact, slash, and query variants; GET and HEAD; API 200 smoke; asset MIME checks; browser acceptance; healthy logs through an observation window; and explicit approval to remove the alias.

## PR B2 gate

PR B2 is allowed only after production evidence confirms the admin-worker route wins for all six patterns, assets and auth are unchanged, no front-gate header is present, logs are healthy through the observation window, and rollback configuration is captured. PR B2 may then remove any confirmed rollback-only front-gate fallback; none exists in the audited front-gate source used for PR B1.

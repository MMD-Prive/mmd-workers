# SIGIL route migration V1

## Goal

Move public ownership of `https://sigil.mmdbkk.com/sigil/*` from `immigrate-worker` to `sigil-worker` without deleting `immigrate-worker` or changing the existing business logic in the same release.

`sigil-worker` is the route owner and canary layer for V1. It proxies to `immigrate-worker` while preserving the existing admin/session/invite/renewal/customer-confirm behavior.

## Route audit

Current SIGIL host route bindings in the live worker configs:

| Worker | Config | Route | Action |
| --- | --- | --- | --- |
| `sigil-worker` | `mmd-workers/sigil-worker/wrangler.toml` | `sigil.mmdbkk.com/sigil/*` | Owns public `/sigil/*` gateway. |
| `immigrate-worker` | `mmd-workers/immigrate-worker/wrangler.toml` | `sigil.mmdbkk.com/a/*` | Keep temporarily for legacy public assets. |

The old broad `immigrate-worker` binding `sigil.mmdbkk.com/*` has been removed from config for this migration. Do not delete `immigrate-worker`; it remains a migration/compatibility layer and still owns legacy `mmdbkk.com`, `www.mmdbkk.com`, `/internal/*`, and `/member/api/*` aliases.

## First-wave routes

These `/sigil/*` routes are currently implemented in `immigrate-worker` and now enter through `sigil-worker` first:

| Method | Path | Current upstream behavior |
| --- | --- | --- |
| `GET` | `/sigil/admin/login` | Render SIGIL admin login. |
| `POST` | `/sigil/admin/login/session` | Create admin login session. |
| `DELETE` | `/sigil/admin/login/session` | Clear admin login session. |
| `POST` | `/sigil/admin/verify-access-code` | Verify protected admin access code. |
| `GET` | `/sigil/admin/control-room` | Protected admin browser route. |
| `GET` | `/sigil/admin/jobs/create-session` | Protected admin create-session page. |
| `GET` | `/sigil/admin/jobs/create-job` | Protected admin create-job page. |
| `GET` | `/sigil/api/invite/resolve` | Public invite resolver alias. |
| `POST` | `/sigil/api/renewal/status` | Public renewal status alias. |
| `POST` | `/sigil/api/renewal/intake` | Public renewal intake alias. |
| `POST` | `/sigil/api/jobs/customer-confirm` | Public customer confirm alias. |

Other `/sigil/*` paths also pass through `sigil-worker` because the Cloudflare route is `sigil.mmdbkk.com/sigil/*`, but only the first-wave routes receive `x-mmd-sigil-migration-wave: first`.

## Preserved contracts

- Query/body parameter `token` is rejected by `sigil-worker`; token-like query parameters must use `t`.
- `next` is restricted to a local path. Unsafe body `next` values are rejected; unsafe query `next` values are normalized to `/sigil/admin/jobs/create-session`.
- Admin session verification remains in `immigrate-worker`; `sigil-worker` does not mint or bypass admin sessions.
- First-wave admin HTML is still generated upstream with SIGIL admin sessions, not raw bearer/confirm keys.
- Legacy `/internal/*`, `/member/api/*`, `mmdbkk.com/sigil/*`, and `www.mmdbkk.com/sigil/*` aliases remain on `immigrate-worker` during the seven-day audit window.

## Canary headers

Every `sigil-worker` response includes:

- `x-mmd-sigil-owner: sigil-worker`
- `x-mmd-sigil-build: SIGIL_ROUTE_MIGRATION_V1`
- `x-mmd-sigil-upstream: immigrate-worker` when proxied

First-wave routes additionally include:

- `x-mmd-sigil-migration-wave: first`

## Deployment order

1. Deploy `sigil-worker`.
2. Verify first-wave routes return `x-mmd-sigil-owner: sigil-worker` and `x-mmd-sigil-build: SIGIL_ROUTE_MIGRATION_V1`.
3. Deploy `immigrate-worker` with the broad `sigil.mmdbkk.com/*` route removed.
4. Verify `sigil.mmdbkk.com/sigil/*` still returns the SIGIL canary headers.
5. Verify `sigil.mmdbkk.com/a/*`, `/internal/*`, and `/member/api/*` aliases still resolve through their existing routes.
6. Tail both workers for traffic and errors.
7. After 7 days with no dependency on `immigrate-worker` as the public `/sigil/*` gateway, move `immigrate-worker` docs/config to deprecated/archive status only.

## Live verification

Run these checks after deploying `sigil-worker` and again after deploying the `immigrate-worker` route cleanup:

```bash
curl -I https://sigil.mmdbkk.com/sigil/admin/login
curl -s https://sigil.mmdbkk.com/sigil/admin/login | grep SIGIL_ROUTE_MIGRATION_V1
```

Expected headers from the first command:

- `x-mmd-sigil-owner: sigil-worker`
- `x-mmd-sigil-build: SIGIL_ROUTE_MIGRATION_V1`
- `x-mmd-sigil-upstream: immigrate-worker`
- `x-mmd-sigil-migration-wave: first`

## Deployment record: SIGIL admin login UI V2

`GET /sigil/admin/login` now renders the premium SIGIL admin gate UI from `sigil-worker`.

- Deployed worker version: `af253f57-839e-4ffc-b8f2-a24b90f19a51`
- UI canary: `SIGIL_ADMIN_LOGIN_UI_V2`
- Route owner header: `x-mmd-sigil-owner: sigil-worker`
- Migration build header: `x-mmd-sigil-build: SIGIL_ROUTE_MIGRATION_V1`
- Login UI header: `x-mmd-sigil-login-ui: SIGIL_ADMIN_LOGIN_UI_V2`

Verified security checks:

- Old Assistant Console UI removed from `/sigil/admin/login`.
- Query/body parameter `token` is rejected with `400`.
- External `next` URLs are rejected with `400`.
- Login form targets `/sigil/admin/login/session`.
- `t` is preserved as the only allowed token-like parameter.

## Log watch

Any request hitting `immigrate-worker` with host `sigil.mmdbkk.com` and path `/sigil/*` should be zero after migration. Watch for the structured warning:

```bash
cd mmd-workers/immigrate-worker
npx wrangler tail immigrate-worker --format=json | grep sigil_gateway_unexpected_hit
```

Keep `immigrate-worker` alive for seven clean days only for:

- `sigil.mmdbkk.com/a/*`
- `/internal/*`
- `/member/api/*`
- `mmdbkk.com/sigil/*` legacy aliases
- `www.mmdbkk.com/sigil/*` legacy aliases

After seven clean days, remove remaining `mmdbkk.com/sigil/*` aliases from `immigrate-worker` if logs show no dependency, archive `immigrate-worker`, and keep a rollback branch or tag.

## Rollback

1. Re-add the removed route to `mmd-workers/immigrate-worker/wrangler.toml`:

   ```toml
   [[routes]]
   pattern = "sigil.mmdbkk.com/*"
   zone_name = "mmdbkk.com"
   ```

2. Deploy `immigrate-worker`.
3. If needed, remove or disable the `sigil.mmdbkk.com/sigil/*` route from `sigil-worker` and redeploy.
4. Confirm `https://sigil.mmdbkk.com/sigil/admin/login` no longer returns `x-mmd-sigil-owner: sigil-worker`.

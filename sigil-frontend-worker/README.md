# SIGIL Frontend Worker

`sigil-frontend-worker` is the clean GET-only UI layer for SIGIL/MMD frontend pages.

It must not own backend business logic, Airtable writes, admin authentication,
membership approval, or payment verification. Forms and interactive pages call
existing backend endpoints such as `POST /api/pay/renewal/proof`.

Safe preview routes:

- `sigil.mmdbkk.com/_frontend-health*`
- `sigil.mmdbkk.com/_preview/pay/renewal*`

## Temporary Production Route Ownership

`sigil.mmdbkk.com/pay/renewal*` is temporarily owned by `sigil-frontend-worker`.
This was changed through the Cloudflare Workers Routes API, not by `wrangler deploy`.

- Route ID: `b209140b9a0f4bd5ab6ce8e4b79d1feb`
- Current owner: `sigil-frontend-worker`
- Previous owner: `admin-worker`
- Production UI route: `sigil.mmdbkk.com/pay/renewal*`

Backend API routes must remain owned by `admin-worker`:

- `sigil.mmdbkk.com/api/pay/renewal/proof*`
- `sigil.mmdbkk.com/api/pay/renewal/review/*`

Do not deploy `admin-worker` until route config cleanup is planned.
`admin-worker/wrangler.toml` still contains `sigil.mmdbkk.com/pay/renewal*`,
so a future `admin-worker` deploy may reclaim the route.

Rollback route ownership to `admin-worker`:

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes/b209140b9a0f4bd5ab6ce8e4b79d1feb" \
  --data '{"pattern":"sigil.mmdbkk.com/pay/renewal*","script":"admin-worker"}'
```

Verify live renewal UI ownership:

```bash
curl -i https://sigil.mmdbkk.com/pay/renewal
curl -i https://sigil.mmdbkk.com/pay/renewal/
curl -i "https://sigil.mmdbkk.com/pay/renewal?t=test123"
```

Expected response headers include:

```text
x-mmd-sigil-frontend-owner: sigil-frontend-worker
```

Verify backend API is not served by the frontend worker:

```bash
curl -i https://sigil.mmdbkk.com/api/pay/renewal/proof
```

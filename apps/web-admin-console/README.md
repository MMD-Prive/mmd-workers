# Web Admin Console

Next.js admin console for the MMD Privé admin-worker deals API.

## Run Locally

Terminal 1:

```bash
cd admin-worker
npx wrangler dev --port 8787
```

Terminal 2:

```bash
cd apps/web-admin-console
NEXT_PUBLIC_ADMIN_API_BASE=http://localhost:8787 ADMIN_INTERNAL_TOKEN=<token> npm run dev
```

The console routes are:

- `/admin`
- `/admin/console`
- `/admin/console/dashboard`
- `/admin/console/deals`
- `/admin/console/deals/[deal_id]`

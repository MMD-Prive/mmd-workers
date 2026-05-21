# Admin Console Local Smoke Test

Use this checklist to run the Admin Console and admin-worker together on a local machine.

## Terminal 1

```bash
cd admin-worker
npx wrangler dev --port 8787
```

## Terminal 2

```bash
cd apps/web-admin-console
NEXT_PUBLIC_ADMIN_API_BASE=http://localhost:8787 ADMIN_INTERNAL_TOKEN=<YOUR_INTERNAL_TOKEN> npm run dev
```

## Browser

Open:

```text
http://localhost:3000/admin/console/deals
```

## Curl Checks

```bash
curl http://localhost:8787/v1/admin/health
```

```bash
curl http://localhost:8787/v1/admin/deals/list-lite \
  -H "Authorization: Bearer <YOUR_INTERNAL_TOKEN>"
```

```bash
curl -X POST http://localhost:8787/v1/admin/deals/upsert-ai \
  -H "Authorization: Bearer <YOUR_INTERNAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "deal_id": "DL-001",
    "client_name": "Test Client",
    "channel": "web",
    "client_tier": "premium",
    "deal_status": "needs_per_review",
    "ai_top_model": "Hito",
    "ai_reply_draft": "We have a strong match in mind."
  }'
```

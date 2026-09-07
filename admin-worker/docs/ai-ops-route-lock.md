# AI Ops route lock

- `GET /v1/admin/ai-ops/context` — authenticated admin advisory context.
- `GET /v1/admin/ai-ops/client.js` — shared frontend panel client.

Both endpoints belong to `admin-worker` and must remain behind existing admin authentication/routing. The layer is advisory only and cannot mutate money, entitlement, Telegram/Drive grants, or protected model eligibility.
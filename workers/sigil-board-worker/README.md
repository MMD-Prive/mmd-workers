# SIGIL Board Worker

V7.0 Worker Implementation Pack for Kenji Board / SIGIL Worker Control Console.

## Routes

```txt
GET  /health
GET  /sigil/board/runtime
POST /sigil/board/runtime/dry-run
POST /sigil/board/actions/queue
POST /sigil/board/audit
POST /sigil/board/runtime/rollback
```

## Safety Rules

- No secrets in Webflow.
- Do not use `token`; use `t` only when tokenized public links are needed.
- Frontend cannot write production.
- `GET /sigil/board/runtime` is read-only.
- POST routes require `SIGIL_WORKER_SECRET`.
- Every controlled action must include actor, role, action, permission, request_id, reason, and audit.
- Payment slip is evidence only, not confirmation.
- SVIP is Boss Per manual decision only.
- Black Card is Ewvon private review.
- Rollback is Boss Per only.

## Secrets

```sh
wrangler secret put SIGIL_WORKER_SECRET
wrangler secret put SIGIL_AUDIT_SECRET
wrangler secret put TELEGRAM_BOT_TOKEN
```

`SIGIL_AUDIT_SECRET` and `TELEGRAM_BOT_TOKEN` are reserved for the next implementation layer. V7.0 writes audit to console and KV.

## Local

```sh
npm install
npm run check
npm run dev
```

## Deploy

```sh
npm run deploy
```

## Smoke Tests

Health:

```sh
curl "https://sigil.mmdbkk.com/health"
```

Runtime:

```sh
curl "https://sigil.mmdbkk.com/sigil/board/runtime"
```

Dry-run:

```sh
curl -X POST "https://sigil.mmdbkk.com/sigil/board/runtime/dry-run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGIL_WORKER_SECRET" \
  -d '{
    "actor": "per",
    "role": "boss_per",
    "action": "controlled_dry_run",
    "target_route": "/sigil/board/runtime/dry-run",
    "required_permission": "controlled_dry_run",
    "reason": "Test controlled dry-run from V7.0 worker pack",
    "payload": {
      "test": true
    }
  }'
```

Queue action:

```sh
curl -X POST "https://sigil.mmdbkk.com/sigil/board/actions/queue" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGIL_WORKER_SECRET" \
  -d '{
    "actor": "per",
    "role": "boss_per",
    "action": "queue_action",
    "target_route": "/sigil/board/actions/queue",
    "required_permission": "queue_action",
    "reason": "Queue preview only"
  }'
```

Rollback guard:

```sh
curl -X POST "https://sigil.mmdbkk.com/sigil/board/runtime/rollback" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGIL_WORKER_SECRET" \
  -d '{
    "actor": "per",
    "role": "boss_per",
    "action": "rollback_runtime",
    "target_route": "/sigil/board/runtime/rollback",
    "required_permission": "rollback_runtime",
    "reason": "Rollback plan only"
  }'
```

## Webflow Connection

In V7.0 Webflow Console:

```txt
Runtime API:
https://sigil.mmdbkk.com/sigil/board/runtime
```

Do not put `SIGIL_WORKER_SECRET` into Webflow.

The V7.0 Webflow UI should only build a request preview. Real POST calls must come from a secure server-side action or admin-only tooling.

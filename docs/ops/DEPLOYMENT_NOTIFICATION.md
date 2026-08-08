# MMD Production Deployment Notifications

All supported Worker deployments use one guarded entry point:

```bash
scripts/deploy-worker.sh <worker-name>
```

The wrapper runs the configured tests and lint command, deploys with Wrangler, captures the Cloudflare Version ID, runs the configured smoke test, sends a Telegram success or failure notification, and exits with the failing command's status. It does not change routes or secrets.

## Required environment

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DEPLOY_CHAT_ID`

Set these in the deploy runner or CI secret store. Never add their values to Wrangler config or the repository.

Optional metadata:

- `DEPLOY_ENVIRONMENT` (defaults to `Production`)
- `DEPLOY_USER` (falls back to `GITHUB_ACTOR`, then the local user)
- `ROLLBACK_VERSION_ID` (included when the deploy runner knows the previous version)
- `DEPLOY_CHANGED_ROUTES` (newline-separated routes changed by the release; defaults to none)
- `DEPLOY_SMOKE_COMMAND` (release-specific smoke command; overrides the registry command)

## Supported Workers

```bash
scripts/deploy-worker.sh mmd-redirect-worker
scripts/deploy-worker.sh payments-worker
scripts/deploy-worker.sh member-pages-worker
scripts/deploy-worker.sh member-api-worker
scripts/deploy-worker.sh sigil-worker
scripts/deploy-worker.sh telegram-worker
scripts/deploy-worker.sh chat-worker
scripts/deploy-worker.sh admin-worker
```

`member-api-worker` is registered but fails closed until its Worker directory and Wrangler config exist in this repository. The registry also covers the existing root deployment scripts for events, SIGIL booking, board, and booking proxy Workers.

Where a Worker has no stable smoke command in the repository, the notification reports `SKIP (not configured)`. Production release automation should set `DEPLOY_SMOKE_COMMAND` to its authenticated route-specific smoke check; a bare HTTP status is not treated as business-flow proof.

To add a future Worker, add one entry to `WORKERS` in `shared/deploy-notify.js` with its Wrangler config and optional `test`, `lint`, and `smoke` commands. No notification formatting changes are needed.

## npm deployment commands

The repository package scripts call the same wrapper. For example:

```bash
npm run deploy:mmd-redirect
npm run deploy:payments
npm run deploy:member-pages
npm run deploy:member-api
npm run deploy:sigil
npm run deploy:telegram
npm run deploy:chat
npm run deploy:admin
```

## Rollback notification

After an operator activates a rollback version through the approved rollback procedure, send the notification with a JSON payload:

```bash
node shared/deploy-notify.js rollback /path/to/rollback.json
```

The payload must contain `worker`, `previousVersion`, `newActiveVersion`, and `reason`. The notifier reports the rollback; it does not perform one.

## Safe notification preview

Formatting can be checked without Telegram network access:

```bash
DEPLOY_NOTIFY_DRY_RUN=1 node shared/deploy-notify.js success /path/to/success.json
```

## Message examples

```text
✅ MMD Deployment Success

Worker:
mmd-redirect-worker

Environment:
Production

Commit:
68fb0a118407c9b794275d06df75ed96d54b5721

Version:
e0e9f103-6678-4269-a1cd-7e95314484c0

Deploy Timestamp:
2026-08-05T08:00:00.000Z

Deploy User:
per

Branch:
rescue/pay-renewal-root-20260407

Changed Routes:
✓ mmdbkk.com/blackcard*
✓ mmdbkk.com/mmd-blackcard*

Smoke Test:
PASS

Rollback Version:
Not available
```

```text
❌ MMD Deployment Failure

Worker:
admin-worker

Command:
npx wrangler deploy --config admin-worker/wrangler.toml

Exit Code:
1

Git SHA:
68fb0a118407c9b794275d06df75ed96d54b5721

Last Log Lines:
<last 12 command log lines>
```

```text
↩️ MMD Deployment Rollback

Worker:
sigil-worker

Previous Version:
e0e9f103-6678-4269-a1cd-7e95314484c0

New Active Version:
92f79d9d-5235-49d8-98f9-adf5c13b2827

Reason:
Smoke test regression
```

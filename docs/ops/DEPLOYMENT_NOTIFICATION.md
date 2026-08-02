# MMD Production Deployment Notifications

All supported MMD Workers must be deployed through the repository-level wrapper. It runs the registered tests and lint command, deploys with the Worker's existing Wrangler configuration, captures the Cloudflare Version ID, runs a read-only HTTP smoke test, and sends a consistent Telegram success or failure notification.

The wrapper does not add, remove, or modify Cloudflare routes. The route list in a success notification describes the Worker's configured coverage.

## Required environment

Export these values in the operator shell or CI secret store. Never put their values in source control or a Wrangler configuration.

```sh
export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_DEPLOY_CHAT_ID="..."
```

The wrapper validates both variables before tests or deployment. `DEPLOY_USER`, `DEPLOY_ENVIRONMENT`, and `DEPLOY_SMOKE_URL` are optional overrides. GitHub Actions may provide `GITHUB_ACTOR`, `GITHUB_SHA`, and `GITHUB_REF_NAME` instead.

## Deploy a Worker

From the repository root:

```sh
scripts/deploy-worker.sh mmd-redirect-worker
```

The supported registry entries are `mmd-redirect-worker`, `payments-worker`, `member-pages-worker`, `member-api-worker`, `sigil-worker`, `telegram-worker`, `chat-worker`, and `admin-worker`.

`member-api-worker` is reserved but fails closed because no Worker directory or Wrangler configuration with that name exists on the current default branch. Enable it by replacing that one registry entry with its authoritative config, tests, lint, smoke URL, expected statuses, and routes. Future Workers likewise require one entry in `WORKERS` in `shared/deploy-notify.js`, plus an optional package-script alias.

## Notification behavior

- Test, lint, deploy, Version-ID capture, or smoke failure sends a failure message and preserves the failing exit code.
- The failure message contains the failed command, exit code, Git SHA, and only the final 12 non-empty log lines.
- A successful deploy sends its Worker, environment, Git/Cloudflare versions, UTC timestamp, deploy user, branch, route coverage, smoke result, and the previous version when Wrangler made it available.
- Missing Telegram configuration fails before any deployment begins.
- If Telegram delivery fails after a successful Cloudflare deployment, the wrapper exits non-zero so the missing operational notification cannot be mistaken for a fully successful workflow.

## Rollback notification

Perform rollback operations using the separately approved Cloudflare procedure. After Cloudflare confirms the active version, send the notification without placing secrets in arguments:

```sh
node shared/deploy-notify.js rollback mmd-redirect-worker \
  --previous-version "<previous-version-id>" \
  --new-active-version "<new-active-version-id>" \
  --reason "<reason>"
```

This command only sends the notification; it does not execute a rollback, deploy, route change, or other Cloudflare mutation.

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

Deploy timestamp:
2026-08-03T04:15:00.000Z

Deploy user:
MMD Ops

Branch:
rescue/pay-renewal-root-20260407

Routes:
✓ mmdbkk.com/*
✓ www.mmdbkk.com/*

Smoke Test:
PASS (HTTP 200: https://mmdbkk.com/)

Rollback version:
50dd9e03-3184-4df4-bb52-a3eafc991040
```

```text
❌ MMD Deployment Failure

Worker:
payments-worker

Command:
npx wrangler deploy --config payments-worker/wrangler.merged.toml

Exit code:
1

Git SHA:
68fb0a118407c9b794275d06df75ed96d54b5721

Last log lines:
Authentication error
Deployment failed
```

```text
↩️ MMD Deployment Rollback

Worker:
admin-worker

Previous Version:
e0e9f103-6678-4269-a1cd-7e95314484c0

New Active Version:
50dd9e03-3184-4df4-bb52-a3eafc991040

Reason:
Smoke test regression
```

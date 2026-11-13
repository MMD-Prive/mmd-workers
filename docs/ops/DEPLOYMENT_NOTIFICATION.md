# Guarded local deployment notifications

This wrapper covers registered **local** deployment commands. It is not a replacement for
Worker-specific GitHub release workflows. No automatic rollback is performed.

```bash
export TELEGRAM_BOT_TOKEN=...       # runner secret, never commit
export TELEGRAM_DEPLOY_CHAT_ID=...  # runner secret
export DEPLOY_SMOKE_COMMAND='node path/to/authenticated-read-only-smoke.mjs'
npm run deploy:admin
```

The smoke command is operator-supplied, read-only and specific to the deployed Worker.
It must exit nonzero on unacceptable responses. A local fixture test does not prove
production health. `DEPLOY_SMOKE_COMMAND` is required for every wrapper deployment;
there is no SKIP fallback. Preview mode is forbidden for deployment.

## Gates and scope

Configuration and entrypoint existence, notification credentials, and nonempty registered
tests/lint plus a smoke command are checked before any tests or Cloudflare mutation.
Then the wrapper runs tests, lint, Wrangler deploy, version capture and smoke, in order.
The admin registry retains all six gates previously in the root package script.
Root admin, events, telegram, SIGIL booking/board/proxy and chat scripts use the wrapper.
The actual Admin and Chat `package.json` files also expose `npm run deploy`.

**Payments must use `.github/workflows/deploy-payments-worker.yml`.** That workflow uses
`payments-worker/wrangler.merged.toml`, version upload/activation, secrets preparation,
its own checks and production probes. The old root payments deploy referenced the
nonexistent `workers/payments-worker/wrangler.toml`. The root command and generic
wrapper now reject Payments with a pointer to the canonical workflow, rather than
bypass that pipeline. Payments notification integration into that workflow is outside
this local-wrapper change.

`member-api-worker` has no configuration and fails closed. Chat's existing
`wrangler 2.toml` references missing `src/index.ts`; it also fails closed until its
canonical entrypoint is repaired. A registry entry does not establish release readiness.
Workers missing registered tests or lint fail preflight. Other Worker-specific workflows
and MMS deployment remain unchanged.

## Outcomes and receipts

Each attempt after preflight writes a unique JSON receipt in `.deploy-receipts/`
(or `DEPLOY_RECEIPT_DIR`). It records source SHA, branch, stage, version,
`deployState`, `smokeResult` and `notificationState` independently. The directory
is ignored by Git; retain it as a release artifact in the runner.

- Test/lint failure: nonzero exit, `NOT_DEPLOYED`.
- Wrangler failure: nonzero exit, `ACTIVATION_UNKNOWN`; inspect Cloudflare before retrying.
- Successful Wrangler with missing version: nonzero exit, `DEPLOYED`, acceptance incomplete.
- Smoke failure: nonzero exit, `DEPLOYED` and `FAIL`; no rollback is claimed.
- Deploy/version/smoke pass with Telegram failure: exit 0, `DEPLOYED`, `PASS`,
  `notificationState=FAILED`, plus a stderr warning. Retry delivery, not deployment.

Telegram calls have a 15-second timeout. Failure notifications include stage and state,
but exclude captured command strings and log snippets because they can contain credentials.
Optional metadata: `DEPLOY_ENVIRONMENT`, `DEPLOY_USER`, `DEPLOY_CHANGED_ROUTES`
(newline-separated) and `ROLLBACK_VERSION_ID` (informational only).

## Notification preview, retry and rollback reporting

```bash
DEPLOY_NOTIFY_DRY_RUN=1 node shared/deploy-notify.js success /path/to/success.json
node shared/deploy-notify.js success /path/to/success.json
node shared/deploy-notify.js rollback /path/to/verified-rollback.json
```

Reconstruct a success payload from the retained receipt and verified release metadata
before retrying delivery. A rollback payload must contain `worker`, `previousVersion`,
`newActiveVersion` and `reason`, verified after the approved rollback procedure.
The notifier only reports rollback; it does not activate one.

## Validation

`npm run test:deploy-notify` runs unit tests and isolated fake-Cloudflare/Telegram
release tests. Node.js CI runs it explicitly on Node 18, 20 and 22, plus Bash syntax
validation. The tests perform no Cloudflare deploy or real Telegram send.

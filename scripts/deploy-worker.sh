#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTIFIER="$ROOT_DIR/shared/deploy-notify.js"
WORKER_NAME="${1:-}"
ENVIRONMENT="${DEPLOY_ENVIRONMENT:-Production}"

if [[ -z "$WORKER_NAME" ]]; then
  echo "Usage: scripts/deploy-worker.sh <worker-name>" >&2
  exit 64
fi

cd "$ROOT_DIR"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mmd-deploy-notify.XXXXXX")"
LOG_FILE="$TEMP_DIR/deploy.log"
PAYLOAD_FILE="$TEMP_DIR/payload.json"
cleanup() {
  rm -f "$LOG_FILE" "$PAYLOAD_FILE"
  rmdir "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

git_sha="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
branch="$(git branch --show-current 2>/dev/null || echo detached)"
deploy_user="${DEPLOY_USER:-${GITHUB_ACTOR:-${USER:-unknown}}}"
current_command="initialization"

notify_failure() {
  local exit_code="$1"
  local log_lines
  log_lines="$(tail -n 12 "$LOG_FILE" 2>/dev/null || true)"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
    log_lines="${log_lines//${TELEGRAM_BOT_TOKEN}/[REDACTED]}"
  fi
  PAYLOAD_FILE="$PAYLOAD_FILE" WORKER_NAME="$WORKER_NAME" CURRENT_COMMAND="$current_command" \
    EXIT_CODE="$exit_code" GIT_SHA="$git_sha" LOG_LINES="$log_lines" node -e '
      const fs = require("node:fs");
      fs.writeFileSync(process.env.PAYLOAD_FILE, JSON.stringify({
        worker: process.env.WORKER_NAME, command: process.env.CURRENT_COMMAND,
        exitCode: process.env.EXIT_CODE, gitSha: process.env.GIT_SHA,
        lastLogLines: process.env.LOG_LINES
      }));
    '
  node "$NOTIFIER" failure "$PAYLOAD_FILE" || echo "Warning: failure notification could not be sent" >&2
}

run_gate() {
  local label="$1"
  local command="$2"
  [[ -z "$command" ]] && return 0
  current_command="$command"
  echo "== $label: $WORKER_NAME ==" | tee -a "$LOG_FILE"
  bash -lc "$command" 2>&1 | tee -a "$LOG_FILE"
  local status="${PIPESTATUS[0]}"
  if [[ "$status" -ne 0 ]]; then
    notify_failure "$status"
    exit "$status"
  fi
}

config_path="$(node "$NOTIFIER" config "$WORKER_NAME" config 2>>"$LOG_FILE")" || {
  notify_failure 64
  exit 64
}
for required in "$NOTIFIER" "$config_path"; do
  if [[ ! -f "$required" ]]; then
    current_command="validate deployment configuration"
    echo "Required file not found: $required" | tee -a "$LOG_FILE" >&2
    notify_failure 66
    exit 66
  fi
done

test_command="$(node "$NOTIFIER" config "$WORKER_NAME" test)"
lint_command="$(node "$NOTIFIER" config "$WORKER_NAME" lint)"
smoke_command="${DEPLOY_SMOKE_COMMAND:-$(node "$NOTIFIER" config "$WORKER_NAME" smoke)}"

run_gate "Tests" "$test_command"
run_gate "Lint" "$lint_command"

current_command="npx wrangler deploy --config $config_path"
echo "== Deploy: $WORKER_NAME ==" | tee -a "$LOG_FILE"
npx wrangler deploy --config "$config_path" 2>&1 | tee -a "$LOG_FILE"
deploy_status="${PIPESTATUS[0]}"
if [[ "$deploy_status" -ne 0 ]]; then
  notify_failure "$deploy_status"
  exit "$deploy_status"
fi

version_id="$(sed -nE 's/.*(Version ID|Current Version ID):[[:space:]]*([0-9a-fA-F-]{36}).*/\2/p' "$LOG_FILE" | tail -n 1)"
if [[ -z "$version_id" ]]; then
  current_command="capture Cloudflare Version ID"
  echo "Wrangler deploy succeeded but no Cloudflare Version ID was found" | tee -a "$LOG_FILE" >&2
  notify_failure 65
  exit 65
fi

smoke_result="SKIP (not configured)"
if [[ -n "$smoke_command" ]]; then
  run_gate "Smoke Test" "$smoke_command"
  smoke_result="PASS"
fi

routes="${DEPLOY_CHANGED_ROUTES:-}"
PAYLOAD_FILE="$PAYLOAD_FILE" WORKER_NAME="$WORKER_NAME" ENVIRONMENT="$ENVIRONMENT" \
  GIT_SHA="$git_sha" VERSION_ID="$version_id" DEPLOY_USER_VALUE="$deploy_user" BRANCH="$branch" \
  ROUTES="$routes" SMOKE_RESULT="$smoke_result" ROLLBACK_VERSION="${ROLLBACK_VERSION_ID:-}" node -e '
    const fs = require("node:fs");
    fs.writeFileSync(process.env.PAYLOAD_FILE, JSON.stringify({
      worker: process.env.WORKER_NAME, environment: process.env.ENVIRONMENT,
      gitSha: process.env.GIT_SHA, versionId: process.env.VERSION_ID,
      timestamp: new Date().toISOString(), deployUser: process.env.DEPLOY_USER_VALUE,
      branch: process.env.BRANCH, routes: process.env.ROUTES ? process.env.ROUTES.split("\n") : [],
      smokeResult: process.env.SMOKE_RESULT, rollbackVersion: process.env.ROLLBACK_VERSION
    }));
  '
current_command="send Telegram deployment success notification"
node "$NOTIFIER" success "$PAYLOAD_FILE" || {
  status="$?"
  notify_failure "$status"
  exit "$status"
}

echo "Deployment completed: $WORKER_NAME ($version_id)"

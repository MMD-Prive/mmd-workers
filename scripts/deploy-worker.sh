#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTIFIER="$ROOT_DIR/shared/deploy-notify.js"
WORKER_NAME="${1:-}"
[[ -n "$WORKER_NAME" && "$#" -eq 1 ]] || { echo 'Usage: bash scripts/deploy-worker.sh <worker-name>' >&2; exit 64; }
cd "$ROOT_DIR"

# All configuration checks happen before tests or Cloudflare mutation.
config_path="$(node "$NOTIFIER" config "$WORKER_NAME" config)" || exit 64
node "$NOTIFIER" preflight || exit 64
test_command="$(node "$NOTIFIER" config "$WORKER_NAME" test)" || exit 64
lint_command="$(node "$NOTIFIER" config "$WORKER_NAME" lint)" || exit 64
smoke_command="${DEPLOY_SMOKE_COMMAND:-}"
for command in "$test_command" "$lint_command" "$smoke_command"; do
  if [[ -z "${command//[[:space:]]/}" ]]; then
    echo 'Tests, lint and DEPLOY_SMOKE_COMMAND are required before deployment.' >&2
    exit 64
  fi
done

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mmd-deploy-notify.XXXXXX")" || exit 73
trap 'rm -rf "$TEMP_DIR"' EXIT
LOG_FILE="$TEMP_DIR/deploy.log"
PAYLOAD_FILE="$TEMP_DIR/payload.json"
# Persist independent deployment and delivery facts, including ambiguous activation.
receipt_dir="${DEPLOY_RECEIPT_DIR:-$ROOT_DIR/.deploy-receipts}"
mkdir -p "$receipt_dir" || exit 73
RECEIPT_FILE="$(mktemp "$receipt_dir/$WORKER_NAME.XXXXXX.json")" || exit 73
export WORKER_NAME
export GIT_SHA="$(git rev-parse HEAD)"
export DEPLOY_BRANCH="$(git branch --show-current)"
export DEPLOY_STATE=NOT_DEPLOYED VERSION_ID='' SMOKE_RESULT=NOT_RUN NOTIFICATION_STATE=NOT_SENT
current_stage=preflight
write_receipt() {
  RECEIPT_FILE="$RECEIPT_FILE" STAGE="$current_stage" node -e '
    const fs = require("node:fs"), e = process.env;
    fs.writeFileSync(e.RECEIPT_FILE, JSON.stringify({worker:e.WORKER_NAME, gitSha:e.GIT_SHA,
      branch:e.DEPLOY_BRANCH, stage:e.STAGE, deployState:e.DEPLOY_STATE, versionId:e.VERSION_ID,
      smokeResult:e.SMOKE_RESULT, notificationState:e.NOTIFICATION_STATE, timestamp:new Date().toISOString()}, null, 2)+"\n");
  '
}
write_receipt || exit 73
notify_failure() {
  STAGE="$current_stage" EXIT_CODE="$1" PAYLOAD_FILE="$PAYLOAD_FILE" node -e '
    const fs = require("node:fs"), e = process.env;
    fs.writeFileSync(e.PAYLOAD_FILE, JSON.stringify({worker:e.WORKER_NAME, command:e.STAGE,
      exitCode:e.EXIT_CODE, gitSha:e.GIT_SHA, deployState:e.DEPLOY_STATE, versionId:e.VERSION_ID}));
  ' || return 1
  # Do not send command strings or captured logs: either can contain credentials.
  if node "$NOTIFIER" failure "$PAYLOAD_FILE"; then NOTIFICATION_STATE=SENT; else NOTIFICATION_STATE=FAILED; fi
  write_receipt
}
run_gate() {
  current_stage="$1"
  bash -c "$2" >"$LOG_FILE" 2>&1
  local status="$?"
  cat "$LOG_FILE"
  if [[ "$status" -ne 0 ]]; then
    [[ "$current_stage" != smoke ]] || SMOKE_RESULT=FAIL
    notify_failure "$status"
    exit "$status"
  fi
}
run_gate tests "$test_command"
run_gate lint "$lint_command"
current_stage=deploy
DEPLOY_STATE=ACTIVATION_UNKNOWN
write_receipt || exit 73
npx wrangler deploy --config "$config_path" >"$LOG_FILE" 2>&1
deploy_status="$?"
cat "$LOG_FILE"
VERSION_ID="$(node "$NOTIFIER" version "$LOG_FILE")"
if [[ "$deploy_status" -ne 0 ]]; then
  notify_failure "$deploy_status"
  exit "$deploy_status"
fi
DEPLOY_STATE=DEPLOYED
if [[ -z "$VERSION_ID" ]]; then
  current_stage=capture_version
  notify_failure 65
  exit 65
fi
write_receipt || exit 73
run_gate smoke "$smoke_command"
SMOKE_RESULT=PASS
current_stage=notification
write_receipt || exit 73
PAYLOAD_FILE="$PAYLOAD_FILE" node -e '
  const fs = require("node:fs"), e = process.env;
  fs.writeFileSync(e.PAYLOAD_FILE, JSON.stringify({worker:e.WORKER_NAME,
    environment:e.DEPLOY_ENVIRONMENT || "Production", gitSha:e.GIT_SHA, versionId:e.VERSION_ID,
    timestamp:new Date().toISOString(), deployUser:e.DEPLOY_USER || e.GITHUB_ACTOR || e.USER,
    branch:e.DEPLOY_BRANCH, routes:(e.DEPLOY_CHANGED_ROUTES || "").split("\n").filter(Boolean),
    smokeResult:e.SMOKE_RESULT, rollbackVersion:e.ROLLBACK_VERSION_ID}));
' || exit 73
if node "$NOTIFIER" success "$PAYLOAD_FILE"; then
  NOTIFICATION_STATE=SENT
else
  NOTIFICATION_STATE=FAILED
  echo 'Warning: deployment and smoke passed; Telegram delivery failed. Do not redeploy to retry notification.' >&2
fi
current_stage=complete
write_receipt || exit 73
echo "Deployment completed: $WORKER_NAME ($VERSION_ID); notification=$NOTIFICATION_STATE; receipt=$RECEIPT_FILE"

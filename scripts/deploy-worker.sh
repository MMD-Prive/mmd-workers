#!/usr/bin/env bash

set -u
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTIFY_MODULE="$ROOT_DIR/shared/deploy-notify.js"
WORKER="${1:-}"

if [[ -z "$WORKER" ]]; then
  echo "Usage: scripts/deploy-worker.sh <worker-name>" >&2
  exit 64
fi

cd "$ROOT_DIR"

node "$NOTIFY_MODULE" preflight "$WORKER" || exit $?

CONFIG="$(node "$NOTIFY_MODULE" config "$WORKER" config)" || exit $?
TEST_COMMAND="$(node "$NOTIFY_MODULE" config "$WORKER" test)" || exit $?
LINT_COMMAND="$(node "$NOTIFY_MODULE" config "$WORKER" lint)" || exit $?
LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/mmd-deploy-${WORKER}.XXXXXX")"
PREVIOUS_VERSION=""

cleanup() {
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

notify_failure() {
  local failed_command="$1"
  local exit_code="$2"
  node "$NOTIFY_MODULE" failure "$WORKER" --command "$failed_command" --exit-code "$exit_code" < "$LOG_FILE" || true
  exit "$exit_code"
}

run_step() {
  local label="$1"
  local command="$2"
  : > "$LOG_FILE"
  echo "==> $label"
  /bin/sh -c "$command" 2>&1 | tee "$LOG_FILE"
  local exit_code=${PIPESTATUS[0]}
  [[ $exit_code -eq 0 ]] || notify_failure "$command" "$exit_code"
}

run_step "Tests" "$TEST_COMMAND"
run_step "Lint" "$LINT_COMMAND"

# Rollback metadata is best-effort and never blocks a deploy. No secret output is retained.
PREVIOUS_OUTPUT="$(npx wrangler deployments list --config "$CONFIG" --json 2>/dev/null || true)"
PREVIOUS_VERSION="$(printf '%s' "$PREVIOUS_OUTPUT" | node "$NOTIFY_MODULE" extract-version || true)"

: > "$LOG_FILE"
DEPLOY_COMMAND="npx wrangler deploy --config $CONFIG"
echo "==> Deploy Worker"
npx wrangler deploy --config "$CONFIG" 2>&1 | tee "$LOG_FILE"
DEPLOY_EXIT=${PIPESTATUS[0]}
[[ $DEPLOY_EXIT -eq 0 ]] || notify_failure "$DEPLOY_COMMAND" "$DEPLOY_EXIT"

VERSION_ID="$(node "$NOTIFY_MODULE" extract-version < "$LOG_FILE")"
if [[ -z "$VERSION_ID" ]]; then
  echo "Cloudflare deploy succeeded, but no Version ID could be captured." | tee -a "$LOG_FILE"
  notify_failure "$DEPLOY_COMMAND" 65
fi

: > "$LOG_FILE"
echo "==> Smoke Tests"
node "$NOTIFY_MODULE" smoke "$WORKER" 2>&1 | tee "$LOG_FILE"
SMOKE_EXIT=${PIPESTATUS[0]}
[[ $SMOKE_EXIT -eq 0 ]] || notify_failure "smoke test: $WORKER" "$SMOKE_EXIT"
SMOKE_RESULT="$(tail -n 1 "$LOG_FILE")"

node "$NOTIFY_MODULE" success "$WORKER" \
  --version "$VERSION_ID" \
  --smoke "$SMOKE_RESULT" \
  --rollback-version "$PREVIOUS_VERSION"

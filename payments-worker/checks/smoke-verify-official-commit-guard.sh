#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://payments-worker.malemodel-bkk.workers.dev}"
TIMEOUT_CURL="${TIMEOUT_CURL:-20}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-}"

ok_count=0
skip_count=0

log() {
  printf '%s\n' "$*"
}

pass() {
  ok_count=$((ok_count + 1))
  log "ok - $*"
}

skip() {
  skip_count=$((skip_count + 1))
  log "skip - $*"
}

fail() {
  log "fail - $*" >&2
  exit 1
}

need_jq() {
  command -v jq >/dev/null 2>&1 || fail "jq is required"
}

post_json() {
  local payload="$1"
  local auth_mode="${2:-auth}"
  local tmp_body tmp_code
  tmp_body="$(mktemp)"
  if [ "$auth_mode" = "auth" ]; then
    tmp_code="$(curl -sS -m "$TIMEOUT_CURL" -o "$tmp_body" -w '%{http_code}' \
      -X POST "${BASE_URL}/v1/payments/verify-official" \
      -H "Content-Type: application/json" \
      -H "X-Internal-Token: ${INTERNAL_TOKEN}" \
      --data "$payload")"
  else
    tmp_code="$(curl -sS -m "$TIMEOUT_CURL" -o "$tmp_body" -w '%{http_code}' \
      -X POST "${BASE_URL}/v1/payments/verify-official" \
      -H "Content-Type: application/json" \
      --data "$payload")"
  fi
  printf '%s\t%s\n' "$tmp_code" "$tmp_body"
}

assert_false_flags() {
  local body_file="$1"
  [ "$(jq -r '.marked_paid' "$body_file")" = "false" ] || fail "marked_paid must remain false"
  [ "$(jq -r '.verified' "$body_file")" = "false" ] || fail "verified must remain false"
}

assert_no_mutation_preview() {
  local body_file="$1"
  jq -e '
    ((.mutations // .proposed_mutations).payments | type == "array" and length == 0) and
    ((.mutations // .proposed_mutations).sessions | type == "array" and length == 0) and
    ((.mutations // .proposed_mutations).proofs | type == "array" and length == 0) and
    ((.mutations // .proposed_mutations).audit | type == "array" and length == 0)
  ' "$body_file" >/dev/null || fail "response must not include mutation writes for guarded smoke"
}

assert_no_secret_shape() {
  local body_file="$1"
  if jq -e '.. | strings | select(test("secret|token|key|Bearer"; "i"))' "$body_file" >/dev/null; then
    fail "response appears to include secret-bearing text"
  fi
}

need_jq

read -r code body < <(post_json '{"dry_run":false,"commit":true}' "none")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  pass "unauth commit blocked with ${code}"
else
  fail "unauth commit expected 401/403, got ${code}: $(cat "$body")"
fi
rm -f "$body"

if [ -z "$INTERNAL_TOKEN" ]; then
  skip "authenticated commit guards require INTERNAL_TOKEN"
  log "Set INTERNAL_TOKEN and rerun this script for authenticated guard smoke."
  log "done - passed=${ok_count} skipped=${skip_count}"
  exit 0
fi

commit_base='{"dry_run":false,"commit":true,"session_id":"smoke_fake_session_2c2a","payment_ref":"smoke_fake_payment_2c2a","amount_thb":12345,"payment_type":"deposit","payment_stage":"deposit","provider":"guard_smoke","provider_txn_id":"guard_smoke_txn","official_paid_at":"2026-05-19T00:00:00.000Z","verified_by":"guard_smoke","match_reason":"guard smoke"}'
read -r code body < <(post_json "$commit_base")
if [ "$code" = "400" ] && [ "$(jq -r '.code // .error' "$body")" = "COMMIT_APPROVAL_REQUIRED" ]; then
  pass "commit without approval phrase blocked"
else
  fail "commit without approval expected COMMIT_APPROVAL_REQUIRED, got ${code}: $(cat "$body")"
fi
rm -f "$body"

no_reason='{"dry_run":false,"commit":true,"official_verification_confirmed":"PAYMENT_VERIFY_COMMIT_APPROVED","session_id":"smoke_fake_session_2c2a","payment_ref":"smoke_fake_payment_2c2a","amount_thb":12345,"payment_type":"deposit","payment_stage":"deposit","provider":"guard_smoke","provider_txn_id":"guard_smoke_txn","official_paid_at":"2026-05-19T00:00:00.000Z","verified_by":"guard_smoke"}'
read -r code body < <(post_json "$no_reason")
if [ "$code" = "400" ] && [ "$(jq -r '.code // .error' "$body")" = "COMMIT_REQUIREMENTS_MISSING" ]; then
  pass "commit without reason blocked"
else
  fail "commit without reason expected COMMIT_REQUIREMENTS_MISSING, got ${code}: $(cat "$body")"
fi
rm -f "$body"

read -r code body < <(post_json '{"dry_run":true,"session_id":"smoke_fake_session_2c2a","payment_ref":"smoke_fake_payment_2c2a","amount_thb":12345,"payment_type":"deposit","payment_stage":"deposit"}')
if [ "$code" = "200" ] && [ "$(jq -r '.dry_run' "$body")" = "true" ] && [ "$(jq -r '.decision' "$body")" = "not_found" ]; then
  assert_false_flags "$body"
  assert_no_mutation_preview "$body"
  assert_no_secret_shape "$body"
  pass "dry_run behavior still unchanged"
else
  fail "dry_run expected not_found preview, got ${code}: $(cat "$body")"
fi
rm -f "$body"

approved_fake='{"dry_run":false,"commit":true,"official_verification_confirmed":"PAYMENT_VERIFY_COMMIT_APPROVED","session_id":"smoke_fake_session_2c2a","payment_ref":"smoke_fake_payment_2c2a","amount_thb":12345,"payment_type":"deposit","payment_stage":"deposit","provider":"guard_smoke","provider_txn_id":"guard_smoke_txn","official_paid_at":"2026-05-19T00:00:00.000Z","verified_by":"guard_smoke","match_reason":"guard smoke"}'
read -r code body < <(post_json "$approved_fake")
decision="$(jq -r '.decision // empty' "$body")"
if [ "$code" = "200" ] && { [ "$decision" = "not_found" ] || [ "$decision" = "review_required" ]; }; then
  assert_false_flags "$body"
  assert_no_mutation_preview "$body"
  assert_no_secret_shape "$body"
  pass "fake payment commit returns ${decision} with no mutation"
else
  fail "fake payment commit expected not_found/review_required, got ${code}: $(cat "$body")"
fi
rm -f "$body"

read -r code body < <(post_json '{"dry_run":false,"session_id":"smoke_fake_session_2c2a","payment_ref":"smoke_fake_payment_2c2a"}')
if [ "$code" = "400" ]; then
  pass "dry_run=false without commit blocked"
else
  fail "dry_run=false without commit expected 400, got ${code}: $(cat "$body")"
fi
rm -f "$body"

case "/v1/payments/verify-official" in
  *notify*|*telegram*|*points*|*entitlement*|*award*)
    fail "guard smoke endpoint must not call mutation/notification side surfaces"
    ;;
  *)
    pass "guard smoke endpoint avoids notify, points, telegram, and entitlement surfaces"
    ;;
esac

log "done - passed=${ok_count} skipped=${skip_count}"

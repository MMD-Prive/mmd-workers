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
  local marked_paid verified
  marked_paid="$(jq -r '.marked_paid' "$body_file")"
  verified="$(jq -r '.verified' "$body_file")"
  [ "$marked_paid" = "false" ] || fail "marked_paid must remain false"
  [ "$verified" = "false" ] || fail "verified must remain false"
}

assert_no_side_effect_fields() {
  local body_file="$1"
  jq -e '
    (.proposed_mutations.payments | type == "array" and length == 0) and
    (.proposed_mutations.sessions | type == "array" and length == 0) and
    (.proposed_mutations.proofs | type == "array" and length == 0) and
    (.proposed_mutations.audit | type == "array" and length == 0)
  ' "$body_file" >/dev/null || fail "proposed_mutations must stay empty in dry-run"
}

need_jq

read -r code body < <(post_json '{"dry_run":true,"session_id":"smoke_fake_session","payment_ref":"smoke_fake_payment"}' "none")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  pass "unauth verify-official returns ${code}"
else
  fail "unauth verify-official expected 401/403, got ${code}: $(cat "$body")"
fi
rm -f "$body"

if [ -z "$INTERNAL_TOKEN" ]; then
  skip "authenticated dry-run checks require INTERNAL_TOKEN"
  log "Set INTERNAL_TOKEN and rerun this script for authenticated production smoke."
  log "done - passed=${ok_count} skipped=${skip_count}"
  exit 0
fi

read -r code body < <(post_json '{"session_id":"smoke_fake_session","payment_ref":"smoke_fake_payment"}')
if [ "$code" = "400" ] && [ "$(jq -r '.code // .error' "$body")" = "DRY_RUN_REQUIRED" ]; then
  pass "missing dry_run returns DRY_RUN_REQUIRED"
else
  fail "missing dry_run expected DRY_RUN_REQUIRED, got ${code}: $(cat "$body")"
fi
rm -f "$body"

read -r code body < <(post_json '{"dry_run":false,"session_id":"smoke_fake_session","payment_ref":"smoke_fake_payment"}')
if [ "$code" = "400" ] && [ "$(jq -r '.code // .error' "$body")" = "DRY_RUN_REQUIRED" ]; then
  pass "dry_run=false returns DRY_RUN_REQUIRED"
else
  fail "dry_run=false expected DRY_RUN_REQUIRED, got ${code}: $(cat "$body")"
fi
rm -f "$body"

fake_payload='{"dry_run":true,"session_id":"smoke_fake_session_2c1","payment_ref":"smoke_fake_payment_2c1","amount_thb":12345,"payment_type":"deposit","payment_stage":"deposit"}'
read -r code body < <(post_json "$fake_payload")
if [ "$code" = "200" ] && [ "$(jq -r '.decision' "$body")" = "not_found" ]; then
  assert_false_flags "$body"
  assert_no_side_effect_fields "$body"
  pass "fake session/payment returns not_found with no mutation preview"
else
  fail "fake session/payment expected not_found, got ${code}: $(cat "$body")"
fi
rm -f "$body"

if [ -n "${FIXTURE_SESSION_ID:-}" ] && [ -n "${FIXTURE_PAYMENT_REF:-}" ] && [ -n "${FIXTURE_MISMATCH_AMOUNT_THB:-}" ]; then
  payload="$(jq -nc \
    --arg session_id "$FIXTURE_SESSION_ID" \
    --arg payment_ref "$FIXTURE_PAYMENT_REF" \
    --argjson amount_thb "$FIXTURE_MISMATCH_AMOUNT_THB" \
    '{dry_run:true,session_id:$session_id,payment_ref:$payment_ref,amount_thb:$amount_thb}')"
  read -r code body < <(post_json "$payload")
  decision="$(jq -r '.decision' "$body")"
  if [ "$code" = "200" ] && { [ "$decision" = "review_required" ] || [ "$decision" = "mismatch" ]; }; then
    assert_false_flags "$body"
    assert_no_side_effect_fields "$body"
    pass "amount mismatch returns ${decision}"
  else
    fail "amount mismatch expected review_required/mismatch, got ${code}: $(cat "$body")"
  fi
  rm -f "$body"
else
  skip "amount mismatch fixture not provided"
fi

if [ -n "${PROOF_ONLY_SESSION_ID:-}" ] || [ -n "${PROOF_ONLY_PAYMENT_REF:-}" ]; then
  payload="$(jq -nc \
    --arg session_id "${PROOF_ONLY_SESSION_ID:-}" \
    --arg payment_ref "${PROOF_ONLY_PAYMENT_REF:-}" \
    '{dry_run:true,session_id:$session_id,payment_ref:$payment_ref,amount_thb:1}')"
  read -r code body < <(post_json "$payload")
  if [ "$code" = "200" ]; then
    assert_false_flags "$body"
    assert_no_side_effect_fields "$body"
    [ "$(jq -r '.decision' "$body")" != "match_ready" ] || fail "proof-only context must not be match_ready"
    pass "proof-only context does not mark paid or verified"
  else
    fail "proof-only fixture request failed ${code}: $(cat "$body")"
  fi
  rm -f "$body"
else
  skip "proof-only fixture not provided"
fi

if [ -n "${VERIFIED_PAYMENT_REF:-}" ]; then
  payload="$(jq -nc --arg payment_ref "$VERIFIED_PAYMENT_REF" '{dry_run:true,payment_ref:$payment_ref,amount_thb:1}')"
  read -r code body < <(post_json "$payload")
  if [ "$code" = "200" ] && [ "$(jq -r '.decision' "$body")" = "duplicate_verified" ]; then
    assert_false_flags "$body"
    assert_no_side_effect_fields "$body"
    pass "existing verified payment returns duplicate preview"
  else
    fail "verified fixture expected duplicate_verified, got ${code}: $(cat "$body")"
  fi
  rm -f "$body"
else
  skip "existing verified fixture not provided"
fi

case "/v1/payments/verify-official" in
  *notify*|*telegram*|*points*|*entitlement*|*award*)
    fail "smoke endpoint must not call mutation/notification surfaces"
    ;;
  *)
    pass "smoke endpoint avoids notify, points, telegram, and entitlement surfaces"
    ;;
esac

log "done - passed=${ok_count} skipped=${skip_count}"

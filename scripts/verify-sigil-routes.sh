#!/usr/bin/env bash
set -euo pipefail

URL="https://sigil.mmdbkk.com/sigil/admin/login"
CANARY="SIGIL_ADMIN_LOGIN_UI_V2"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

require_header() {
  local headers="$1"
  local name="$2"
  local value="$3"

  printf '%s\n' "$headers" | tr -d '\r' | grep -Fqi "${name}: ${value}" ||
    fail "missing header ${name}: ${value}"
}

status_code() {
  curl -sS -o /dev/null -w '%{http_code}' "$1"
}

printf 'Checking SIGIL admin login headers...\n'
headers="$(curl -sSI "$URL")"
require_header "$headers" "x-mmd-sigil-owner" "sigil-worker"
require_header "$headers" "x-mmd-sigil-build" "SIGIL_ROUTE_MIGRATION_V1"
require_header "$headers" "x-mmd-sigil-login-ui" "$CANARY"

printf 'Checking SIGIL admin login HTML canary...\n'
html="$(curl -sS "$URL")"
printf '%s\n' "$html" | grep -Fq "$CANARY" ||
  fail "HTML does not contain ${CANARY}"

if printf '%s\n' "$html" | grep -Fq "Assistant Console"; then
  fail "HTML still contains Assistant Console"
fi

printf 'Checking rejected token query...\n'
token_status="$(status_code "${URL}?token=test")"
if [ "$token_status" != "400" ]; then
  fail "token query returned ${token_status}, expected 400"
fi

printf 'Checking rejected external next query...\n'
next_status="$(status_code "${URL}?next=https://evil.example")"
if [ "$next_status" != "400" ]; then
  fail "external next query returned ${next_status}, expected 400"
fi

printf 'SIGIL route verification passed.\n'

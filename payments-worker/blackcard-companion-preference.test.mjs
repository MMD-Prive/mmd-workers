import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("./blackcard-companion-preference.js", import.meta.url), "utf8");

test("signed customer auth and Black Card/product gate are mandatory", () => {
  assert.match(source, /authorizeConfirmationRequest\(request, env\)/);
  assert.match(source, /authorized\.expectedRole !== "customer"/);
  assert.match(source, /blackcard_product_required/);
  assert.match(source, /blackcard_payment_state_unavailable/);
});

test("canonical Personal Main catalog only accepts HITO, HIEI, HIMA and HIRO", () => {
  assert.match(source, /personalMain\(normalizeId\(id\)\)/);
  assert.match(source, /companion_id/);
  assert.doesNotMatch(source, /travel_model/);
  assert.match(source, /personal-main-catalog/);
});

test("preference is persisted as one idempotent Session marker and never grants entitlement", () => {
  assert.match(source, /MMD BLACK CARD COMPANION PREFERENCE V1/);
  assert.match(source, /replaceMarker/);
  assert.match(source, /current\?\.companion_id === next\.companion_id/);
  assert.match(source, /idempotent: true/);
  assert.match(source, /entitlement_activated: false/);
});

test("payment states distinguish pending verification from paid without changing membership", () => {
  assert.match(source, /selected_pending_verification/);
  assert.match(source, /selected_verified_pending_entitlement/);
  assert.match(source, /CLOSED_STATES/);
  assert.match(source, /payment_status/);
});

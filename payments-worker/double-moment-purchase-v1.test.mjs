import assert from "node:assert/strict";
import test from "node:test";
import { handleDoubleMomentRequest, isDoubleMomentRequest } from "./double-moment-purchase-v1.js";

test("Double Moment routes are bounded", () => {
  assert.equal(isDoubleMomentRequest("/v1/confirm/double-moment/health", "GET"), true);
  assert.equal(isDoubleMomentRequest("/v1/confirm/double-moment/start", "POST"), true);
  assert.equal(isDoubleMomentRequest("/v1/confirm/double-moment/start", "GET"), false);
  assert.equal(isDoubleMomentRequest("/v1/confirm/verify", "POST"), false);
});

test("health receipt exposes locked v1 policy", async () => {
  const request = new Request("https://sigil.mmdbkk.com/v1/confirm/double-moment/health");
  const response = await handleDoubleMomentRequest(request, {}, async () => {
    throw new Error("downstream_must_not_run");
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    campaign_id: "promo_double_moment_sep2026",
    policy_version: "v1",
    purchase_amount_thb: 20000,
    total_credit_thb: 27000,
    minimum_service_thb: 20000,
    validity_days: 180,
    authority: "payments-worker",
  });
});

test("start route fails closed without trusted service auth", async () => {
  const request = new Request("https://sigil.mmdbkk.com/v1/confirm/double-moment/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_record_id: "rec00000000000" }),
  });
  const response = await handleDoubleMomentRequest(request, { INTERNAL_TOKEN: "secret" }, async () => {
    throw new Error("downstream_must_not_run");
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "service_auth_required");
});

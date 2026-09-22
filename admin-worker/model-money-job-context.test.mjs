import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_PUBLIC_MODEL_PACKAGE_KEYS,
  attachModelMoneyContextToJobResponse,
  persistSessionModelMoneyContext,
  resolveJobModelMoneyContext,
} from "./src/model-money-job-context.js";

test("Public Job uses an allowlisted model-service package", () => {
  const result = resolveJobModelMoneyContext({
    job_visibility: "public",
    model_work_lane: "public_model",
    model_package_code: "pick_me_up",
  });
  assert.equal(result.ok, true);
  assert.equal(result.context.model_work_lane, "public_model");
  assert.equal(result.context.model_package_code, "pick_me_up");
  assert.equal(result.context.compensation_mode, "public_package_matrix");
});

test("Membership package_code is never read as a model-service package", () => {
  const result = resolveJobModelMoneyContext({
    job_visibility: "public",
    package_code: "premium",
  });
  assert.equal(result.ok, true);
  assert.equal(result.context.model_work_lane, "public_model");
  assert.equal(result.context.model_package_code, "");
  assert.equal(result.context.compensation_mode, "public_session_locked");
});

test("confidential handling remains Public Money unless the job is explicitly Private", () => {
  const result = resolveJobModelMoneyContext({
    visibility: "confidential",
    confidential: true,
    model_package_code: "cook_with_me",
  });
  assert.equal(result.ok, true);
  assert.equal(result.context.confidential_handling, true);
  assert.equal(result.context.confidential_is_money_lane, false);
  assert.equal(result.context.model_work_lane, "public_model");
  assert.equal(result.context.model_package_code, "cook_with_me");
});

test("Private Money rejects a Public package matrix", () => {
  const result = resolveJobModelMoneyContext({
    job_visibility: "private",
    model_work_lane: "private_model",
    model_package_code: "night_out",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "model_package_not_allowed_for_money_lane");
});

test("explicit money lane cannot conflict with canonical job visibility", () => {
  const result = resolveJobModelMoneyContext({
    job_visibility: "private",
    model_work_lane: "public_model",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "model_work_lane_conflict");
  assert.equal(result.expected_lane, "private_model");
});

test("reserved Day Off and Night Life packages are not live before their release", () => {
  assert.equal(ACTIVE_PUBLIC_MODEL_PACKAGE_KEYS.has("night_out"), false);
  assert.equal(ACTIVE_PUBLIC_MODEL_PACKAGE_KEYS.has("day_off_short"), false);
  const result = resolveJobModelMoneyContext({
    job_visibility: "public",
    model_package_code: "night_out",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "public_model_package_not_active");
});

test("Session persistence writes only model_work_lane and model_package_code", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (!init.method) return Response.json({ records: [{ id: "recSession12345678", fields: {} }] });
    return Response.json({ id: "recSession12345678", fields: { model_work_lane: "public_model", model_package_code: "pick_me_up" } });
  };
  const result = await persistSessionModelMoneyContext({
    AIRTABLE_BASE_ID: "app12345678901234",
    AIRTABLE_API_KEY: "test",
    AIRTABLE_TABLE_SESSIONS: "tbl12345678901234",
  }, "sess-public", {
    policy_version: "test",
    model_work_lane: "public_model",
    model_package_code: "pick_me_up",
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  const patch = JSON.parse(calls[1].init.body);
  assert.deepEqual(patch.fields, {
    model_work_lane: "public_model",
    model_package_code: "pick_me_up",
  });
  assert.equal("package_code" in patch.fields, false);
  assert.equal("pay_model_thb" in patch.fields, false);
});

test("Private persistence clears any stale Public service package", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (!init.method) return Response.json({ records: [{ id: "recSession12345678", fields: {} }] });
    return Response.json({ id: "recSession12345678", fields: {} });
  };
  const result = await persistSessionModelMoneyContext({
    AIRTABLE_BASE_ID: "app12345678901234",
    AIRTABLE_API_KEY: "test",
    AIRTABLE_TABLE_SESSIONS: "tbl12345678901234",
  }, "sess-private", {
    policy_version: "test",
    model_work_lane: "private_model",
    model_package_code: "",
  }, { fetchImpl });

  assert.equal(result.ok, true);
  const patch = JSON.parse(calls[1].init.body);
  assert.equal(patch.fields.model_work_lane, "private_model");
  assert.equal(patch.fields.model_package_code, "");
});

test("job response remains successful but fails closed when persistence needs reconciliation", async () => {
  const response = Response.json({ ok: true, session_id: "sess-1" });
  const context = resolveJobModelMoneyContext({ job_visibility: "private" }).context;
  const output = await attachModelMoneyContextToJobResponse(response, {}, context);
  const body = await output.json();
  assert.equal(output.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.model_money.model_work_lane, "private_model");
  assert.equal(body.model_money.persistence_status, "pending_reconciliation");
  assert.equal(output.headers.get("x-mmd-model-money-context"), "pending-reconciliation");
});

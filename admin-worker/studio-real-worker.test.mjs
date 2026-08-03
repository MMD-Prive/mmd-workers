import test from "node:test";
import assert from "node:assert/strict";
import { handleStudioRequest } from "./src/studio-real-worker.js";

const BASE_ENV = {
  ADMIN_BEARER: "admin-t",
  CONFIRM_KEY: "confirm-k",
  AIRTABLE_BASE_ID: "base1",
  AIRTABLE_API_KEY: "airkey",
  AIRTABLE_TABLE_CONSOLE_INBOX_ID: "tblConsole",
  ALLOWED_ORIGINS: "https://mmdbkk.com",
};

function req(path, body = {}, init = {}) {
  return new Request(`https://mmdbkk.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://mmdbkk.com", ...(init.headers || {}) },
    body: JSON.stringify(body),
  });
}

async function json(res) {
  return await res.json();
}

function installAirtableMock({ onCreate } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (!init.method || init.method === "GET") return Response.json({ records: [] });
    if (onCreate) return onCreate(url, init, calls);
    return Response.json({ id: "recStudio123", fields: JSON.parse(init.body || "{}").fields || {} });
  };
  return calls;
}

test("intake validate success", async () => {
  const res = await handleStudioRequest(req("/studio/api/intake/validate?t=admin-t", {
    model_name: "Test Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.safe_preview_only, true);
  assert.equal(data.normalized.model_name, "Test Model");
});

test("intake commit requires admin t", async () => {
  const res = await handleStudioRequest(req("/studio/api/intake/commit", {
    model_name: "Test Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 401);
});

test("GWs without run_number fails", async () => {
  const res = await handleStudioRequest(req("/studio/api/intake/validate?t=admin-t", {
    model_name: "G Model",
    field: "GWs",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "run_number_required");
});

test("EMs invalid run_number fails", async () => {
  const res = await handleStudioRequest(req("/studio/api/intake/validate?t=admin-t", {
    model_name: "E Model",
    field: "EMs",
    run_number: "EM12",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "invalid_run_number");
});

test("review commit does not publish", async () => {
  installAirtableMock();
  const res = await handleStudioRequest(req("/studio/api/review/commit?t=admin-t", {
    studio_review_id: "review_test_001",
    idempotency_key: "review_commit_test_001",
    model_name: "Review Model",
    field: "ST",
    layer: "Private / SIGIL",
    decision: "Approved Direction",
    final_note: "approved direction only",
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.published, false);
  assert.equal(data.status, "committed");
  assert.ok(data.studio_review_id);
});

test("publish-plan returns blockers without approved review", async () => {
  const res = await handleStudioRequest(req("/studio/api/model-preview/publish-plan?t=admin-t", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    template: "MMD Compcard",
    checklist: { safe: true },
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.status, "plan_only");
  assert.equal(data.can_commit, false);
  assert.match(data.blockers.join(","), /review_required/);
});

test("publish commit requires X-Confirm-Key", async () => {
  const res = await handleStudioRequest(req("/studio/api/model-preview/commit?t=admin-t", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    studio_review_id: "recReview1",
    checklist: { safe: true },
  }), BASE_ENV);
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error, "confirm_key_required");
});

test("publish commit fail-closes when R2 verification fails", async () => {
  const calls = installAirtableMock();
  const env = { ...BASE_ENV, MMD_MODEL_ASSETS: { async head() { return null; } } };
  const res = await handleStudioRequest(req("/studio/api/model-preview/commit?t=admin-t", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    studio_review_id: "recReview1",
    r2_required_keys: ["models/a.webp"],
    checklist: { safe: true },
  }, { headers: { "X-Confirm-Key": "confirm-k" } }), env);
  assert.equal(res.status, 409);
  assert.equal((await json(res)).error, "r2_verification_failed");
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 0);
});

test("token query is not accepted as admin t", async () => {
  const res = await handleStudioRequest(req("/studio/api/intake/validate?token=admin-t", {
    model_name: "Token Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 401);
});

test("frontend line_user_id trust is rejected", async () => {
  const res = await handleStudioRequest(req("/studio/api/intake/validate?t=admin-t", {
    model_name: "Line Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
    line_user_id: "U123",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "line_user_id_not_allowed");
});

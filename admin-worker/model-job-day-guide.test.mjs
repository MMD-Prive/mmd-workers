import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  MODEL_JOB_DAY_GUIDE_ACK_PATH,
  MODEL_JOB_DAY_GUIDE_STATUS_PATH,
  MODEL_JOB_DAY_GUIDE_VERSION,
  handleModelJobDayGuideRequest,
  isModelJobDayGuideRequest,
} from "./src/model-job-day-guide.js";

const ORIGIN = "https://mmdmodel.lovable.app";
const SECRET = "test-model-session-secret";
const MODEL_ID = "recMODEL0000000001";

const env = {
  AIRTABLE_API_KEY: "pat-test",
  AIRTABLE_BASE_ID: "appTEST0000000001",
  AIRTABLE_TABLE_MODELS: "Models",
  MODEL_SESSION_SIGNING_SECRET: SECRET,
  ALLOWED_ORIGINS: ORIGIN,
};

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function modelSessionCookie(overrides = {}) {
  const payload = {
    kind: "model_session",
    role: "model",
    model_record_id: MODEL_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const encoded = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", SECRET).update(encoded).digest("hex");
  return `mmd_model_session_v1=${encoded}.${signature}`;
}

function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("origin")) headers.set("origin", ORIGIN);
  if (!headers.has("cookie")) headers.set("cookie", modelSessionCookie());
  return new Request(`https://mmdbkk.com${path}`, { ...init, headers });
}

function modelRecord(fields = {}) {
  return { id: MODEL_ID, fields: { working_name: "Model", status: "active", ...fields } };
}

async function withMockFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("route matcher is narrow and stays under the existing profile* Worker route", () => {
  assert.equal(isModelJobDayGuideRequest(MODEL_JOB_DAY_GUIDE_STATUS_PATH), true);
  assert.equal(isModelJobDayGuideRequest(MODEL_JOB_DAY_GUIDE_ACK_PATH), true);
  assert.equal(isModelJobDayGuideRequest("/v1/model/profile"), false);
  assert.equal(isModelJobDayGuideRequest("/v1/model/session/current"), false);
});

test("status fails closed without the canonical model session", async () => {
  const response = await handleModelJobDayGuideRequest(new Request(
    `https://mmdbkk.com${MODEL_JOB_DAY_GUIDE_STATUS_PATH}`,
    { headers: { origin: ORIGIN } },
  ), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "model_session_required" });
});

test("status requires the guide when the canonical timestamp is blank", async () => {
  await withMockFetch(async () => new Response(JSON.stringify(modelRecord()), {
    status: 200,
    headers: { "content-type": "application/json" },
  }), async () => {
    const response = await handleModelJobDayGuideRequest(request(MODEL_JOB_DAY_GUIDE_STATUS_PATH), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.guide_version, MODEL_JOB_DAY_GUIDE_VERSION);
    assert.equal(body.required, true);
    assert.equal(body.acknowledged_at, null);
    assert.equal(body.authority, "models.job_day_guide_acknowledged_at");
  });
});

test("ack writes one server-owned timestamp to the authenticated canonical Model", async () => {
  const seen = [];
  await withMockFetch(async (url, init = {}) => {
    seen.push({ url: String(url), init });
    if ((init.method || "GET") === "PATCH") {
      const payload = JSON.parse(init.body);
      const fields = payload.records[0].fields;
      const acknowledgedAt = fields.job_day_guide_acknowledged_at;
      assert.equal(payload.records[0].id, MODEL_ID);
      assert.match(acknowledgedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.notEqual(acknowledgedAt, "1999-01-01T00:00:00.000Z");
      return new Response(JSON.stringify({ records: [modelRecord({ job_day_guide_acknowledged_at: acknowledgedAt })] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(modelRecord()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const response = await handleModelJobDayGuideRequest(request(MODEL_JOB_DAY_GUIDE_ACK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        completed: true,
        guide_version: MODEL_JOB_DAY_GUIDE_VERSION,
        acknowledged_at: "1999-01-01T00:00:00.000Z",
        model_record_id: "recATTACKER00000001",
      }),
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.required, false);
    assert.match(body.acknowledged_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(seen.filter((entry) => (entry.init.method || "GET") === "PATCH").length, 1);
  });
});

test("ack is idempotent and preserves the first canonical timestamp", async () => {
  const existing = "2026-09-09T08:30:00.000Z";
  let patchCalls = 0;
  await withMockFetch(async (_url, init = {}) => {
    if ((init.method || "GET") === "PATCH") patchCalls += 1;
    return new Response(JSON.stringify(modelRecord({ job_day_guide_acknowledged_at: existing })), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const response = await handleModelJobDayGuideRequest(request(MODEL_JOB_DAY_GUIDE_ACK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: true, guide_version: MODEL_JOB_DAY_GUIDE_VERSION }),
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.required, false);
    assert.equal(body.acknowledged_at, existing);
    assert.equal(patchCalls, 0);
  });
});

test("ack requires explicit completion and the current guide version", async () => {
  await withMockFetch(async () => new Response(JSON.stringify(modelRecord()), {
    status: 200,
    headers: { "content-type": "application/json" },
  }), async () => {
    const incomplete = await handleModelJobDayGuideRequest(request(MODEL_JOB_DAY_GUIDE_ACK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: false }),
    }), env);
    assert.equal(incomplete.status, 400);

    const stale = await handleModelJobDayGuideRequest(request(MODEL_JOB_DAY_GUIDE_ACK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: true, guide_version: "old-guide" }),
    }), env);
    assert.equal(stale.status, 409);
  });
});

test("cross-origin callers outside the configured Model Hub origin are rejected", async () => {
  const response = await handleModelJobDayGuideRequest(request(MODEL_JOB_DAY_GUIDE_STATUS_PATH, {
    headers: { origin: "https://example.invalid" },
  }), env);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: "origin_not_allowed" });
});

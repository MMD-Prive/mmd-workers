import assert from "node:assert/strict";
import test from "node:test";

import worker, { testInternals } from "../src/index.js";

const ORIGIN = "https://mmdbkk.com";
const URL = `https://sigil-worker.malemodel-bkk.workers.dev${testInternals.PUBLIC_MODEL_APPLY_PATH}`;

function makeKv() {
  return {
    reads: [],
    writes: [],
    async get(key) {
      this.reads.push(key);
      return null;
    },
    async put(key, value) {
      this.writes.push([key, value]);
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    WORKER_NAME: "sigil-worker-test",
    ALLOWED_ORIGINS: ORIGIN,
    ...overrides,
  };
}

function call(path = testInternals.PUBLIC_MODEL_APPLY_PATH, init = {}, env = makeEnv()) {
  return worker.fetch(new Request(`https://sigil-worker.malemodel-bkk.workers.dev${path}`, init), env);
}

function validPayload(overrides = {}) {
  return {
    application_type: "public_model",
    source: "webflow_public_model",
    form_version: "public-model-apply-v8",
    nickname: "Smoke Public Model",
    phone: "+66 81 234 5678",
    telegram: "@smoke_private",
    work_types: ["Modeling", "Public Events", "Private Review Only"],
    consent: true,
    ...overrides,
  };
}

test("exact public model apply route handles OPTIONS CORS", async () => {
  const response = await call(testInternals.PUBLIC_MODEL_APPLY_PATH, {
    method: "OPTIONS",
    headers: {
      origin: ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
  assert.equal(await response.text(), "");
});

test("unknown routes still return not_found", async () => {
  const response = await call("/v1/public-model/apply/extra", { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.ok, false);
  assert.equal(body.error, "not_found");
});

test("POST rejects invalid JSON", async () => {
  const response = await call(testInternals.PUBLIC_MODEL_APPLY_PATH, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: "{not-json",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_json");
  assert.equal(body.service, testInternals.PUBLIC_MODEL_SERVICE);
});

test("POST rejects invalid payload without persistence", async () => {
  const kv = makeKv();
  const response = await call(
    testInternals.PUBLIC_MODEL_APPLY_PATH,
    {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ nickname: "", consent: false, work_types: ["VIP"] }),
    },
    makeEnv({ SIGIL_PUBLIC_MODEL_KV: kv, SIGIL_BOARD_KV: kv }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_payload");
  assert.deepEqual(Object.keys(body.fields).sort(), ["consent", "contact", "nickname", "work_types"]);
  assert.deepEqual(kv.writes, []);
});

test("POST valid payload fails closed and does not mutate without approved persistence", async () => {
  const publicModelKv = makeKv();
  const boardKv = makeKv();
  const response = await call(
    testInternals.PUBLIC_MODEL_APPLY_PATH,
    {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validPayload({ social_url: "https://social.example/private-smoke" })),
    },
    makeEnv({ SIGIL_PUBLIC_MODEL_KV: publicModelKv, SIGIL_BOARD_KV: boardKv }),
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.error, "persistence_not_configured");
  assert.equal(body.service, testInternals.PUBLIC_MODEL_SERVICE);
  assert.equal(body.mode, "readiness_only");
  assert.equal(body.accepted, false);
  assert.equal(body.received, false);
  assert.equal(body.storage.persisted, false);
  assert.equal(body.storage.reason, "persistence_disabled");
  assert.equal(body.board_card.persisted, false);
  assert.equal(body.board_card.reason, "persistence_disabled");
  assert.deepEqual(publicModelKv.reads, []);
  assert.deepEqual(publicModelKv.writes, []);
  assert.deepEqual(boardKv.reads, []);
  assert.deepEqual(boardKv.writes, []);

  const serialized = JSON.stringify(body);
  for (const privateValue of ["+66", "234 5678", "@smoke_private", "social.example"]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
});

test("POST rejects unsupported public model work types", async () => {
  const response = await call(testInternals.PUBLIC_MODEL_APPLY_PATH, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(validPayload({ work_types: ["Private Review Only", "Black Card"] })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_payload");
  assert.equal(body.fields.work_types, "contains unsupported work type");
  assert.equal(JSON.stringify(body).includes("Black Card"), false);
});

test("public model apply does not expose private SIGIL talent logic", async () => {
  const response = await call(testInternals.PUBLIC_MODEL_APPLY_PATH, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(validPayload()),
  });
  const serialized = JSON.stringify(await response.json()).toLowerCase();

  for (const forbidden of ["svip", "black card", "vip", "private talent", "booking_confirmed", "approved"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

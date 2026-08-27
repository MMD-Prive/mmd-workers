import assert from "node:assert/strict";
import test from "node:test";

import worker, { testInternals } from "../src/index.js";

const ORIGIN = "https://mmdbkk.com";
const URL = `https://sigil-worker.malemodel-bkk.workers.dev${testInternals.PUBLIC_MODEL_APPLY_PATH}`;
const UPLOAD_URL = `https://sigil-worker.malemodel-bkk.workers.dev${testInternals.PUBLIC_MODEL_UPLOAD_URL_PATH}`;

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

function makeR2() {
  return {
    writes: [],
    async put(key, value, options) {
      this.writes.push([key, value, options]);
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

function validUploadPayload(overrides = {}) {
  return {
    application_type: "public_model",
    source: "webflow_public_model",
    form_version: "public-model-apply-v8",
    upload_session_id: "pmu_session_123456",
    kind: "photo",
    role: "front_face",
    file_name: "front-face.jpg",
    content_type: "image/jpeg",
    file_size: 1024 * 1024,
    consent: true,
    ...overrides,
  };
}

function validUploadRef(overrides = {}) {
  return {
    upload_ref: "pmu_ref_frontface_123456",
    kind: "photo",
    role: "front_face",
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

test("exact public model upload-url route handles POST readiness", async () => {
  const publicModelKv = makeKv();
  const uploadBucket = makeR2();
  const response = await call(
    testInternals.PUBLIC_MODEL_UPLOAD_URL_PATH,
    {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validUploadPayload()),
    },
    makeEnv({ SIGIL_PUBLIC_MODEL_KV: publicModelKv, SIGIL_PUBLIC_MODEL_UPLOADS: uploadBucket }),
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.error, "upload_not_configured");
  assert.equal(body.service, testInternals.PUBLIC_MODEL_UPLOAD_SERVICE);
  assert.equal(body.mode, "readiness_only");
  assert.equal(body.upload_enabled, false);
  assert.deepEqual(publicModelKv.reads, []);
  assert.deepEqual(publicModelKv.writes, []);
  assert.deepEqual(uploadBucket.writes, []);

  const serialized = JSON.stringify(body);
  for (const forbidden of ["object_key", "public_file_url", "airtable", "record_id", "review_status", "front-face.jpg"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("public model upload-url rejects invalid JSON and invalid payload", async () => {
  const invalidJson = await call(testInternals.PUBLIC_MODEL_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: "{not-json",
  });
  const invalidJsonBody = await invalidJson.json();

  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJsonBody.ok, false);
  assert.equal(invalidJsonBody.error, "invalid_json");
  assert.equal(invalidJsonBody.service, testInternals.PUBLIC_MODEL_UPLOAD_SERVICE);

  const invalidPayload = await call(testInternals.PUBLIC_MODEL_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ kind: "photo", role: "front_face", consent: false }),
  });
  const invalidPayloadBody = await invalidPayload.json();

  assert.equal(invalidPayload.status, 400);
  assert.equal(invalidPayloadBody.ok, false);
  assert.equal(invalidPayloadBody.error, "invalid_payload");
  assert.deepEqual(Object.keys(invalidPayloadBody.fields).sort(), [
    "application_type",
    "consent",
    "content_type",
    "file_name",
    "file_size",
  ]);
});

test("public model upload-url validates kind, role, MIME, and size", async () => {
  const cases = [
    [{ kind: "video" }, "kind"],
    [{ kind: "photo", role: "trainer_certificate" }, "role"],
    [{ kind: "document", role: "front_face" }, "role"],
    [{ kind: "photo", content_type: "application/pdf", file_name: "profile.pdf" }, "content_type"],
    [{ kind: "document", role: "trainer_certificate", content_type: "application/pdf", file_name: "certificate.pdf" }, ""],
    [{ file_size: testInternals.PUBLIC_MODEL_MAX_UPLOAD_BYTES + 1 }, "file_size"],
    [{ file_size: 0 }, "file_size"],
    [{ file_name: "../front-face.jpg" }, "file_name"],
    [{ base64: "data:image/jpeg;base64,aaaa" }, "upload_payload"],
    [{ blob: "blob:https://mmdbkk.com/private" }, "upload_payload"],
  ];

  for (const [overrides, field] of cases) {
    const response = await call(testInternals.PUBLIC_MODEL_UPLOAD_URL_PATH, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validUploadPayload(overrides)),
    });
    const body = await response.json();

    if (!field) {
      assert.equal(response.status, 503);
      assert.equal(body.error, "upload_not_configured");
    } else {
      assert.equal(response.status, 400, field);
      assert.equal(body.error, "invalid_payload");
      assert.equal(Object.hasOwn(body.fields, field), true, field);
    }
  }
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

test("POST accepts upload metadata refs only while persistence remains disabled", async () => {
  const publicModelKv = makeKv();
  const uploadBucket = makeR2();
  const response = await call(
    testInternals.PUBLIC_MODEL_APPLY_PATH,
    {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validPayload({
        upload_session_id: "pmu_session_123456",
        uploads: [
          validUploadRef(),
          validUploadRef({
            upload_ref: "pmu_ref_cert_123456",
            kind: "document",
            role: "trainer_certificate",
          }),
        ],
      })),
    },
    makeEnv({ SIGIL_PUBLIC_MODEL_KV: publicModelKv, SIGIL_PUBLIC_MODEL_UPLOADS: uploadBucket }),
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, "persistence_not_configured");
  assert.deepEqual(publicModelKv.reads, []);
  assert.deepEqual(publicModelKv.writes, []);
  assert.deepEqual(uploadBucket.writes, []);

  const serialized = JSON.stringify(body);
  for (const forbidden of ["pmu_ref_frontface", "trainer_certificate", "object_key", "public_file_url", "review_status"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("POST rejects upload object keys, URLs, raw data, and browser statuses", async () => {
  const cases = [
    { uploads: [validUploadRef({ object_key: "public-model/private.jpg" })] },
    { uploads: [validUploadRef({ public_file_url: "https://cdn.example/private.jpg" })] },
    { uploads: [validUploadRef({ upload_status: "uploaded" })] },
    { uploads: [validUploadRef({ review_status: "approved" })] },
    { upload_refs: [validUploadRef({ upload_ref: "bad" })] },
    { files: ["raw-file"] },
    { base64: "data:image/jpeg;base64,aaaa" },
    { blob: "blob:https://mmdbkk.com/private" },
    { photo_url: "https://cdn.example/private.jpg" },
  ];

  for (const bodyOverrides of cases) {
    const response = await call(testInternals.PUBLIC_MODEL_APPLY_PATH, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validPayload(bodyOverrides)),
    });
    const body = await response.json();

    assert.equal(response.status, 400, JSON.stringify(bodyOverrides));
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_payload");
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

test("public model upload-url does not expose private SIGIL talent logic", async () => {
  const response = await call(testInternals.PUBLIC_MODEL_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(validUploadPayload()),
  });
  const serialized = JSON.stringify(await response.json()).toLowerCase();

  for (const forbidden of ["svip", "black card", "vip", "private talent", "booking_confirmed", "approved", "object_key"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

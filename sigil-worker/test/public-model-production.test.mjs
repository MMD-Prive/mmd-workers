import assert from "node:assert/strict";
import test from "node:test";

import worker, { PublicModelCoordinator } from "../src/index.js";
import { publicModelTestInternals } from "../src/public-model.js";

const ORIGIN = "https://www.mmdbkk.com";
const APPLY_URL = "https://sigil-worker.malemodel-bkk.workers.dev/v1/public-model/apply";
const UPLOAD_URL = "https://sigil-worker.malemodel-bkk.workers.dev/v1/public-model/upload-url";

function makeKv() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

function makeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes, size: bytes.byteLength, options });
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.size } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async list() {
      return { objects: [] };
    },
  };
}

function makeCoordinatorNamespace(env) {
  const instances = new Map();
  return {
    idFromName(name) {
      return name;
    },
    get(id) {
      if (!instances.has(id)) {
        const values = new Map();
        let transactionQueue = Promise.resolve();
        const storage = {
          async get(key) {
            return values.get(key);
          },
          async put(key, value) {
            values.set(key, value);
          },
          async delete(key) {
            values.delete(key);
          },
          transaction(callback) {
            const run = transactionQueue.then(() => callback({
              get: storage.get,
              put: storage.put,
              delete: storage.delete,
            }));
            transactionQueue = run.catch(() => {});
            return run;
          },
        };
        let eventQueue = Promise.resolve();
        const state = {
          storage,
          blockConcurrencyWhile(callback) {
            return callback();
          },
        };
        instances.set(id, {
          coordinator: new PublicModelCoordinator(state, env),
          enqueue(request) {
            const run = eventQueue.then(() => this.coordinator.fetch(request));
            eventQueue = run.catch(() => {});
            return run;
          },
        });
      }
      return {
        fetch(input, init) {
          return instances.get(id).enqueue(new Request(input, init));
        },
      };
    },
  };
}

function makeAirtable() {
  const applications = [];
  const uploads = [];
  const patches = [];
  let sequence = 1;
  return {
    applications,
    uploads,
    patches,
    async fetch(url, init = {}) {
      const parsed = new URL(url);
      const tableId = parsed.pathname.split("/").at(-1);
      const method = init.method || "GET";
      if (method === "GET" && tableId === publicModelTestInternals.AIRTABLE_APPLICATION_TABLE_ID) {
        const formula = parsed.searchParams.get("filterByFormula") || "";
        const hash = /="([a-f0-9]+)"/.exec(formula)?.[1];
        const record = applications.find((item) => item.fields[publicModelTestInternals.APPLICATION_FIELDS.payloadHash] === hash);
        return Response.json({ records: record ? [record] : [] });
      }
      if (method === "GET" && tableId === publicModelTestInternals.AIRTABLE_UPLOAD_TABLE_ID) {
        const formula = parsed.searchParams.get("filterByFormula") || "";
        const uploadRef = /='([^']+)'/.exec(formula)?.[1];
        const record = uploads.find((item) => item.fields[publicModelTestInternals.UPLOAD_FIELDS.uploadRef] === uploadRef);
        return Response.json({ records: record ? [record] : [] });
      }
      if (method === "POST") {
        const fields = JSON.parse(init.body).records[0].fields;
        const record = { id: `rec_test_${sequence++}`, fields };
        if (tableId === publicModelTestInternals.AIRTABLE_APPLICATION_TABLE_ID) applications.push(record);
        else uploads.push(record);
        return Response.json({ records: [record] });
      }
      if (method === "PATCH") {
        const segments = parsed.pathname.split("/");
        const recordId = segments.at(-1);
        const fields = JSON.parse(init.body).fields;
        const record = uploads.find((item) => item.id === recordId);
        if (record) Object.assign(record.fields, fields);
        patches.push({ recordId, fields });
        return Response.json({ id: recordId, fields });
      }
      return Response.json({ error: "unexpected_test_request" }, { status: 500 });
    },
  };
}

function makeEnv(overrides = {}) {
  const airtable = overrides.airtable || makeAirtable();
  const env = {
    WORKER_NAME: "sigil-worker-test",
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
    PUBLIC_MODEL_ENABLED: "true",
    PUBLIC_MODEL_UPLOAD_ENABLED: "true",
    PUBLIC_MODEL_UPLOAD_REQUIRED: "false",
    PUBLIC_MODEL_UPLOAD_SIGNING_SECRET: "test-signing-secret-at-least-32-bytes",
    AIRTABLE_API_TOKEN: "test-token",
    SIGIL_BOARD_KV: makeKv(),
    PUBLIC_MODEL_UPLOADS_R2: makeR2(),
    AIRTABLE_FETCH: airtable.fetch,
    __airtable: airtable,
    ...overrides,
  };
  if (!env.PUBLIC_MODEL_COORDINATOR) env.PUBLIC_MODEL_COORDINATOR = makeCoordinatorNamespace(env);
  return env;
}

function validApplication(overrides = {}) {
  return {
    application_type: "public_model",
    source: "webflow_public_model_apply",
    form_version: "public-model-apply-v8",
    nickname: "Production Test",
    age: 29,
    location: "Bangkok",
    phone: "+66 81 234 5678",
    line_id: "production-test",
    occupation_label: "นักแสดง และ ครีเอเตอร์",
    service_job_preference: "นายแบบ",
    story: "Test application",
    consent: true,
    ...overrides,
  };
}

async function post(url, body, env) {
  return worker.fetch(new Request(url, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);
}

test("production apply persists once and returns an idempotent duplicate response", async () => {
  const env = makeEnv();
  const first = await post(APPLY_URL, validApplication(), env);
  const firstBody = await first.json();

  assert.equal(first.status, 200);
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.mode, "intake_received");
  assert.match(firstBody.application_id, /^pma_\d{8}_[A-Za-z0-9_-]{12}$/);
  assert.equal(firstBody.storage.persisted, true);
  assert.equal(env.__airtable.applications.length, 1);
  assert.equal(JSON.stringify(firstBody).includes("+66"), false);
  assert.equal(JSON.stringify(firstBody).includes("production-test"), false);

  const fields = env.__airtable.applications[0].fields;
  assert.equal(fields[publicModelTestInternals.APPLICATION_FIELDS.nickname], "Production Test");
  assert.equal(fields[publicModelTestInternals.APPLICATION_FIELDS.intakeStatus], "private_review_pending");
  assert.equal(fields[publicModelTestInternals.APPLICATION_FIELDS.consent], true);

  const duplicate = await post(APPLY_URL, validApplication(), env);
  const duplicateBody = await duplicate.json();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(duplicateBody.application_id, firstBody.application_id);
  assert.equal(env.__airtable.applications.length, 1);
});

test("concurrent production apply creates exactly one Airtable application", async () => {
  const env = makeEnv();
  const [first, second] = await Promise.all([
    post(APPLY_URL, validApplication({ nickname: "Concurrent Test" }), env),
    post(APPLY_URL, validApplication({ nickname: "Concurrent Test" }), env),
  ]);
  const results = await Promise.all([first.json(), second.json()]);

  assert.equal(env.__airtable.applications.length, 1);
  assert.equal(results.filter((body) => body.ok).length >= 1, true);
  assert.equal([200, 409].includes(first.status), true);
  assert.equal([200, 409].includes(second.status), true);
});

test("slow Airtable persistence remains serialized without an idempotency lease takeover", async () => {
  const env = makeEnv();
  const realFetch = env.AIRTABLE_FETCH;
  env.AIRTABLE_FETCH = async (url, init = {}) => {
    const tableId = new URL(url).pathname.split("/").at(-1);
    if ((init.method || "GET") === "POST" && tableId === publicModelTestInternals.AIRTABLE_APPLICATION_TABLE_ID) {
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    return realFetch(url, init);
  };

  const responses = await Promise.all([
    post(APPLY_URL, validApplication({ nickname: "Slow Serialized" }), env),
    post(APPLY_URL, validApplication({ nickname: "Slow Serialized" }), env),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(bodies.filter((body) => body.duplicate).length, 1);
  assert.equal(env.__airtable.applications.length, 1);
});

test("production apply enforces origin, body size, and rate limits", async () => {
  const originEnv = makeEnv();
  const rejectedOrigin = await worker.fetch(new Request(APPLY_URL, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify(validApplication()),
  }), originEnv);
  assert.equal(rejectedOrigin.status, 403);
  assert.equal((await rejectedOrigin.json()).error, "origin_not_allowed");

  const large = await post(APPLY_URL, validApplication({ story: "x".repeat(70 * 1024) }), makeEnv());
  assert.equal(large.status, 413);
  assert.equal((await large.json()).error, "payload_too_large");

  const rateEnv = makeEnv();
  for (let index = 0; index < 5; index += 1) {
    const response = await post(APPLY_URL, validApplication({ nickname: `Rate Test ${index}` }), rateEnv);
    assert.equal(response.status, 200);
  }
  const limited = await post(APPLY_URL, validApplication({ nickname: "Rate Test Limited" }), rateEnv);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "rate_limited");
});

test("atomic rate limiting rejects one of six concurrent apply requests", async () => {
  const env = makeEnv();
  const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => (
    post(APPLY_URL, validApplication({ nickname: `Concurrent Rate ${index}` }), env)
  )));
  assert.equal(responses.filter((response) => response.status === 200).length, 5);
  assert.equal(responses.filter((response) => response.status === 429).length, 1);
  assert.equal(env.__airtable.applications.length, 5);
});

test("production upload issues a signed opaque URL, stores R2 privately, and attaches metadata", async () => {
  const env = makeEnv();
  const authorization = await post(UPLOAD_URL, {
    application_type: "public_model",
    consent: true,
    kind: "photo",
    role: "front_face",
    file_name: "front.jpg",
    content_type: "image/jpeg",
    file_size: 4,
    source_path: "/apply/public-model",
  }, env);
  const authBody = await authorization.json();

  assert.equal(authorization.status, 200);
  assert.equal(authBody.ok, true);
  assert.match(authBody.upload_session_id, /^pmu_/);
  assert.match(authBody.upload_ref, /^pmu_ref_/);
  assert.equal(JSON.stringify(authBody).includes("r2"), false);
  assert.equal(JSON.stringify(authBody).includes("object_key"), false);

  const upload = await worker.fetch(new Request(authBody.upload_url, {
    method: "PUT",
    headers: { origin: ORIGIN, "content-type": "image/jpeg", "content-length": "4" },
    body: new Uint8Array([1, 2, 3, 4]),
    duplex: "half",
  }), env);
  const uploadBody = await upload.json();
  assert.equal(upload.status, 200);
  assert.equal(uploadBody.uploaded, true);
  assert.equal(env.PUBLIC_MODEL_UPLOADS_R2.objects.size, 1);
  assert.equal(env.__airtable.uploads.length, 1);

  const apply = await post(APPLY_URL, validApplication({
    upload_session_id: authBody.upload_session_id,
    uploads: [{ upload_ref: authBody.upload_ref, kind: "photo", role: "front_face" }],
  }), env);
  const applyBody = await apply.json();
  assert.equal(apply.status, 200);
  assert.equal(applyBody.ok, true);
  assert.equal(env.__airtable.patches.length, 1);
  assert.equal(env.__airtable.uploads[0].fields[publicModelTestInternals.UPLOAD_FIELDS.applicationId], applyBody.application_id);
  assert.equal(env.__airtable.uploads[0].fields[publicModelTestInternals.UPLOAD_FIELDS.uploadStatus], "attached");

  const retry = await post(APPLY_URL, validApplication({
    upload_session_id: authBody.upload_session_id,
    uploads: [{ upload_ref: authBody.upload_ref, kind: "photo", role: "front_face" }],
  }), env);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryBody.duplicate, true);
  assert.equal(retryBody.application_id, applyBody.application_id);
  assert.equal(env.__airtable.applications.length, 1);
});

test("repeated upload PUT is idempotent and does not duplicate Airtable metadata", async () => {
  const env = makeEnv();
  const authorization = await post(UPLOAD_URL, {
    application_type: "public_model",
    consent: true,
    kind: "photo",
    role: "front_face",
    file_name: "front.jpg",
    content_type: "image/jpeg",
    file_size: 4,
  }, env);
  const authBody = await authorization.json();
  const uploadRequest = () => new Request(authBody.upload_url, {
    method: "PUT",
    headers: { origin: ORIGIN, "content-type": "image/jpeg", "content-length": "4" },
    body: new Uint8Array([1, 2, 3, 4]),
    duplex: "half",
  });

  const first = await worker.fetch(uploadRequest(), env);
  const retry = await worker.fetch(uploadRequest(), env);
  const retryBody = await retry.json();
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retryBody.duplicate, true);
  assert.equal(env.__airtable.uploads.length, 1);
  assert.equal(env.PUBLIC_MODEL_UPLOADS_R2.objects.size, 1);
});

test("production apply rejects an upload already attached to another application", async () => {
  const env = makeEnv();
  const authorization = await post(UPLOAD_URL, {
    application_type: "public_model",
    consent: true,
    kind: "photo",
    role: "front_face",
    file_name: "front.jpg",
    content_type: "image/jpeg",
    file_size: 4,
  }, env);
  const authBody = await authorization.json();
  const upload = await worker.fetch(new Request(authBody.upload_url, {
    method: "PUT",
    headers: { origin: ORIGIN, "content-type": "image/jpeg", "content-length": "4" },
    body: new Uint8Array([1, 2, 3, 4]),
    duplex: "half",
  }), env);
  assert.equal(upload.status, 200);

  const first = await post(APPLY_URL, validApplication({
    nickname: "First Owner",
    upload_session_id: authBody.upload_session_id,
    uploads: [{ upload_ref: authBody.upload_ref, kind: "photo", role: "front_face" }],
  }), env);
  assert.equal(first.status, 200);

  const second = await post(APPLY_URL, validApplication({
    nickname: "Second Owner",
    upload_session_id: authBody.upload_session_id,
    uploads: [{ upload_ref: authBody.upload_ref, kind: "photo", role: "front_face" }],
  }), env);
  assert.equal(second.status, 400);
  assert.match((await second.json()).fields.upload_refs, /another application/);
  assert.equal(env.__airtable.applications.length, 1);
});

test("concurrent applications cannot both claim the same uploaded asset", async () => {
  const env = makeEnv();
  const authorization = await post(UPLOAD_URL, {
    application_type: "public_model",
    consent: true,
    kind: "photo",
    role: "front_face",
    file_name: "front.jpg",
    content_type: "image/jpeg",
    file_size: 4,
  }, env);
  const authBody = await authorization.json();
  const upload = await worker.fetch(new Request(authBody.upload_url, {
    method: "PUT",
    headers: { origin: ORIGIN, "content-type": "image/jpeg", "content-length": "4" },
    body: new Uint8Array([1, 2, 3, 4]),
    duplex: "half",
  }), env);
  assert.equal(upload.status, 200);

  const uploadFields = {
    upload_session_id: authBody.upload_session_id,
    uploads: [{ upload_ref: authBody.upload_ref, kind: "photo", role: "front_face" }],
  };
  const responses = await Promise.all([
    post(APPLY_URL, validApplication({ ...uploadFields, nickname: "Concurrent Owner A" }), env),
    post(APPLY_URL, validApplication({ ...uploadFields, nickname: "Concurrent Owner B" }), env),
  ]);
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 400).length, 1);
  assert.equal(env.__airtable.applications.length, 1);
});

test("duplicate success waits until a previously failed upload attachment is reconciled", async () => {
  const env = makeEnv();
  const authorization = await post(UPLOAD_URL, {
    application_type: "public_model",
    consent: true,
    kind: "photo",
    role: "front_face",
    file_name: "front.jpg",
    content_type: "image/jpeg",
    file_size: 4,
  }, env);
  const authBody = await authorization.json();
  await worker.fetch(new Request(authBody.upload_url, {
    method: "PUT",
    headers: { origin: ORIGIN, "content-type": "image/jpeg", "content-length": "4" },
    body: new Uint8Array([1, 2, 3, 4]),
    duplex: "half",
  }), env);

  const realFetch = env.AIRTABLE_FETCH;
  let failPatch = true;
  env.AIRTABLE_FETCH = async (url, init) => {
    if ((init?.method || "GET") === "PATCH" && failPatch) {
      failPatch = false;
      return Response.json({ error: "temporary" }, { status: 503 });
    }
    return realFetch(url, init);
  };
  const payload = validApplication({
    nickname: "Attachment Recovery",
    upload_session_id: authBody.upload_session_id,
    uploads: [{ upload_ref: authBody.upload_ref, kind: "photo", role: "front_face" }],
  });
  const first = await post(APPLY_URL, payload, env);
  assert.equal(first.status, 503);
  assert.equal(env.__airtable.applications.length, 1);

  const retry = await post(APPLY_URL, payload, env);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryBody.duplicate, true);
  assert.equal(env.__airtable.patches.length, 1);
  assert.equal(env.__airtable.applications.length, 1);
});

test("production dependency failures stay fail-closed without leaking internals", async () => {
  const applyEnv = makeEnv({
    AIRTABLE_FETCH: async () => Response.json({ error: { message: "private Airtable detail" } }, { status: 503 }),
  });
  const apply = await post(APPLY_URL, validApplication(), applyEnv);
  const applyBody = await apply.json();
  assert.equal(apply.status, 503);
  assert.deepEqual(applyBody, {
    ok: false,
    error: "persistence_failed",
    service: "mmd_public_model_apply",
    accepted: false,
  });
  assert.equal(JSON.stringify(applyBody).includes("Airtable"), false);

  const uploadEnv = makeEnv();
  uploadEnv.SIGIL_BOARD_KV.put = async () => {
    throw new Error("private KV detail");
  };
  const upload = await post(UPLOAD_URL, {
    application_type: "public_model",
    consent: true,
    kind: "photo",
    role: "front_face",
    file_name: "front.jpg",
    content_type: "image/jpeg",
    file_size: 4,
  }, uploadEnv);
  const uploadBody = await upload.json();
  assert.equal(upload.status, 503);
  assert.deepEqual(uploadBody, {
    ok: false,
    error: "upload_authorization_failed",
    service: "mmd_public_model_upload_url",
    accepted: false,
  });
  assert.equal(JSON.stringify(uploadBody).includes("KV"), false);
});

test("health advertises Public Model only after live dependency probes pass", async () => {
  const readyEnv = makeEnv();
  const ready = await worker.fetch(new Request("https://sigil-worker.malemodel-bkk.workers.dev/health"), readyEnv);
  const readyBody = await ready.json();
  assert.equal(ready.status, 200);
  assert.equal(readyBody.capabilities.public_model_apply, true);
  assert.equal(readyBody.capabilities.public_model_upload, true);

  const failedEnv = makeEnv({
    AIRTABLE_FETCH: async () => Response.json({ error: "unavailable" }, { status: 503 }),
  });
  const failed = await worker.fetch(new Request("https://sigil-worker.malemodel-bkk.workers.dev/health"), failedEnv);
  const failedBody = await failed.json();
  assert.equal(failed.status, 200);
  assert.equal(failedBody.capabilities.public_model_apply, false);
  assert.equal(failedBody.capabilities.public_model_upload, false);
  assert.equal(Object.hasOwn(failedBody, "dependencies"), false);
});

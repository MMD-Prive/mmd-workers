import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index-with-public-model-notify.js";
import {
  PRIVATE_MODEL_APPLY_PATH,
  PRIVATE_MODEL_PAGE_PATH,
  PRIVATE_MODEL_RECEIVED_PATH,
  PRIVATE_MODEL_STATUS_PATH,
  PRIVATE_MODEL_UPLOAD_URL_PATH,
  privateModelTestInternals,
} from "../src/private-model.js";

const ORIGIN = "https://www.mmdbkk.com";

function coordinator() {
  return {
    idFromName(name) { return name; },
    get() {
      return {
        async fetch(url, init) {
          const path = new URL(url).pathname;
          const body = JSON.parse(init.body || "{}");
          if (path === "/rate-limit") return Response.json({ ok: true, limited: false });
          if (path === "/idempotency/prepare") return Response.json({ ok: true, application_id: body.application_id, complete: false });
          if (path === "/idempotency/commit") return Response.json({ ok: true, application_id: body.application_id, duplicate: false });
          if (path === "/health") return Response.json({ ok: true });
          return Response.json({ ok: false, error: "unexpected_coordinator_path", path }, { status: 500 });
        },
      };
    },
  };
}

function makeEnv(overrides = {}) {
  const writes = [];
  const env = {
    PRIVATE_MODEL_ENABLED: "true",
    PRIVATE_MODEL_UPLOAD_ENABLED: "true",
    PRIVATE_MODEL_UPLOAD_REQUIRED: "false",
    PUBLIC_MODEL_ENABLED: "true",
    PUBLIC_MODEL_UPLOAD_ENABLED: "true",
    PUBLIC_MODEL_UPLOAD_REQUIRED: "false",
    ALLOWED_ORIGINS: ORIGIN,
    AIRTABLE_API_TOKEN: "test-token",
    PUBLIC_MODEL_UPLOAD_SIGNING_SECRET: "test-signing-secret",
    SIGIL_BOARD_KV: {
      async get() { return null; },
      async put() {},
    },
    PUBLIC_MODEL_COORDINATOR: coordinator(),
    PUBLIC_MODEL_UPLOADS_R2: {
      async list() { return { objects: [] }; },
      async head() { return null; },
      async put() {},
      async delete() {},
    },
    AIRTABLE_FETCH: async (url, init = {}) => {
      const method = init.method || "GET";
      if (method === "GET") return Response.json({ records: [] });
      if (method === "POST") {
        const payload = JSON.parse(init.body || "{}");
        writes.push(...(payload.records || []));
        return Response.json({ records: [{ id: "rec_private_test", fields: payload.records?.[0]?.fields || {} }] });
      }
      return Response.json({ records: [] });
    },
    ...overrides,
  };
  return { env, writes };
}

async function call(path, init = {}, envOverrides = {}) {
  const { env, writes } = makeEnv(envOverrides);
  const request = new Request(`https://sigil-worker.malemodel-bkk.workers.dev${path}`, {
    ...init,
    headers: { origin: ORIGIN, ...(init.headers || {}) },
  });
  const response = await worker.fetch(request, env, { waitUntil() {} });
  return { response, writes };
}

test("GET /sigil/apply renders a dedicated Private Model form", async () => {
  const { response } = await call(PRIVATE_MODEL_PAGE_PATH);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Private Model Application/);
  assert.match(html, new RegExp(PRIVATE_MODEL_APPLY_PATH.replaceAll("/", "\\/")));
  assert.match(html, new RegExp(PRIVATE_MODEL_UPLOAD_URL_PATH.replaceAll("/", "\\/")));
  assert.doesNotMatch(html, /membership_review|partner_request|private_access/);
});

test("Private Model application validation fails closed for wrong application_type", async () => {
  const { response } = await call(PRIVATE_MODEL_APPLY_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ application_type: "public_model", nickname: "Test", contact: "@test", consent: true }),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_payload");
  assert.equal(body.fields.application_type, "must be private_model");
});

test("Private Model application persists canonical review fields for TarT", async () => {
  const { response, writes } = await call(PRIVATE_MODEL_APPLY_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      application_type: "private_model",
      form_version: "private-model-apply-v1",
      nickname: "Nox",
      contact: "@noxprivate",
      city: "Bangkok",
      reason: "Private model review",
      note: "evening availability",
      consent: true,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.application_type, "private_model");
  assert.equal(body.status, "New");
  assert.equal(body.review_status, "pending_review");
  assert.equal(body.intake_status, "private_review_pending");
  assert.equal(body.handler, "TarT");
  assert.match(body.application_id, /^pma_/);
  assert.match(body.received_url, new RegExp(PRIVATE_MODEL_RECEIVED_PATH.replaceAll("/", "\\/")));
  assert.match(body.status_url, new RegExp(PRIVATE_MODEL_STATUS_PATH.replaceAll("/", "\\/")));
  assert.equal(writes.length, 1);

  const fields = writes[0].fields;
  const F = privateModelTestInternals.APPLICATION_FIELDS;
  assert.equal(fields[F.applicationType], "private_model");
  assert.equal(fields[F.handler], "TarT");
  assert.equal(fields[F.status], "New");
  assert.equal(fields[F.reviewStatus], "pending_review");
  assert.equal(fields[F.intakeStatus], "private_review_pending");
  assert.match(fields[F.notes], /Source: \/sigil\/apply/);
});

test("Private Model upload-url validates private_model metadata before issuing upload", async () => {
  const { response } = await call(PRIVATE_MODEL_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      application_type: "public_model",
      consent: true,
      kind: "photo",
      role: "front_face",
      file_name: "front.jpg",
      content_type: "image/jpeg",
      file_size: 1024,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.fields.application_type, "must be private_model");
});

test("health exposes private model capabilities", async () => {
  const { response } = await call("/health");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.capabilities.private_model_apply, true);
  assert.equal(body.capabilities.private_model_upload, true);
});

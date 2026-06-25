#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_SCHEMA_PATCH_V1_ROUTES,
  classifyModelSchemaPatchV1AirtableError,
  default as worker,
  isVerifiedDepositRecord,
  modelSchemaPatchV1Tables,
  validateModelSchemaPatchV1Payload,
} from "./src/index.js";

test("registers the model schema patch v1 route constants", () => {
  assert.equal(MODEL_SCHEMA_PATCH_V1_ROUTES.visibilityUpdate, "/v1/model/visibility/update");
  assert.equal(MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize, "/v1/model/private-flash/authorize");
  assert(!Object.values(MODEL_SCHEMA_PATCH_V1_ROUTES).some((path) => path.includes("/immigrate")));
});

test("uses preview_token_hash for stored flash access hashes and no raw token field", () => {
  const tables = modelSchemaPatchV1Tables({});
  assert.equal(tables.flashGrants.fields.previewTokenHash, "preview_token_hash");
  assert(!Object.values(tables.flashGrants.fields).includes("token"));
});

test("validates model request payloads without allowing self-authorized flash grants", () => {
  assert.equal(
    validateModelSchemaPatchV1Payload(MODEL_SCHEMA_PATCH_V1_ROUTES.visibilityUpdate, {
      model_id: "recModel",
      requested_visibility: "vip",
    }).ok,
    true,
  );

  const invalidGrant = validateModelSchemaPatchV1Payload(
    MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize,
    { model_id: "recModel", client_id: "recClient" },
  );
  assert.equal(invalidGrant.ok, false);
  assert(invalidGrant.errors.includes("payment_ref"));

  const manualGrant = validateModelSchemaPatchV1Payload(
    MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize,
    { model_id: "recModel", client_id: "recClient", manual_unlock: true },
  );
  assert.equal(manualGrant.ok, true);
});

test("classifies missing Airtable schema safely", () => {
  assert.deepEqual(
    classifyModelSchemaPatchV1AirtableError({ status: 404, data: { error: { message: "NOT_FOUND" } } }),
    {
      code: "missing_table",
      status: 503,
      message: "Airtable table is missing or not enabled.",
    },
  );

  assert.deepEqual(
    classifyModelSchemaPatchV1AirtableError({
      status: 422,
      data: { error: { type: "UNKNOWN_FIELD_NAME", message: "Unknown field name: preview_token_hash" } },
    }),
    {
      code: "schema_not_ready",
      status: 503,
      message: "Airtable schema is not ready for this route.",
    },
  );
});

test("requires official verification evidence for private flash deposits", () => {
  const tables = modelSchemaPatchV1Tables({});
  const fields = tables.payments.fields;

  for (const loose of ["paid", "confirmed", "complete", "success", "succeeded"]) {
    assert.equal(
      isVerifiedDepositRecord({ fields: { [fields.depositStatus]: loose, [fields.verificationStatus]: loose } }, tables),
      false,
      `${loose} must not unlock private flash by itself`,
    );
  }

  assert.equal(
    isVerifiedDepositRecord({ fields: { [fields.officialVerifiedAt]: "2026-06-26T05:00:00.000Z" } }, tables),
    true,
  );
  assert.equal(
    isVerifiedDepositRecord({
      fields: {
        [fields.verificationStatus]: "official_verified",
        [fields.officialVerificationRef]: "pay_ref_123",
        [fields.officialVerifiedBy]: "per",
      },
    }, tables),
    true,
  );
});

test("runtime rejects unauthenticated private flash authorization", async () => {
  const response = await worker.fetch(
    new Request("https://admin-worker.test/v1/model/private-flash/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model_id: "recModel", client_id: "recClient", payment_ref: "pay_1" }),
    }),
    baseTestEnv(),
  );
  const data = await response.json();
  assert.equal(response.status, 401);
  assert.equal(data.error, "unauthorized");
});

test("runtime rejects loose paid or confirmed payment status for private flash", async () => {
  await withMockedFetch(async () => {
    const response = await worker.fetch(
      privateFlashRequest({ payment_ref: "pay_loose" }),
      baseTestEnv(),
    );
    const data = await response.json();
    assert.equal(response.status, 423);
    assert.equal(data.error, "verified_deposit_required");
  }, async (input, init) => {
    const req = normalizeMockRequest(input, init);
    assert.equal(req.method, "GET");
    return jsonResponse({
      records: [
        {
          id: "recPaymentLoose",
          fields: {
            payment_ref: "pay_loose",
            deposit_status: "paid",
            verification_status: "confirmed",
          },
        },
      ],
    });
  });
});

test("runtime accepts official verified deposit for private flash", async () => {
  const calls = [];
  await withMockedFetch(async () => {
    const response = await worker.fetch(
      privateFlashRequest({ payment_ref: "pay_verified" }),
      baseTestEnv(),
    );
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.authorization_basis, "verified_deposit");
    assert.equal(data.token_storage, "sha256_hash_only");
    assert(data.t);
    assert.equal(calls.some((call) => call.method === "POST"), true);
  }, async (input, init) => {
    const req = normalizeMockRequest(input, init);
    calls.push({ method: req.method, url: req.url });
    if (req.method === "GET") {
      return jsonResponse({
        records: [
          {
            id: "recPaymentVerified",
            fields: {
              payment_ref: "pay_verified",
              verification_status: "official_verified",
              official_verification_ref: "pay_verified",
              official_verified_by: "per",
            },
          },
        ],
      });
    }
    assert.equal(req.method, "POST");
    const body = await req.json();
    assert.equal(body.records[0].fields.deposit_verified, true);
    assert.equal(body.records[0].fields.preview_token_hash.length, 64);
    assert.equal(body.records[0].fields.payload_json.includes("pay_verified"), true);
    assert.equal(body.records[0].fields.payload_json.includes('"sha256_hash_only"'), true);
    return jsonResponse({ records: [{ id: "recGrant", fields: body.records[0].fields }] });
  });
});

test("demo-links routes are kept and ported in src entrypoint", async () => {
  const env = baseTestEnv();
  const create = await worker.fetch(
    new Request("https://admin-worker.test/v1/demo-links/create", { method: "POST" }),
    env,
  );
  const createData = await create.json();
  assert.equal(create.status, 401);
  assert.equal(createData.error, "unauthorized");

  const get = await worker.fetch(
    new Request("https://admin-worker.test/v1/demo-links/get", { method: "GET" }),
    env,
  );
  const getData = await get.json();
  assert.equal(get.status, 400);
  assert.equal(getData.error, "missing_demo_id");
});

function baseTestEnv() {
  return {
    ADMIN_BEARER: "test-admin",
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_TABLE_DEMO_LINKS: "Demo Links",
  };
}

function privateFlashRequest(body) {
  return new Request("https://admin-worker.test/v1/model/private-flash/authorize", {
    method: "POST",
    headers: {
      authorization: "Bearer test-admin",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model_id: "recModel",
      client_id: "recClient",
      ...body,
    }),
  });
}

async function withMockedFetch(run, handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function normalizeMockRequest(input, init) {
  if (input instanceof Request) return input;
  return new Request(input, init);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

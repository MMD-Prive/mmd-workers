#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_SCHEMA_PATCH_V1_ROUTES,
  classifyModelSchemaPatchV1AirtableError,
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

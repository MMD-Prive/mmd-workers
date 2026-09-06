import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_ASSET_READINESS_PATH,
  buildModelAssetReadiness,
  handleModelAssetReadinessRequest,
  isModelAssetReadinessRequest,
  projectModelAssetRecord,
  validatePublicModelAssetPath,
} from "./src/model-asset-readiness.js";

test("readiness endpoint is exact GET route", () => {
  assert.equal(isModelAssetReadinessRequest(MODEL_ASSET_READINESS_PATH, "GET"), true);
  assert.equal(isModelAssetReadinessRequest(`${MODEL_ASSET_READINESS_PATH}/extra`, "GET"), false);
  assert.equal(isModelAssetReadinessRequest(MODEL_ASSET_READINESS_PATH, "POST"), false);
});

test("public model asset path accepts only canonical public asset keys", () => {
  const valid = validatePublicModelAssetPath("models/mdl_123/profile/main.webp");
  assert.equal(valid.ok, true);
  assert.equal(valid.kind, "profile");
  assert.equal(valid.url, "https://models.mmdbkk.com/models/mdl_123/profile/main.webp");

  const prefix = validatePublicModelAssetPath("models/mdl_123/", { allowPrefix: true });
  assert.equal(prefix.ok, true);
  assert.equal(prefix.path, "models/mdl_123/");
});

test("path guard blocks protected and unsafe paths", () => {
  for (const key of [
    "models/mdl_123/private/photo.webp",
    "models/mdl_123/evidence/slip.webp",
    "models/mdl_123/slips/abc.webp",
    "models/mdl_123/line-notes/note.webp",
    "models/mdl_123/sigil/private.webp",
  ]) {
    assert.equal(validatePublicModelAssetPath(key).ok, false, key);
  }
  assert.equal(validatePublicModelAssetPath("../models/mdl_123/profile/main.webp").ok, false);
  assert.equal(validatePublicModelAssetPath("https://models.mmdbkk.com/models/mdl_123/profile/main.webp").ok, false);
  assert.equal(validatePublicModelAssetPath("models//mdl_123/profile/main.webp").ok, false);
});

test("six passing checks yield Ready for Review and final preview CTA", () => {
  const readiness = buildModelAssetReadiness({
    canonical_record: true,
    r2_migration: true,
    primary_image: true,
    public_profile: true,
    gallery: true,
    compcard: true,
  });
  assert.equal(readiness.score, 6);
  assert.equal(readiness.verdict, "Ready for Review");
  assert.equal(readiness.next.route, "/internal/admin/studio/model-preview");
});

test("missing canonical record routes to Studio Upload", () => {
  const readiness = buildModelAssetReadiness({});
  assert.equal(readiness.score, 0);
  assert.equal(readiness.verdict, "Incomplete");
  assert.equal(readiness.next.route, "/internal/admin/studio/upload");
});

test("canonical projection trusts backend evidence, not a declared public key alone", () => {
  const record = {
    id: "recModelAsset12345",
    fields: {
      working_name: "Ewa",
      r2_prefix: "models/mdl_ewa/",
      storage_source_primary: "R2",
      primary_image_key: "models/mdl_ewa/profile/main.webp",
      public_profile_ready: true,
      gallery_ready: true,
      compcard_ready: true,
    },
  };
  const projected = projectModelAssetRecord(record, {
    r2_exists: true,
    primary_exists: true,
    profile_exists: true,
    gallery_exists: true,
    compcard_exists: true,
  });
  assert.equal(projected.model_record_id, record.id);
  assert.equal(projected.primary_image_key, "models/mdl_ewa/profile/main.webp");
  assert.equal(projected.readiness_summary.score, 6);
  assert.equal(projected.readiness_summary.verdict, "Ready for Review");
  assert.equal("published" in projected, false);
});

test("protected declared primary never becomes public preview", () => {
  const projected = projectModelAssetRecord({
    id: "recModelAsset99999",
    fields: {
      working_name: "Demo",
      r2_prefix: "models/mdl_demo/",
      storage_source_primary: "R2",
      primary_image_key: "models/mdl_demo/private/main.webp",
      public_profile_ready: true,
    },
  }, { r2_exists: true, primary_exists: true });
  assert.equal(projected.primary_image_key, "");
  assert.equal(projected.readiness_summary.primary_image, false);
  assert.equal(projected.diagnostics.blocked_primary_reason, "protected_path");
});

test("handler returns backend-owned safe projection without secret fields", async () => {
  const canonical = {
    id: "recModelAssetABCDE",
    fields: {
      working_name: "Ewa",
      r2_prefix: "models/mdl_ewa/",
      storage_source_primary: "R2",
      primary_image_key: "models/mdl_ewa/profile/main.webp",
    },
  };
  const coreWorker = {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/v1/admin/models/list") {
        return Response.json({ ok: true, items: [canonical] });
      }
      throw new Error(`unexpected core route: ${path}`);
    },
  };
  const keys = new Set([
    "models/mdl_ewa/profile/main.webp",
    "models/mdl_ewa/gallery/01.webp",
    "models/mdl_ewa/compcard/main.webp",
  ]);
  const env = {
    MMD_MODEL_ASSETS: {
      async list({ prefix, limit = 100 }) {
        return { objects: [...keys].filter((key) => key.startsWith(prefix)).slice(0, limit).map((key) => ({ key })) };
      },
      async head(key) {
        return keys.has(key) ? { key } : null;
      },
    },
  };
  const request = new Request(`https://mmdbkk.com${MODEL_ASSET_READINESS_PATH}?q=Ewa`, {
    headers: { Cookie: "mmd_admin_gate_v1=fake-for-upstream-wrapper" },
  });
  const response = await handleModelAssetReadinessRequest(request, env, {}, coreWorker);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.found, true);
  assert.equal(body.authority, "backend");
  assert.equal(body.published, false);
  assert.equal(body.can_publish, false);
  assert.equal(body.demo, false);
  assert.equal(body.readiness.score, 6);
  assert.deepEqual(body.flow, ["Drive / Intake", "Studio", "R2 + Airtable", "Public Asset"]);
  assert.equal(JSON.stringify(body).includes("ADMIN_BEARER"), false);
  assert.equal(JSON.stringify(body).includes("CONFIRM_KEY"), false);
  assert.equal(JSON.stringify(body).includes("api_base"), false);
});

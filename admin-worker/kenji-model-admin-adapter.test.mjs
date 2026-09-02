import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiModelAdminRequest,
  isKenjiModelAdminRequest,
  KENJI_MODEL_ADMIN_BASE_PATH,
  KENJI_MODEL_ADMIN_DRAFT_PATH,
  projectKenjiAdminModelRecord,
  projectKenjiKeywordProfileRecord,
} from "./src/kenji-model-admin-adapter.js";

const ENV = {
  AIRTABLE_API_KEY: "test-airtable-key",
  AIRTABLE_BASE_ID: "appTestBase",
  AIRTABLE_TABLE_MODELS_ID: "tblModelsCanonical",
  AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES_ID: "tblKeywordProfilesCanonical",
  AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS_ID: "tblReviewRequestsCanonical",
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function bodyOf(result) {
  return result.json();
}

test("recognizes only the exact Kenji model admin routes", () => {
  assert.equal(isKenjiModelAdminRequest(KENJI_MODEL_ADMIN_BASE_PATH, "GET"), true);
  assert.equal(isKenjiModelAdminRequest(KENJI_MODEL_ADMIN_DRAFT_PATH, "POST"), true);
  assert.equal(isKenjiModelAdminRequest("/v1/admin/kenji/models/publish", "POST"), false);
  assert.equal(isKenjiModelAdminRequest("/v1/admin/models/upsert", "POST"), false);
});

test("projects canonical Models identity without private notes, contacts, rates, or storage", () => {
  const projected = projectKenjiAdminModelRecord({
    id: "rec12345678901234",
    fields: {
      unique_key: "ems07-demo",
      working_name: "EMs07 Demo",
      model_tier: "premium",
      status: "active",
      approved_client_visibility: "premium",
      folder_name: "Premium Package",
      requires_per_approval: true,
      visibility_review_status: "approved",
      admin_note: "never expose",
      telegram_id: "123456789",
      line_user_id: "Uxxxxxxxxxxxxxxxx",
      minimum_rate_90m: 999999,
      private_original_key: "models/private/secret.jpg",
    },
  });

  assert.equal(projected.model_key, "ems07-demo");
  assert.equal(projected.working_name, "EMs07 Demo");
  assert.equal(projected.model_status, "active");
  assert.equal(projected.booking_visibility, "premium");
  for (const forbidden of ["admin_note", "telegram_id", "line_user_id", "minimum_rate_90m", "private_original_key"]) {
    assert.equal(Object.hasOwn(projected, forbidden), false);
  }
});

test("projects existing Model Keyword Profiles and excludes private_admin_note", () => {
  const profile = projectKenjiKeywordProfileRecord({
    id: "recKeyword12345678",
    fields: {
      model_key: "ems07-demo",
      Model: ["rec12345678901234"],
      folder_name: "Premium Package",
      working_name: "EMs07 Demo",
      search_aliases: ["Demo", "EMs07"],
      customer_safe_info: "สุขุม คุยง่าย และผ่านการ review แล้ว",
      positive_sensitive_description: "คาแรกเตอร์ชัด แต่ใช้เมื่อ policy อนุญาต",
      customer_safe_remark: "ข้อมูลสำหรับตอบลูกค้าเท่านั้น",
      model_tier: "premium",
      allowed_customer_scope: ["standard", "premium"],
      photo_visibility_policy: "review_required",
      deposit_preview_gate: "required",
      status: "draft",
      include_in_public_kenji: false,
      source_ref: "legacy-keyword-profile",
      version: 7,
      reviewed_at: "2026-09-01T12:00:00.000Z",
      private_admin_note: "must never leave Airtable",
    },
  });

  assert.equal(profile.keyword_profile_id, "recKeyword12345678");
  assert.deepEqual(profile.linked_model_ids, ["rec12345678901234"]);
  assert.deepEqual(profile.search_aliases, ["Demo", "EMs07"]);
  assert.equal(profile.customer_safe_info.includes("review"), true);
  assert.equal(profile.profile_version, 7);
  assert.equal(Object.hasOwn(profile, "private_admin_note"), false);
});

test("list joins Models identity with the existing Keyword Profiles content", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const decoded = decodeURIComponent(url);
    if (decoded.includes("tblModelsCanonical")) {
      return response({
        records: [{
          id: "rec12345678901234",
          fields: {
            unique_key: "gws12-north",
            working_name: "GWs12 North Source",
            model_tier: "premium",
            status: "active",
            approved_client_visibility: "premium",
            admin_note: "private",
            minimum_rate_90m: 4500,
          },
        }],
      });
    }
    if (decoded.includes("tblKeywordProfilesCanonical")) {
      return response({
        records: [{
          id: "recKeyword12345678",
          fields: {
            model_key: "gws12-north",
            Model: ["rec12345678901234"],
            working_name: "GWs12 North",
            search_aliases: ["North", "GWs12"],
            customer_safe_info: "สุภาพและคุยง่าย",
            customer_safe_remark: "ตอบได้หลังผ่าน policy",
            model_tier: "premium",
            allowed_customer_scope: ["standard", "premium"],
            status: "published",
            version: 3,
            private_admin_note: "private profile note",
          },
        }],
      });
    }
    throw new Error(`unexpected table call: ${url}`);
  };

  const result = await handleKenjiModelAdminRequest(
    new Request("https://mmdbkk.com/v1/admin/kenji/models?q=GWs12&limit=20"),
    ENV,
    { fetchImpl }
  );
  const body = await bodyOf(result);

  assert.equal(result.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.count, 1);
  assert.equal(body.items[0].model_key, "gws12-north");
  assert.equal(body.items[0].working_name, "GWs12 North");
  assert.equal(body.items[0].customer_safe_info, "สุภาพและคุยง่าย");
  assert.equal(body.items[0].profile_status, "published");
  assert.equal(body.items[0].profile_version, 3);
  assert.equal(Object.hasOwn(body.items[0], "admin_note"), false);
  assert.equal(Object.hasOwn(body.items[0], "minimum_rate_90m"), false);
  assert.equal(Object.hasOwn(body.items[0], "private_admin_note"), false);
  assert.equal(calls.length, 2);
  assert.ok(calls.some((call) => decodeURIComponent(call.url).includes("tblModelsCanonical")));
  assert.ok(calls.some((call) => decodeURIComponent(call.url).includes("tblKeywordProfilesCanonical")));
  assert.ok(calls.every((call) => !decodeURIComponent(call.url).includes("Offer")));
});

test("list fails closed when canonical Keyword Profiles cannot be read", async () => {
  const fetchImpl = async (url) => {
    if (decodeURIComponent(url).includes("tblModelsCanonical")) return response({ records: [] });
    return response({ error: { type: "NOT_FOUND" } }, 404);
  };
  const result = await handleKenjiModelAdminRequest(
    new Request("https://mmdbkk.com/v1/admin/kenji/models"),
    ENV,
    { fetchImpl }
  );
  assert.equal(result.status, 503);
  assert.equal((await bodyOf(result)).error, "keyword_profile_source_unavailable");
});

test("draft write requires an idempotency key", async () => {
  const result = await handleKenjiModelAdminRequest(
    new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_key: "ems07-demo", working_name: "EMs07 Demo" }),
    }),
    ENV,
    { fetchImpl: async () => response({ records: [] }) }
  );
  assert.equal(result.status, 400);
  assert.equal((await bodyOf(result)).error, "idempotency_key_required");
});

test("draft blocks rate and availability claims from customer-safe copy", async () => {
  for (const customer_safe_info of ["ราคา 4,500 บาท", "คืนนี้ว่างครับ", "available tonight"]) {
    const result = await handleKenjiModelAdminRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "adapter-guard-test-1234",
        },
        body: JSON.stringify({ model_key: "ems07-demo", working_name: "EMs07 Demo", customer_safe_info }),
      }),
      ENV,
      { fetchImpl: async () => response({ records: [] }) }
    );
    assert.equal(result.status, 400);
    assert.match((await bodyOf(result)).error, /customer_safe_info_failed_guard/);
  }
});

test("vip and exclusive tiers default proposed visibility to curated", async () => {
  for (const model_tier of ["vip", "exclusive"]) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init });
      if ((init.method || "GET") === "GET") return response({ records: [] });
      return response({ records: [{ id: "recReview123456789" }] }, 201);
    };
    const result = await handleKenjiModelAdminRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `tier-${model_tier}-12345` },
        body: JSON.stringify({ model_key: `${model_tier}-demo`, working_name: "Tier Demo", model_tier }),
      }),
      ENV,
      { actor: { id: "boss-per", role: "owner" }, fetchImpl }
    );
    assert.equal(result.status, 201);
    const createPayload = JSON.parse(calls[1].init.body);
    assert.equal(createPayload.records[0].fields.requested_visibility, "curated");
  }
});

test("draft writes only to existing Model Review Requests and targets Keyword Profiles", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if ((init.method || "GET") === "GET") return response({ records: [] });
    return response({ records: [{ id: "recReview123456789" }] }, 201);
  };

  const request = new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "kenji-model-draft-ems07-v2",
    },
    body: JSON.stringify({
      model_id: "rec12345678901234",
      keyword_profile_id: "recKeyword12345678",
      expected_profile_version: 7,
      model_key: "ems07-demo",
      folder_name: "Premium Package",
      working_name: "EMs07 Demo",
      search_aliases: ["Demo", "EMs07"],
      customer_safe_info: "สุขุม คุยง่าย และสุภาพ",
      positive_sensitive_description: "คาแรกเตอร์ชัด ใช้เมื่อ policy อนุญาต",
      customer_safe_remark: "ใช้เฉพาะข้อมูลที่ review แล้ว",
      model_tier: "premium",
      proposed_visibility: "premium",
      allowed_customer_scope: ["standard", "premium"],
      restricted_scope: ["review"],
      photo_visibility_policy: "review_required",
      deposit_preview_gate: "required",
      profile_status: "draft",
      include_in_public_kenji: false,
      source_ref: "legacy-keyword-profile",
    }),
  });

  const result = await handleKenjiModelAdminRequest(request, ENV, {
    actor: { id: "boss-per", role: "owner" },
    fetchImpl,
  });
  const body = await bodyOf(result);

  assert.equal(result.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.status, "pending_review");
  assert.equal(body.production_mutated, false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => decodeURIComponent(call.url).includes("tblReviewRequestsCanonical")));
  assert.ok(calls.every((call) => !decodeURIComponent(call.url).includes("tblModelsCanonical")));
  assert.ok(calls.every((call) => !decodeURIComponent(call.url).includes("tblKeywordProfilesCanonical")));

  const createPayload = JSON.parse(calls[1].init.body);
  const fields = createPayload.records[0].fields;
  assert.equal(fields.request_type, "kenji_model_keyword_profile");
  assert.equal(fields.request_status, "pending_review");
  assert.equal(fields.requested_by, "boss-per");
  const savedDraft = JSON.parse(fields.payload_json);
  assert.equal(savedDraft.target, "model_keyword_profile");
  assert.equal(savedDraft.keyword_profile_id, "recKeyword12345678");
  assert.equal(savedDraft.expected_profile_version, 7);
  assert.equal(savedDraft.model_key, "ems07-demo");
  assert.equal(savedDraft.requires_per_approval, true);
  assert.equal(Object.hasOwn(savedDraft, "rate"), false);
  assert.equal(Object.hasOwn(savedDraft, "availability"), false);
});

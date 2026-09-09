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
  assert.equal(projected.identity_tier, "premium");
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
      model_key: "ems04-sin-m",
      Model: ["rec12345678901234"],
      folder_name: "EMs04 - Sin M",
      working_name: "Sin M",
      search_aliases: ["Sin", "EMs04"],
      customer_safe_info: "สุขุม คุยง่าย และผ่านการ review แล้ว",
      positive_sensitive_description: "คาแรกเตอร์ชัด แต่ใช้เมื่อ policy อนุญาต",
      customer_safe_remark: "ข้อมูลสำหรับตอบลูกค้าเท่านั้น",
      model_tier: "EMs",
      allowed_customer_scope: ["VIP", "SVIP", "Black Card", "#Potential"],
      photo_visibility_policy: "VIP/SVIP/Black Card only",
      deposit_preview_gate: "Verified deposit + Per approval",
      status: "Review",
      include_in_public_kenji: "No",
      source_ref: "Per brief / Model Keyword Studio / 2026-08-28",
      version: 7,
      reviewed_at: "2026-09-01T12:00:00.000Z",
      private_admin_note: "must never leave Airtable",
    },
  });

  assert.equal(profile.keyword_profile_id, "recKeyword12345678");
  assert.deepEqual(profile.linked_model_ids, ["rec12345678901234"]);
  assert.deepEqual(profile.search_aliases, ["Sin", "EMs04"]);
  assert.equal(profile.model_tier, "EMs");
  assert.deepEqual(profile.allowed_customer_scope, ["VIP", "SVIP", "Black Card", "#Potential"]);
  assert.equal(profile.include_in_public_kenji, false);
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
            unique_key: "ems04-sin-m",
            working_name: "Sin M Source",
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
            model_key: "ems04-sin-m",
            Model: ["rec12345678901234"],
            working_name: "Sin M",
            search_aliases: ["Sin", "EMs04"],
            customer_safe_info: "สุภาพและคุยง่าย",
            customer_safe_remark: "ตอบได้หลังผ่าน policy",
            model_tier: "EMs",
            allowed_customer_scope: ["VIP", "SVIP", "Black Card", "#Potential"],
            photo_visibility_policy: "VIP/SVIP/Black Card only",
            deposit_preview_gate: "Verified deposit + Per approval",
            status: "Review",
            version: 3,
            private_admin_note: "private profile note",
          },
        }],
      });
    }
    throw new Error(`unexpected table call: ${url}`);
  };

  const result = await handleKenjiModelAdminRequest(
    new Request("https://mmdbkk.com/v1/admin/kenji/models?q=EMs04&limit=20"),
    ENV,
    { fetchImpl }
  );
  const body = await bodyOf(result);

  assert.equal(result.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.count, 1);
  assert.equal(body.items[0].model_key, "ems04-sin-m");
  assert.equal(body.items[0].working_name, "Sin M");
  assert.equal(body.items[0].customer_safe_info, "สุภาพและคุยง่าย");
  assert.equal(body.items[0].model_tier, "EMs");
  assert.equal(body.items[0].identity_tier, "premium");
  assert.equal(body.items[0].profile_status, "Review");
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
      body: JSON.stringify({ model_key: "ems04-sin-m", working_name: "Sin M" }),
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
        body: JSON.stringify({ model_key: "ems04-sin-m", working_name: "Sin M", customer_safe_info }),
      }),
      ENV,
      { fetchImpl: async () => response({ records: [] }) }
    );
    assert.equal(result.status, 400);
    assert.match((await bodyOf(result)).error, /customer_safe_info_failed_guard/);
  }
});

test("profile tier choices map safely to proposed visibility defaults", async () => {
  for (const [model_tier, expectedVisibility] of [["Public", "public"], ["GWs", "curated"], ["EMs", "curated"], ["Private", "curated"]]) {
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
        body: JSON.stringify({ model_key: "tier-demo", working_name: "Tier Demo", model_tier }),
      }),
      ENV,
      { actor: { id: "boss-per", role: "owner" }, fetchImpl }
    );
    assert.equal(result.status, 201);
    const createPayload = JSON.parse(calls[1].init.body);
    assert.equal(createPayload.records[0].fields.requested_visibility, expectedVisibility);
  }
});

test("draft accepts only canonical keyword-profile choice values", async () => {
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
      "Idempotency-Key": "kenji-model-draft-ems04-v2",
    },
    body: JSON.stringify({
      model_id: "rec12345678901234",
      keyword_profile_id: "recKeyword12345678",
      expected_profile_version: 7,
      model_key: "ems04-sin-m",
      folder_name: "EMs04 - Sin M",
      working_name: "Sin M",
      search_aliases: ["Sin", "EMs04"],
      customer_safe_info: "สุขุม คุยง่าย และสุภาพ",
      positive_sensitive_description: "คาแรกเตอร์ชัด ใช้เมื่อ policy อนุญาต",
      customer_safe_remark: "ใช้เฉพาะข้อมูลที่ review แล้ว",
      model_tier: "EMs",
      proposed_visibility: "curated",
      allowed_customer_scope: ["VIP", "SVIP", "Black Card", "#Potential"],
      photo_visibility_policy: "VIP/SVIP/Black Card only",
      deposit_preview_gate: "Verified deposit + Per approval",
      profile_status: "Review",
      include_in_public_kenji: false,
      source_ref: "Per brief / Model Keyword Studio / 2026-08-28",
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
  assert.equal(savedDraft.model_key, "ems04-sin-m");
  assert.equal(savedDraft.model_tier, "EMs");
  assert.deepEqual(savedDraft.allowed_customer_scope, ["VIP", "SVIP", "Black Card", "#Potential"]);
  assert.equal(savedDraft.photo_visibility_policy, "VIP/SVIP/Black Card only");
  assert.equal(savedDraft.deposit_preview_gate, "Verified deposit + Per approval");
  assert.equal(savedDraft.current_profile_status, "Review");
  assert.equal(savedDraft.proposed_profile_status, "Review");
  assert.equal(savedDraft.requires_per_approval, true);
  assert.equal(Object.hasOwn(savedDraft, "rate"), false);
  assert.equal(Object.hasOwn(savedDraft, "availability"), false);
});

test("draft rejects values outside the Airtable keyword-profile choice contract", async () => {
  const base = {
    model_key: "ems04-sin-m",
    working_name: "Sin M",
    model_tier: "EMs",
  };
  for (const [field, value, expected] of [
    ["model_tier", "premium", "invalid_model_tier"],
    ["allowed_customer_scope", ["Premium"], "invalid_allowed_customer_scope"],
    ["photo_visibility_policy", "everyone", "invalid_photo_visibility_policy"],
    ["deposit_preview_gate", "auto", "invalid_deposit_preview_gate"],
  ]) {
    const result = await handleKenjiModelAdminRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `bad-${field}-12345` },
        body: JSON.stringify({ ...base, [field]: value }),
      }),
      ENV,
      { fetchImpl: async () => response({ records: [] }) }
    );
    assert.equal(result.status, 400);
    assert.equal((await bodyOf(result)).error, expected);
  }
});

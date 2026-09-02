import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiModelAdminRequest,
  isKenjiModelAdminRequest,
  KENJI_MODEL_ADMIN_BASE_PATH,
  KENJI_MODEL_ADMIN_DRAFT_PATH,
  projectKenjiAdminModelRecord,
} from "./src/kenji-model-admin-adapter.js";

const ENV = {
  AIRTABLE_API_KEY: "test-airtable-key",
  AIRTABLE_BASE_ID: "appTestBase",
  AIRTABLE_TABLE_MODELS: "Models",
  AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS: "MMD — Model Review Requests",
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

test("projects Models records without private notes, contacts, rates, or raw storage", () => {
  const projected = projectKenjiAdminModelRecord({
    id: "rec12345678901234",
    fields: {
      unique_key: "ems07-demo",
      working_name: "EMs07 Demo",
      aliases: ["Demo", "EMs07"],
      customer_safe_summary: "สุขุม คุยง่าย และผ่านการ review แล้ว",
      customer_safe_remark: "ข้อมูลสำหรับตอบลูกค้าเท่านั้น",
      model_tier: "premium",
      status: "active",
      booking_visibility: "private",
      access_folder: "premium",
      requires_per_approval: true,
      admin_note: "never expose",
      telegram_id: "123456789",
      line_user_id: "Uxxxxxxxxxxxxxxxx",
      minimum_rate_90m: 999999,
      private_original_key: "models/private/secret.jpg",
    },
  });

  assert.equal(projected.model_key, "ems07-demo");
  assert.equal(projected.working_name, "EMs07 Demo");
  assert.deepEqual(projected.search_aliases, ["Demo", "EMs07"]);
  assert.equal(projected.customer_safe_info.includes("review"), true);
  for (const forbidden of ["admin_note", "telegram_id", "line_user_id", "minimum_rate_90m", "private_original_key"]) {
    assert.equal(Object.hasOwn(projected, forbidden), false);
  }
});

test("list reads canonical Models and returns only the safe projection", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response({
      records: [
        {
          id: "rec12345678901234",
          fields: {
            unique_key: "gws12-north",
            working_name: "GWs12 North",
            aliases: "North, GWs12",
            customer_safe_summary: "สุภาพและคุยง่าย",
            status: "active",
            booking_visibility: "public",
            admin_note: "private",
            minimum_rate_90m: 4500,
          },
        },
      ],
    });
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
  assert.equal(Object.hasOwn(body.items[0], "admin_note"), false);
  assert.equal(Object.hasOwn(body.items[0], "minimum_rate_90m"), false);
  assert.match(calls[0].url, /\/Models\?pageSize=100/);
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

test("draft writes only to the existing Model Review Requests table and leaves production Models untouched", async () => {
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
      "Idempotency-Key": "kenji-model-draft-ems07-v1",
    },
    body: JSON.stringify({
      model_id: "rec12345678901234",
      model_key: "ems07-demo",
      working_name: "EMs07 Demo",
      search_aliases: ["Demo", "EMs07"],
      customer_safe_info: "สุขุม คุยง่าย และสุภาพ",
      customer_safe_remark: "ใช้เฉพาะข้อมูลที่ review แล้ว",
      model_tier: "premium",
      proposed_visibility: "premium",
      allowed_customer_scope: ["standard", "premium"],
      restricted_scope: ["review"],
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
  assert.ok(calls.every((call) => decodeURIComponent(call.url).includes("MMD — Model Review Requests")));
  assert.ok(calls.every((call) => !decodeURIComponent(call.url).endsWith("/Models")));

  const createPayload = JSON.parse(calls[1].init.body);
  const fields = createPayload.records[0].fields;
  assert.equal(fields.request_type, "kenji_model_profile");
  assert.equal(fields.request_status, "pending_review");
  assert.equal(fields.requested_by, "boss-per");
  const savedDraft = JSON.parse(fields.payload_json);
  assert.equal(savedDraft.model_key, "ems07-demo");
  assert.equal(savedDraft.requires_per_approval, true);
  assert.equal(Object.hasOwn(savedDraft, "rate"), false);
  assert.equal(Object.hasOwn(savedDraft, "availability"), false);
});

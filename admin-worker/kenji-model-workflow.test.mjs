import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiModelAdminRequest,
  isKenjiModelAdminRequest,
} from "./src/kenji-model-admin-adapter.js";
import { KENJI_MODEL_REVIEW_QUEUE_PATH } from "./src/kenji-model-workflow.js";

const ENV = {
  AIRTABLE_API_KEY: "test-airtable-key",
  AIRTABLE_BASE_ID: "appTestBase",
  AIRTABLE_TABLE_MODELS_ID: "tblModelsCanonical",
  AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES_ID: "tblKeywordProfilesCanonical",
  AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS_ID: "tblReviewRequestsCanonical",
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function workflowRequest(path, method = "GET", body = null, key = "workflow-command-123456") {
  const headers = {
    "x-mmd-admin-actor": "per",
    "x-mmd-admin-role": "admin",
  };
  if (body !== null) {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = key;
  }
  return new Request(`https://mmdbkk.com${path}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
}

function makeHarness() {
  let reviewRecord = {
    id: "recReview123456789",
    fields: {
      request_id: "kenji_model_keyword_req_1234567890abcdef12345678",
      Model: ["rec12345678901234"],
      request_type: "kenji_model_keyword_profile",
      request_status: "pending_review",
      requested_by: "per",
      requested_at: "2026-09-06T10:00:00.000Z",
      requested_visibility: "curated",
      decision_note: "draft",
      payload_json: JSON.stringify({
        target: "model_keyword_profile",
        model_id: "rec12345678901234",
        keyword_profile_id: null,
        expected_profile_version: null,
        model_key: "gws21-ewa",
        folder_name: "GWs21 - Ewa",
        working_name: "Ewa",
        search_aliases: ["GWs21", "Ewa"],
        customer_safe_info: "ลุคมั่นใจ คุยง่าย และใช้ข้อมูลที่ผ่าน review เท่านั้น",
        positive_sensitive_description: "คาแรกเตอร์ชัด ใช้เมื่อ policy อนุญาต",
        customer_safe_remark: "VIP / SVIP / Black Card สามารถทราบชื่อเล่นได้ ระดับอื่นไม่เปิดเผยตัวตน",
        model_tier: "GWs",
        proposed_visibility: "curated",
        allowed_customer_scope: ["VIP", "SVIP", "Black Card"],
        photo_visibility_policy: "VIP/SVIP/Black Card only",
        deposit_preview_gate: "Per approval",
        current_profile_status: "Draft",
        proposed_profile_status: "Review",
        include_in_public_kenji: false,
        source_ref: "Models · GWs21 · Ewa · Per approved copy",
        requires_per_approval: true,
      }),
    },
  };
  const modelRecord = {
    id: "rec12345678901234",
    fields: { unique_key: "gws21-ewa", working_name: "Ewa", status: "active" },
  };
  const profiles = [];
  const calls = [];

  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const decoded = decodeURIComponent(url);
    const method = (init.method || "GET").toUpperCase();

    if (decoded.includes("tblReviewRequestsCanonical")) {
      if (method === "GET") return response({ records: [reviewRecord] });
      if (method === "PATCH") {
        const payload = JSON.parse(init.body);
        reviewRecord = {
          ...reviewRecord,
          fields: { ...reviewRecord.fields, ...payload.records[0].fields },
        };
        return response({ records: [reviewRecord] });
      }
    }

    if (decoded.includes("tblModelsCanonical/rec12345678901234")) {
      return response(modelRecord);
    }

    if (decoded.includes("tblKeywordProfilesCanonical")) {
      if (method === "GET") return response({ records: profiles });
      if (method === "POST") {
        const payload = JSON.parse(init.body);
        const created = { id: "recProfile123456789", fields: payload.records[0].fields };
        profiles.push(created);
        return response({ records: [created] }, 201);
      }
      if (method === "PATCH") {
        const payload = JSON.parse(init.body);
        const item = profiles.find((record) => record.id === payload.records[0].id);
        Object.assign(item.fields, payload.records[0].fields);
        return response({ records: [item] });
      }
    }

    throw new Error(`unexpected Airtable call ${method} ${url}`);
  };

  return {
    fetchImpl,
    calls,
    getReview: () => reviewRecord,
    getProfiles: () => profiles,
  };
}

test("recognizes the scoped Model review workflow without reviving a broad publish route", () => {
  assert.equal(isKenjiModelAdminRequest(KENJI_MODEL_REVIEW_QUEUE_PATH, "GET"), true);
  assert.equal(isKenjiModelAdminRequest("/v1/admin/kenji/models/reviews/kenji_model_keyword_req_1234567890abcdef12345678/review", "POST"), true);
  assert.equal(isKenjiModelAdminRequest("/v1/admin/kenji/models/reviews/kenji_model_keyword_req_1234567890abcdef12345678/qa", "POST"), true);
  assert.equal(isKenjiModelAdminRequest("/v1/admin/kenji/models/reviews/kenji_model_keyword_req_1234567890abcdef12345678/publish", "POST"), true);
  assert.equal(isKenjiModelAdminRequest("/v1/admin/kenji/models/reviews/kenji_model_keyword_req_1234567890abcdef12345678/audit", "GET"), true);
  assert.equal(isKenjiModelAdminRequest("/v1/admin/kenji/models/publish", "POST"), false);
});

test("Model workflow is end-to-end Review → QA → Publish → Audit and writes only the Keyword Profile", async () => {
  const harness = makeHarness();
  const requestId = "kenji_model_keyword_req_1234567890abcdef12345678";

  const queue = await handleKenjiModelAdminRequest(
    workflowRequest(`${KENJI_MODEL_REVIEW_QUEUE_PATH}?status=open`),
    ENV,
    { fetchImpl: harness.fetchImpl }
  );
  const queueBody = await queue.json();
  assert.equal(queue.status, 200);
  assert.equal(queueBody.count, 1);
  assert.equal(queueBody.items[0].stage, "review");
  assert.equal(queueBody.items[0].workflow_version, 1);
  assert.equal(queueBody.items[0].customer_safe_remark.includes("ราคา"), false);

  const reviewed = await handleKenjiModelAdminRequest(
    workflowRequest(`/v1/admin/kenji/models/reviews/${requestId}/review`, "POST", { expected_version: 1 }, "review-command-123456"),
    ENV,
    { fetchImpl: harness.fetchImpl }
  );
  const reviewedBody = await reviewed.json();
  assert.equal(reviewed.status, 200);
  assert.equal(reviewedBody.request_status, "reviewed");
  assert.equal(reviewedBody.workflow_version, 2);
  assert.equal(reviewedBody.production_mutated, false);

  const qa = await handleKenjiModelAdminRequest(
    workflowRequest(`/v1/admin/kenji/models/reviews/${requestId}/qa`, "POST", {
      expected_version: 2,
      qa: {
        policy_path_match: true,
        customer_safe_preview_checked: true,
        source_checked: true,
        privacy_checked: true,
      },
    }, "qa-command-123456"),
    ENV,
    { fetchImpl: harness.fetchImpl }
  );
  const qaBody = await qa.json();
  assert.equal(qa.status, 200);
  assert.equal(qaBody.stage, "qa_passed");
  assert.equal(qaBody.workflow_version, 3);
  assert.equal(qaBody.qa.pass, true);
  assert.equal(qaBody.production_mutated, false);

  const published = await handleKenjiModelAdminRequest(
    workflowRequest(`/v1/admin/kenji/models/reviews/${requestId}/publish`, "POST", { expected_version: 3 }, "publish-command-123456"),
    ENV,
    { fetchImpl: harness.fetchImpl }
  );
  const publishedBody = await published.json();
  assert.equal(published.status, 200);
  assert.equal(publishedBody.stage, "published");
  assert.equal(publishedBody.workflow_version, 4);
  assert.equal(publishedBody.production_mutated, true);
  assert.equal(publishedBody.published_profile_id, "recProfile123456789");
  assert.equal(publishedBody.published_profile_version, 1);

  const profiles = harness.getProfiles();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].fields.model_key, "gws21-ewa");
  assert.equal(profiles[0].fields.status, "Active");
  assert.equal(profiles[0].fields.version, 1);
  assert.deepEqual(profiles[0].fields.Model, ["rec12345678901234"]);
  assert.equal(profiles[0].fields.search_aliases, "GWs21\nEwa");
  assert.equal(profiles[0].fields.include_in_public_kenji, "No");
  assert.equal(Object.hasOwn(profiles[0].fields, "rate"), false);
  assert.equal(Object.hasOwn(profiles[0].fields, "availability"), false);
  assert.equal(Object.hasOwn(profiles[0].fields, "approved_client_visibility"), false);

  const audit = await handleKenjiModelAdminRequest(
    workflowRequest(`/v1/admin/kenji/models/reviews/${requestId}/audit`),
    ENV,
    { fetchImpl: harness.fetchImpl }
  );
  const auditBody = await audit.json();
  assert.equal(audit.status, 200);
  assert.equal(auditBody.stage, "published");
  assert.deepEqual(auditBody.events.map((event) => event.action), ["submit_review", "review_approved", "qa_passed", "publish"]);
  assert.equal(auditBody.count, 4);

  const reviewPayload = JSON.parse(harness.getReview().fields.payload_json);
  assert.equal(reviewPayload.workflow.published_profile_id, "recProfile123456789");
  assert.equal(reviewPayload.workflow.published_profile_version, 1);
  assert.equal(harness.getReview().fields.request_status, "published");
});

test("QA fails closed when operator evidence is incomplete and Production stays unchanged", async () => {
  const harness = makeHarness();
  const requestId = "kenji_model_keyword_req_1234567890abcdef12345678";
  await handleKenjiModelAdminRequest(
    workflowRequest(`/v1/admin/kenji/models/reviews/${requestId}/review`, "POST", { expected_version: 1 }, "review-failcase-123"),
    ENV,
    { fetchImpl: harness.fetchImpl }
  );

  const qa = await handleKenjiModelAdminRequest(
    workflowRequest(`/v1/admin/kenji/models/reviews/${requestId}/qa`, "POST", {
      expected_version: 2,
      qa: { policy_path_match: true },
    }, "qa-failcase-123456"),
    ENV,
    { fetchImpl: harness.fetchImpl }
  );
  const body = await qa.json();
  assert.equal(qa.status, 422);
  assert.equal(body.ok, false);
  assert.equal(body.stage, "review");
  assert.ok(body.qa.errors.some((error) => error.code === "customer_safe_preview_not_checked"));
  assert.equal(harness.getProfiles().length, 0);
});

test("policy-negation wording is allowed while actual price data remains blocked", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if ((init.method || "GET") === "GET") return response({ records: [] });
    return response({ records: [{ id: "recReview123456789" }] }, 201);
  };

  const allowed = await handleKenjiModelAdminRequest(
    new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "negation-policy-123456" },
      body: JSON.stringify({
        model_key: "gws21-ewa",
        working_name: "Ewa",
        customer_safe_remark: "ห้ามบอกราคา และห้ามบอกคิว",
      }),
    }),
    ENV,
    { fetchImpl }
  );
  assert.equal(allowed.status, 201);

  const blocked = await handleKenjiModelAdminRequest(
    new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "actual-price-123456" },
      body: JSON.stringify({
        model_key: "gws21-ewa",
        working_name: "Ewa",
        customer_safe_remark: "ราคา 8,000 บาท",
      }),
    }),
    ENV,
    { fetchImpl }
  );
  assert.equal(blocked.status, 400);
  assert.equal((await blocked.json()).error, "customer_safe_remark_failed_guard");
});

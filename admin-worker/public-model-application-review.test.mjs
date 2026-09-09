import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_MODEL_ASSET_FIELDS,
  PUBLIC_MODEL_REVIEW_FIELDS,
  handlePublicModelApplicationReviewRequest,
  isPublicModelApplicationReviewRequest,
} from "./src/public-model-application-review.js";
import { normalizeNext } from "./src/admin-login-hero-worker.js";

const APP_ID = "pma_20260906_abcdefgh";
const APP_RECORD_ID = "recPublicModelApp01";
const ASSET_ID = "pmua_abcdefgh1234";
const ASSET_RECORD_ID = "recPublicAsset01";
const APP_TABLE = "tblwUa8ySWln8OfaJ";
const ASSET_TABLE = "tblEhg3dsFzPERpNQ";

const payload = {
  application_type: "public_model",
  nickname: "ไม้เรียว",
  age: 28,
  height_cm: 174,
  weight_kg: 64,
  location: "กรุงเทพ,พัทยา,นครราชสีมา",
  occupation_detail: "พนักงานบริษัทรถยนต์ไทย 10 ปี",
  intro: "มืออาชีพ เฟรนด์ลี่ ตรงปก",
  experience: "พนักงานบริษัทรถยนต์ไทย 10 ปี",
  skills: "ไทย อังกฤษเล็กน้อย",
  boundaries: "ไม่รับงานผิดกฎหมาย สารเสพติดทุกชนิด",
  mmd_public_model_category: "เพื่อนกิน เพื่อนเที่ยว",
  mmd_public_customer_scope: ["ผู้หญิง", "ผู้ชาย", "LGBT", "ต่างชาติ"],
  mmd_previous_work_background: ["เคยรับงานเอง", "เคยทำกับ agency"],
  mmd_previous_agency_or_venue: "งานเพื่อนเที่ยว",
  mmd_worked_independently_before: true,
  mmd_experience_years: 2,
  mmd_experience_months: 0,
  lgbt_professional: "comfortable_or_reviewed",
  privacy_level: "approval_before_public_use",
};

function appRecord() {
  return {
    id: APP_RECORD_ID,
    fields: {
      [PUBLIC_MODEL_REVIEW_FIELDS.applicationId]: APP_ID,
      [PUBLIC_MODEL_REVIEW_FIELDS.applicationType]: "public_model",
      [PUBLIC_MODEL_REVIEW_FIELDS.nickname]: "ไม้เรียว",
      [PUBLIC_MODEL_REVIEW_FIELDS.payloadJson]: JSON.stringify(payload),
      [PUBLIC_MODEL_REVIEW_FIELDS.status]: { name: "New" },
      [PUBLIC_MODEL_REVIEW_FIELDS.reviewStatus]: { name: "pending_review" },
      [PUBLIC_MODEL_REVIEW_FIELDS.intakeStatus]: "private_review_pending",
      [PUBLIC_MODEL_REVIEW_FIELDS.submittedAt]: "2026-09-06T05:41:04.000Z",
      [PUBLIC_MODEL_REVIEW_FIELDS.notes]: "",
    },
  };
}

function assetRecord() {
  return {
    id: ASSET_RECORD_ID,
    fields: {
      [PUBLIC_MODEL_ASSET_FIELDS.assetId]: ASSET_ID,
      [PUBLIC_MODEL_ASSET_FIELDS.applicationId]: APP_ID,
      [PUBLIC_MODEL_ASSET_FIELDS.kind]: { name: "photo" },
      [PUBLIC_MODEL_ASSET_FIELDS.role]: "other_photo",
      [PUBLIC_MODEL_ASSET_FIELDS.fileName]: "IMG_8562.jpeg",
      [PUBLIC_MODEL_ASSET_FIELDS.contentType]: "image/jpeg",
      [PUBLIC_MODEL_ASSET_FIELDS.bucket]: "mmd-private-public-model-uploads",
      [PUBLIC_MODEL_ASSET_FIELDS.objectKey]: "public-model/v1/private/example.jpg",
      [PUBLIC_MODEL_ASSET_FIELDS.uploadStatus]: { name: "attached" },
      [PUBLIC_MODEL_ASSET_FIELDS.reviewStatus]: { name: "pending_review" },
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function createEnv() {
  let application = appRecord();
  let asset = assetRecord();
  const calls = [];
  const env = {
    AIRTABLE_API_KEY: "test-airtable-key",
    PUBLIC_MODEL_UPLOADS_R2: {
      async get(key) {
        assert.equal(key, asset.fields[PUBLIC_MODEL_ASSET_FIELDS.objectKey]);
        return { body: new Uint8Array([255, 216, 255]), size: 3, httpMetadata: { contentType: "image/jpeg" } };
      },
    },
    AIRTABLE_FETCH: async (url, init = {}) => {
      const parsed = new URL(url);
      const method = String(init.method || "GET").toUpperCase();
      calls.push({ url: parsed.toString(), method, body: init.body ? JSON.parse(init.body) : null });
      if (parsed.pathname.includes(`/${APP_TABLE}/${APP_RECORD_ID}`) && method === "PATCH") {
        const body = JSON.parse(init.body);
        application = { ...application, fields: { ...application.fields, ...body.fields } };
        return jsonResponse(application);
      }
      if (parsed.pathname.endsWith(`/${APP_TABLE}`) && method === "GET") {
        return jsonResponse({ records: [application] });
      }
      if (parsed.pathname.endsWith(`/${ASSET_TABLE}`) && method === "GET") {
        return jsonResponse({ records: [asset] });
      }
      if (parsed.pathname.endsWith(`/${ASSET_TABLE}`) && method === "PATCH") {
        const body = JSON.parse(init.body);
        const update = body.records?.find((record) => record.id === ASSET_RECORD_ID);
        if (update) asset = { ...asset, fields: { ...asset.fields, ...update.fields } };
        return jsonResponse({ records: [asset] });
      }
      return jsonResponse({ error: { type: "UNEXPECTED_TEST_REQUEST" } }, 500);
    },
  };
  return { env, calls, getApplication: () => application, getAsset: () => asset };
}

test("route matcher covers only the dedicated Public Model review surface", () => {
  assert.equal(isPublicModelApplicationReviewRequest("/internal/admin/model-applications"), true);
  assert.equal(isPublicModelApplicationReviewRequest("/v1/admin/model-applications"), true);
  assert.equal(isPublicModelApplicationReviewRequest(`/v1/admin/model-applications/${APP_ID}`), true);
  assert.equal(isPublicModelApplicationReviewRequest("/internal/ceo/models"), false);
});

test("admin login return path preserves the application deep link", () => {
  const next = normalizeNext(`/internal/admin/model-applications?application_id=${APP_ID}`);
  assert.equal(next, `/internal/admin/model-applications?application_id=${APP_ID}`);
});

test("review page is purpose-built and exposes explicit decision actions", async () => {
  const response = await handlePublicModelApplicationReviewRequest(new Request("https://mmdbkk.com/internal/admin/model-applications"), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-admin-surface"), "public-model-application-review");
  const html = await response.text();
  assert.match(html, /Public Model Applications/);
  assert.match(html, /อนุมัติใบสมัคร/);
  assert.match(html, /ไม่รับ/);
  assert.match(html, /ขอดูต่อ \/ กำลังพิจารณา/);
  assert.match(html, /ไม่เปิด Public visibility/);
});

test("detail endpoint returns review-ready applicant context and private asset proxy only", async () => {
  const { env } = createEnv();
  const response = await handlePublicModelApplicationReviewRequest(new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}`), env, { id: "per" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.application.nickname, "ไม้เรียว");
  assert.equal(body.application.height_cm, 174);
  assert.equal(body.application.weight_kg, 64);
  assert.equal(body.application.intro, "มืออาชีพ เฟรนด์ลี่ ตรงปก");
  assert.equal(body.application.public_model_category, "เพื่อนกิน เพื่อนเที่ยว");
  assert.deepEqual(body.application.customer_scope, ["ผู้หญิง", "ผู้ชาย", "LGBT", "ต่างชาติ"]);
  assert.equal(body.application.assets[0].asset_id, ASSET_ID);
  assert.equal(body.application.assets[0].url, `/v1/admin/model-applications/${APP_ID}/assets/${ASSET_ID}`);
  assert.equal("object_key" in body.application.assets[0], false);
  assert.doesNotMatch(JSON.stringify(body), /public-model\/v1\/private\/example\.jpg/);
});

test("attached private image is streamed only through the application-scoped asset proxy", async () => {
  const { env } = createEnv();
  const response = await handlePublicModelApplicationReviewRequest(new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}/assets/${ASSET_ID}`), env, { id: "per" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [255, 216, 255]);
});

test("approve writes canonical review state, approves attached assets, and never publishes a profile", async () => {
  const state = createEnv();
  const request = new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://mmdbkk.com" },
    body: JSON.stringify({ decision: "approve", note: "เหมาะกับ Public lane" }),
  });
  const response = await handlePublicModelApplicationReviewRequest(request, state.env, { id: "per" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.decision, "approve");
  assert.equal(body.publishes_model, false);
  assert.equal(body.next_step, "onboarding_ready");
  const application = state.getApplication();
  assert.equal(application.fields[PUBLIC_MODEL_REVIEW_FIELDS.status], "Approved");
  assert.equal(application.fields[PUBLIC_MODEL_REVIEW_FIELDS.reviewStatus], "accepted");
  assert.equal(application.fields[PUBLIC_MODEL_REVIEW_FIELDS.intakeStatus], "approved");
  assert.equal(application.fields[PUBLIC_MODEL_REVIEW_FIELDS.handler], "per");
  assert.match(application.fields[PUBLIC_MODEL_REVIEW_FIELDS.notes], /เหมาะกับ Public lane/);
  assert.equal(state.getAsset().fields[PUBLIC_MODEL_ASSET_FIELDS.reviewStatus], "approved");
});

test("decision mutation rejects cross-origin requests before Airtable writes", async () => {
  const state = createEnv();
  const request = new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ decision: "approve" }),
  });
  const response = await handlePublicModelApplicationReviewRequest(request, state.env, { id: "per" });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: "forbidden_origin" });
  assert.equal(state.calls.length, 0);
});

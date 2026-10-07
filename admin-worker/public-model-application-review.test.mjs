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

function createEnv({ modelRecords = [], includeAsset = true } = {}) {
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
        return jsonResponse({ records: includeAsset ? [asset] : [] });
      }
      if (parsed.pathname.endsWith("/Models") && method === "GET") {
        return jsonResponse({ records: modelRecords });
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

test("contact-first application can stay pending without photos but cannot be approved yet", async () => {
  const state = createEnv({ includeAsset: false });
  const request = new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://mmdbkk.com" },
    body: JSON.stringify({ decision: "approve" }),
  });
  const response = await handlePublicModelApplicationReviewRequest(request, state.env, { id: "per" });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error, "application_media_required_for_approval");
  assert.equal(body.state, "needs_media");
  assert.equal(state.getApplication().fields[PUBLIC_MODEL_REVIEW_FIELDS.intakeStatus], "private_review_pending");
});

test("approval blocks a working-name collision until Per explicitly confirms the same Model record", async () => {
  const modelId = "rec12345678901234";
  const modelRecords = [{ id: modelId, fields: { working_name: "ไม้เรียว", aliases: "Old Alias" } }];
  const state = createEnv({ modelRecords });
  const request = (body) => new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://mmdbkk.com" },
    body: JSON.stringify(body),
  });

  let response = await handlePublicModelApplicationReviewRequest(request({ decision: "approve" }), state.env, { id: "per" });
  assert.equal(response.status, 409);
  let body = await response.json();
  assert.equal(body.error, "working_name_conflict");
  assert.deepEqual(body.conflicts, [{ model_record_id: modelId, working_name: "ไม้เรียว" }]);

  response = await handlePublicModelApplicationReviewRequest(request({ decision: "approve", linked_model_id: modelId }), state.env, { id: "per" });
  assert.equal(response.status, 200);
  body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.linked_model_id, modelId);
  assert.match(state.getApplication().fields[PUBLIC_MODEL_REVIEW_FIELDS.notes], new RegExp(modelId));
});

test("GWs and EMs run-number names stay reserved for system assignment", async () => {
  const state = createEnv();
  const application = state.getApplication();
  application.fields[PUBLIC_MODEL_REVIEW_FIELDS.nickname] = "GWs19";
  const request = new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://mmdbkk.com" },
    body: JSON.stringify({ decision: "approve" }),
  });
  const response = await handlePublicModelApplicationReviewRequest(request, state.env, { id: "per" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "reserved_working_name");
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

test("Medical Professional policy is verified and brief-only before a public profile can be opened", async () => {
  const state = createEnv();
  const base = `https://mmdbkk.com/v1/admin/model-applications/${APP_ID}/role-policy`;
  const request = (body) => new Request(base, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://mmdbkk.com" },
    body: JSON.stringify(body),
  });

  let response = await handlePublicModelApplicationReviewRequest(request({
    approved_roles: ["medical_professional"],
    booking_mode: "curated",
    public_profile_approved: false,
    credential_status: "pending",
  }), state.env, { id: "per" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, error: "medical_brief_only_required" });

  response = await handlePublicModelApplicationReviewRequest(request({
    approved_roles: ["medical_professional"],
    booking_mode: "brief_only",
    public_profile_approved: true,
    credential_status: "pending",
  }), state.env, { id: "per" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, error: "medical_credential_verification_required" });

  response = await handlePublicModelApplicationReviewRequest(request({
    approved_roles: ["medical_professional"],
    booking_mode: "brief_only",
    public_profile_approved: true,
    credential_status: "verified",
    credential_notes: "Verified internally",
  }), state.env, { id: "per" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(state.getApplication().fields[PUBLIC_MODEL_REVIEW_FIELDS.bookingMode], "brief_only");
  assert.equal(state.getApplication().fields[PUBLIC_MODEL_REVIEW_FIELDS.credentialStatus], "verified");
});

test("rendered review script compiles and starts queue and detail loading", async () => {
  const { Script } = await import("node:vm");
  const response = await handlePublicModelApplicationReviewRequest(new Request("https://mmdbkk.com/internal/admin/model-applications"));
  const html = await response.text();
  const source = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(source, "review page must include its bootstrap script");
  const script = new Script(source);
  for (const query of ["", "?application_id=" + APP_ID]) {
    const app = { className: "loading", textContent: "กำลังโหลดใบสมัคร…" };
    const requests = [];
    await script.runInNewContext({
      document: { querySelector: (selector) => selector === "#app" ? app : {} },
      location: { href: "https://mmdbkk.com/internal/admin/model-applications" + query },
      URL,
      fetch: async (path) => {
        requests.push(path);
        return { ok: false, status: 503, json: async () => ({ ok: false, error: "test_backend_unavailable" }) };
      },
    });
    assert.equal(requests[0], query ? "/v1/admin/model-applications/" + APP_ID : "/v1/admin/model-applications?limit=30");
    assert.equal(app.className, "card error");
    assert.match(app.textContent, /test_backend_unavailable/);
  }
});

test("queue read returns a JSON 503 instead of throwing when Airtable is not configured", async () => {
  const response = await handlePublicModelApplicationReviewRequest(
    new Request("https://mmdbkk.com/v1/admin/model-applications", { headers: { Origin: "https://mmdbkk.com" } }),
    {},
    null,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "public_model_review_airtable_not_configured" });
});

test("detail read returns a JSON 502 when Airtable rejects the request", async () => {
  const response = await handlePublicModelApplicationReviewRequest(
    new Request(`https://mmdbkk.com/v1/admin/model-applications/${APP_ID}`, { headers: { Origin: "https://mmdbkk.com" } }),
    {
      AIRTABLE_API_KEY: "test",
      AIRTABLE_FETCH: async () => new Response(JSON.stringify({ error: { type: "INVALID_PERMISSIONS" } }), { status: 403 }),
    },
    null,
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, error: "public_model_review_airtable_failed", provider: "INVALID_PERMISSIONS" });
});

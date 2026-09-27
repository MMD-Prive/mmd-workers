import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ModelCardCoordinator, enqueuePrimaryCard, handleStudioCards, safeCardJob } from "./src/model-card-automation.js";
import { projectCardDesign, cardPortraitPrompt, cardHtml, CARD_STYLES } from "./src/model-card-design.js";
import modelWorker from "./src/model-liff-worker-legacy.js";
import studioWorker from "./src/studio-real-worker.js";
import activeWorker from "./src/admin-login-hero-worker.js";

const modelId = "recModel000000001", mediaId = "recMedia000000001";
const mediaRef = "media_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
function model(overrides = {}) {
  return { id: modelId, fields: { status: "active", working_name: "Jasper", suffix_code: "OP", height_cm: 178, weight_kg: 65, sales_layer: "private", orientation_label: "gay", ...overrides } };
}
function png(width, height) {
  // Header fixture; state tests are separate from actual browser rendering.
  const bytes = new Uint8Array(32);
  bytes.set([137,80,78,71,13,10,26,10], 0); bytes.set([73,72,68,82], 12);
  new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
class Storage {
  data = new Map(); alarmAt = null; chain = Promise.resolve();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async setAlarm(at) { this.alarmAt = at; }
  async deleteAlarm() { this.alarmAt = null; }
  transaction(action) { const result = this.chain.then(() => action(this)); this.chain = result.catch(() => {}); return result; }
}
function harness(t) {
  const objects = new Map(), instances = new Map();
  const calls = { images: 0, renders: 0, dbWrites: 0, html: "", form: null, apiFailure: false, renderFailure: false, changeAfterGenerate: false, dbFailure: false, outputSize: [1322, 1200] };
  const sourceKey = `models/${modelId}/profile_photo/${mediaRef}.png`;
  const records = { model: model(), media: { id: mediaId, fields: { Model: [modelId], media_id: mediaRef, media_type: "profile_photo", asset_role: "profile_main", public_safe: true, review_status: "approved", media_visibility: "public_candidate", private_original_key: sourceKey, file_type: "image/png" } } };
  const bucket = {
    async put(key, value, options = {}) { objects.set(key, { bytes: typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value), ...options }); return { etag: key }; },
    async head(key) { const x = objects.get(key); return x ? { size: x.bytes.length, etag: key, httpMetadata: x.httpMetadata || {}, customMetadata: x.customMetadata || {} } : null; },
    async get(key) { const x = objects.get(key); if (!x) return null; return { ...await this.head(key), body: new Blob([x.bytes]).stream(), arrayBuffer: async () => x.bytes.slice().buffer, json: async () => JSON.parse(new TextDecoder().decode(x.bytes)) }; },
    async list({ prefix }) { return { objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: false }; },
  };
  objects.set(sourceKey, { bytes: png(800, 900), customMetadata: { model_record_id: modelId }, httpMetadata: { contentType: "image/png" } });
  for (const key of ["studio-card-brand/mmd.png", "studio-card-brand/sigil.webp"]) objects.set(key, { bytes: png(80, 80), httpMetadata: { contentType: "image/png" } });
  const env = {
    ALLOWED_ORIGINS: "https://mmdbkk.com",
    MODEL_CARD_AUTO_ENABLED: "true", MODEL_CARD_DAILY_LIMIT: "20", MMD_MODEL_ASSETS: bucket,
    AIRTABLE_API_KEY: "test-airtable", AIRTABLE_BASE_ID: "appTest", AIRTABLE_TABLE_MODELS: "Models",
    OPENAI_IMAGE_API_KEY: "test-image-secret", MODEL_SESSION_SIGNING_SECRET: "test-session-secret",
    MODEL_CARD_MMD_LOGO_KEY: "studio-card-brand/mmd.png", MODEL_CARD_SIGIL_LOGO_KEY: "studio-card-brand/sigil.webp",
    MODEL_CARD_BROWSER: { async quickAction(action, options) {
      calls.renders++; calls.html = options.html;
      assert.equal(action, "screenshot"); assert.deepEqual(options.viewport, { width: 1322, height: 1200, deviceScaleFactor: 1 });
      if (calls.renderFailure) return new Response("unavailable", { status: 503 });
      return new Response(png(...calls.outputSize));
    } },
  };
  env.MODEL_CARD_COORDINATOR = { idFromName: (x) => x, get(key) {
    if (!instances.has(key)) instances.set(key, new ModelCardCoordinator({ storage: new Storage() }, env));
    return instances.get(key);
  } };
  const original = globalThis.fetch;
  globalThis.fetch = async (request, options = {}) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.host === "api.openai.com") {
      calls.images++; calls.form = options.body;
      assert.equal(options.headers.authorization, "Bearer test-image-secret");
      if (calls.apiFailure) throw new Error("timed out with private provider detail");
      if (calls.changeAfterGenerate) records.media.fields.asset_role = "gallery_candidate";
      return Response.json({ data: [{ b64_json: Buffer.from(png(1328, 1200)).toString("base64") }] });
    }
    assert.equal(url.host, "api.airtable.com");
    if (options.method === "PATCH") {
      calls.dbWrites++;
      if (calls.dbFailure) return Response.json({ error: "unavailable" }, { status: 503 });
      const body = JSON.parse(options.body); Object.assign(records.media.fields, body.records[0].fields);
      return Response.json({ records: [records.media] });
    }
    if (url.pathname.endsWith(modelId)) return Response.json(records.model);
    if (url.pathname.endsWith(mediaId)) return Response.json(records.media);
    return Response.json({ records: [records.media] });
  };
  t.after(() => { globalThis.fetch = original; });
  return { env, calls, records, objects, sourceKey, instances,
    coordinator: () => env.MODEL_CARD_COORDINATOR.get(`model-card:${modelId}`),
    job: async () => env.MODEL_CARD_COORDINATOR.get(`model-card:${modelId}`).ctx.storage.get("job"),
  };
}
function sessionCookie() {
  const body = Buffer.from(JSON.stringify({ kind: "model_session", role: "model", model_record_id: modelId, exp: Math.floor(Date.now()/1000)+600 })).toString("base64url");
  return `mmd_model_session_v1=${body}.${createHmac("sha256", "test-session-secret").update(body).digest("hex")}`;
}
function modelRequest(path, method = "GET", body) {
  return new Request(`https://mmdbkk.com${path}`, { method, headers: { origin: "https://mmdbkk.com", cookie: sessionCookie(), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test("seven directions follow canonical metadata; labels stay hidden, exclusive faces differ", () => {
  const fixtures = {
    ST: { orientation_label: "straight" }, GY: {}, FR: { catalog_group: "Farang" },
    EN: { sales_layer: "public", "MMD Public Category": "Travel" },
    EX: { sales_layer: "public", "MMD Public Category": "Extreme" },
    GWs: { recognition_class: "GWs", working_name: "GWs19" }, EMs: { recognition_class: "EMs", working_name: "EMs11" },
  };
  for (const [field, fields] of Object.entries(fixtures)) {
    const result = projectCardDesign(model(fields)); assert.equal(result.ok, true);
    assert.equal(result.design.field, field); assert.equal(result.design.accent, CARD_STYLES[field].accent);
    assert.equal(result.design.identity, ["GWs", "EMs"].includes(field) ? "distinct_resemblance" : "preserve");
    const image = "data:image/png;base64,AA==";
    const html = cardHtml(result.design, image, image);
    assert.doesNotMatch(html, />\s*(cm|kg|Straight|Gay|Private)\s*</);
    assert.match(cardPortraitPrompt(result.design), /no text, numbers, faint digits/i);
  }
});
test("missing/ambiguous classification or assigned identity pauses instead of inventing", () => {
  for (const fields of [{ sales_layer: "both" }, { orientation_label: "" }, { suffix_code: "" }, { recognition_class: "EMs", working_name: "Someone" }, { recognition_class: "EMs", exclusive_group: "GWs" }, { height_cm: 0 }, { status: "inactive" }]) assert.equal(projectCardDesign(model(fields)).ok, false);
  const publicExclusive = projectCardDesign(model({ sales_layer: "public", "MMD Public Category": "Travel", recognition_class: "EMs" }));
  assert.ok(publicExclusive.missing.includes("exclusive_public_direction_required"));
});
test("province is explicit; old CNX folder cannot put CM on a BKK card", () => {
  const bonn = model({ working_name: "Bonn", suffix_code: "CN", folder_name: "Bonn CNX", height_cm: 175, weight_kg: 73 });
  assert.equal(projectCardDesign(bonn).design.province, "");
  assert.equal(projectCardDesign(bonn, { MODEL_CARD_PROVINCE_BY_MODEL_JSON: JSON.stringify({ [modelId]: "BKK" }) }).design.province, "");
  assert.equal(projectCardDesign(bonn, { MODEL_CARD_PROVINCE_BY_MODEL_JSON: JSON.stringify({ [modelId]: "CM" }) }).design.province, "CM");
});
test("renderer escapes identity text and rejects remote resource injection", () => {
  const design = projectCardDesign(model()).design;
  assert.throws(() => cardHtml(design, "https://private.invalid/image", "data:image/png;base64,AA=="));
  assert.match(cardHtml({ ...design, title: '<img src=x onerror="x">' }, "data:image/png;base64,AA==", "data:image/png;base64,AA=="), /&lt;img/);
});
test("disabled feature creates no background jobs", async (t) => {
  const h = harness(t); h.env.MODEL_CARD_AUTO_ENABLED = "false";
  assert.deepEqual(await enqueuePrimaryCard(h.env, modelId, mediaId), { enabled: false, job: null });
  assert.equal(h.instances.size, 0); assert.equal(h.calls.images, 0);
});
test("concurrent selections and retries result in one job, one paid generation and exact PNG", async (t) => {
  const h = harness(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => enqueuePrimaryCard(h.env, modelId, mediaId)));
  assert.equal(new Set(results.map((r) => r.job.job_id)).size, 1);
  await Promise.all([h.coordinator().alarm(), h.coordinator().alarm()]);
  await h.coordinator().alarm();
  const job = await h.job(); assert.equal(job.state, "awaiting_owner_review");
  assert.equal(h.calls.images, 1); assert.equal(h.calls.renders, 1); assert.equal(h.calls.dbWrites, 0);
  assert.equal(h.calls.form.get("size"), "1328x1200"); assert.equal(h.calls.form.get("n"), "1");
  assert.equal(h.calls.form.get("input_fidelity"), null);
  const list = await (await handleStudioCards(h.env, "/studio/api/model-cards/list", {})).json();
  assert.equal(list.enabled, true);
  h.env.MODEL_CARD_AUTO_ENABLED = "false";
  const pausedList = await (await handleStudioCards(h.env, "/studio/api/model-cards/list", {})).json();
  assert.equal(pausedList.enabled, false); assert.equal(pausedList.jobs.length, 1);
  h.env.MODEL_CARD_AUTO_ENABLED = "true";
  assert.equal(list.jobs[0].model_name, "Jasper OP"); assert.equal(list.jobs[0].published, false);
  const preview = await handleStudioCards(h.env, "/studio/api/model-cards/preview", { model_record_id: modelId, job_id: job.job_id });
  assert.equal(preview.status, 200); assert.equal(preview.headers.get("content-type"), "image/png");
  assert.equal(preview.headers.get("cache-control"), "private, no-store");
  assert.equal((await enqueuePrimaryCard(h.env, modelId, "recMedia000000002")).job.job_id, job.job_id);
  assert.equal(h.calls.images, 1);
});
test("source ownership, approval and main role are checked before any image charge", async (t) => {
  const h = harness(t); h.records.media.fields.Model = ["recOther000000001"];
  await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  assert.equal((await h.job()).state, "source_changed"); assert.equal(h.calls.images, 0);
});
test("missing measurements can resume after canonical profile is completed", async (t) => {
  const h = harness(t); delete h.records.model.fields.weight_kg;
  const queued = await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  assert.equal((await h.job()).state, "waiting_profile"); assert.equal(h.calls.images, 0);
  h.records.model.fields.weight_kg = 65;
  const resumed = await handleStudioCards(h.env, "/studio/api/model-cards/resume", { model_record_id: modelId, job_id: queued.job.job_id });
  assert.equal(resumed.status, 202); await h.coordinator().alarm(); assert.equal((await h.job()).state, "awaiting_owner_review");
});
test("missing approved logo pauses before the paid API", async (t) => {
  const h = harness(t); h.env.MODEL_CARD_SIGIL_LOGO_KEY = "";
  await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  assert.equal((await h.job()).state, "waiting_configuration"); assert.equal(h.calls.images, 0);
});
test("lost provider response is not retried or exposed", async (t) => {
  const h = harness(t); h.calls.apiFailure = true;
  await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm(); await h.coordinator().alarm();
  const job = await h.job(); assert.equal(job.state, "needs_review"); assert.equal(job.error, "generation_result_unknown");
  assert.equal(h.calls.images, 1); assert.equal(safeCardJob(job, true).can_resume, false);
  assert.doesNotMatch(JSON.stringify(safeCardJob(job)), /secret|provider|source_key|private|model_record_id/);
});
test("render-only resume reuses the saved portrait without another image charge", async (t) => {
  const h = harness(t); h.calls.renderFailure = true;
  await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  const job = await h.job(); assert.equal(job.stage, "render"); assert.equal(safeCardJob(job, true).can_resume, true);
  h.calls.renderFailure = false;
  await handleStudioCards(h.env, "/studio/api/model-cards/resume", { model_record_id: modelId, job_id: job.job_id });
  await h.coordinator().alarm(); assert.equal(h.calls.images, 1); assert.equal(h.calls.renders, 2);
  assert.equal((await h.job()).state, "awaiting_owner_review");
});
test("a crash after the paid attempt cannot issue it again", async (t) => {
  const h = harness(t);
  await enqueuePrimaryCard(h.env, modelId, mediaId);
  const job = await h.job(); job.stage = "generate"; job.state = "generating";
  await h.coordinator().ctx.storage.put("job", job);
  await h.coordinator().alarm(); assert.equal((await h.job()).error, "generation_result_unknown"); assert.equal(h.calls.images, 0);
});
test("profile/source changes during generation prevent a reviewable stale card", async (t) => {
  const h = harness(t); h.calls.changeAfterGenerate = true;
  await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  assert.equal((await h.job()).state, "source_changed"); assert.equal(h.calls.renders, 0);
});
test("deleting the source revokes even a previously finished draft preview", async (t) => {
  const h = harness(t); await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  const job = await h.job(); h.objects.delete(h.sourceKey);
  const response = await handleStudioCards(h.env, "/studio/api/model-cards/preview", { model_record_id: modelId, job_id: job.job_id });
  assert.equal(response.status, 409);
});
test("daily budget is atomic across models", async (t) => {
  const h = harness(t); h.env.MODEL_CARD_DAILY_LIMIT = "2";
  const budget = h.env.MODEL_CARD_COORDINATOR.get("model-card:daily-budget");
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => budget.fetch(new Request("https://card.internal/budget", { method: "POST", body: JSON.stringify({ job_id: `card_${String(i).padStart(32, "0")}` }) }))));
  assert.equal(results.filter((r) => r.ok).length, 2);
});
test("actual set-main handler queues only after approved owned image is saved", async (t) => {
  const h = harness(t);
  h.records.media.fields.asset_role = "gallery_candidate";
  const response = await modelWorker.fetch(modelRequest(`/v1/model/media/${mediaRef}/set-main`, "POST"), h.env, {});
  const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.card_generation.job.state, "queued"); assert.equal(h.calls.dbWrites, 1);
  assert.equal(h.records.media.fields.asset_role, "profile_main"); assert.equal(h.calls.images, 0);
});
test("unapproved source cannot enqueue through set-main; unauthenticated status is denied", async (t) => {
  const h = harness(t); h.records.media.fields.review_status = "pending_review";
  const response = await modelWorker.fetch(modelRequest(`/v1/model/media/${mediaRef}/set-main`, "POST"), h.env, {});
  assert.equal(response.status, 409); assert.equal(h.instances.size, 0);
  const unauth = await modelWorker.fetch(new Request("https://mmdbkk.com/v1/model/media/card-status"), h.env, {});
  assert.equal(unauth.status, 401);
});
test("card queue outage does not misreport a successful profile save", async (t) => {
  const h = harness(t); delete h.env.MODEL_CARD_COORDINATOR;
  const response = await modelWorker.fetch(modelRequest(`/v1/model/media/${mediaRef}/set-main`, "POST"), h.env, {});
  const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.ok, true);
  assert.equal(body.card_generation.error, "card_queue_unavailable");
});
test("Studio draft endpoints keep the existing authentication boundary", async (t) => {
  const h = harness(t);
  for (const path of ["list", "preview", "resume"]) {
    const response = await studioWorker.fetch(new Request(`https://mmdbkk.com/studio/api/model-cards/${path}`, { method: "POST", headers: { origin: "https://mmdbkk.com", "content-type": "application/json" }, body: "{}" }), h.env, {});
    assert.equal(response.status, 401);
  }
  assert.equal(h.calls.images, 0);
});
test("active production entrypoint reaches the primary-photo trigger", async (t) => {
  const h = harness(t);
  const response = await activeWorker.fetch(modelRequest(`/v1/model/media/${mediaRef}/set-main`, "POST"), h.env, { waitUntil() {} });
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.card_generation.job.state, "queued");
});
test("failed primary-photo save never queues a generation", async (t) => {
  const h = harness(t); h.calls.dbFailure = true;
  const response = await modelWorker.fetch(modelRequest(`/v1/model/media/${mediaRef}/set-main`, "POST"), h.env, {});
  assert.equal(response.status, 503); assert.equal(h.instances.size, 0);
});
test("wrong renderer dimensions never become a ready draft", async (t) => {
  const h = harness(t); h.calls.outputSize = [1328, 1200];
  await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  const job = await h.job(); assert.equal(job.state, "needs_review"); assert.equal(job.error, "card_dimensions_invalid");
  assert.equal(h.objects.has(h.coordinator().key(job, "card.png")), false);
});
test("a preflight hold can use a corrected primary without allocating another job", async (t) => {
  const h = harness(t); h.records.media.fields.file_type = "image/heic";
  const first = await enqueuePrimaryCard(h.env, modelId, mediaId); await h.coordinator().alarm();
  assert.equal((await h.job()).state, "waiting_profile");
  h.records.media.fields.file_type = "image/png";
  const again = await enqueuePrimaryCard(h.env, modelId, mediaId);
  assert.equal(again.job.job_id, first.job.job_id); assert.equal(again.job.state, "queued");
  await h.coordinator().alarm(); assert.equal(h.calls.images, 1);
});

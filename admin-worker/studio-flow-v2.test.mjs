import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { handleStudioRequest } from "./src/studio-real-worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const MODEL_ID = "recModel0000000001";
const ENV = {
  ADMIN_BEARER: "studio-flow-test-admin",
  INTERNAL_API_TOKEN: "studio-flow-test-internal",
  CONFIRM_KEY: "studio-flow-test-confirm",
  AIRTABLE_BASE_ID: "base1",
  AIRTABLE_API_KEY: "test-airtable",
  AIRTABLE_TABLE_CONSOLE_INBOX_ID: "tblConsole",
  AIRTABLE_TABLE_MODELS: "Models",
  ALLOWED_ORIGINS: "https://mmdbkk.com",
  STUDIO_ASSET_SIGNING_SECRET: "studio-flow-asset-secret",
};
const ORIGINAL_FETCH = globalThis.fetch;
test.after(() => { globalThis.fetch = ORIGINAL_FETCH; });

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function cookie() {
  const now = Date.now();
  const payload = base64url(JSON.stringify({ version: 1, scope: "internal_admin", host: "https://mmdbkk.com", iat: now, exp: now + 3_600_000, nonce: "studio-flow-test", auth_method: "bearer" }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ENV.ADMIN_BEARER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `mmd_admin_gate_v1=${encodeURIComponent(`${payload}.${base64url(signature)}`)}`;
}

async function call(env, path, body, options = {}) {
  const headers = { origin: "https://mmdbkk.com", "content-type": "application/json", ...(options.headers || {}) };
  if (options.authed !== false) headers.cookie = options.cookie || await cookie();
  const method = options.method || "POST";
  return handleStudioRequest(new Request(`https://mmdbkk.com/studio/api/${path}`, {
    method, headers, ...(method === "POST" ? { body: JSON.stringify(body || {}) } : {}),
  }), env);
}

function fixture() {
  const records = new Map();
  const models = new Map([[MODEL_ID, { id: MODEL_ID, fields: { working_name: "Ice T", sales_layer: "private", orientation_label: "straight", height_cm: 178, weight_kg: 68, status: "active" } }]]);
  const calls = [];
  const objects = new Map();
  const r2Calls = [];
  let sequence = 0;
  const state = { failLookup: false, failModel: false, loseCreateReply: false, afterCreate: null };
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const parts = parsed.pathname.split("/").map(decodeURIComponent);
    const table = parts[3], id = parts[4];
    const method = init.method || "GET";
    calls.push({ table, id, method, url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (table === "Models") {
      if (state.failModel) return Response.json({ error: "upstream unavailable" }, { status: 503 });
      if (id) return models.has(id) ? Response.json(models.get(id)) : Response.json({}, { status: 404 });
      return Response.json({ records: [...models.values()] });
    }
    if (method === "GET" && id) return records.has(id) ? Response.json(records.get(id)) : Response.json({}, { status: 404 });
    if (method === "GET") {
      if (state.failLookup) return Response.json({ error: { message: "unknown field" } }, { status: 422 });
      const match = parsed.searchParams.get("filterByFormula")?.match(/^\{(inbox_id|idempotency_key)\}="([A-Za-z0-9._:-]+)"$/);
      return Response.json({ records: [...records.values()].filter((record) => match && record.fields[match[1]] === match[2]) });
    }
    if (method === "POST") {
      const created = { id: `rec${String(++sequence).padStart(14, "0")}`, fields: JSON.parse(init.body).fields };
      records.set(created.id, created);
      state.afterCreate?.(created);
      if (state.loseCreateReply) { state.loseCreateReply = false; throw new Error("response lost after create"); }
      return Response.json(created);
    }
    if (method === "PATCH" && records.has(id)) {
      Object.assign(records.get(id).fields, JSON.parse(init.body).fields);
      return Response.json(records.get(id));
    }
    throw new Error(`Unexpected mutation ${method}`);
  };
  const binding = {
    async put(key, value, options) {
      r2Calls.push({ op: "put", key });
      if (objects.has(key)) return null;
      const object = { key, size: value.byteLength, bytes: new Uint8Array(value), httpMetadata: options.httpMetadata, customMetadata: options.customMetadata, checksums: { sha256: options.sha256 } };
      objects.set(key, object);
      return object;
    },
    async head(key) { r2Calls.push({ op: "head", key }); return objects.get(key) || null; },
    async get(key) {
      r2Calls.push({ op: "get", key });
      const object = objects.get(key);
      return object ? { ...object, body: new Response(object.bytes).body } : null;
    },
  };
  const env = { ...ENV, MMD_MODEL_ASSETS: binding };
  return { env, records, models, calls, objects, r2Calls, state };
}

async function upload(f, index = 0) {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, index]);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), `photo-${index}.png`);
  const response = await handleStudioRequest(new Request("https://mmdbkk.com/studio/api/upload", {
    method: "POST", headers: { origin: "https://mmdbkk.com", cookie: await cookie(), "Idempotency-Key": `studio-flow-upload-${index}` }, body: form,
  }), f.env);
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  return { asset_id: data.asset_id, name: `photo-${index}.png`, size: data.size, type: data.content_type };
}

function intakeBody(files, changes = {}) {
  return {
    flow_version: 2, idempotency_key: "studio-flow-intake-001", model_name: "Ice T", model_record_id: MODEL_ID,
    field: "ST", layer: "Private / SIGIL", run_number: "", template_hint: "sigil-straight-bronze",
    files, main_asset_id: files[0]?.asset_id, audiences: ["public", "private"], consent: true,
    height_cm: 178, weight_kg: 68, category: "Premium", gender: "male", client_types: "both",
    drive_folder: "https://drive.google.com/drive/folders/reference-only", promotion_albums: ["new-coming", "mmd-recommend"],
    note: "เก็บอ้างอิงเพื่อตรวจงาน", compcard_family: "A", visual_variant_number: 3, title: "ชื่อรอง",
    ...changes,
  };
}

function reviewBody(id, changes = {}) {
  return { flow_version: 2, idempotency_key: "studio-flow-review-001", studio_intake_id: id, decision: "Approved Direction", checklist: { identity: true, photo: true, safe: true }, final_note: "ตรวจเรียบร้อย", ...changes };
}

async function saveIntake(f, changes = {}, files) {
  const body = intakeBody(files || [await upload(f)], changes);
  const response = await call(f.env, "intake/commit", body);
  assert.equal(response.status, 200, await response.clone().text());
  return { body, receipt: await response.json() };
}

async function saveReview(f, intake, changes = {}) {
  const body = reviewBody(intake.receipt.studio_intake_id, changes);
  const response = await call(f.env, "review/commit", body);
  assert.equal(response.status, 200, await response.clone().text());
  return { body, receipt: await response.json() };
}

function writes(f) { return f.calls.filter((call) => call.method !== "GET"); }
function payload(f, id) { return JSON.parse(f.records.get(id).fields.payload_json); }
function setPayload(f, id, value) { f.records.get(id).fields.payload_json = JSON.stringify(value); }

function seedMyCard(f, modelId = MODEL_ID) {
  const id = "recRequest00000001";
  f.records.set(id, { id, fields: {
    source: "mmd_model_my_card", status: "model_request_pending",
    payload_json: JSON.stringify({ model_record_id: modelId, model: { working_name: "Ice T" }, selected_media: { media_id: "media_12345678", object_key: "models/private-original" } }),
  } });
  return id;
}

test("V2 intake retains the multi-photo business fields and reads only a safe projection", async () => {
  const f = fixture();
  const files = [await upload(f), await upload(f, 1)];
  const saved = await saveIntake(f, { main_asset_id: files[1].asset_id, untrusted_extra: { arbitrary: "not persisted" } }, files);
  const stored = payload(f, saved.receipt.studio_intake_id);
  assert.equal(stored.raw, undefined);
  assert.equal(stored.normalized.untrusted_extra, undefined);
  assert.equal(stored.normalized.model_context.ready, true);
  stored.raw = { private_original_key: "private-secret", authorization: "private-token" };
  stored.normalized.storage_key = "private-secret";
  stored.normalized.model_context.context.private_detail = "private-token";
  setPayload(f, saved.receipt.studio_intake_id, stored);
  const before = writes(f).length;
  const response = await call(f.env, "intake/read", { studio_intake_id: saved.receipt.studio_intake_id });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(data.intake.studio_intake_id, saved.receipt.studio_intake_id);
  for (const key of ["category", "audiences", "gender", "client_types", "drive_folder", "promotion_albums", "note", "consent", "height_cm", "weight_kg", "compcard_family", "visual_variant_number", "title", "model_record_id", "main_asset_id"]) assert.deepEqual(data.intake[key], saved.body[key]);
  assert.deepEqual(data.intake.files, files);
  assert.deepEqual(data.intake.asset_ids, files.map((file) => file.asset_id));
  assert.equal(JSON.stringify(data).includes("private-secret"), false);
  assert.equal(JSON.stringify(data).includes("private-token"), false);
  assert.equal(data.intake.idempotency_key, undefined);
  assert.equal(data.intake.drive, undefined);
  assert.equal(writes(f).length, before);
});

test("all new reads require the signed admin session and same-origin gate before I/O", async () => {
  const f = fixture();
  for (const path of ["intake/read", "review/read", "assets/read", "model-context", "models/search"]) {
    const response = await call(f.env, path, {}, { authed: false });
    assert.equal(response.status, 401, path);
  }
  const denied = await call(f.env, "assets/read", {}, { headers: { origin: "https://other.example" } });
  assert.equal(denied.status, 403);
  const signature = await call(f.env, "assets/read", {}, { cookie: "mmd_admin_gate_v1=wrong.signature" });
  assert.equal(signature.status, 401);
  const method = await call(f.env, "intake/read", {}, { method: "GET" });
  assert.equal(method.status, 405);
  assert.equal(f.calls.length, 0);
  assert.equal(f.r2Calls.length, 0);
});

test("assets/read streams an authenticated original without storage identifiers or mutation", async () => {
  const f = fixture();
  const file = await upload(f);
  const count = f.r2Calls.length;
  const response = await call(f.env, "assets/read", { asset_id: file.asset_id });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("content-length"), String(file.size));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await response.arrayBuffer()).byteLength, file.size);
  assert.deepEqual(f.r2Calls.slice(count).map((call) => call.op), ["get"]);
  assert.equal(f.calls.length, 0);
});

test("assets/read rejects changed opaque IDs, missing objects and malformed references", async () => {
  const f = fixture();
  const file = await upload(f);
  const changed = file.asset_id.slice(0, -1) + (file.asset_id.endsWith("a") ? "b" : "a");
  for (const asset_id of [changed, `studio_${"f".repeat(64)}`]) assert.equal((await call(f.env, "assets/read", { asset_id })).status, 404);
  assert.equal((await call(f.env, "assets/read", { asset_id: "../../private/file" })).status, 400);
  assert.equal((await call(f.env, "assets/read", { asset_id: file.asset_id, r2_key: "private/file" })).status, 400);
});

test("assets/read rejects absent or mismatched uploader metadata and checksums", async () => {
  for (const mutate of [
    (object) => { object.customMetadata = {}; },
    (object) => { object.customMetadata.asset_id = `studio_${"f".repeat(64)}`; },
    (object) => { object.customMetadata.source = "another_uploader"; },
    (object) => { object.customMetadata.sha256 = "0".repeat(64); },
    (object) => { object.customMetadata.size = "999"; },
    (object) => { object.httpMetadata.contentType = "image/jpeg"; },
    (object) => { object.checksums = {}; },
    (object) => { object.customMetadata.staging_prefix = "private"; },
  ]) {
    const f = fixture();
    const file = await upload(f);
    mutate(f.objects.get(`studio-staging/assets/${file.asset_id}`));
    const response = await call(f.env, "assets/read", { asset_id: file.asset_id });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "asset_verification_failed");
    assert.equal(f.r2Calls.filter((call) => call.op === "put").length, 1);
  }
});

test("V2 intake validates photo count, metadata, main photo, consent and canonical identity before create", async () => {
  const f = fixture();
  const file = await upload(f);
  for (const changes of [
    { files: [] }, { files: Array(11).fill(file) }, { files: [file, file] },
    { files: [{ ...file, size: file.size + 1 }] }, { main_asset_id: `studio_${"f".repeat(64)}` },
    { consent: "true" }, { audiences: [] }, { model_name: "Spoofed Name" },
    { weight_kg: 99 }, { compcard_family: "B" }, { model_context: { ready: true } },
  ]) {
    const response = await call(f.env, "intake/commit", intakeBody([file], changes));
    assert.ok([400, 409].includes(response.status), await response.clone().text());
  }
  assert.equal(writes(f).length, 0);
});

test("V2 validate performs verification but cannot create an intake or review", async () => {
  const f = fixture();
  const files = [await upload(f)];
  const validated = await call(f.env, "intake/validate", intakeBody(files));
  assert.equal(validated.status, 200);
  assert.equal((await validated.json()).normalized.model_context.ready, true);
  assert.equal(writes(f).length, 0);
  const saved = await saveIntake(f, {}, files);
  const response = await call(f.env, "review/validate", reviewBody(saved.receipt.studio_intake_id));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).safe_preview_only, true);
  assert.equal(writes(f).length, 1);
});

test("V2 serial intake replay returns the same receipt and conflicts on any changed payload", async () => {
  const f = fixture();
  const saved = await saveIntake(f);
  const reversed = Object.fromEntries(Object.entries(saved.body).reverse());
  const response = await call(f.env, "intake/commit", reversed);
  const repeated = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual({ ...repeated, replayed: false }, saved.receipt);
  assert.equal(repeated.replayed, true);
  const changed = await call(f.env, "intake/commit", { ...saved.body, note: "changed" });
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).error, "idempotency_conflict");
  assert.equal(writes(f).length, 1);
});

test("V2 recovers a lost commit reply by idempotency reference without a second write", async () => {
  const f = fixture();
  const body = intakeBody([await upload(f)]);
  f.state.loseCreateReply = true;
  const unconfirmed = await call(f.env, "intake/commit", body);
  assert.equal(unconfirmed.status, 503);
  assert.equal((await unconfirmed.json()).error, "intake_save_unconfirmed");
  const recovered = await call(f.env, "intake/read", { idempotency_key: body.idempotency_key });
  assert.equal(recovered.status, 200);
  const reference = (await recovered.json()).intake.studio_intake_id;
  const retry = await call(f.env, "intake/commit", body);
  const receipt = await retry.json();
  assert.equal(receipt.studio_intake_id, reference);
  assert.equal(receipt.replayed, true);
  assert.equal(writes(f).length, 1);
});

test("idempotency recovery returns 404 for no record and 503 on uncertain lookup, never creates", async () => {
  const f = fixture();
  assert.equal((await call(f.env, "intake/read", { idempotency_key: "not-yet-recorded" })).status, 404);
  assert.equal((await call(f.env, "review/read", { idempotency_key: "not-yet-recorded" })).status, 404);
  f.state.failLookup = true;
  assert.equal((await call(f.env, "intake/read", { idempotency_key: "not-yet-recorded" })).status, 503);
  const body = intakeBody([await upload(f)]);
  assert.equal((await call(f.env, "intake/commit", body)).status, 503);
  assert.equal(writes(f).length, 0);
});

test("reads reject records from another workflow in the shared Console Inbox", async () => {
  const f = fixture();
  const saved = await saveIntake(f);
  const id = saved.receipt.studio_intake_id;
  assert.equal((await call(f.env, "review/read", { studio_review_id: id })).status, 404);
  f.records.get(id).fields.source = "mmd_model_my_card";
  assert.equal((await call(f.env, "intake/read", { studio_intake_id: id })).status, 404);
  assert.equal((await call(f.env, "intake/read", { idempotency_key: saved.body.idempotency_key })).status, 404);
  assert.equal(writes(f).length, 1);
});

test("V2 review uses saved intake identity and creates an immutable snapshot bound to that intake", async () => {
  const f = fixture();
  const intake = await saveIntake(f);
  const review = await saveReview(f, intake, { model_name: "Browser Forgery", field: "EMs", run_number: "EMs999", files: [] });
  const stored = payload(f, review.receipt.studio_review_id);
  assert.equal(stored.raw, undefined);
  assert.equal(stored.normalized.model_name, "Ice T");
  assert.equal(stored.normalized.field, "ST");
  assert.equal(stored.normalized.intake_snapshot.studio_intake_id, intake.receipt.studio_intake_id);
  assert.deepEqual(stored.normalized.intake_snapshot.files, intake.body.files);
  const changed = payload(f, intake.receipt.studio_intake_id);
  changed.normalized.model_name = "Later intake change";
  setPayload(f, intake.receipt.studio_intake_id, changed);
  const before = writes(f).length;
  const response = await call(f.env, "review/read", { studio_review_id: review.receipt.studio_review_id });
  const data = await response.json();
  assert.equal(data.review.intake_snapshot.model_name, "Ice T");
  assert.equal(data.review.studio_intake_id, intake.receipt.studio_intake_id);
  assert.equal(data.preview_ready, true);
  assert.deepEqual(data.blockers, []);
  assert.equal(writes(f).length, before);
});

test("V2 Approved Direction requires three actual boolean checks", async () => {
  const f = fixture();
  const intake = await saveIntake(f);
  for (const checklist of [{}, { identity: true, photo: true, safe: false }, { identity: "true", photo: true, safe: true }, { identity: true, photo: true, safe: true, authority: true }]) {
    const response = await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id, { checklist }));
    assert.equal(response.status, 400);
  }
  assert.equal(writes(f).length, 1);
});

test("V2 unlinked and incomplete canonical models can save drafts but cannot approve", async () => {
  for (const unlinked of [true, false]) {
    const f = fixture();
    if (!unlinked) f.models.get(MODEL_ID).fields.status = "inactive";
    const intake = await saveIntake(f, unlinked ? { model_record_id: "" } : {});
    const response = await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id));
    assert.equal(response.status, 409);
    const draftReview = await saveReview(f, intake, { decision: "Needs Review", checklist: {} });
    const read = await call(f.env, "review/read", { studio_review_id: draftReview.receipt.studio_review_id });
    assert.equal((await read.json()).preview_ready, false);
  }
});

test("V2 preserves canonical one-digit RUN but blocks manual originals for AI-only identity", async () => {
  const f = fixture();
  Object.assign(f.models.get(MODEL_ID).fields, { working_name: "GWs1", recognition_class: "GWs" });
  const intake = await saveIntake(f, { model_name: "GWs1", field: "GWs", run_number: "GWs1", compcard_family: "GWs", visual_variant_number: 7 });
  const read = await call(f.env, "intake/read", { studio_intake_id: intake.receipt.studio_intake_id });
  assert.equal((await read.json()).intake.run_number, "GWs1");
  const response = await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "generated_media_required");
  assert.equal(writes(f).length, 1);
});

test("V2 review rechecks canonical state and assets before approval", async () => {
  const f = fixture();
  const intake = await saveIntake(f);
  f.models.get(MODEL_ID).fields.working_name = "Changed";
  assert.equal((await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id))).status, 409);
  f.models.get(MODEL_ID).fields.working_name = "Ice T";
  f.objects.clear();
  const response = await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "asset_verification_failed");
  assert.equal(writes(f).length, 1);
});

test("V2 review replay and idempotency recovery return the exact original binding without mutation", async () => {
  const f = fixture();
  const intake = await saveIntake(f);
  const review = await saveReview(f, intake);
  const retry = await call(f.env, "review/commit", review.body);
  assert.deepEqual({ ...await retry.json(), replayed: false }, review.receipt);
  const changed = await call(f.env, "review/commit", { ...review.body, final_note: "different" });
  assert.equal(changed.status, 409);
  const recovered = await call(f.env, "review/read", { idempotency_key: review.body.idempotency_key });
  const data = await recovered.json();
  assert.equal(data.review.studio_review_id, review.receipt.studio_review_id);
  assert.equal(data.review.studio_intake_id, intake.receipt.studio_intake_id);
  assert.equal(data.preview_ready, true);
  assert.equal(writes(f).length, 2);
});

test("approved review reads fail closed for changed, unavailable or inactive canonical state and missing assets", async () => {
  for (const change of [
    (f) => { f.models.get(MODEL_ID).fields.working_name = "GWs1"; f.models.get(MODEL_ID).fields.recognition_class = "GWs"; },
    (f) => { Object.assign(f.models.get(MODEL_ID).fields, { sales_layer: "public", "MMD Public Category": "Travel" }); },
    (f) => { f.models.get(MODEL_ID).fields.status = "inactive"; },
    (f) => { f.state.failModel = true; },
    (f) => { f.objects.clear(); },
  ]) {
    const f = fixture();
    const review = await saveReview(f, await saveIntake(f));
    change(f);
    const before = writes(f).length;
    const response = await call(f.env, "review/read", { idempotency_key: review.body.idempotency_key });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.preview_ready, false);
    assert.ok(data.blockers.length);
    assert.equal(writes(f).length, before);
  }
});

test("review/read rejects a snapshot pointing to a different intake", async () => {
  const f = fixture();
  const review = await saveReview(f, await saveIntake(f));
  const saved = payload(f, review.receipt.studio_review_id);
  saved.normalized.intake_snapshot.studio_intake_id = "recOther0000000001";
  setPayload(f, review.receipt.studio_review_id, saved);
  const response = await call(f.env, "review/read", { studio_review_id: review.receipt.studio_review_id });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "review_snapshot_invalid");
});

test("V2 approval and preview reads enforce ordinary frame completeness", async () => {
  for (const visual_variant_number of [null, 6, 7]) {
    const f = fixture();
    const intake = await saveIntake(f, { visual_variant_number });
    const response = await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "studio_frame_required");
    assert.equal(writes(f).length, 1);
  }
  const f = fixture();
  const review = await saveReview(f, await saveIntake(f));
  const stored = payload(f, review.receipt.studio_review_id);
  for (const value of [null, 6, 7]) {
    stored.normalized.intake_snapshot.visual_variant_number = value;
    setPayload(f, review.receipt.studio_review_id, stored);
    const response = await call(f.env, "review/read", { studio_review_id: review.receipt.studio_review_id });
    const data = await response.json();
    assert.equal(data.preview_ready, false);
    assert.deepEqual(data.blockers, ["studio_frame_required"]);
  }
});

test("V2 preview fails closed for incomplete saved renderer metrics", async () => {
  const f = fixture();
  const review = await saveReview(f, await saveIntake(f));
  for (const patch of [{ height_cm: null }, { height_cm: 129 }, { weight_kg: null }, { weight_kg: 201 }]) {
    const stored = payload(f, review.receipt.studio_review_id);
    Object.assign(stored.normalized.intake_snapshot, { height_cm: 178, weight_kg: 68 }, patch);
    setPayload(f, review.receipt.studio_review_id, stored);
    const response = await call(f.env, "review/read", { studio_review_id: review.receipt.studio_review_id });
    const data = await response.json();
    assert.equal(data.preview_ready, false);
    assert.deepEqual(data.blockers, ["studio_metrics_required"]);
  }
});

test("V2 exclusive drafts require their fixed frame and a two-line title before approval", async () => {
  for (const changes of [{ visual_variant_number: 6 }, { title: "" }, { title: "one\ntwo\nthree" }]) {
    const f = fixture();
    Object.assign(f.models.get(MODEL_ID).fields, { working_name: "GWs1", recognition_class: "GWs" });
    const intake = await saveIntake(f, { model_name: "GWs1", field: "GWs", run_number: "GWs1", compcard_family: "GWs", visual_variant_number: 7, ...changes });
    const response = await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, changes.visual_variant_number ? "studio_frame_required" : "studio_title_required");
    assert.equal(writes(f).length, 1);
  }
});

test("V2 intake and review refuse My Card references belonging to a different canonical model", async () => {
  const f = fixture();
  const files = [await upload(f)];
  const requestId = seedMyCard(f, "recModel0000000002");
  const wrongIntake = await call(f.env, "intake/commit", intakeBody(files, { compcard_request_id: requestId }));
  assert.equal(wrongIntake.status, 409);
  assert.equal((await wrongIntake.json()).error, "my_card_model_mismatch");
  assert.equal(writes(f).length, 0);
  seedMyCard(f);
  const intake = await saveIntake(f, { compcard_request_id: requestId }, files);
  seedMyCard(f, "recModel0000000002");
  const wrongReview = await call(f.env, "review/commit", reviewBody(intake.receipt.studio_intake_id));
  assert.equal(wrongReview.status, 409);
  assert.equal((await wrongReview.json()).error, "my_card_model_mismatch");
  assert.equal(writes(f).length, 1);
  assert.equal(f.records.get(requestId).fields.status, "model_request_pending");
});

test("V2 binds My Card again immediately before status synchronization", async () => {
  const f = fixture();
  const requestId = seedMyCard(f);
  const intake = await saveIntake(f, { compcard_request_id: requestId });
  f.state.afterCreate = (record) => { if (record.fields.source === "mmd_studio_review") seedMyCard(f, "recModel0000000002"); };
  const review = await saveReview(f, intake);
  assert.equal(payload(f, review.receipt.studio_review_id).normalized.intake_snapshot.model_record_id, MODEL_ID);
  assert.equal(f.records.get(requestId).fields.status, "model_request_pending");
  assert.equal(f.calls.filter((call) => call.method === "PATCH").length, 0);
  const read = await call(f.env, "review/read", { studio_review_id: review.receipt.studio_review_id });
  assert.deepEqual((await read.json()).blockers, ["my_card_model_mismatch"]);
});

test("matching V2 My Card review updates the linked request only once across serial replay", async () => {
  const f = fixture();
  const requestId = seedMyCard(f);
  const review = await saveReview(f, await saveIntake(f, { compcard_request_id: requestId }));
  assert.equal(f.records.get(requestId).fields.status, "studio_approved");
  const result = await call(f.env, "review/commit", review.body);
  assert.equal((await result.json()).replayed, true);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 2);
  assert.equal(f.calls.filter((call) => call.method === "PATCH").length, 1);
});

test("V2 idempotency and reads also work with dedicated Studio tables", async () => {
  const f = fixture();
  f.env.AIRTABLE_TABLE_STUDIO_INTAKE = "Studio_Intake";
  f.env.AIRTABLE_TABLE_STUDIO_REVIEW = "Studio_Review";
  const intake = await saveIntake(f);
  const review = await saveReview(f, intake);
  assert.equal(intake.receipt.table_mode, "studio_table");
  assert.equal(review.receipt.table_mode, "studio_table");
  const repeated = await call(f.env, "intake/commit", intake.body);
  assert.equal((await repeated.json()).replayed, true);
  const read = await call(f.env, "review/read", { idempotency_key: review.body.idempotency_key });
  assert.equal((await read.json()).preview_ready, true);
  assert.equal(writes(f).length, 2);
});

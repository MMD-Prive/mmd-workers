import coreWorker, { isAuthed } from "./index.js";
import { hasValidAdminBrowserSession } from "./admin-browser-session.js";
import { wireMmsApproveUi } from "./mms-admin-approve-ui.js";
import { wireMmsAdminMobileBundle } from "./mms-admin-mobile-bundle.js";
import { wireMmsJobsUi } from "./mms-admin-jobs-ui.js";
import { renderMmsAdminPage } from "./mms-admin-page.js";
import {
  appendMmsJobReceipt,
  buildMmsCanonicalJobPayload,
  linkedPrebookingFromNotes,
  linkedSessionFromNotes,
} from "./mms-job-bridge.js";

const PAGE_PATH = "/internal/admin/mms";
const API_PREFIX = "/v1/admin/mms";
const INTERNAL_BASE = "https://mms.internal";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE_ID = "tblC98mKWbzmPuNzX";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MMS_JOB_LANES = new Set([
  "mms",
  "aroma_therapy_oil",
  "thai_massage",
  "sport_massage",
  "office_syndrome",
  "health_fitness_advisor",
  "thai_herbal_compress",
  "partner_present",
  "partner_present_massage_session",
  "women_massage",
]);

export function isMmsAdminRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === PAGE_PATH || path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

export async function handleMmsAdminRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  const adminAuthenticated = (await isAuthed(request, env)) || (await hasValidAdminBrowserSession(request, env));
  if (!adminAuthenticated) {
    if (path === PAGE_PATH && (method === "GET" || method === "HEAD")) {
      return Response.redirect(`${url.origin}/internal/admin/login?next=${encodeURIComponent(PAGE_PATH)}`, 303);
    }
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (path === PAGE_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    const build = mmsAdminBuild(env);
    const page = stampMmsAdminBuild(wireMmsJobsUi(wireMmsAdminMobileBundle(wireMmsApproveUi(renderMmsAdminPage()))), build);
    const response = html(page);
    response.headers.set("x-mmd-admin-build", build);
    response.headers.set("x-mmd-admin-surface", "mms-admin");
    return method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
  }

  if (!env.MMS_WORKER || typeof env.MMS_WORKER.fetch !== "function") {
    return json({ ok: false, error: "mms_service_unavailable" }, 503);
  }

  if (path === `${API_PREFIX}/system-check` && method === "GET") {
    return json(await runMmsSystemCheck(env));
  }
  if (path === `${API_PREFIX}/catalog` && method === "GET") {
    return proxyJson(request, env, "/mms/api/catalog", { origin: true });
  }
  if (path === `${API_PREFIX}/snapshot` && method === "GET") {
    return proxyJson(request, env, "/internal/mms/admin/snapshot");
  }
  if (path === `${API_PREFIX}/jobs` && method === "GET") {
    return json(await listMmsCanonicalJobs(env));
  }
  if (path === `${API_PREFIX}/applications` && method === "POST") {
    return proxyJson(request, env, "/mms/api/applications", { origin: true });
  }
  if (path === `${API_PREFIX}/uploads/presign` && method === "POST") {
    return proxyJson(request, env, "/mms/api/uploads/presign", { origin: true });
  }

  const upload = path.match(/^\/v1\/admin\/mms\/uploads\/(mmsapp_[a-f0-9]{24})\/([A-Za-z0-9_-]{32,})$/);
  if (upload && method === "PUT") {
    return proxyUpload(request, env, `/mms/api/uploads/${upload[1]}/${upload[2]}`);
  }

  const application = path.match(/^\/v1\/admin\/mms\/applications\/(mmsapp_[a-f0-9]{24})$/);
  if (application && method === "PATCH") {
    return proxyJson(request, env, `/internal/mms/admin/applications/${application[1]}`);
  }

  const therapist = path.match(/^\/v1\/admin\/mms\/therapists\/([A-Za-z0-9_-]{4,80})$/);
  if (therapist && method === "PATCH") {
    return proxyJson(request, env, `/internal/mms/admin/therapists/${therapist[1]}`);
  }

  const prebookingJob = path.match(/^\/v1\/admin\/mms\/prebookings\/(mmspre_[a-f0-9]{24})\/job$/);
  if (prebookingJob && method === "POST") {
    return createMmsCanonicalJob(request, env, prebookingJob[1]);
  }

  const prebooking = path.match(/^\/v1\/admin\/mms\/prebookings\/(mmspre_[a-f0-9]{24})$/);
  if (prebooking && method === "PATCH") {
    return proxyJson(request, env, `/internal/mms/admin/prebookings/${prebooking[1]}`);
  }

  if (path === `${API_PREFIX}/file` && method === "GET") {
    const key = url.searchParams.get("key") || "";
    return env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}/internal/mms/admin/file?key=${encodeURIComponent(key)}`, { method: "GET" }));
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function createMmsCanonicalJob(request, env, prebookingId) {
  const input = await readJsonObject(request);
  if (!input.ok) return json({ ok: false, error: "invalid_json" }, 400);

  const snapshot = await readMmsSnapshot(env);
  if (!snapshot.ok) return json({ ok: false, error: "mms_snapshot_unavailable" }, 503);
  const prebooking = (snapshot.prebookings || []).find((item) => clean(item?.prebooking_id) === prebookingId);
  if (!prebooking) return json({ ok: false, error: "mms_prebooking_not_found" }, 404);

  const receiptSession = linkedSessionFromNotes(prebooking.internal_notes);
  if (receiptSession) {
    return json({
      ok: true,
      linked: true,
      existing: true,
      prebooking_id: prebookingId,
      session_id: receiptSession,
    });
  }

  const existing = await findCanonicalJobByPrebooking(env, prebookingId);
  if (existing) {
    await persistMmsJobReceipt(env, prebooking, {
      prebookingId,
      sessionId: existing.session_id,
      paymentRef: existing.payment_ref,
    });
    return json({
      ok: true,
      linked: true,
      existing: true,
      prebooking_id: prebookingId,
      session_id: existing.session_id,
      payment_ref: existing.payment_ref,
    });
  }

  let payload;
  try {
    payload = buildMmsCanonicalJobPayload(prebooking, snapshot.therapists || [], input.data);
  } catch (error) {
    return json({ ok: false, error: clean(error?.code || error?.message || "mms_job_bridge_invalid") }, 400);
  }

  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });
  const authorization = clean(request.headers.get("Authorization"));
  const origin = clean(request.headers.get("Origin"));
  const confirmKey = clean(request.headers.get("X-Confirm-Key"));
  if (authorization) headers.set("Authorization", authorization);
  if (origin) headers.set("Origin", origin);
  if (confirmKey) headers.set("X-Confirm-Key", confirmKey);

  const response = await coreWorker.fetch(new Request(new URL("/v1/admin/job/create", request.url), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  }), env, {});
  const created = await response.json().catch(() => ({}));
  if (!response.ok || created?.ok === false) {
    return json({
      ok: false,
      error: clean(created?.error?.message || created?.error || "mmd_job_create_failed"),
    }, response.status || 502);
  }

  const sessionId = clean(created.session_id);
  const paymentRef = clean(created.payment_ref);
  if (!sessionId) return json({ ok: false, error: "mmd_job_create_missing_session" }, 502);

  const receiptPersisted = await persistMmsJobReceipt(env, prebooking, {
    prebookingId,
    sessionId,
    paymentRef,
  });

  return json({
    ok: true,
    linked: true,
    existing: false,
    prebooking_id: prebookingId,
    session_id: sessionId,
    payment_ref: paymentRef,
    receipt_persisted: receiptPersisted,
  });
}

async function readMmsSnapshot(env) {
  try {
    const response = await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}/internal/mms/admin/snapshot`, { method: "GET" }));
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) return { ok: false };
    return {
      ok: true,
      applications: Array.isArray(data.applications) ? data.applications : [],
      therapists: Array.isArray(data.therapists) ? data.therapists : [],
      prebookings: Array.isArray(data.prebookings) ? data.prebookings : [],
    };
  } catch {
    return { ok: false };
  }
}

async function persistMmsJobReceipt(env, prebooking, receipt) {
  const notes = appendMmsJobReceipt(prebooking?.internal_notes, receipt);
  try {
    const response = await env.MMS_WORKER.fetch(new Request(
      `${INTERNAL_BASE}/internal/mms/admin/prebookings/${encodeURIComponent(receipt.prebookingId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internal_notes: notes }),
      }
    ));
    return response.ok;
  } catch {
    return false;
  }
}

async function findCanonicalJobByPrebooking(env, prebookingId) {
  const result = await listMmsCanonicalJobs(env);
  if (!result.ok) return null;
  return result.jobs.find((job) => clean(job.prebooking_id) === clean(prebookingId)) || null;
}

async function listMmsCanonicalJobs(env) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const apiKey = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_PAT || env.AIRTABLE_TOKEN);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE_ID);
  if (!baseId || !apiKey || !table) {
    return { ok: false, error: "canonical_jobs_airtable_not_ready", jobs: [] };
  }

  try {
    const params = new URLSearchParams({ pageSize: "100" });
    const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: "canonical_jobs_airtable_failed", jobs: [] };

    const jobs = (Array.isArray(data.records) ? data.records : [])
      .map((record) => canonicalJobProjection(record))
      .filter((job) => job.is_mms)
      .sort((a, b) => `${b.job_date || ""} ${b.start_time || ""}`.localeCompare(`${a.job_date || ""} ${a.start_time || ""}`))
      .slice(0, 100)
      .map(({ is_mms, ...job }) => job);
    return { ok: true, jobs, count: jobs.length };
  } catch {
    return { ok: false, error: "canonical_jobs_airtable_failed", jobs: [] };
  }
}

function canonicalJobProjection(record) {
  const fields = record?.fields || {};
  const note = clean(fields.note || fields["Internal Notes"] || fields.internal_notes || fields.admin_note);
  const lane = clean(fields.job_type || fields.session_type_raw || fields["Session Type"] || fields.model_work_lane || fields.model_work_type).toLowerCase();
  const sessionId = clean(fields.session_id || fields["Session ID"] || fields.session || record?.id);
  const prebookingId = linkedPrebookingFromNotes(note);
  const isMms = MMS_JOB_LANES.has(lane) || lane.includes("male massage") || Boolean(prebookingId) || /^mms_/i.test(sessionId);
  return {
    is_mms: isMms,
    session_id: sessionId,
    payment_ref: clean(fields.payment_ref || fields["Payment Ref"]),
    prebooking_id: prebookingId,
    client_name: clean(fields.client_name || fields.member_name || fields.customer_name || fields["Client Name"]),
    model_name: clean(fields.model_name || fields["Assigned Model"] || fields["Model Name"]),
    job_date: clean(fields.job_date || fields["Session Date"] || fields.date),
    start_time: clean(fields.start_time || fields["Start Time"]),
    end_time: clean(fields.end_time || fields["End Time"]),
    location_name: clean(fields.location_name || fields["Location Name"] || fields.location),
    amount_thb: numberValue(fields.amount_thb || fields["Total Amount"] || fields.final_price_thb || fields.base_price_thb),
    status: clean(fields.session_state || fields["Session Status"] || fields.status || "Created"),
  };
}

async function runMmsSystemCheck(env) {
  const checkedAt = new Date().toISOString();
  let health = null;
  let snapshot = null;
  let matching = null;
  const errors = [];

  try {
    const response = await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}/health`, { method: "GET" }));
    health = await response.json().catch(() => null);
    if (!response.ok || !health?.ok) errors.push("worker_health_failed");
  } catch {
    errors.push("worker_health_failed");
  }

  try {
    const response = await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}/internal/mms/admin/snapshot`, { method: "GET" }));
    snapshot = await response.json().catch(() => null);
    if (!response.ok || !snapshot?.ok) errors.push("airtable_snapshot_failed");
  } catch {
    errors.push("airtable_snapshot_failed");
  }

  try {
    const response = await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}/mms/api/therapists/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient_gender: "ผู้ชาย",
        zone: "sukhumvit",
        skills: ["aroma_therapy_oil"],
      }),
    }));
    matching = await response.json().catch(() => null);
    if (!response.ok || !matching?.ok) errors.push("matching_probe_failed");
  } catch {
    errors.push("matching_probe_failed");
  }

  const snapshotReady = Boolean(snapshot?.ok);
  const checks = {
    worker: Boolean(health?.ok && health?.worker === "mms-worker"),
    applications: Boolean(snapshotReady && Array.isArray(snapshot?.applications)),
    therapists: Boolean(snapshotReady && Array.isArray(snapshot?.therapists)),
    airtable: Boolean(health?.bindings?.airtable && snapshotReady),
    r2: Boolean(health?.bindings?.private_uploads),
    matching: Boolean(matching?.ok && matching?.data),
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checked_at: checkedAt,
    checks,
    counts: {
      applications: Number(snapshot?.counts?.applications || 0),
      therapists: Number(snapshot?.counts?.therapists || 0),
      prebookings: Number(snapshot?.counts?.prebookings || 0),
      matching_candidates: Array.isArray(matching?.data?.matches) ? matching.data.matches.length : 0,
    },
    notes: {
      r2: checks.r2 ? "binding_ready" : "binding_missing",
      matching: checks.matching ? "read_only_probe_passed" : "probe_failed",
    },
    errors: [...new Set(errors)],
  };
}

async function proxyJson(request, env, targetPath, { origin = false } = {}) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (origin) headers.set("origin", "https://mmdbkk.com");
  const init = { method: request.method, headers };
  if (!/^(GET|HEAD)$/i.test(request.method)) init.body = await request.text();
  return relay(await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}${targetPath}`, init)));
}

async function proxyUpload(request, env, targetPath) {
  const contentType = String(request.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ ok: false, error: "empty_upload" }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return json({ ok: false, error: "upload_too_large" }, 413);
  const response = await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}${targetPath}`, {
    method: "PUT",
    headers: {
      origin: "https://mmdbkk.com",
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
    },
    body: bytes,
  }));
  return relay(response);
}

async function readJsonObject(request) {
  try {
    const data = await request.json();
    return { ok: Boolean(data && typeof data === "object" && !Array.isArray(data)), data };
  } catch {
    return { ok: false, data: null };
  }
}

function relay(response) {
  const headers = new Headers();
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  const type = response.headers.get("content-type");
  if (type) headers.set("content-type", type);
  return new Response(response.body, { status: response.status, headers });
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}
function clean(value) {
  return String(value ?? "").trim();
}
function mmsAdminBuild(env = {}) {
  return clean(env.ADMIN_WORKER_BUILD_SHA).replace(/[^A-Za-z0-9._:-]/g, "") || "unknown";
}
function stampMmsAdminBuild(value, build) {
  const marker = clean(build).replace(/[^A-Za-z0-9._:-]/g, "") || "unknown";
  let output = String(value ?? "");
  if (output.includes("<head>")) {
    output = output.replace("<head>", `<head><meta name="mmd-admin-build" content="${marker}">`);
  }
  if (/<body\b/.test(output)) {
    output = output.replace(/<body\b/, `<body data-mmd-admin-build="${marker}"`);
  }
  return output;
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
function html(value) {
  return new Response(value, { status: 200, headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-store",
    "content-security-policy": "default-src 'self'; img-src 'self' data: https://s3.amazonaws.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  } });
}
function methodNotAllowed(allow) { return new Response(null, { status: 405, headers: { allow: allow.join(", ") } }); }

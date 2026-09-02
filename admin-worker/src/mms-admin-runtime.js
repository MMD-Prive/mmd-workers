import { isAuthed } from "./index.js";
import { wireMmsApproveUi } from "./mms-admin-approve-ui.js";
import { renderMmsAdminPage } from "./mms-admin-page.js";

const PAGE_PATH = "/internal/admin/mms";
const API_PREFIX = "/v1/admin/mms";
const INTERNAL_BASE = "https://mms.internal";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isMmsAdminRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === PAGE_PATH || path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

export async function handleMmsAdminRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (!(await isAuthed(request, env))) {
    if (path === PAGE_PATH && (method === "GET" || method === "HEAD")) {
      return Response.redirect(`${url.origin}/internal/admin/login?next=${encodeURIComponent(PAGE_PATH)}`, 303);
    }
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (path === PAGE_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    const response = html(wireMmsApproveUi(renderMmsAdminPage()));
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
      body: "{}",
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

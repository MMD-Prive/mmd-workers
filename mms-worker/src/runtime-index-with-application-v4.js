import runtime from "./runtime-index-with-therapist-invite.js";
export { MmsCoordinator } from "./runtime-index-with-therapist-invite.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const GRANT_TTL_MS = 15 * 60 * 1000;
const APPLICATION_TABLE = "APPLICATIONS";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (path === "/mms/api/uploads/presign" && request.method === "POST") {
      const body = await request.clone().json().catch(() => null);
      if (body?.kind === "additional_photo") {
        return handleAdditionalPhotoGrant(request, env, body);
      }
    }

    const uploadMatch = path.match(/^\/mms\/api\/uploads\/(mmsapp_[a-f0-9]{24})\/([A-Za-z0-9_-]{32,})$/);
    if (uploadMatch && request.method === "PUT") {
      return handleUpload(request, env, uploadMatch[1], uploadMatch[2]);
    }

    if (path === "/internal/mms/admin/file" && request.method === "GET") {
      const key = String(url.searchParams.get("key") || "").trim();
      if (/^mms\/applications\/mmsapp_[a-f0-9]{24}\/additional_photo\//.test(key)) {
        return handleAdditionalPhotoRead(request, env, key);
      }
    }

    if (path === "/internal/mms/admin/snapshot" && request.method === "GET") {
      const response = await runtime.fetch(request, env, ctx);
      return augmentAdminSnapshot(response, env);
    }

    return runtime.fetch(request, env, ctx);
  },
};

async function handleAdditionalPhotoGrant(request, env, body) {
  requirePublicOrigin(request, env);
  const applicationRef = String(body.application_ref || "").trim();
  const applicationToken = String(body.application_token || "").trim();
  const filename = safeFilename(body.filename);
  const contentType = String(body.content_type || "").trim().toLowerCase();
  const size = Number(body.size);

  if (!/^mmsapp_[a-f0-9]{24}$/.test(applicationRef)) return jsonError(400, "APPLICATION_REF_INVALID");
  if (!/^[A-Za-z0-9._:-]{20,200}$/.test(applicationToken)) return jsonError(400, "APPLICATION_TOKEN_INVALID");
  if (!filename) return jsonError(400, "FILENAME_INVALID");
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return jsonError(400, "CONTENT_TYPE_INVALID");
  if (!Number.isInteger(size) || size < 1 || size > uploadMaxBytes(env)) return jsonError(400, "SIZE_INVALID");

  const stub = coordinator(env, applicationRef);
  const authorized = await stub.authorizeApplication(applicationRef, await sha256Hex(applicationToken));
  if (!authorized) return jsonError(401, "APPLICATION_TOKEN_REJECTED");

  const uploadToken = randomToken(32);
  const tokenHash = await sha256Hex(uploadToken);
  const expiresAt = Date.now() + GRANT_TTL_MS;
  const r2Key = `mms/applications/${applicationRef}/additional_photo/${crypto.randomUUID()}${safeExtension(filename, contentType)}`;
  await stub.createUploadGrant({
    token_hash: tokenHash,
    application_id: applicationRef,
    kind: "additional_photo",
    filename,
    content_type: contentType,
    expected_bytes: size,
    r2_key: r2Key,
    expires_at: expiresAt,
  });

  const publicBase = String(env.MMS_PUBLIC_BASE_URL || request.url).replace(/\/mms\/api\/uploads\/presign.*$/, "").replace(/\/$/, "");
  return Response.json({
    ok: true,
    upload: {
      method: "PUT",
      url: `${publicBase}/mms/api/uploads/${applicationRef}/${uploadToken}`,
      content_type: contentType,
      content_length: size,
      expires_at: new Date(expiresAt).toISOString(),
    },
  }, { status: 201, headers: corsHeaders(request, env) });
}

async function handleUpload(request, env, applicationId, uploadToken) {
  requirePublicOrigin(request, env);
  if (!env.MMS_PRIVATE_UPLOADS) return jsonError(503, "UPLOAD_STORAGE_UNAVAILABLE");
  const stub = coordinator(env, applicationId);
  const tokenHash = await sha256Hex(uploadToken);
  const claim = await stub.claimUploadGrant(tokenHash, Date.now());
  if (!claim.ok) return jsonError(409, claim.code || "UPLOAD_GRANT_INVALID");

  try {
    const grant = claim.grant;
    if (!request.body) throw new Error("UPLOAD_BODY_REQUIRED");
    const body = await request.arrayBuffer();
    const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (body.byteLength !== grant.expected_bytes) throw new Error("UPLOAD_SIZE_MISMATCH");
    if (body.byteLength > uploadMaxBytes(env)) throw new Error("UPLOAD_TOO_LARGE");
    if (contentType !== grant.content_type) throw new Error("UPLOAD_TYPE_MISMATCH");

    await env.MMS_PRIVATE_UPLOADS.put(grant.r2_key, body, {
      httpMetadata: { contentType: grant.content_type },
      customMetadata: {
        application_id: applicationId,
        kind: grant.kind,
        original_name: String(grant.filename || "").slice(0, 160),
      },
    });
    await stub.completeUploadGrant(tokenHash, Date.now());
    const airtable = await attachUpload(env, applicationId, grant).catch(() => ({ status: "pending" }));
    return Response.json({
      ok: true,
      application_ref: applicationId,
      application_id: applicationId,
      kind: grant.kind,
      storage: { r2: "stored", airtable: airtable.status },
    }, { status: 201, headers: corsHeaders(request, env) });
  } catch (error) {
    await stub.releaseUploadGrant(tokenHash);
    const code = String(error?.message || "UPLOAD_FAILED");
    const status = code === "UPLOAD_TOO_LARGE" ? 413 : 400;
    return jsonError(status, code);
  }
}

async function attachUpload(env, applicationId, grant) {
  if (!env.AIRTABLE_API_TOKEN) return { status: "pending_airtable_secret" };
  const record = await findApplication(env, applicationId);
  if (!record) return { status: "pending_application_sync" };

  if (grant.kind === "profile_photo") {
    await airtableUpdate(env, record.id, { "Profile Photo R2 Key": grant.r2_key });
  } else if (grant.kind === "additional_photo") {
    const existing = parseJsonArray(record.fields?.["Additional Photo R2 Keys"]);
    await airtableUpdate(env, record.id, {
      "Additional Photo R2 Keys": JSON.stringify([...new Set([...existing, grant.r2_key])]),
    });
  } else if (grant.kind === "certificate") {
    const existing = parseJsonArray(record.fields?.["Certificate R2 Keys"]);
    await airtableUpdate(env, record.id, {
      "Certificate R2 Keys": JSON.stringify([...new Set([...existing, grant.r2_key])]),
    });
  } else {
    return { status: "unsupported_kind" };
  }
  return { status: "synced" };
}

async function augmentAdminSnapshot(response, env) {
  if (!response.ok || !env.AIRTABLE_API_TOKEN) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok || !Array.isArray(payload.applications)) return response;

  const raw = await airtableListApplications(env).catch(() => []);
  const byId = new Map(raw.map((record) => [String(record.fields?.["Application ID"] || ""), record.fields || {}]));
  payload.applications = payload.applications.map((application) => {
    const fields = byId.get(String(application.application_id || ""));
    if (!fields) return application;
    return {
      ...application,
      age: numberOrZero(fields.Age),
      height_cm: numberOrZero(fields["Height Cm"]),
      weight_kg: numberOrZero(fields["Weight Kg"]),
      home_province: clean(fields["Home Province"], 120),
      residence_province: clean(fields["Residence Province"], 120),
      residence_area: clean(fields["Residence Area"], 180),
      has_massage_experience: Boolean(fields["Has Massage Experience"]),
      professional_massage_experience: Boolean(fields["Professional Massage Experience"]),
      experience_background: selectName(fields["Experience Background"]),
      partner_present_experience: Boolean(fields["Partner Present Experience"]),
      work_preference: selectName(fields["Work Preference"]),
      languages: arrayOfStrings(fields.Languages),
      availability_summary: arrayOfStrings(fields["Availability Summary"]),
      lead_time_preference: selectName(fields["Lead Time Preference"]),
      transport_modes: arrayOfStrings(fields["Transport Mode"]),
      preferred_contact: selectName(fields["Preferred Contact"]),
      preferred_contact_time: clean(fields["Preferred Contact Time"], 160),
      workshop_interest: selectName(fields["Workshop Interest"]),
      motivation: clean(fields.Motivation, 1200),
      recommended_route: selectName(fields["Recommended Applicant Route"]),
      work_base_area: clean(fields["Work Base Area"], 240),
      mobility_scope: clean(fields["Mobility Scope"], 120),
      coverage_area_note: clean(fields["Coverage Area Note"], 1200),
      additional_photo_r2_keys: parseJsonArray(fields["Additional Photo R2 Keys"]),
    };
  });

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status: response.status, headers });
}

async function handleAdditionalPhotoRead(request, env, key) {
  if (new URL(request.url).hostname.toLowerCase() !== String(env.MMS_INTERNAL_HOST || "mms.internal").toLowerCase()) {
    return jsonError(404, "NOT_FOUND");
  }
  if (!env.MMS_PRIVATE_UPLOADS) return jsonError(503, "UPLOAD_STORAGE_UNAVAILABLE");
  const object = await env.MMS_PRIVATE_UPLOADS.get(key);
  if (!object) return jsonError(404, "FILE_NOT_FOUND");
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { status: 200, headers });
}

async function findApplication(env, applicationId) {
  const table = tableId(env, APPLICATION_TABLE);
  const params = new URLSearchParams({ maxRecords: "1", filterByFormula: `{Application ID}='${airtableEscape(applicationId)}'` });
  const data = await airtableFetch(env, `${table}?${params}`);
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function airtableListApplications(env) {
  const table = tableId(env, APPLICATION_TABLE);
  const records = [];
  let offset = "";
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const data = await airtableFetch(env, `${table}?${params}`);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = String(data.offset || "");
    if (!offset) break;
  }
  return records;
}

async function airtableUpdate(env, recordId, fields) {
  return airtableFetch(env, `${tableId(env, APPLICATION_TABLE)}/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: false }),
  });
}

async function airtableFetch(env, path, init = {}) {
  const base = String(env.AIRTABLE_BASE_ID || "").trim();
  const response = await fetch(`https://api.airtable.com/v0/${base}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`AIRTABLE_${response.status}`);
  return response.json();
}

function requirePublicOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(env).has(origin)) throw new Error("ORIGIN_NOT_ALLOWED");
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com,https://mmdprive.webflow.io").split(",").map((value) => value.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(env).has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function coordinator(env, name) {
  return env.MMS_COORDINATOR.get(env.MMS_COORDINATOR.idFromName(name));
}

function tableId(env, suffix) {
  const value = String(env[`AIRTABLE_${suffix}_TABLE_ID`] || "").trim();
  if (!/^tbl[A-Za-z0-9]{14}$/.test(value)) throw new Error("AIRTABLE_TABLE_INVALID");
  return value;
}

function uploadMaxBytes(env) {
  const value = Number(env.MMS_UPLOAD_MAX_BYTES || MAX_UPLOAD_BYTES);
  return Number.isInteger(value) && value > 0 && value <= 25 * 1024 * 1024 ? value : MAX_UPLOAD_BYTES;
}

function safeFilename(value) {
  const raw = String(value || "").normalize("NFKC").trim();
  if (!raw || raw.length > 160 || raw.includes("/") || raw.includes("\\")) return "";
  return raw.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "-");
}

function safeExtension(filename, contentType) {
  const ext = String(filename || "").toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)?.[0];
  if (ext) return ext === ".jpeg" ? ".jpg" : ext;
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" })[contentType] || "";
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch { return []; }
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map((item) => selectName(item)).filter(Boolean) : [];
}

function selectName(value) {
  return value && typeof value === "object" && typeof value.name === "string" ? value.name : clean(value, 160);
}

function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function numberOrZero(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function normalizePath(value) { return String(value || "/").replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/"; }
function airtableEscape(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jsonError(status, code) {
  return Response.json({ ok: false, error: { code, message: code } }, { status, headers: { "Cache-Control": "no-store" } });
}

// public-access-worker/src/index.js
// MMD Privé — Public Access Intake V1
// Public brief + evidence only. Never grants access, confirms payment, or confirms a booking.

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!isAllowedOrigin(request, env)) return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);

    if (request.method === "GET" && (path === "/health" || path === "/ping")) {
      return withCors(json({ ok: true, worker: "public-access-worker", version: "v1", ts: Date.now() }), cors);
    }

    if (request.method === "POST" && path === "/public/api/access/intake") {
      try {
        return withCors(await handleIntake(request, env), cors);
      } catch (error) {
        return withCors(json({
          ok: false,
          error: "public_access_intake_failed",
          message: safeError(error)
        }, statusFor(error)), cors);
      }
    }

    return withCors(json({ ok: false, error: "not_found" }, 404), cors);
  }
};

async function handleIntake(request, env) {
  requireEnv(env, ["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID", "PUBLIC_ACCESS_EVIDENCE"]);
  const form = await request.formData();

  const name = required(form.get("name"), "name");
  const contactMethod = enumValue(form.get("contact_method"), "contact_method", ["line", "telegram", "email", "phone"]);
  const contactValue = required(form.get("contact_value"), "contact_value");
  const modelQuery = clean(form.get("model_query"), 120);
  const brief = required(form.get("brief"), "brief", 3000);
  const source = clean(form.get("source") || "public_access", 80);
  const locale = clean(form.get("locale") || "th-TH", 32);
  const consent = form.get("consent") === "true";
  const evidence = form.get("evidence");

  if (!consent) throw httpError(400, "consent_required");
  if (!(evidence instanceof File) || !evidence.size) throw httpError(400, "evidence_required");
  if (evidence.size > MAX_FILE_BYTES) throw httpError(413, "evidence_too_large");
  if (!ALLOWED_TYPES.has(evidence.type)) throw httpError(415, "evidence_type_not_allowed");

  const requestId = makeRef("PA");
  const createdAt = new Date().toISOString();
  const r2Key = buildEvidenceKey(requestId, evidence);
  const digest = await sha256File(evidence);

  await env.PUBLIC_ACCESS_EVIDENCE.put(r2Key, await evidence.arrayBuffer(), {
    httpMetadata: { contentType: evidence.type },
    customMetadata: {
      request_id: requestId,
      sha256: digest,
      uploaded_at: createdAt,
      original_name: safeFilename(evidence.name)
    }
  });

  const fields = compact({
    "Request ID": requestId,
    "Status": "PENDING_REVIEW",
    "Created At": createdAt,
    "Source": source,
    "Client Name": name,
    "Contact Method": contactMethod,
    "Contact Value": contactValue,
    "Model Query": modelQuery || undefined,
    "Brief": brief,
    "Locale": locale,
    "Evidence R2 Key": r2Key,
    "Evidence Name": safeFilename(evidence.name),
    "Evidence Type": evidence.type,
    "Evidence Bytes": evidence.size,
    "Evidence SHA256": digest,
    "Evidence Status": "RECEIVED_PENDING_REVIEW",
    "Payment Status": "PENDING",
    "Access Status": "PENDING_REVIEW"
  });

  const record = await airtableCreate(env, tableName(env), fields);
  const notification = await notifyMmd(env, { requestId, name, contactMethod, modelQuery, recordId: record?.id || "" });

  return json({
    ok: true,
    request_id: requestId,
    status: "PENDING_REVIEW",
    evidence_only: true,
    official_verification_required: true,
    access_granted: false,
    message: "MMD received your brief and supporting evidence. Official review is still required.",
    notification: notification.ok ? "queued" : "not_configured"
  }, 201);
}

function tableName(env) {
  return String(env.AIRTABLE_TABLE_PUBLIC_ACCESS_REQUESTS || "Public Access Requests").trim();
}

async function airtableCreate(env, table, fields) {
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records: [{ fields }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(502, "airtable_write_failed");
  return data?.records?.[0] || null;
}

async function notifyMmd(env, payload) {
  const endpoint = String(env.TELEGRAM_INTERNAL_SEND_URL || "").trim();
  const chatId = String(env.TELEGRAM_PUBLIC_ACCESS_CHAT_ID || env.TELEGRAM_INTERNAL_CHAT_ID || "").trim();
  if (!endpoint || !chatId) return { ok: false, skipped: true };

  const adminUrl = addParams(env.PUBLIC_ACCESS_ADMIN_URL, {
    request_id: payload.requestId,
    record_id: payload.recordId
  });
  const text = [
    "🕊️ <b>Public Access — pending review</b>",
    `Ref: <code>${esc(payload.requestId)}</code>`,
    `Client: ${esc(payload.name)}`,
    `Contact: ${esc(payload.contactMethod)}`,
    payload.modelQuery ? `Model query: ${esc(payload.modelQuery)}` : "",
    adminUrl ? `Review: ${esc(adminUrl)}` : "",
    "",
    "Evidence received only. Do not approve access or payment without official verification."
  ].filter(Boolean).join("\n");

  try {
    const headers = { "Content-Type": "application/json" };
    if (env.TELEGRAM_INTERNAL_TOKEN) headers["X-Internal-Token"] = env.TELEGRAM_INTERNAL_TOKEN;
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: env.TG_THREAD_PUBLIC_ACCESS || undefined,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        text,
        source: "public_access_worker",
        intent: "public_access_pending_review",
        request_id: payload.requestId,
        airtable_record_id: payload.recordId
      })
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

function buildEvidenceKey(requestId, file) {
  const ext = extensionFor(file.type);
  return `public-access/${requestId}/evidence.${ext}`;
}

function extensionFor(type) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" })[type] || "bin";
}

async function sha256File(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function makeRef(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${suffix}`;
}

function required(value, field, max = 160) {
  const result = clean(value, max);
  if (!result) throw httpError(400, `${field}_required`);
  return result;
}

function clean(value, max = 160) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function enumValue(value, field, allowed) {
  const result = clean(value, 40).toLowerCase();
  if (!allowed.includes(result)) throw httpError(400, `invalid_${field}`);
  return result;
}

function safeFilename(value) {
  return String(value || "evidence").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

function normalizePath(path) {
  return path.replace(/\/+$/, "") || "/";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });
  if (origin && allowed.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return false;
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function addParams(raw, values) {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    Object.entries(values).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
    return url.toString();
  } catch { return ""; }
}

function esc(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function requireEnv(env, names) {
  for (const name of names) if (!env[name]) throw httpError(500, `missing_${name.toLowerCase()}`);
}

function httpError(status, code) {
  const error = new Error(code);
  error.status = status;
  return error;
}

function statusFor(error) {
  return Number.isInteger(error?.status) ? error.status : 500;
}

function safeError(error) {
  const code = String(error?.message || "internal_error");
  return /^[a-z0-9_]+$/i.test(code) ? code : "internal_error";
}

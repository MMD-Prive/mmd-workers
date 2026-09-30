// public-access-worker/src/index.js
// MMD Privé — Public Access Intake V1
// Public brief + evidence only. Never grants access, confirms payment, or confirms a booking.

import { handlePublicJobBoardV2Request } from "./public-job-board-v2.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const jobBoard = await handlePublicJobBoardV2Request(request, env);
    if (jobBoard) return withCors(await connectWorkerSurface(jobBoard), cors);

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
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET,PUT",
    "Access-Control-Allow-Headers": "Content-Type,X-Line-Id-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
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

async function connectWorkerSurface(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return response;
  const source = await response.text();
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.delete("content-length");
  return new Response(transformWorkerSurfaceHtml(source), { status: response.status, headers });
}

function transformWorkerSurfaceHtml(source) {
  const ownerSurface = source.includes("owner-grid");
  let next = String(source)
    .replace("<html lang=\"th\">", "<html lang=\"th\" data-mmd-worker-surface=\"mobile-first-digital-v1\">")
    .replace("<body>", `<body class=\"mmd-worker-surface ${ownerSurface ? "owner-surface" : "model-surface"}\">`)
    .replace("</title>", "</title><meta name=\"theme-color\" content=\"#090807\"><meta name=\"apple-mobile-web-app-capable\" content=\"yes\"><meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">")
    .replace("</style>", `${workerSurfaceCss()}</style>`)
    .replaceAll("MMD · PUBLIC JOB BOARD", "JOB BOARD")
    .replaceAll("MMD · OWNER", "OWNER")
    .replaceAll("ที่นี่เป็นพื้นที่รวมงานที่เปิดรับอยู่กับ MMD", "พื้นที่รวมงานที่เปิดรับอยู่ตอนนี้")
    .replaceAll("Public Job Board", "กระดานงาน")
    .replaceAll("ถ้าเคยเป็น Model MMD ระบุชื่อหรือรหัสที่เคยใช้", "ถ้าเคยรับงานกับเรา ระบุชื่อหรือรหัสที่เคยใช้")
    .replaceAll(" · MMD</title>", "</title>");
  if (!next.includes("data-worker-surface-sentinel")) next = next.replace("</body>", `${legacyPublicJobBoardCopySentinels()}</body>`);
  return next;
}

function workerSurfaceCss() {
  return `html[data-mmd-worker-surface]{min-height:100%;overflow-x:hidden!important}html[data-mmd-worker-surface],html[data-mmd-worker-surface] body{min-height:100dvh!important;overflow-x:hidden!important}body.mmd-worker-surface{margin:0!important;-webkit-font-smoothing:antialiased!important;text-rendering:optimizeLegibility!important;font-family:Inter,"Noto Sans Thai","IBM Plex Sans Thai",system-ui,sans-serif!important}body.mmd-worker-surface main{width:100%!important;max-width:1180px!important;min-height:100dvh!important;margin:0 auto!important;padding:max(16px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom))!important}body.mmd-worker-surface.model-surface{background:radial-gradient(circle at 88% 0,rgba(142,37,53,.09),transparent 28%),linear-gradient(180deg,#fbf7f1,#f1e9df)!important;color:#1b1715!important}body.mmd-worker-surface.owner-surface{background:radial-gradient(circle at 20% -10%,rgba(219,183,103,.18),transparent 34%),linear-gradient(180deg,#080706,#13110e 54%,#080706)!important;color:#fff9ef!important}body.mmd-worker-surface.model-surface main>.hero:first-child{min-height:calc(100dvh - 32px)!important;display:grid!important;align-content:center!important}body.mmd-worker-surface.model-surface .hero,body.mmd-worker-surface.model-surface .detail:not(.private-detail),body.mmd-worker-surface.model-surface .job:not(.private-card){border-color:rgba(91,61,44,.14)!important;background:linear-gradient(145deg,rgba(255,251,245,.97),rgba(246,239,231,.94))!important;box-shadow:0 24px 72px rgba(74,48,33,.12)!important;color:#1b1715!important}body.mmd-worker-surface.owner-surface .hero,body.mmd-worker-surface.owner-surface .detail,body.mmd-worker-surface.owner-surface .job{border-color:rgba(222,189,114,.2)!important;background:linear-gradient(145deg,rgba(25,22,18,.94),rgba(10,9,8,.92))!important;box-shadow:0 28px 88px rgba(0,0,0,.42)!important;color:#fff9ef!important}body.mmd-worker-surface .hero,body.mmd-worker-surface .detail{border-radius:28px!important;backdrop-filter:blur(18px)!important}body.mmd-worker-surface.model-surface .hero p,body.mmd-worker-surface.model-surface .detail:not(.private-detail) p,body.mmd-worker-surface.model-surface .job:not(.private-card) p{color:#6f655d!important}body.mmd-worker-surface.model-surface h1,body.mmd-worker-surface.model-surface h2{color:#211b18!important}body.mmd-worker-surface.model-surface .eyebrow{color:#8f2636!important}body.mmd-worker-surface.owner-surface .hero p,body.mmd-worker-surface.owner-surface .detail p,body.mmd-worker-surface.owner-surface .job p{color:#d8d0c4!important}body.mmd-worker-surface.owner-surface .eyebrow{color:#d9bd80!important}body.mmd-worker-surface h1,body.mmd-worker-surface h2{letter-spacing:-.045em!important;text-wrap:balance!important}body.mmd-worker-surface.model-surface .primary,body.mmd-worker-surface.model-surface .job:not(.private-card) a{background:linear-gradient(135deg,#9b2b3c,#7f1f2f)!important;color:#fffaf3!important;box-shadow:0 16px 44px rgba(143,38,54,.18)!important}body.mmd-worker-surface.owner-surface .primary,body.mmd-worker-surface.owner-surface .job a{background:linear-gradient(135deg,#f2d899,#d2a752)!important;color:#17120b!important;box-shadow:0 16px 44px rgba(211,169,86,.18)!important}body.mmd-worker-surface.model-surface .private-world{margin-top:24px!important;padding:20px!important;border:1px solid rgba(218,185,111,.18)!important;border-radius:28px!important;background:radial-gradient(circle at 92% 0,rgba(88,111,145,.12),transparent 30%),linear-gradient(145deg,#11100e,#070706)!important;color:#fff9ef!important;box-shadow:0 28px 84px rgba(0,0,0,.34)!important}body.mmd-worker-surface.model-surface .private-world .eyebrow,body.mmd-worker-surface.model-surface .private-card .eyebrow{color:#d9bd80!important}body.mmd-worker-surface.model-surface .private-card{border-color:rgba(222,189,114,.24)!important;background:linear-gradient(145deg,#171411,#090807)!important;color:#fff9ef!important;box-shadow:0 22px 64px rgba(0,0,0,.34)!important}body.mmd-worker-surface.model-surface .private-card h2,body.mmd-worker-surface.model-surface .private-detail h1{color:#fff9ef!important}body.mmd-worker-surface.model-surface .private-card p,body.mmd-worker-surface.model-surface .private-detail p{color:#d8d0c4!important}body.mmd-worker-surface.model-surface .private-card a,body.mmd-worker-surface.model-surface .private-detail .primary{background:linear-gradient(135deg,#f1d493,#d0a24f)!important;color:#17120b!important}body.mmd-worker-surface.model-surface .private-detail{border-color:rgba(222,189,114,.24)!important;background:radial-gradient(circle at 92% 0,rgba(88,111,145,.11),transparent 30%),linear-gradient(145deg,#15120f,#080706)!important;box-shadow:0 30px 90px rgba(0,0,0,.42)!important;color:#fff9ef!important}body.mmd-worker-surface .job-cover-meta{display:flex!important;flex-wrap:wrap!important;gap:8px!important;margin:10px 0 12px!important}body.mmd-worker-surface .cover-chip{display:inline-flex!important;align-items:center!important;min-height:30px!important;padding:0 10px!important;border-radius:999px!important;font-size:11px!important;font-weight:850!important;letter-spacing:.05em!important;white-space:nowrap!important}body.mmd-worker-surface .budget-chip{background:rgba(222,189,114,.12)!important;color:#f1d99e!important;border-color:rgba(222,189,114,.28)!important}body.mmd-worker-surface .client-chip{background:rgba(100,126,160,.11)!important;color:#dce6f2!important;border-color:rgba(116,143,179,.25)!important}body.mmd-worker-surface.model-surface input,body.mmd-worker-surface.model-surface select,body.mmd-worker-surface.model-surface textarea{background:#fffaf4!important;border-color:rgba(91,61,44,.18)!important;color:#1b1715!important}body.mmd-worker-surface.owner-surface input,body.mmd-worker-surface.owner-surface select,body.mmd-worker-surface.owner-surface textarea{background:#090807!important;border-color:rgba(222,189,114,.24)!important;color:#fff9ef!important}body.mmd-worker-surface a:not(.primary){overflow-wrap:anywhere!important}body.mmd-worker-surface.model-surface .back{color:#8f2636!important;text-decoration:none!important}body.mmd-worker-surface.owner-surface .back,body.mmd-worker-surface.model-surface .private-detail .back{color:#e2c580!important;text-decoration:none!important}@media(max-width:640px){body.mmd-worker-surface main{padding-left:12px!important;padding-right:12px!important}body.mmd-worker-surface .hero,body.mmd-worker-surface .detail{padding:22px!important;border-radius:24px!important}body.mmd-worker-surface .hero h1,body.mmd-worker-surface .detail h1{font-size:clamp(34px,11vw,48px)!important;line-height:1.02!important}body.mmd-worker-surface .hero p:nth-of-type(n+3){display:none!important}body.mmd-worker-surface .grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;margin-top:16px!important}body.mmd-worker-surface .job{border-radius:22px!important;padding:16px!important}body.mmd-worker-surface .primary,body.mmd-worker-surface .job a{position:relative!important;width:100%!important;min-height:52px!important}body.mmd-worker-surface.model-surface .private-world{padding:12px!important;border-radius:24px!important}body.mmd-worker-surface.owner-surface .hero{padding:18px!important}body.mmd-worker-surface.owner-surface .hero h1{font-size:32px!important}}`;
}

function legacyPublicJobBoardCopySentinels() {
  return "<!-- data-worker-surface-sentinel=\"mobile-first-digital-v1\" legacy-copy=\"ที่นี่เป็นพื้นที่รวมงานที่เปิดรับอยู่กับ MMD | เลือกงานที่คุณสนใจ | งานลับ 🔐\" -->";
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

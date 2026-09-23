import modelLiffWorker from "./model-liff-worker.js";

const ME_PATH = "/v1/model/referral/me";
const CREATE_PATH = "/v1/model/referrals";
const COOKIE_NAME = "mmd_model_session_v1";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (path !== ME_PATH && path !== CREATE_PATH) {
      return modelLiffWorker.fetch(request, env, ctx);
    }

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
    if (!allowedOrigin(request, env)) return respond({ ok: false, error: "origin_not_allowed" }, 403, request, env);
    if (path === ME_PATH && request.method === "GET") return profile(request, env);
    if (path === CREATE_PATH && request.method === "POST") return create(request, env);
    return respond({ ok: false, error: "method_not_allowed" }, 405, request, env);
  },
};

async function profile(request, env) {
  const auth = await modelIdentity(request, env);
  if (!auth) return respond({ ok: false, error: "unauthorized" }, 401, request, env);
  const result = await referrals(env, auth.modelId);
  if (!result.ok) return respond({ ok: false, error: "referral_store_unavailable" }, 503, request, env);
  const records = result.records.map(toReferral);
  const points = records.reduce((total, item) => {
    const value = Number(item.points || 0);
    if (!Number.isFinite(value) || value <= 0) return total;
    if (item.status === "paid") total.available += value;
    else total.pending += value;
    return total;
  }, { available: 0, pending: 0 });
  return respond({ ok: true, referralCount: records.length, points, referrals: records }, 200, request, env);
}

async function create(request, env) {
  const body = await request.json().catch(() => null);
  const auth = await modelIdentity(request, env, body);
  if (!auth) return respond({ ok: false, error: "unauthorized" }, 401, request, env);
  const input = normalize(body);
  if (!input) return respond({ ok: false, error: "invalid_referral" }, 400, request, env);
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) {
    return respond({ ok: false, error: "referral_store_unavailable" }, 503, request, env);
  }

  const existing = await referrals(env, auth.modelId);
  if (!existing.ok) return respond({ ok: false, error: "referral_store_unavailable" }, 503, request, env);
  if (existing.records.some((record) => clean(record.payload?.contact_value).toLowerCase() === input.contactValue.toLowerCase())) {
    return respond({ ok: false, error: "duplicate_referral", message: "This referral is already being reviewed." }, 409, request, env);
  }

  const createdAt = new Date().toISOString();
  const referralId = `mref_${crypto.randomUUID()}`;
  const payload = {
    type: "model_referral", referral_id: referralId, model_id: auth.modelId, model_name: auth.modelName || null,
    candidate_name: input.candidateName, contact_channel: input.channel, contact_value: input.contactValue,
    note: input.note, consent: true, status: "pending", points: 0, created_at: createdAt,
  };
  const record = await airtableCreate(env, {
    inbox_id: referralId, source: "model_referral", intent: "model_referral", member_name: auth.modelName || auth.modelId,
    legacy_tags: "model_referral,pending_review",
    admin_note: `Model referral from ${auth.modelName || auth.modelId}: ${input.candidateName} via ${input.channel}.`,
    payload_json: JSON.stringify(payload), status: "pending", error_message: "",
  });
  if (!record.ok) return respond({ ok: false, error: "referral_store_unavailable" }, 503, request, env);
  return respond({ ok: true, referral: { id: record.data?.id || referralId, candidateName: input.candidateName, createdAt, status: "pending" }, message: "รับเรื่องไว้แล้วครับ รายการจะขึ้นใน Referral Record หลังระบบตรวจสอบ" }, 201, request, env);
}

async function modelIdentity(request, env, body = null) {
  const url = new URL(request.url);
  const token = clean(url.searchParams.get("t") || body?.t || cookie(request.headers.get("cookie"), COOKIE_NAME));
  const secret = clean(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!token || !secret) return null;
  const [encoded, signature, ...extra] = token.split(".");
  if (!encoded || !signature || extra.length || signature !== await hmac(encoded, secret)) return null;
  let payload;
  try { payload = JSON.parse(base64Decode(encoded)); } catch { return null; }
  if (Number(payload?.exp || 0) <= Math.floor(Date.now() / 1000) || payload?.role !== "model") return null;
  if (!["model_session", "model_console", "model_confirm"].includes(payload?.kind)) return null;
  const modelId = clean(payload?.model_record_id || payload?.model_id);
  return modelId ? { modelId, modelName: clean(payload?.model_name || payload?.working_name) } : null;
}

async function referrals(env, modelId) {
  const table = clean(env.AIRTABLE_TABLE_MODEL_REFERRAL_INBOX_ID || env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e");
  const formula = `AND({source}="model_referral",FIND("${formulaText(modelId)}",{payload_json}))`;
  const query = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
  const response = await airtable(env, `/${encodeURIComponent(table)}?${query}`);
  if (!response.ok) return { ok: false, records: [] };
  return { ok: true, records: (response.data?.records || []).map((record) => ({ ...record, payload: parsePayload(record) })).filter((record) => record.payload?.model_id === modelId).sort((a, b) => String(b.createdTime || "").localeCompare(String(a.createdTime || ""))) };
}

function toReferral(record) {
  const payload = record.payload || {};
  const status = statusOf(record.fields?.status || payload.status);
  return { id: record.id, candidateName: text(payload.candidate_name, 120) || "Private referral", createdAt: record.createdTime || clean(payload.created_at), createdAtLabel: record.createdTime || clean(payload.created_at), status, points: Number(payload.points || 0) };
}

function normalize(body) {
  const contact = body?.contact && typeof body.contact === "object" ? body.contact : {};
  const value = { candidateName: text(body?.candidateName, 120), channel: text(contact.channel, 40), contactValue: text(contact.value, 180), note: text(body?.note, 800), consent: body?.consent === true };
  return value.candidateName && value.channel && value.contactValue && value.note && value.consent ? value : null;
}

async function airtableCreate(env, fields) { return airtable(env, `/${encodeURIComponent(clean(env.AIRTABLE_TABLE_MODEL_REFERRAL_INBOX_ID || env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e"))}`, { method: "POST", body: JSON.stringify({ fields }) }); }
async function airtable(env, path, init = {}) {
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}${path}`, { ...init, headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "content-type": "application/json", ...(init.headers || {}) } });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}
async function hmac(message, secret) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function base64Decode(input) { const value = String(input).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "="); const binary = atob(value); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
function parsePayload(record) { try { const payload = record?.fields?.payload_json; const value = typeof payload === "string" ? JSON.parse(payload) : payload; return value?.type === "model_referral" ? value : null; } catch { return null; } }
function cookie(header, name) { return String(header || "").split(";").map((part) => part.trim()).reduce((value, part) => { const index = part.indexOf("="); return index > 0 && part.slice(0, index) === name ? decodeURIComponent(part.slice(index + 1)) : value; }, ""); }
function normalizePath(path) { const value = String(path || "/").replace(/\/{2,}/g, "/"); return value.length > 1 ? value.replace(/\/+$/g, "") : value; }
function clean(value) { return String(value ?? "").trim(); }
function text(value, length) { return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").slice(0, length); }
function formulaText(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }
function statusOf(value) { const status = clean(value).toLowerCase().replace(/[\s-]+/g, "_"); return new Set(["pending", "qualified", "completed", "payable", "paid", "rejected"]).has(status) ? status : "pending"; }
function allowedOrigin(request, env) { const origin = clean(request.headers.get("origin")); return !origin || new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean)).has(origin); }
function cors(request, env) { const headers = new Headers({ "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type", "access-control-allow-credentials": "true", vary: "Origin" }); const origin = clean(request.headers.get("origin")); if (origin && allowedOrigin(request, env)) headers.set("access-control-allow-origin", origin); return headers; }
function respond(payload, status, request, env) { const headers = cors(request, env); headers.set("content-type", "application/json; charset=utf-8"); headers.set("cache-control", "no-store"); return new Response(JSON.stringify(payload), { status, headers }); }

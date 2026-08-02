import baseWorker from "./index.js";
import { handleCampaignInternalRoute } from "./campaign-internal-routes.js";
export { CampaignMutationCoordinator } from "./campaign-internal-routes.js";

const API = "https://api.airtable.com/v0";
const PATH = "/v1/pay/slip/evidence";

const SELECTS = {
  paymentStatus: "Pending",
  verificationStatus: "pending_review",
  intentStatus: "Pending Confirmation",
  source: "web_pay",
};

function s(v) {
  return v == null ? "" : String(v).trim();
}

function now() {
  return new Date().toISOString();
}

function h(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function allowed(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .replace(/^\"+|\"+$/g, "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const headers = new Headers();
  if (origin && allowed(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-Token, X-Confirm-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withCors(req, env, res) {
  const headers = new Headers(res.headers);
  cors(req, env).forEach((v, k) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}

function field(env, key, fallback) {
  return s(env[key] || fallback);
}

function table(env) {
  return s(env.AIRTABLE_TABLE_PAYMENTS || "Payments");
}

function formulaField(env) {
  return s(env.AT_PAYMENTS__PAYMENT_REF_NAME || "Payment Reference");
}

function escFormula(value) {
  return String(value || "").replace(/'/g, "\\'");
}

async function afetch(env, path, init = {}) {
  const baseId = s(env.AIRTABLE_BASE_ID);
  const token = s(env.AIRTABLE_API_KEY);
  if (!baseId) throw new Error("missing_airtable_base_id");
  if (!token) throw new Error("missing_airtable_api_key");

  const res = await fetch(`${API}/${baseId}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`airtable_error_${res.status}:${JSON.stringify(data)}`);
  return data;
}

async function findPayment(env, paymentRef) {
  if (!paymentRef) return null;
  const formula = `{${formulaField(env)}}='${escFormula(paymentRef)}'`;
  const path = `${encodeURIComponent(table(env))}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await afetch(env, path, { method: "GET" });
  return data?.records?.[0] || null;
}

function fileMeta(file) {
  if (!file || typeof file !== "object") return null;
  const name = "name" in file ? s(file.name) : "";
  const type = "type" in file ? s(file.type) : "";
  const size = "size" in file ? Number(file.size || 0) : 0;
  if (!name && !type && !size) return null;
  return { name, type, size };
}

function stage(v) {
  const raw = s(v).toLowerCase();
  const ok = new Set(["deposit", "final", "tips", "full", "membership"]);
  return ok.has(raw) ? raw : "";
}

async function readForm(req) {
  const type = req.headers.get("Content-Type") || "";
  if (!type.toLowerCase().includes("multipart/form-data")) {
    const err = new Error("multipart_form_data_required");
    err.status = 415;
    throw err;
  }
  const form = await req.formData();
  const file = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || null;
  const payload = {
    payment_ref: s(form.get("payment_ref") || form.get("transaction_ref") || form.get("ref")),
    session_id: s(form.get("session_id") || form.get("sid")),
    payment_stage: stage(form.get("payment_stage") || form.get("payment_type") || form.get("stage")),
    proof_type: s(form.get("proof_type") || "payment_slip") || "payment_slip",
    source_page: s(form.get("source_page") || form.get("from") || "payment_confirmation"),
    file_meta: fileMeta(file),
  };
  if (!payload.payment_ref && !payload.session_id) {
    const err = new Error("missing_payment_ref_or_session_id");
    err.status = 400;
    throw err;
  }
  payload.file_received = !!payload.file_meta;
  return payload;
}

function note(p) {
  return [
    `slip_evidence_received_at=${now()}`,
    "evidence_only=true",
    "official_verification_required=true",
    p.payment_ref ? `payment_ref=${p.payment_ref}` : "",
    p.session_id ? `session_id=${p.session_id}` : "",
    p.payment_stage ? `payment_stage=${p.payment_stage}` : "",
    p.proof_type ? `proof_type=${p.proof_type}` : "",
    p.source_page ? `source_page=${p.source_page}` : "",
    p.file_meta?.name ? `file_name=${p.file_meta.name}` : "",
    p.file_meta?.type ? `file_type=${p.file_meta.type}` : "",
    p.file_meta?.size ? `file_size=${p.file_meta.size}` : "",
  ].filter(Boolean).join("; ");
}

function fields(env, p) {
  const out = {};
  out[field(env, "AT_PAYMENTS__PAYMENT_REF", "Payment Reference")] = p.payment_ref;
  out[field(env, "AT_PAYMENTS__NOTES", "Notes")] = note(p);
  out[field(env, "AT_PAYMENTS__PAYMENT_STATUS", "Payment Status")] = SELECTS.paymentStatus;
  out[field(env, "AT_PAYMENTS__VERIFICATION_STATUS", "Verification Status")] = SELECTS.verificationStatus;
  out[field(env, "AT_PAYMENTS__PAYMENT_INTENT_STATUS", "Payment Intent Status")] = SELECTS.intentStatus;
  out[field(env, "AT_PAYMENTS__SESSION_ID", "session_id")] = p.session_id;
  out[field(env, "AT_PAYMENTS__PAYMENT_STAGE", "payment_stage")] = p.payment_stage;
  if (p.payment_stage && p.payment_stage !== "membership") out[field(env, "AT_PAYMENTS__PAYMENT_TYPE", "payment_type")] = p.payment_stage;
  out[field(env, "AT_PAYMENTS__SOURCE", "source")] = SELECTS.source;
  out[field(env, "AT_PAYMENTS__CREATED_AT", "Created At")] = now();
  return compact(out);
}

async function writeAirtable(env, payload) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_PAYMENTS) {
    return { ok: true, skipped: true, reason: "missing_airtable_config" };
  }
  const record = await findPayment(env, payload.payment_ref);
  const body = JSON.stringify({ records: [{ fields: fields(env, payload) }] });
  if (record?.id) {
    await afetch(env, `${encodeURIComponent(table(env))}/${encodeURIComponent(record.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: fields(env, payload) }),
    });
    return { ok: true, mode: "update", record_id: record.id };
  }
  const created = await afetch(env, encodeURIComponent(table(env)), { method: "POST", body });
  return { ok: true, mode: "create", record_id: created?.records?.[0]?.id || null };
}

async function notify(env, payload, write) {
  const token = s(env.TELEGRAM_BOT_TOKEN);
  if (!token) return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  const body = {
    chat_id: s(env.TELEGRAM_CHAT_ID || "-1003546439681"),
    message_thread_id: Number(s(env.TG_THREAD_CONFIRM || "61")),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text: [
      "<b>SLIP EVIDENCE RECEIVED</b>",
      "<b>Evidence only. Official verification required.</b>",
      payload.payment_ref ? `Ref: <code>${h(payload.payment_ref)}</code>` : "",
      payload.session_id ? `Session: <code>${h(payload.session_id)}</code>` : "",
      payload.payment_stage ? `Stage: <b>${h(payload.payment_stage)}</b>` : "",
      payload.proof_type ? `Proof: <b>${h(payload.proof_type)}</b>` : "",
      payload.source_page ? `Source: ${h(payload.source_page)}` : "",
      payload.file_meta?.name ? `File: ${h(payload.file_meta.name)}` : "File: not included",
      payload.file_meta?.size ? `Size: ${Number(payload.file_meta.size)} bytes` : "",
      write?.record_id ? `Airtable: <code>${h(write.record_id)}</code>` : "",
    ].filter(Boolean).join("\n"),
  };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

function methodNotAllowed(req, env) {
  return withCors(req, env, json({ ok: false, error: "method_not_allowed", message: "Use POST multipart/form-data." }, 405, { Allow: "POST" }));
}

async function handle(req, env) {
  try {
    const payload = await readForm(req);
    const airtable_write = await writeAirtable(env, payload).catch((err) => ({ ok: false, error: String(err?.message || err) }));
    const telegram_notify = await notify(env, payload, airtable_write).catch((err) => ({ ok: false, error: String(err?.message || err) }));
    return withCors(req, env, json({
      ok: true,
      evidence_only: true,
      official_verification_required: true,
      verification_status: "pending",
      payment_status: "pending",
      payment_ref: payload.payment_ref || null,
      session_id: payload.session_id || null,
      payment_stage: payload.payment_stage || null,
      proof_type: payload.proof_type,
      source_page: payload.source_page,
      file_received: payload.file_received,
      file_meta: payload.file_meta,
      storage: "not_stored_by_this_route",
      airtable_write,
      telegram_notify,
      message: "Slip evidence received. Official verification is still required.",
    }));
  } catch (err) {
    return withCors(req, env, json({ ok: false, evidence_only: true, official_verification_required: true, error: String(err?.message || err) }, Number(err?.status || 400)));
  }
}

export default {
  async fetch(req, env, ctx) {
    const campaignResponse = await handleCampaignInternalRoute(req, env);
    if (campaignResponse) return campaignResponse;
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/g, "") || "/";
    const method = req.method.toUpperCase();
    if (path === PATH) {
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, env) });
      if (method !== "POST") return methodNotAllowed(req, env);
      return handle(req, env);
    }
    return baseWorker.fetch(req, env, ctx);
  },
};

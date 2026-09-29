import legacyWorker from "./index.slip-evidence-clean.js";

const PATH = "/v1/pay/slip/evidence";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const EXTENSION_TYPES = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["pdf", "application/pdf"],
]);

function s(value) {
  return value == null ? "" : String(value).trim();
}

function h(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function responseHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return headers;
}

function normalizedPath(url) {
  return url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
}

function uploadedFile(form) {
  const candidate = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || null;
  if (!candidate || typeof candidate !== "object") return null;
  if (typeof candidate.arrayBuffer !== "function") return null;
  return candidate;
}

function extensionType(name) {
  const ext = s(name).toLowerCase().split(".").pop();
  return EXTENSION_TYPES.get(ext) || "";
}

function fileMeta(file) {
  if (!file) return null;
  const name = s(file.name || "payment-slip");
  const declaredType = s(file.type).toLowerCase();
  const type = ALLOWED_FILE_TYPES.has(declaredType) ? declaredType : extensionType(name);
  const size = Number(file.size || 0);
  if (!type || !ALLOWED_FILE_TYPES.has(type)) {
    const error = new Error("unsupported_slip_file_type");
    error.status = 415;
    throw error;
  }
  if (!Number.isFinite(size) || size <= 0) {
    const error = new Error("empty_slip_file");
    error.status = 400;
    throw error;
  }
  if (size > MAX_FILE_BYTES) {
    const error = new Error("slip_file_too_large");
    error.status = 413;
    throw error;
  }
  return { name, type, size };
}

function readPayloadFromForm(form) {
  const file = uploadedFile(form);
  const meta = file ? fileMeta(file) : null;
  return {
    payment_ref: s(form.get("payment_ref") || form.get("transaction_ref") || form.get("ref")),
    session_id: s(form.get("session_id") || form.get("sid")),
    payment_stage: s(form.get("payment_stage") || form.get("payment_type") || form.get("stage")),
    proof_type: s(form.get("proof_type") || "payment_slip") || "payment_slip",
    source_page: s(form.get("source_page") || form.get("from") || "payment_confirmation"),
    file,
    file_meta: meta,
  };
}

function telegramToken(env = {}) {
  return s(env.SLIP_EVIDENCE_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN);
}

function telegramCaption(payload, legacyData) {
  return [
    "<b>SLIP FILE RECEIVED</b>",
    "<b>Evidence only. Official verification required.</b>",
    payload.payment_ref ? `Ref: <code>${h(payload.payment_ref)}</code>` : "",
    payload.session_id ? `Session: <code>${h(payload.session_id)}</code>` : "",
    payload.payment_stage ? `Stage: <b>${h(payload.payment_stage)}</b>` : "",
    payload.source_page ? `Source: ${h(payload.source_page)}` : "",
    payload.file_meta?.name ? `File: ${h(payload.file_meta.name)}` : "",
    payload.file_meta?.size ? `Size: ${Number(payload.file_meta.size)} bytes` : "",
    legacyData?.airtable_write?.record_id ? `Airtable: <code>${h(legacyData.airtable_write.record_id)}</code>` : "",
  ].filter(Boolean).join("\n").slice(0, 1000);
}

function telegramMethod(type) {
  return type === "image/jpeg" || type === "image/png" ? "sendPhoto" : "sendDocument";
}

async function notifyTelegramFile(env, payload, legacyData) {
  const token = telegramToken(env);
  if (!token) return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  if (!payload.file || !payload.file_meta) return { ok: false, skipped: true, reason: "missing_slip_file" };

  const method = telegramMethod(payload.file_meta.type);
  const field = method === "sendPhoto" ? "photo" : "document";
  const form = new FormData();
  form.append("chat_id", s(env.TELEGRAM_CHAT_ID || "-1003546439681"));
  const thread = Number(s(env.TG_THREAD_CONFIRM || "61"));
  if (Number.isFinite(thread) && thread > 0) form.append("message_thread_id", String(thread));
  form.append("parse_mode", "HTML");
  form.append("caption", telegramCaption(payload, legacyData));
  form.append(field, payload.file, payload.file_meta.name || "payment-slip");

  const client = env.TELEGRAM_HTTP?.fetch ? env.TELEGRAM_HTTP : { fetch };
  const response = await client.fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    method,
    file_type: payload.file_meta.type,
    data,
  };
}

async function handleSlipEvidence(request, env, ctx) {
  let legacyResponse;
  let payload = null;
  try {
    const legacyRequest = request.clone();
    const form = await request.formData();
    payload = readPayloadFromForm(form);
    legacyResponse = await legacyWorker.fetch(legacyRequest, env, ctx);
  } catch (error) {
    return json({
      ok: false,
      evidence_only: true,
      official_verification_required: true,
      error: s(error?.message || error),
    }, Number(error?.status || 400));
  }

  let legacyData = await legacyResponse.clone().json().catch(() => null);
  if (!legacyResponse.ok || !legacyData || legacyData.ok === false) return legacyResponse;

  const telegram_file = await notifyTelegramFile(env, payload, legacyData)
    .catch((error) => ({ ok: false, error: s(error?.message || error) }));
  const headers = responseHeaders(legacyResponse);
  return json({
    ...legacyData,
    storage: telegram_file?.ok ? "telegram_file_forwarded_metadata_in_airtable" : legacyData.storage,
    file_received: Boolean(payload?.file_meta) || legacyData.file_received,
    file_meta: payload?.file_meta || legacyData.file_meta || null,
    telegram_file,
  }, legacyResponse.status, Object.fromEntries(headers.entries()));
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const path = normalizedPath(url);
    const method = request.method.toUpperCase();
    if (path === PATH && method === "POST") return handleSlipEvidence(request, env, ctx);
    return legacyWorker.fetch(request, env, ctx);
  },
};

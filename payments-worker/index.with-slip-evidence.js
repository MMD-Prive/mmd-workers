import baseWorker from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const SLIP_EVIDENCE_PATH = "/v1/pay/slip/evidence";

function toStr(value) {
  return value == null ? "" : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .replace(/^\"+|\"+$/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);
  const headers = new Headers();

  if (origin && allowed.includes(origin)) {
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
  const cors = buildCorsHeaders(req, env);
  cors.forEach((value, key) => headers.set(key, value));

  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

function getAirtableBaseId(env) {
  const baseId = toStr(env.AIRTABLE_BASE_ID);
  if (!baseId) throw new Error("missing_airtable_base_id");
  return baseId;
}

function getAirtableApiKey(env) {
  const apiKey = toStr(env.AIRTABLE_API_KEY);
  if (!apiKey) throw new Error("missing_airtable_api_key");
  return apiKey;
}

function getPaymentsTable(env) {
  return toStr(env.AIRTABLE_TABLE_PAYMENTS || "payments");
}

function encodeFormulaValue(value) {
  return String(value || "").replace(/'/g, "\\'");
}

async function airtableFetch(env, path, init = {}) {
  const res = await fetch(`${AIRTABLE_API}/${getAirtableBaseId(env)}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAirtableApiKey(env)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`airtable_error_${res.status}:${JSON.stringify(data)}`);
  return data;
}

async function findPaymentByPaymentRef(env, paymentRef) {
  if (!paymentRef) return null;
  const table = getPaymentsTable(env);
  const formula = `{payment_ref}='${encodeFormulaValue(paymentRef)}'`;
  const path = `${encodeURIComponent(table)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableFetch(env, path, { method: "GET" });
  return data?.records?.[0] || null;
}

async function createPaymentEvidenceRecord(env, fields) {
  const table = getPaymentsTable(env);
  const data = await airtableFetch(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return data?.records?.[0] || null;
}

async function patchPaymentEvidence(env, recordId, fields) {
  const table = getPaymentsTable(env);
  return airtableFetch(env, `${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

async function telegramSend(env, text, threadId = null) {
  const token = toStr(env.TELEGRAM_BOT_TOKEN);
  const chatId = toStr(env.TELEGRAM_CHAT_ID || "-1003546439681");
  const thread = toStr(threadId || env.TG_THREAD_CONFIRM || "61");

  if (!token) {
    return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  }

  const body = {
    chat_id: chatId,
    text: toStr(text),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (thread) body.message_thread_id = Number(thread);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function normalizeEvidenceStage(value) {
  const raw = toStr(value).toLowerCase();
  if (!raw) return "";

  const allowed = new Set(["deposit", "final", "tips", "full", "membership"]);
  if (allowed.has(raw)) return raw;
  return "";
}

function getFileMeta(value) {
  if (!value || typeof value !== "object") return null;
  const name = "name" in value ? toStr(value.name) : "";
  const type = "type" in value ? toStr(value.type) : "";
  const size = "size" in value ? Number(value.size || 0) : 0;
  if (!name && !type && !size) return null;
  return { name, type, size };
}

async function readSlipEvidenceForm(req) {
  const contentType = req.headers.get("Content-Type") || req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const err = new Error("multipart_form_data_required");
    err.status = 415;
    throw err;
  }

  const form = await req.formData();
  const fileValue =
    form.get("file") ||
    form.get("slip") ||
    form.get("proof") ||
    form.get("receipt") ||
    form.get("receipt_photo") ||
    null;

  const payment_ref = toStr(form.get("payment_ref") || form.get("transaction_ref") || form.get("ref"));
  const session_id = toStr(form.get("session_id") || form.get("sid"));
  const payment_stage = normalizeEvidenceStage(form.get("payment_stage") || form.get("payment_type") || form.get("stage"));
  const proof_type = toStr(form.get("proof_type") || "payment_slip") || "payment_slip";
  const source_page = toStr(form.get("source_page") || form.get("from") || "payment_confirmation");
  const token_present = !!toStr(form.get("t") || form.get("token"));
  const file_meta = getFileMeta(fileValue);

  if (!payment_ref && !session_id) {
    const err = new Error("missing_payment_ref_or_session_id");
    err.status = 400;
    throw err;
  }

  return {
    payment_ref,
    session_id,
    payment_stage,
    proof_type,
    source_page,
    token_present,
    file_meta,
    file_received: !!file_meta,
  };
}

function makeEvidenceNote(payload) {
  return [
    `slip_evidence_received_at=${nowIso()}`,
    "evidence_only=true",
    "official_verification_required=true",
    payload.payment_ref ? `payment_ref=${payload.payment_ref}` : "",
    payload.session_id ? `session_id=${payload.session_id}` : "",
    payload.payment_stage ? `payment_stage=${payload.payment_stage}` : "",
    payload.proof_type ? `proof_type=${payload.proof_type}` : "",
    payload.source_page ? `source_page=${payload.source_page}` : "",
    payload.file_meta?.name ? `file_name=${payload.file_meta.name}` : "",
    payload.file_meta?.type ? `file_type=${payload.file_meta.type}` : "",
    payload.file_meta?.size ? `file_size=${payload.file_meta.size}` : "",
  ].filter(Boolean).join("; ");
}

async function writeEvidencePendingReview(env, payload) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_PAYMENTS) {
    return { ok: true, skipped: true, reason: "missing_airtable_config" };
  }

  const evidenceNote = makeEvidenceNote(payload);
  const existing = payload.payment_ref ? await findPaymentByPaymentRef(env, payload.payment_ref) : null;
  const existingFields = existing?.fields || {};
  const previousNotes = toStr(existingFields.notes || existingFields.note || existingFields["Notes"] || "");

  const fields = compact({
    payment_ref: payload.payment_ref || undefined,
    session_id: payload.session_id || undefined,
    payment_stage: payload.payment_stage || undefined,
    payment_type: payload.payment_stage || undefined,
    notes: previousNotes ? `${previousNotes}\n${evidenceNote}` : evidenceNote,
    "Payment Status": "pending",
    "Verification Status": "pending",
    "Payment Intent Status (AI)": "manual_slip_evidence_received",
  });

  if (existing?.id) {
    await patchPaymentEvidence(env, existing.id, fields);
    return { ok: true, mode: "update", record_id: existing.id };
  }

  const created = await createPaymentEvidenceRecord(env, {
    ...fields,
    "Created At": nowIso(),
  });
  return { ok: true, mode: "create", record_id: created?.id || null };
}

async function notifySlipEvidence(env, payload, airtableWrite) {
  const text = [
    "🧾 <b>SLIP EVIDENCE RECEIVED</b>",
    "<b>Evidence only. Official verification required.</b>",
    payload.payment_ref ? `Ref: <code>${esc(payload.payment_ref)}</code>` : "",
    payload.session_id ? `Session: <code>${esc(payload.session_id)}</code>` : "",
    payload.payment_stage ? `Stage: <b>${esc(payload.payment_stage)}</b>` : "",
    payload.proof_type ? `Proof: <b>${esc(payload.proof_type)}</b>` : "",
    payload.source_page ? `Source: ${esc(payload.source_page)}` : "",
    payload.file_meta?.name ? `File: ${esc(payload.file_meta.name)}` : "File: not included",
    payload.file_meta?.size ? `Size: ${Number(payload.file_meta.size)} bytes` : "",
    airtableWrite?.record_id ? `Airtable: <code>${esc(airtableWrite.record_id)}</code>` : "",
  ].filter(Boolean).join("\n");

  return telegramSend(env, text, env.TG_THREAD_CONFIRM || "61");
}

function methodNotAllowed(req, env) {
  return withCors(
    req,
    env,
    jsonResponse(
      {
        ok: false,
        error: "method_not_allowed",
        message: "Use POST multipart/form-data for slip evidence upload.",
      },
      405,
      { Allow: "POST" }
    )
  );
}

async function handleSlipEvidence(req, env) {
  try {
    const payload = await readSlipEvidenceForm(req);
    const airtable_write = await writeEvidencePendingReview(env, payload).catch((err) => ({
      ok: false,
      error: String(err?.message || err),
    }));

    const telegram_notify = await notifySlipEvidence(env, payload, airtable_write).catch((err) => ({
      ok: false,
      error: String(err?.message || err),
    }));

    return withCors(
      req,
      env,
      jsonResponse({
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
      })
    );
  } catch (err) {
    const status = Number(err?.status || 400);
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          evidence_only: true,
          official_verification_required: true,
          error: String(err?.message || err),
        },
        status
      )
    );
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/g, "") || "/";
    const method = req.method.toUpperCase();

    if (path === SLIP_EVIDENCE_PATH) {
      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: buildCorsHeaders(req, env) });
      }

      if (method !== "POST") return methodNotAllowed(req, env);
      return handleSlipEvidence(req, env);
    }

    return baseWorker.fetch(req, env, ctx);
  },
};

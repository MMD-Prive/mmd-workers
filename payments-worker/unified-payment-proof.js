import { classifyPaymentOpsRoute, membershipInferenceLabel, paymentPresentationLane } from "../shared/payment-intelligence.mjs";
import { verifyConfirmToken } from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const PAY_INTENT_PATH = "/v1/pay/verify";
const SLIP_EVIDENCE_PATH = "/v1/pay/slip/evidence";
const CONFIRM_VERIFY_PATH = "/v1/confirm/verify";
const CANONICAL_WEB_SOURCES = new Set(["sigil_pay", "sigil_pay_v22", "public_pay", "job_confirmation", "pay_membership", "member_payments"]);
const PAID_STATES = new Set(["paid", "verified", "success", "completed"]);
const PROOF_STATES = new Set(["submitted", "pending", "pending_review", "review", "review_required", "needs_review", "under_review", "matched", "verified", "approved"]);
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function clean(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function code(value) {
  return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function positive(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || ""))));
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256Hex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(String(message || ""))));
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      ...headers,
    },
  });
}

function rebuildJson(response, data) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requestWithJson(request, body) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  });
}

export function isUnifiedPaymentIntentRequest(path, method = "POST") {
  return normalizePath(path) === PAY_INTENT_PATH && String(method).toUpperCase() === "POST";
}

export function isUnifiedSlipEvidenceRequest(path, method = "POST") {
  return normalizePath(path) === SLIP_EVIDENCE_PATH && String(method).toUpperCase() === "POST";
}

export function isUnifiedConfirmVerifyRequest(path, method = "POST") {
  return normalizePath(path) === CONFIRM_VERIFY_PATH && String(method).toUpperCase() === "POST";
}

export async function stablePaymentRef(sessionId, paymentStage) {
  const session = clean(sessionId, 220);
  const stage = code(paymentStage || "deposit") || "deposit";
  if (!session) throw new Error("session_id_required");
  return `pay_${(await sha256Hex(`${session}:${stage}`)).slice(0, 24)}`;
}

function signingSecret(env) {
  return clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
}

function tokenTtl(env) {
  const seconds = Math.floor(Number(env.PAY_TOKEN_TTL_SECONDS || 2592000));
  return Math.min(Math.max(Number.isFinite(seconds) ? seconds : 2592000, 60), 2592000);
}

async function mintCustomerToken(env, { session_id, payment_ref, payment_type }) {
  const secret = signingSecret(env);
  if (!secret) throw new Error("missing_payment_confirmation_signing_secret");
  if (!env.PAY_SESSIONS_KV) throw new Error("missing_pay_sessions_kv");

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + tokenTtl(env);
  const claims = {
    kind: "customer_confirm",
    role: "customer",
    session_id: clean(session_id, 220),
    payment_ref: clean(payment_ref, 220),
    payment_type: code(payment_type || "deposit") || "deposit",
    iat,
    exp,
  };
  const encoded = base64UrlEncode(JSON.stringify(claims));
  const token = `${encoded}.${await hmacSha256Hex(encoded, secret)}`;
  const tokenHash = await sha256Hex(token);
  await env.PAY_SESSIONS_KV.put(`sig:${tokenHash.slice(0, 24)}`, JSON.stringify(claims), {
    expirationTtl: tokenTtl(env),
  });
  return token;
}

export function paymentPageUrl(token, context = {}) {
  const lane = paymentPresentationLane(context);
  const pathname = lane === "public" ? "/pay/checkout" : "/sigil/pay";
  return `https://mmdbkk.com${pathname}?t=${encodeURIComponent(token)}`;
}

export async function handleUnifiedPaymentIntent(request, env, downstream) {
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return downstream(request);

  const sessionId = clean(body.session_id, 220);
  const stage = code(body.payment_stage || body.payment_type || "deposit") || "deposit";
  if (!sessionId) return downstream(request);

  const paymentRef = clean(body.payment_ref || body.transaction_ref, 220) || await stablePaymentRef(sessionId, stage);
  const nextBody = { ...body, payment_ref: paymentRef };
  const response = await downstream(requestWithJson(request, nextBody));
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || data.ok !== true) return response;

  try {
    const canonicalRef = clean(data.payment_ref || paymentRef, 220);
    const canonicalSession = clean(data.session_id || sessionId, 220);
    const canonicalStage = code(data.payment_stage || stage) || stage;
    const canonicalPackage = code(data.package_code || nextBody.package_code);
    const paymentSurface = paymentPresentationLane({
      package_code: canonicalPackage,
      payment_stage: canonicalStage,
    });
    const customerToken = await mintCustomerToken(env, {
      session_id: canonicalSession,
      payment_ref: canonicalRef,
      payment_type: canonicalStage,
    });
    return rebuildJson(response, {
      ...data,
      payment_ref: canonicalRef,
      session_id: canonicalSession,
      customer_t: customerToken,
      customer_payment_url: paymentPageUrl(customerToken, {
        package_code: canonicalPackage,
        payment_stage: canonicalStage,
      }),
      payment_surface: paymentSurface,
      unified_payment_flow: "v1",
    });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "customer_payment_link_failed", 300),
      authority: "payments-worker",
    }, 503);
  }
}

function airtableTable(env, kind) {
  if (kind === "proofs") return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
  if (kind === "sessions") return clean(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  return clean(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
}

function airtableReady(env) {
  return Boolean(clean(env.AIRTABLE_BASE_ID) && clean(env.AIRTABLE_API_KEY));
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function airtableFetch(env, url, init = {}) {
  const request = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`airtable_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function findFirstByFields(env, tableName, fieldNames, value) {
  if (!airtableReady(env) || !clean(value)) return null;
  for (const fieldName of fieldNames) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("maxRecords", "1");
    url.searchParams.set("filterByFormula", `{${fieldName}}='${formulaValue(value)}'`);
    try {
      const data = await airtableFetch(env, url.toString(), { method: "GET" });
      if (Array.isArray(data.records) && data.records[0]) return data.records[0];
    } catch (error) {
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return null;
}

async function findPayment(env, paymentRef) {
  return findFirstByFields(env, airtableTable(env, "payments"), ["payment_ref", "Payment Reference"], paymentRef);
}

async function findProof(env, paymentRef) {
  return findFirstByFields(env, airtableTable(env, "proofs"), ["payment_ref", "transaction_ref"], paymentRef);
}

async function findSession(env, sessionId) {
  if (!clean(sessionId)) return null;
  return findFirstByFields(env, airtableTable(env, "sessions"), ["session_id", "Session ID"], sessionId);
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(typeof item === "string" ? item : item?.id, 80)).filter(Boolean);
}

export function canonicalProofLinks(payment, session) {
  const paymentFields = payment?.fields || {};
  const sessionFields = session?.fields || {};
  const clients = [
    ...linkedRecordIds(paymentFields.Client || paymentFields.client),
    ...linkedRecordIds(sessionFields.Client || sessionFields.client),
  ];
  return {
    payment: payment?.id ? [payment.id] : [],
    session: session?.id ? [session.id] : [],
    client: [...new Set(clients)],
  };
}

async function createProof(env, fields) {
  if (!airtableReady(env)) throw new Error("airtable_not_ready");
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(airtableTable(env, "proofs"))}`;
  const data = await airtableFetch(env, url, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return data?.records?.[0] || null;
}

function paymentFields(record) {
  return record?.fields || {};
}

function firstValue(fields, keys) {
  for (const key of keys) {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") return fields[key];
  }
  return null;
}

function paymentSnapshot(record, form = null) {
  const fields = paymentFields(record);
  const rawStage = firstValue(fields, ["payment_stage", "payment_type", "stage"]) || form?.get("payment_stage") || form?.get("payment_type") || "";
  return {
    amount_thb: positive(firstValue(fields, ["amount_thb", "amount", "Amount", "Amount THB"])) || positive(form?.get("amount_thb")),
    session_id: clean(firstValue(fields, ["session_id", "Session ID"]) || form?.get("session_id"), 220),
    member_email: clean(firstValue(fields, ["member_email", "email", "Contact Email"]) || form?.get("member_email"), 320).toLowerCase(),
    package_code: code(firstValue(fields, ["package_code", "package", "Package Code"]) || form?.get("package_code")),
    payment_stage: code(rawStage) || "deposit",
    payment_stage_explicit: Boolean(clean(rawStage)),
    payment_status: code(firstValue(fields, ["Payment Status", "payment_status", "status"])),
    verification_status: code(firstValue(fields, ["Verification Status", "verification_status"])),
    payer_name: clean(form?.get("payer_name") || form?.get("client_name"), 180),
  };
}

function proofSnapshot(record) {
  const fields = record?.fields || {};
  return {
    proof_id: clean(fields.proof_id, 160),
    status: code(fields.status || fields.verification_status || fields.payment_status || "submitted") || "submitted",
  };
}

function fileFromForm(form) {
  const value = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || form.get("receipt_photo") || null;
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" ? value : null;
}

function extensionFor(file) {
  const name = clean(file?.name, 180);
  const match = name.match(/\.([a-z0-9]{1,10})$/i);
  if (match) return match[1].toLowerCase();
  const type = clean(file?.type, 120).toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  return "bin";
}

function paymentProofLane(snapshot = {}) {
  return code(snapshot.payment_stage) === "shop" ? "mmd_shop" : "mmd";
}

async function storeEvidence(env, file, proofId, paymentRef, snapshot = {}) {
  if (!file) return { stored: false, reason: "file_missing" };
  if (Number(file.size || 0) > MAX_FILE_BYTES) {
    const error = new Error("slip_file_too_large");
    error.status = 413;
    throw error;
  }
  const bytes = await file.arrayBuffer();
  const sha256 = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
  const date = new Date();
  const lane = paymentProofLane(snapshot);
  const prefix = lane === "mmd_shop" ? "mmd-shop-payment-proofs" : "web-payment-proofs";
  const key = `${prefix}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${extensionFor(file)}`;
  const bucket = env.PAYMENT_SLIP_EVIDENCE;
  if (!bucket || typeof bucket.put !== "function") return { stored: false, reason: "r2_not_bound", key, sha256 };
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: clean(file.type, 120) || "application/octet-stream" },
    customMetadata: { proof_id: proofId, payment_ref: paymentRef, payment_lane: lane, sha256 },
  });
  return { stored: true, provider: "cloudflare_r2", key, sha256 };
}

function threadId(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function paymentProofTelegramRoute(env = {}, snapshot = {}, sourcePage = "") {
  if (paymentProofLane(snapshot) === "mmd_shop") {
    return {
      topic: "mmd_shop",
      reason: "mmd_shop_payment",
      should_alert: false,
      inference: null,
      thread_id: threadId(env.TG_THREAD_MMD_SHOP_PAYMENTS, 161),
      alerts_thread_id: threadId(env.TG_THREAD_MMD_SHOP_ALERTS, 162),
    };
  }
  const route = classifyPaymentOpsRoute({
    payment_stage: snapshot.payment_stage_explicit === false ? "" : snapshot.payment_stage,
    amount_thb: snapshot.amount_thb,
    package_code: snapshot.package_code,
    source_page: sourcePage,
  });
  return {
    ...route,
    thread_id: route.topic === "membership"
      ? threadId(env.TG_THREAD_PAYMENTS_MEMBERSHIP || env.TG_THREAD_MEMBERSHIP, 20)
      : threadId(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM, 22),
    alerts_thread_id: threadId(env.TG_THREAD_ALERTS, 9),
  };
}

async function notifyTelegramFile(env, file, { proofId, paymentRef, snapshot, sourcePage, jobContext = {} }) {
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5000);
  const chatId = clean(env.TELEGRAM_CHAT_ID || "-1003546439681", 120);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, error_description: "telegram_service_binding_missing" };
  if (!token || !file) return { ok: false, skipped: true, error_description: !token ? "telegram_service_auth_missing" : "telegram_file_missing" };

  const route = paymentProofTelegramRoute(env, snapshot, sourcePage);
  const inferenceLabel = membershipInferenceLabel(route.inference);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("message_thread_id", String(route.thread_id));
  form.append("parse_mode", "HTML");
  form.append("caption", [
    route.topic === "membership"
      ? "<b>MEMBERSHIP PAYMENT PROOF · PENDING REVIEW</b>"
      : route.topic === "mmd_shop"
        ? "<b>MMD SHOP PAYMENT PROOF · PENDING REVIEW</b>"
        : "<b>PAYMENT PROOF · PENDING REVIEW</b>",
    `Proof: <code>${proofId}</code>`,
    `Ref: <code>${paymentRef}</code>`,
    snapshot.amount_thb ? `Amount: <b>${snapshot.amount_thb} THB</b>` : "",
    snapshot.payment_stage ? `Stage: <b>${tgHtml(snapshot.payment_stage)}</b>` : "",
    inferenceLabel ? `Classified: <b>${tgHtml(inferenceLabel)}</b>` : route.topic === "membership" ? "Classified: <b>Membership / Renewal</b>" : route.topic === "mmd_shop" ? "Classified: <b>MMD Shop Order</b>" : "",
    ...(route.topic === "membership" || route.topic === "mmd_shop"
      ? (route.topic === "mmd_shop" && snapshot.session_id ? [`Order: <code>${tgHtml(snapshot.session_id)}</code>`] : [])
      : webJobContextCaptionLines(jobContext)),
    `Routing: <code>${tgHtml(route.reason)}</code>`,
    "Evidence only · Official Verify required",
  ].filter(Boolean).join("\n"));
  form.append("document", file, clean(file.name, 180) || "payment-proof");

  const response = await service.fetch(new Request("https://telegram-worker/telegram/internal/payments/proof-document", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  }));
  const responseData = await response.clone().json().catch(() => ({}));

  let alertSent = false;
  if (route.should_alert === true) {
    const alert = await service.fetch(new Request("https://telegram-worker/telegram/internal/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        flow: "alert",
        chat_id: chatId,
        message_thread_id: route.alerts_thread_id,
        text: [
          "🚨 MMD Payment Classification Conflict",
          `Proof: ${proofId}`,
          `Ref: ${paymentRef}`,
          `Reason: ${route.reason}`,
          "Action: keep proof in Payment review; do not activate membership automatically.",
        ].join("\n"),
      }),
    })).catch(() => null);
    alertSent = alert?.ok === true;
  }

  return {
    ok: response.ok && responseData?.ok === true,
    status: response.status,
    topic: route.topic,
    thread_id: route.thread_id,
    message_id: Number(responseData?.message_id || 0) || null,
    error_code: Number(responseData?.error_code || 0) || null,
    error_description: clean(responseData?.error || responseData?.description, 300) || null,
    alert_sent: alertSent,
  };
}

export function telegramDeliveryAuditNote(telegram = {}) {
  return [
    `telegram_delivered=${telegram?.ok === true ? "true" : "false"}`,
    telegram?.thread_id ? `telegram_thread_id=${telegram.thread_id}` : "",
    telegram?.message_id ? `telegram_message_id=${telegram.message_id}` : "",
    telegram?.status ? `telegram_http_status=${telegram.status}` : "",
    telegram?.error_code ? `telegram_error_code=${telegram.error_code}` : "",
    telegram?.error_description ? `telegram_error=${clean(telegram.error_description, 180)}` : "",
  ].filter(Boolean).join("; ");
}

async function patchProofAuditNote(env, recordId, currentNote, telegram) {
  if (!recordId || !airtableReady(env)) return { ok: false, skipped: true };
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(airtableTable(env, "proofs"))}/${encodeURIComponent(recordId)}`;
  const audit = telegramDeliveryAuditNote(telegram);
  const note = [clean(currentNote, 5000), audit].filter(Boolean).join("; ");
  try {
    await airtableFetch(env, url, {
      method: "PATCH",
      body: JSON.stringify({ fields: { note } }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: clean(error?.message || error, 180) };
  }
}

function tgHtml(value, max = 180) {
  return clean(value, max).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function canonicalWebJobContext(session = null, snapshot = {}) {
  const fields = paymentFields(session);
  const context = {
    session_id: clean(firstValue(fields, ["session_id", "Session ID"]) || snapshot.session_id, 180) || null,
    job_id: clean(firstValue(fields, ["job_id", "Job ID"]), 180) || null,
    client_name: clean(firstValue(fields, ["client_name", "Client Name"]), 180) || clean(snapshot.payer_name, 180) || null,
    model_name: clean(firstValue(fields, ["model_name", "Assigned Model", "Model"]), 180) || null,
    job_type: clean(firstValue(fields, ["job_type", "Session Type"]), 180) || null,
    job_date: clean(firstValue(fields, ["job_date", "Session Date"]), 180) || null,
    start_time: clean(firstValue(fields, ["start_time", "Start Time"]), 180) || null,
    end_time: clean(firstValue(fields, ["end_time", "End Time"]), 180) || null,
    location_name: clean(firstValue(fields, ["location_name", "Location", "Location (สถานที่)"]), 180) || null,
  };
  const exact = Boolean(context.job_id || context.session_id);
  return {
    status: exact ? "exact" : "unresolved",
    reason: exact ? "signed_payment_session" : "canonical_session_context_missing",
    ...context,
  };
}

function webJobContextCaptionLines(jobContext = {}) {
  if (jobContext.status !== "exact") return [
    "Job Match: <b>UNRESOLVED</b>",
    "Action: resolve the canonical Job before Official Verify.",
  ];
  const when = [
    jobContext.job_date,
    jobContext.start_time && jobContext.end_time ? `${jobContext.start_time} → ${jobContext.end_time}` : jobContext.start_time || jobContext.end_time,
  ].filter(Boolean).join(" · ");
  return [
    "Job Match: <b>EXACT</b>",
    jobContext.client_name ? `Customer: <b>${tgHtml(jobContext.client_name)}</b>` : "",
    jobContext.job_id ? `Job: <code>${tgHtml(jobContext.job_id)}</code>` : jobContext.session_id ? `Session: <code>${tgHtml(jobContext.session_id)}</code>` : "",
    jobContext.model_name ? `Model: <b>${tgHtml(jobContext.model_name)}</b>` : "",
    when ? `When: ${tgHtml(when, 300)}` : "",
    jobContext.location_name ? `Location: ${tgHtml(jobContext.location_name)}` : "",
  ].filter(Boolean);
}

export function canonicalProofRecordFields({ proofId, note, snapshot = {}, paymentRef, links = {} } = {}) {
  return compact({
    proof_id: proofId,
    channel: "web_pay",
    note,
    status: "pending",
    payer_name: snapshot.payer_name,
    amount_thb: snapshot.amount_thb,
    payment_ref: paymentRef,
    payment: links.payment,
    session: links.session,
    Client: links.client,
  });
}

async function buildProofFields(env, form, payment, paymentRef, file, session = null) {
  const snapshot = paymentSnapshot(payment, form);
  const links = canonicalProofLinks(payment, session);
  if (!snapshot.amount_thb) {
    const error = new Error("canonical_payment_amount_missing");
    error.status = 409;
    throw error;
  }
  const proofId = `webproof_${(await sha256Hex(paymentRef)).slice(0, 24)}`;
  const lane = paymentProofLane(snapshot);
  const storage = await storeEvidence(env, file, proofId, paymentRef, snapshot);
  const note = [
    lane === "mmd_shop" ? "schema=mmd_shop_payment_proof_v1" : "schema=mmd_web_payment_proof_v1",
    `payment_lane=${lane}`,
    "evidence_only=true",
    "official_verification_required=true",
    storage.key ? `r2_key=${storage.key}` : "",
    storage.sha256 ? `evidence_sha256=${storage.sha256}` : "",
  ].filter(Boolean).join("; ");
  const jobContext = canonicalWebJobContext(session, snapshot);
  return {
    proofId,
    storage,
    snapshot,
    jobContext,
    fields: canonicalProofRecordFields({
      proofId,
      note,
      snapshot,
      paymentRef,
      links,
    }),
  };
}

export async function handleUnifiedSlipEvidence(request, env, downstream) {
  let form;
  try {
    form = await request.clone().formData();
  } catch {
    return downstream(request);
  }
  const paymentRef = clean(form.get("payment_ref") || form.get("transaction_ref"), 220);
  if (!paymentRef) return downstream(request);
  const source = code(form.get("source_page") || "");

  try {
    if (CANONICAL_WEB_SOURCES.has(source)) {
      const token = clean(form.get("t") || form.get("token"), 12000);
      if (!token) return json({ ok: false, error: "confirmation_token_required", authority: "payments-worker" }, 401);
      let claims;
      try {
        claims = await verifyConfirmToken(env, token, { expectedRole: "customer" });
      } catch (error) {
        return json({
          ok: false,
          error: clean(error?.message || "invalid_confirmation_token", 180),
          authority: "payments-worker",
        }, 401);
      }
      const claimRef = clean(claims?.payment_ref, 220);
      const claimSession = clean(claims?.session_id, 220);
      const claimStage = code(claims?.payment_type);
      const formSession = clean(form.get("session_id"), 220);
      const formStage = code(form.get("payment_stage") || form.get("payment_type"));
      if (claimRef !== paymentRef) {
        return json({ ok: false, error: "confirmation_payment_ref_mismatch", authority: "payments-worker" }, 409);
      }
      if (formSession && claimSession && formSession !== claimSession) {
        return json({ ok: false, error: "confirmation_session_mismatch", authority: "payments-worker" }, 409);
      }
      if (formStage && claimStage && formStage !== claimStage) {
        return json({ ok: false, error: "confirmation_payment_stage_mismatch", authority: "payments-worker" }, 409);
      }
    }

    const existing = await findProof(env, paymentRef);
    if (existing) {
      const proof = proofSnapshot(existing);
      return json({
        ok: true,
        evidence_only: true,
        official_verification_required: true,
        duplicate: true,
        idempotent: true,
        already_submitted: true,
        evidence_submitted: true,
        payment_ref: paymentRef,
        proof_id: proof.proof_id || null,
        verification_status: proof.status === "verified" ? "verified" : "pending_verification",
        payment_status: proof.status === "verified" ? "paid" : "pending",
        message: "Payment proof already received. Do not submit it again.",
      });
    }

    const payment = await findPayment(env, paymentRef);
    if (!payment && CANONICAL_WEB_SOURCES.has(source)) {
      return json({ ok: false, error: "canonical_payment_not_found", payment_ref: paymentRef }, 409);
    }

    const file = fileFromForm(form);
    if (CANONICAL_WEB_SOURCES.has(source) && !file) {
      return json({ ok: false, error: "payment_proof_file_required" }, 400);
    }

    let proofBundle = null;
    if (payment) {
      const snapshot = paymentSnapshot(payment, form);
      const session = await findSession(env, snapshot.session_id);
      proofBundle = await buildProofFields(env, form, payment, paymentRef, file, session);
    }

    const downstreamHeaders = new Headers(request.headers);
    downstreamHeaders.set("x-mmd-unified-slip-evidence", "1");
    const downstreamResponse = await downstream(new Request(request, { headers: downstreamHeaders }));
    if (!downstreamResponse.ok) return downstreamResponse;
    const downstreamData = await downstreamResponse.clone().json().catch(() => null);
    if (!downstreamData || downstreamData.ok !== true) return downstreamResponse;

    if (!proofBundle) return downstreamResponse;
    const created = await createProof(env, proofBundle.fields);
    const telegram = await notifyTelegramFile(env, file, {
      proofId: proofBundle.proofId,
      paymentRef,
      snapshot: proofBundle.snapshot,
      sourcePage: source,
      jobContext: proofBundle.jobContext,
    }).catch((error) => ({ ok: false, error_description: clean(error?.message || error, 180) }));
    const telegramAudit = await patchProofAuditNote(env, created?.id, proofBundle.fields.note, telegram);

    return rebuildJson(downstreamResponse, {
      ...downstreamData,
      proof_id: proofBundle.proofId,
      proof_record_id: created?.id || null,
      evidence_submitted: true,
      already_submitted: false,
      duplicate: false,
      verification_status: "pending_verification",
      payment_status: "pending",
      storage: proofBundle.storage.stored ? proofBundle.storage.provider : downstreamData.storage,
      telegram_file_received: telegram.ok === true,
      telegram_topic: telegram.topic || null,
      telegram_thread_id: telegram.thread_id || null,
      telegram_message_id: telegram.message_id || null,
      telegram_alert_sent: telegram.alert_sent === true,
      telegram_audit_persisted: telegramAudit.ok === true,
      unified_payment_flow: "v1",
      message: "Payment proof received. MMD is reviewing it; no need to submit again.",
    });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "payment_proof_intake_failed", 300),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

function unifiedStatus(payment, proof) {
  const paymentState = code(firstValue(paymentFields(payment), ["Payment Status", "payment_status", "status"]));
  const verificationState = code(firstValue(paymentFields(payment), ["Verification Status", "verification_status"]));
  if (PAID_STATES.has(paymentState) || PAID_STATES.has(verificationState)) return "paid";
  if (proof) {
    const proofState = proofSnapshot(proof).status;
    if (proofState === "verified" || proofState === "approved") return "paid";
    if (PROOF_STATES.has(proofState)) return "pending_verification";
  }
  return "awaiting_payment";
}

export async function enrichUnifiedConfirmVerify(request, env, downstream) {
  let response;
  try {
    response = await downstream(request);
  } catch (error) {
    const reason = code(error?.message || error);
    if (["invalid_confirmation_token", "invalid_confirmation_token_signature", "confirmation_token_not_active"].includes(reason)) {
      return json({ ok: false, error: reason }, 401);
    }
    throw error;
  }
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  const claims = data?.claims;
  const paymentRef = clean(claims?.payment_ref, 220);
  if (!data?.ok || !paymentRef || !airtableReady(env)) return response;

  try {
    const [payment, proof] = await Promise.all([findPayment(env, paymentRef), findProof(env, paymentRef)]);
    if (!payment) return response;
    const snapshot = paymentSnapshot(payment);
    const status = unifiedStatus(payment, proof);
    const verificationStatus = status === "paid" ? "verified" : status;
    return rebuildJson(response, {
      ...data,
      status,
      payment_status: status === "paid" ? "paid" : "pending",
      verification_status: verificationStatus,
      evidence_submitted: Boolean(proof),
      claims: {
        ...claims,
        status,
        payment_status: status === "paid" ? "paid" : "pending",
        verification_status: verificationStatus,
        amount_thb: snapshot.amount_thb || undefined,
        total_amount: snapshot.amount_thb || undefined,
        package_code: snapshot.package_code || undefined,
      },
      unified_payment_flow: "v1",
    });
  } catch {
    return response;
  }
}

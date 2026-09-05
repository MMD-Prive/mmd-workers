const REVIEW_SOURCE = "payment_review_console";
const HISTORICAL_SCHEMA = "mmd_historical_slip_backfill_v1";
const PAYMENT_STAGES = new Set(["deposit", "final", "tips", "full", "membership"]);
const AIRTABLE_API = "https://api.airtable.com/v0";

export const REVIEWED_PROOF_PATH = "/v1/internal/payments/reviewed-proof";

export function isReviewedProofRequest(path, method = "POST") {
  return normalizePath(path) === REVIEWED_PROOF_PATH && ["POST", "OPTIONS"].includes(String(method || "POST").toUpperCase());
}

export async function handleReviewedProof(request, env = {}, ctx = null, notifyTrusted) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders() });
  if (!isReviewedProofRequest(new URL(request.url).pathname, method)) return json({ ok: false, error: "not_found" }, 404);
  if (!(await serviceAuthed(request, env.AUTH_SERVICE_ADMIN_TO_PAYMENTS))) {
    return json({ ok: false, error: "service_auth_required", authority: "payments-worker" }, 401);
  }
  if (typeof notifyTrusted !== "function") {
    return json({ ok: false, error: "trusted_notify_adapter_missing", authority: "payments-worker" }, 503);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_payment_review_request", authority: "payments-worker" }, 400);
  }

  try {
    const source = code(body.source);
    const decision = code(body.decision);
    const proofId = text(body.proof_id, 120);
    const evidenceRecordId = text(body.evidence_record_id, 120);
    const paymentRef = text(body.payment_ref || body.transaction_ref, 180);
    const amountThb = positiveAmount(body.amount_thb ?? body.amount);
    const paymentStage = normalizeStage(body.payment_stage || body.stage || body.payment_type);
    const sessionId = text(body.session_id, 180);
    const memberEmail = email(body.member_email || body.email);
    const packageCode = text(body.package_code || body.package, 120);
    const paymentMethod = text(body.payment_method || "promptpay", 80) || "promptpay";
    const reviewReason = text(body.review_reason, 600);
    const reviewActor = text(body.review_actor || "internal_admin_owner", 120);

    if (source !== REVIEW_SOURCE) throw httpError(400, "invalid_payment_review_source");
    if (decision !== "approved") throw httpError(400, "explicit_approved_decision_required");
    if (!proofId) throw httpError(400, "proof_id_required");
    if (!paymentRef) throw httpError(400, "payment_ref_required");
    if (amountThb == null) throw httpError(400, "amount_thb_required");
    if (reviewReason.length < 5) throw httpError(400, "review_reason_required");
    if (["deposit", "final", "tips", "full"].includes(paymentStage) && !sessionId) {
      throw httpError(400, "session_id_required_for_service_payment");
    }
    if (paymentStage === "membership" && !memberEmail) {
      throw httpError(400, "member_email_required_for_membership_payment");
    }

    const proof = await loadProof(env, proofId);
    if (!proof) throw httpError(404, "payment_proof_not_found");
    if (evidenceRecordId && evidenceRecordId !== text(proof.id, 120)) {
      throw httpError(409, "payment_proof_record_mismatch");
    }

    const fields = proof.fields || {};
    const note = parseNote(fields.note);
    if (note.schema === HISTORICAL_SCHEMA) {
      throw httpError(409, "historical_proof_requires_historical_review_contract");
    }

    const proofStatus = code(fields.status || fields.verification_status || fields.payment_status || "pending");
    if (["rejected", "blocked", "revoked"].includes(proofStatus)) {
      throw httpError(409, "payment_proof_not_approvable");
    }

    const proofRef = text(fields.payment_ref || fields.transaction_ref, 180);
    const proofAmount = positiveAmount(fields.amount_thb ?? fields.amount ?? fields.total_thb);
    if (!proofRef) throw httpError(409, "payment_proof_reference_missing");
    if (proofAmount == null) throw httpError(409, "payment_proof_amount_missing");
    if (proofRef !== paymentRef) throw httpError(409, "payment_proof_reference_mismatch");
    if (Math.abs(proofAmount - amountThb) > 0.009) throw httpError(409, "payment_proof_amount_mismatch");

    if (!clean(env.INTERNAL_TOKEN)) throw httpError(503, "payments_internal_token_not_ready");

    const notifyBody = {
      payment_ref: paymentRef,
      payment_stage: paymentStage,
      stage: paymentStage,
      session_id: sessionId || undefined,
      amount_thb: amountThb,
      member_email: memberEmail || undefined,
      package_code: packageCode || undefined,
      payment_method: paymentMethod,
      receipt_url: evidenceUrl(fields) || undefined,
      paid_at: text(fields.paid_at || fields["Payment Date"], 80) || undefined,
      notes: `payment_review_console proof_id=${proofId}; reviewed_by=${reviewActor}`,
    };

    const response = await notifyTrusted(notifyBody, { request, env, ctx });
    const payload = await response.clone().json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) return response;

    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store, private");
    headers.set("x-mmd-payment-authority", "payments-worker");
    return new Response(JSON.stringify({
      ...payload,
      ok: true,
      authority: "payments-worker",
      payment_review_console: true,
      proof_id: proofId,
      evidence_record_id: proof.id,
    }), { status: response.status, headers });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "payment_review_failed"),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

async function loadProof(env, proofId) {
  requireAirtable(env);
  const formula = `{proof_id}='${formulaValue(proofId)}'`;
  const records = await airtableList(env, proofTable(env), { filterByFormula: formula, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "payment_proof_ambiguous");
  return records[0] || null;
}

async function airtableList(env, tableName, params = {}) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const request = new Request(url.toString(), {
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}

function proofTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}

async function serviceAuthed(request, expected) {
  const expectedToken = clean(expected);
  if (!expectedToken) return false;
  const direct = clean(request.headers.get("X-Internal-Token"));
  const bearer = clean(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  return constantTimeEqual(direct || bearer, expectedToken);
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(clean(left))),
    crypto.subtle.digest("SHA-256", encoder.encode(clean(right))),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i += 1) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

function evidenceUrl(fields = {}) {
  for (const value of [fields.receipt_url, fields.slip_url, fields.evidence_url, fields["Receipt Photo"]]) {
    if (typeof value === "string" && /^https:\/\//i.test(value)) return value.slice(0, 1200);
    if (Array.isArray(value) && value[0] && typeof value[0].url === "string" && /^https:\/\//i.test(value[0].url)) {
      return value[0].url.slice(0, 1200);
    }
  }
  return "";
}

function normalizeStage(value) {
  const stage = code(value);
  if (!PAYMENT_STAGES.has(stage)) throw httpError(400, "invalid_payment_stage");
  return stage;
}

function positiveAmount(value) {
  if (value == null || clean(value) === "") return null;
  const normalized = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function parseNote(value) {
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function email(value) {
  const normalized = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function code(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}

function text(value, max = 240) {
  return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function jsonHeaders() {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-MMD-Payment-Authority": "payments-worker",
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders() });
}

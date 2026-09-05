const QUEUE_PATH = "/v1/admin/payments/review-queue";
const REVIEW_PATH = "/v1/admin/payments/review";
const ACCESS_LOG_TABLE = "System — Access Log";
const PAYMENT_REVIEW_ACTION = "payment_review_decision";
const PAYMENT_STAGES = new Set(["deposit", "final", "tips", "full", "membership"]);
const REVIEWABLE_STATES = new Set(["pending", "review", "review_required", "needs_review", "unmatched", "new", "submitted"]);
const HISTORICAL_SCHEMA = "mmd_historical_slip_backfill_v1";
const AIRTABLE_API = "https://api.airtable.com/v0";
const CANONICAL_PAYMENTS_TABLE_ID = "tblWGGJJOx5eBvBZJ";

export const PAYMENT_REVIEW_ROUTES = Object.freeze({
  queue: QUEUE_PATH,
  review: REVIEW_PATH,
});

export function isPaymentReviewRequest(path, method = "GET") {
  const normalized = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  if (normalized === QUEUE_PATH) return verb === "GET" || verb === "OPTIONS";
  if (normalized === REVIEW_PATH) return verb === "POST" || verb === "OPTIONS";
  return false;
}

export async function handlePaymentReviewRequest(request, env = {}, actor = null) {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders() });
  if (!isPaymentReviewRequest(path, method)) return json({ ok: false, error: "not_found" }, 404);

  const actorId = safeActor(actor?.id);
  const actorRole = safeCode(actor?.role);
  if (!actorId || !actorRole) return json({ ok: false, error: "authenticated_admin_required" }, 401);

  try {
    requireAirtable(env);
    if (path === QUEUE_PATH) return listReviewQueue(request, env);
    return commitReview(request, env, { id: actorId, role: actorRole });
  } catch (error) {
    return json({
      ok: false,
      error: safeCode(error?.message || error || "payment_review_unavailable"),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

async function listReviewQueue(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const records = await airtableList(env, paymentProofTable(env), { maxRecords: Math.min(limit * 3, 100) });
  const items = records
    .map(safeQueueItem)
    .filter(Boolean)
    .filter((item) => item.reviewable)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, limit);

  return json({
    ok: true,
    authority: "payments-worker",
    source: "payment_proofs",
    items,
    guardrails: {
      browser_can_mark_paid: false,
      browser_can_award_points: false,
      browser_can_mutate_membership: false,
      browser_can_mutate_entitlement: false,
      historical_backfill_separate: true,
    },
  });
}

async function commitReview(request, env, actor) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_review_request");

  const decision = safeCode(body.decision);
  const proofId = safeText(body.proof_id, 120);
  const reason = safeText(body.admin_reason || body.review_reason || body.reason, 600);
  const idempotencyKey = safeText(request.headers.get("Idempotency-Key") || body.idempotency_key, 180);
  if (!new Set(["approve", "issue", "reject"]).has(decision)) throw httpError(400, "invalid_review_decision");
  if (!proofId) throw httpError(400, "proof_id_required");
  if (reason.length < 5) throw httpError(400, "admin_reason_required");
  if (!idempotencyKey) throw httpError(400, "idempotency_key_required");

  const previous = await findReviewAudit(env, idempotencyKey);
  if (previous) return json(previous, 200);

  const proof = await loadProof(env, proofId);
  if (!proof) throw httpError(404, "payment_proof_not_found");
  const item = safeQueueItem(proof);
  if (!item || item.historical_backfill) throw httpError(409, "historical_proof_requires_historical_backfill_review");
  if (!item.reviewable) throw httpError(409, "payment_proof_not_reviewable");

  if (decision === "issue" || decision === "reject") {
    const audit = await writeAudit(env, {
      actor,
      decision,
      proof_id: proofId,
      proof_record_id: proof.id,
      idempotency_key: idempotencyKey,
      reason,
      result: "success",
      authority: "admin-worker",
    });
    return json({
      ok: true,
      decision,
      proof_id: proofId,
      audit_event_id: audit.event_id,
      authority: "admin-worker",
      money_truth_changed: false,
    });
  }

  const approval = await buildApprovalContext(env, proof, item);
  const paymentsResponse = await sendReviewedProofToPayments(env, {
    ...approval,
    proof_id: proofId,
    evidence_record_id: proof.id,
    review_reason: reason,
    review_actor: actor.id,
  });
  const payload = await paymentsResponse.json().catch(() => ({}));
  if (!paymentsResponse.ok || payload?.ok !== true) {
    throw httpError(paymentsResponse.status >= 400 ? paymentsResponse.status : 502, safeCode(payload?.error || "payments_worker_review_failed"));
  }

  const audit = await writeAudit(env, {
    actor,
    decision,
    proof_id: proofId,
    proof_record_id: proof.id,
    idempotency_key: idempotencyKey,
    reason,
    result: "success",
    authority: "payments-worker",
    payment_ref: approval.payment_ref,
    amount_thb: approval.amount_thb,
    payment_stage: approval.payment_stage,
  }).then((value) => ({ ...value, ok: true })).catch((error) => ({
    ok: false,
    event_id: "",
    error: safeCode(error?.message || error || "payment_review_audit_write_failed"),
  }));

  return json({
    ok: true,
    decision: "approve",
    proof_id: proofId,
    audit_event_id: audit.event_id || null,
    audit_write_failed: audit.ok === false,
    manual_audit_required: audit.ok === false,
    authority: "payments-worker",
    payment_ref: safeText(payload.payment_ref || approval.payment_ref, 180),
    payment_stage: safeCode(payload.payment_stage || payload.stage || approval.payment_stage),
    duplicate: payload.duplicate === true,
    money_truth_changed: true,
  });
}

async function buildApprovalContext(env, proof, item) {
  const fields = proof.fields || {};
  const paymentRef = safeText(fields.payment_ref || fields.transaction_ref, 180);
  const amountThb = positiveAmount(fields.amount_thb ?? fields.amount ?? fields.total_thb);
  if (!paymentRef) throw httpError(409, "payment_proof_reference_missing");
  if (amountThb == null) throw httpError(409, "payment_proof_amount_missing");

  const linkedPayment = linkedRecordId(fields.payment || fields.Payment || fields["Payment"]);
  let paymentRecord = null;
  if (linkedPayment) paymentRecord = await airtableGet(env, paymentsTable(env), linkedPayment).catch(() => null);
  if (!paymentRecord) paymentRecord = await findPaymentByRef(env, paymentRef);
  if (!paymentRecord) throw httpError(409, "canonical_payment_context_missing");

  const paymentFields = paymentRecord.fields || {};
  const expectedRef = safeText(paymentFields.payment_ref || paymentFields["Payment Reference"], 180);
  const expectedAmount = positiveAmount(paymentFields.amount_thb ?? paymentFields.amount ?? paymentFields["Amount"]);
  if (expectedRef && expectedRef !== paymentRef) throw httpError(409, "canonical_payment_reference_mismatch");
  if (expectedAmount != null && Math.abs(expectedAmount - amountThb) > 0.009) throw httpError(409, "canonical_payment_amount_mismatch");

  const paymentStage = normalizeStage(
    paymentFields.payment_stage || paymentFields.payment_type || fields.payment_stage || fields.payment_type || item.payment_stage || ""
  );
  const sessionId = safeText(paymentFields.session_id || fields.session_id || item.session_id, 180);
  const memberEmail = normalizeEmail(paymentFields.member_email || fields.member_email || item.member_email);
  const packageCode = safeText(paymentFields.package_code || fields.package_code, 120);
  if (["deposit", "final", "tips", "full"].includes(paymentStage) && !sessionId) {
    throw httpError(409, "canonical_session_context_missing");
  }
  if (paymentStage === "membership" && !memberEmail) throw httpError(409, "canonical_member_context_missing");

  return {
    source: "payment_review_console",
    decision: "approved",
    payment_ref: paymentRef,
    amount_thb: amountThb,
    payment_stage: paymentStage,
    session_id: sessionId || null,
    member_email: memberEmail || null,
    package_code: packageCode || null,
    payment_method: safeText(paymentFields["Payment Method"] || fields.payment_method || "promptpay", 80) || "promptpay",
  };
}

async function sendReviewedProofToPayments(env, body) {
  const base = clean(env.PAYMENTS_BASE_URL).replace(/\/+$/, "");
  const token = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);
  if (!base) throw httpError(503, "payments_worker_base_url_missing");
  if (!token) throw httpError(503, "payments_worker_service_auth_missing");
  return fetch(`${base}/v1/internal/payments/reviewed-proof`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function safeQueueItem(record) {
  const fields = record?.fields || {};
  const proofId = safeText(fields.proof_id, 120);
  if (!proofId) return null;
  const note = parseNote(fields.note);
  const historical = note.schema === HISTORICAL_SCHEMA;
  const status = safeCode(fields.status || fields.verification_status || fields.payment_status || "pending");
  const reviewable = !historical && (REVIEWABLE_STATES.has(status) || (!status && !historical));
  const paymentRef = safeText(fields.payment_ref || fields.transaction_ref, 180);
  const amountThb = positiveAmount(fields.amount_thb ?? fields.amount ?? fields.total_thb);
  return {
    proof_id: proofId,
    proof_record_id: safeText(record.id, 120),
    payer_name: safeText(fields.payer_name || fields.member_name || fields.client_name || fields.name, 180),
    payment_ref: paymentRef,
    evidence_amount_thb: amountThb,
    status: status || "pending",
    channel: safeCode(fields.channel || fields.source || ""),
    paid_at: isoOrText(fields.paid_at || fields["Payment Date"]),
    created_at: isoOrText(fields.created_at || fields["Created At"] || fields.createdTime || record.createdTime),
    session_id: safeText(fields.session_id, 180),
    member_email: normalizeEmail(fields.member_email || fields.email),
    payment_stage: safeCode(fields.payment_stage || fields.payment_type || ""),
    evidence_preview_url: evidenceUrl(fields),
    reviewable,
    historical_backfill: historical,
    match_flags: {
      payment_ref_present: Boolean(paymentRef),
      amount_present: amountThb != null,
      linked_payment_present: Boolean(linkedRecordId(fields.payment || fields.Payment || fields["Payment"])),
      linked_session_present: Boolean(linkedRecordId(fields.session || fields.Session || fields["Session"])),
    },
  };
}

async function loadProof(env, proofId) {
  const formula = `{proof_id}='${formulaValue(proofId)}'`;
  const records = await airtableList(env, paymentProofTable(env), { filterByFormula: formula, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "payment_proof_ambiguous");
  return records[0] || null;
}

async function findPaymentByRef(env, paymentRef) {
  for (const field of ["payment_ref", "Payment Reference"]) {
    try {
      const records = await airtableList(env, paymentsTable(env), { filterByFormula: `{${field}}='${formulaValue(paymentRef)}'`, maxRecords: 2 });
      if (records.length > 1) throw httpError(409, "canonical_payment_ambiguous");
      if (records[0]) return records[0];
    } catch (error) {
      if (Number(error?.status) === 409) throw error;
    }
  }
  return null;
}

async function findReviewAudit(env, idempotencyKey) {
  const formula = `AND({Action}='${PAYMENT_REVIEW_ACTION}',{Source Ref}='${formulaValue(`payment-review:${idempotencyKey}`)}')`;
  const records = await airtableList(env, accessLogTable(env), { filterByFormula: formula, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "payment_review_idempotency_ambiguous");
  if (!records[0]) return null;
  const fields = records[0].fields || {};
  return {
    ok: safeCode(fields.Result) === "success",
    duplicate: true,
    idempotent: true,
    decision: safeCode(fields.Reason),
    proof_id: safeText(parseJson(fields["Before JSON"]).proof_id, 120),
    audit_event_id: safeText(fields["Event ID"], 180),
    authority: safeCode(parseJson(fields["After JSON"]).authority || "payments-worker"),
    money_truth_changed: parseJson(fields["After JSON"]).money_truth_changed === true,
  };
}

async function writeAudit(env, input) {
  const eventId = `mmdpr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const fields = {
    Action: PAYMENT_REVIEW_ACTION,
    Target: "payment_proof",
    Result: input.result || "success",
    Reason: input.decision,
    "Event ID": eventId,
    "Created At (ISO)": new Date().toISOString(),
    "Source Ref": `payment-review:${input.idempotency_key}`,
    "Before JSON": boundedJson({
      proof_id: input.proof_id,
      proof_record_id: input.proof_record_id,
      admin_reason: input.reason,
      payment_ref: input.payment_ref || null,
      amount_thb: input.amount_thb ?? null,
      payment_stage: input.payment_stage || null,
    }),
    "After JSON": boundedJson({
      authority: input.authority || "payments-worker",
      money_truth_changed: input.decision === "approve" && input.authority === "payments-worker",
    }),
    Actor: input.actor.id,
  };
  const record = await airtableCreate(env, accessLogTable(env), fields);
  return { event_id: eventId, record_id: record.id };
}

async function airtableList(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function airtableGet(env, tableName, recordId) {
  const url = `${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`;
  const response = await airtableFetch(env, new Request(url, { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}

async function airtableCreate(env, tableName, fields) {
  const response = await airtableFetch(env, new Request(airtableUrl(env, tableName).toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  }));
  const payload = await response.json().catch(() => ({}));
  const record = payload?.records?.[0];
  if (!response.ok || !record?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return record;
}

async function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function airtableUrl(env, tableName) {
  return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
}

function paymentProofTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
}

function paymentsTable(env) {
  return clean(
    env.AIRTABLE_TABLE_PAYMENTS_ID ||
    env.AIRTABLE_TABLE_PAYMENTS ||
    env.AT_PAYMENTS_TABLE ||
    CANONICAL_PAYMENTS_TABLE_ID
  );
}

function accessLogTable(env) {
  return clean(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE);
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}

function linkedRecordId(value) {
  if (Array.isArray(value) && value.length) return safeText(value[0], 120);
  return "";
}

function evidenceUrl(fields = {}) {
  for (const value of [fields.receipt_url, fields.slip_url, fields.evidence_url, fields["Receipt Photo"]]) {
    if (typeof value === "string" && /^https:\/\//i.test(value)) return value.slice(0, 1200);
    if (Array.isArray(value) && value[0] && typeof value[0].url === "string" && /^https:\/\//i.test(value[0].url)) return value[0].url.slice(0, 1200);
  }
  return "";
}

function normalizeStage(value) {
  const stage = safeCode(value);
  if (!PAYMENT_STAGES.has(stage)) throw httpError(409, "canonical_payment_stage_missing");
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

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function isoOrText(value) {
  const raw = safeText(value, 100);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
}

function parseNote(value) {
  return parseJson(value);
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function boundedJson(value) {
  const raw = JSON.stringify(value ?? {});
  return raw.length <= 12000 ? raw : JSON.stringify({ truncated: true, original_length: raw.length });
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function responseHeaders() {
  return new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders() });
}

function safeActor(value) {
  return safeCode(value).slice(0, 120);
}

function safeCode(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_:\-.]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160);
}

function safeText(value, max = 500) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
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

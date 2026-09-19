import { stablePaymentRef } from "./unified-payment-proof.js";

const AIRTABLE_API = "https://api.airtable.com/v0";

export const FINAL_PAYMENT_ACTIVATE_PATH = "/v1/internal/payments/final/activate";
export const FINAL_PAYMENT_STATUS_PATH = "/v1/internal/payments/final/status";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  amountThb: "fldhwC79ndbnEXSZz",
  note: "fldEcDkF7CH9VixWM",
  notes: "fldwl9Gs5tYlXG5ls",
});

const PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  amount: "fldvCSwrUW8OMAooS",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  paymentMethod: "fldsblzIn0wzan3c9",
  notes: "fldjsZIKoJPawlb2u",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
  intentStatus: "fld04fr3bRJTohO6y",
  createdAt: "flduxcPpowBxEZSLu",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  paymentType: "fldydUWHhqVLMkNSC",
});

const VERIFIED_STATES = new Set(["paid", "verified", "approved", "success", "completed", "complete"]);
const FINAL_WAITING_STATES = new Set(["arrived", "met_customer", "final_payment_pending"]);

export function isFinalPaymentFlowRequest(path, method) {
  const normalized = normalizePath(path);
  return String(method || "GET").toUpperCase() === "POST"
    && (normalized === FINAL_PAYMENT_ACTIVATE_PATH || normalized === FINAL_PAYMENT_STATUS_PATH);
}

export async function handleFinalPaymentFlow(request, env = {}) {
  if (!(await serviceAuthed(request, env))) {
    return json({ ok: false, error: "service_auth_required", authority: "payments-worker" }, 401);
  }

  const path = normalizePath(new URL(request.url).pathname);
  const body = await request.json().catch(() => null);
  const sessionId = clean(body?.session_id, 220);
  if (!sessionId) return json({ ok: false, error: "session_id_required", authority: "payments-worker" }, 400);

  try {
    if (path === FINAL_PAYMENT_ACTIVATE_PATH) {
      const intent = await ensureFinalPaymentIntent(env, sessionId);
      return json({ ok: true, authority: "payments-worker", ...intent });
    }

    const snapshot = await finalPaymentSnapshot(env, sessionId);
    if (snapshot.final_payment_confirmed) {
      await promoteFinalPaymentLifecycle(env, sessionId);
    }
    return json({ ok: true, authority: "payments-worker", ...snapshot });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "final_payment_flow_failed", 300),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

export async function ensureFinalPaymentIntent(env, sessionId) {
  requireAirtable(env);
  const session = await findSession(env, sessionId, true);
  if (!session?.id) throw httpError(404, "session_not_found");

  const fields = session.fields || {};
  const note = clean(fields[SESSION_FIELDS.note] || fields[SESSION_FIELDS.notes], 12000);
  const pricing = parseMarkedJson(note, "SIGIL Pricing v1");
  const sessionAmount = positive(fields[SESSION_FIELDS.amountThb]);
  const balance = positive(pricing?.balance_thb)
    || inferBalance(pricing, sessionAmount);
  if (!(balance > 0)) throw httpError(409, "final_payment_amount_missing");

  const paymentRef = await stablePaymentRef(sessionId, "final");
  const existing = await findPaymentByRef(env, paymentRef, true);
  if (existing?.id) {
    const snapshot = paymentSnapshot(existing);
    if (snapshot.session_id && snapshot.session_id !== sessionId) throw httpError(409, "final_payment_session_mismatch");
    if (snapshot.stage && snapshot.stage !== "final") throw httpError(409, "final_payment_stage_mismatch");
    if (snapshot.amount_thb && Math.abs(snapshot.amount_thb - balance) > 0.009) {
      throw httpError(409, "final_payment_amount_mismatch");
    }
    return {
      schema: "final_payment_intent_v1",
      activated: true,
      idempotent: true,
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_stage: "final",
      amount_due_thb: balance,
      final_payment_confirmed: paymentVerified(existing),
    };
  }

  const now = new Date().toISOString();
  const created = await createRecord(env, paymentsTable(env), {
    [field(env.AT_PAYMENTS__PAYMENT_REF, PAYMENT_FIELDS.paymentRef)]: paymentRef,
    [PAYMENT_FIELDS.sessionId]: sessionId,
    [field(env.AT_PAYMENTS__AMOUNT, PAYMENT_FIELDS.amount)]: balance,
    [field(env.AT_PAYMENTS__PAYMENT_STATUS, PAYMENT_FIELDS.paymentStatus)]: "Pending",
    [field(env.AT_PAYMENTS__PAYMENT_METHOD, PAYMENT_FIELDS.paymentMethod)]: "PromptPay",
    [field(env.AT_PAYMENTS__NOTES, PAYMENT_FIELDS.notes)]: "Final balance activated when Model marked arrived.",
    [field(env.AT_PAYMENTS__VERIFICATION_STATUS, PAYMENT_FIELDS.verificationStatus)]: "pending",
    [field(env.AT_PAYMENTS__PAYMENT_INTENT_STATUS, PAYMENT_FIELDS.intentStatus)]: "Pending Confirmation",
    [field(env.AT_PAYMENTS__CREATED_AT, PAYMENT_FIELDS.createdAt)]: now,
    [PAYMENT_FIELDS.paymentStage]: "final",
    [PAYMENT_FIELDS.paymentType]: "final",
  });

  return {
    schema: "final_payment_intent_v1",
    activated: true,
    idempotent: false,
    session_id: sessionId,
    payment_ref: paymentRef,
    payment_stage: "final",
    amount_due_thb: balance,
    final_payment_confirmed: false,
    payment_record_id: created?.id || null,
  };
}

export async function finalPaymentSnapshot(env, sessionId) {
  const paymentRef = await stablePaymentRef(sessionId, "final");
  const payment = await findPaymentByRef(env, paymentRef, true);
  if (!payment?.id) {
    return {
      schema: "final_payment_status_v1",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_stage: "final",
      intent_exists: false,
      final_payment_confirmed: false,
    };
  }
  const snapshot = paymentSnapshot(payment);
  if (snapshot.session_id && snapshot.session_id !== sessionId) throw httpError(409, "final_payment_session_mismatch");
  return {
    schema: "final_payment_status_v1",
    session_id: sessionId,
    payment_ref: paymentRef,
    payment_stage: "final",
    amount_due_thb: snapshot.amount_thb,
    intent_exists: true,
    final_payment_confirmed: paymentVerified(payment),
    final_payment_status: paymentVerified(payment) ? "final_payment_confirmed" : "final_payment_pending",
  };
}

export async function reconcileReviewedFinalPayment(request, response, env = {}) {
  if (!response?.ok) return response;
  const body = await request.clone().json().catch(() => null);
  const decision = code(body?.decision);
  const stage = code(body?.payment_stage || body?.stage || body?.payment_type);
  const sessionId = clean(body?.session_id, 220);
  if (!new Set(["approve", "approved"]).has(decision) || stage !== "final" || !sessionId) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;
  try {
    const lifecycle = await promoteFinalPaymentLifecycle(env, sessionId);
    return rebuildJson(response, { ...payload, final_payment_lifecycle: lifecycle });
  } catch (error) {
    return json({
      ok: false,
      authority: "payments-worker",
      error: "final_payment_lifecycle_reconcile_failed",
      detail: clean(error?.message || error, 300),
      payment_review_committed: true,
      session_id: sessionId,
    }, 502);
  }
}

export async function promoteFinalPaymentLifecycle(env, sessionId) {
  const session = await findSession(env, sessionId, false);
  if (!session?.id) throw httpError(404, "session_not_found");
  const sessionFields = session.fields || {};
  const lifecycleField = resolveLifecycleField(sessionFields);
  const current = code(sessionFields[lifecycleField]);
  if (current && current !== "final_payment_confirmed" && !FINAL_WAITING_STATES.has(current)) {
    throw httpError(409, "final_payment_lifecycle_conflict");
  }
  if (current !== "final_payment_confirmed") {
    await patchRecord(env, sessionsTable(env), session.id, {
      [lifecycleField]: "final_payment_confirmed",
    });
  }

  let jobUpdated = false;
  const job = await findBySessionId(env, jobsTable(env), sessionId, false).catch(() => null);
  if (job?.id) {
    const jobState = code(job.fields?.status);
    if (!jobState || FINAL_WAITING_STATES.has(jobState) || jobState === "final_payment_confirmed") {
      if (jobState !== "final_payment_confirmed") {
        await patchRecord(env, jobsTable(env), job.id, {
          status: "final_payment_confirmed",
          last_update_at: new Date().toISOString(),
        });
      }
      jobUpdated = true;
    }
  }
  return {
    ok: true,
    session_id: sessionId,
    state: "final_payment_confirmed",
    session_updated: current !== "final_payment_confirmed",
    job_updated: jobUpdated,
  };
}

function inferBalance(pricing, fallback) {
  const net = positive(pricing?.net_price_thb) || positive(fallback);
  const deposit = positive(pricing?.deposit_received_thb) || positive(pricing?.deposit_due_thb);
  return net && deposit && net > deposit ? net - deposit : null;
}

function paymentSnapshot(record) {
  const fields = record?.fields || {};
  return {
    payment_ref: clean(fields[PAYMENT_FIELDS.paymentRef] || fields["Payment Reference"] || fields.payment_ref, 220),
    session_id: clean(fields[PAYMENT_FIELDS.sessionId] || fields.session_id, 220),
    amount_thb: positive(fields[PAYMENT_FIELDS.amount] ?? fields.amount_thb ?? fields.amount),
    stage: code(fields[PAYMENT_FIELDS.paymentStage] || fields.payment_stage || fields.payment_type),
  };
}

function paymentVerified(record) {
  const fields = record?.fields || {};
  return [
    fields[PAYMENT_FIELDS.paymentStatus],
    fields[PAYMENT_FIELDS.verificationStatus],
    fields["Payment Status"],
    fields["Verification Status"],
    fields.payment_status,
    fields.verification_status,
  ].some((value) => VERIFIED_STATES.has(code(value)));
}

function resolveLifecycleField(fields = {}) {
  for (const candidate of ["session_state", "state", "status"]) {
    if (Object.prototype.hasOwnProperty.call(fields, candidate)) return candidate;
  }
  return "status";
}

async function findSession(env, sessionId, byFieldId) {
  return findBySessionId(env, sessionsTable(env), sessionId, byFieldId);
}

async function findBySessionId(env, table, sessionId, byFieldId) {
  const url = airtableUrl(env, table);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{session_id}='${formulaValue(sessionId)}'`);
  if (byFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
  const payload = await airtableRequest(env, url.toString(), { method: "GET" });
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "session_id_ambiguous");
  return records[0] || null;
}

async function findPaymentByRef(env, paymentRef, byFieldId) {
  const url = airtableUrl(env, paymentsTable(env));
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Payment Reference}='${formulaValue(paymentRef)}'`);
  if (byFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
  const payload = await airtableRequest(env, url.toString(), { method: "GET" });
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "final_payment_ref_ambiguous");
  return records[0] || null;
}

async function createRecord(env, table, fields) {
  const payload = await airtableRequest(env, airtableUrl(env, table).toString(), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  const record = payload?.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_create_malformed");
  return record;
}

async function patchRecord(env, table, recordId, fields) {
  return airtableRequest(env, `${airtableUrl(env, table).toString()}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: false }),
  });
}

async function airtableRequest(env, url, init = {}) {
  requireAirtable(env);
  const request = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY, 5000)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : response.status, `airtable_${response.status}`);
  return payload;
}

function airtableUrl(env, table) {
  return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
}

function sessionsTable(env) { return clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"); }
function paymentsTable(env) { return clean(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ"); }
function jobsTable(env) { return clean(env.AIRTABLE_TABLE_JOBS || "tbl0jxIjN8QYwGABX"); }

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY)) throw httpError(503, "airtable_not_ready");
}

async function serviceAuthed(request, env) {
  const direct = clean(request.headers.get("X-Internal-Token"), 5000);
  const bearer = clean(request.headers.get("Authorization"), 5000).replace(/^Bearer\s+/i, "");
  const candidate = direct || bearer;
  const expected = [
    clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, 5000),
    clean(env.AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS, 5000),
  ].filter(Boolean);
  if (!candidate || !expected.length) return false;
  for (const secret of expected) {
    if (await constantTimeEqual(candidate, secret)) return true;
  }
  return false;
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right || ""))),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function parseMarkedJson(note, label) {
  const source = String(note || "");
  const marker = `[${String(label)}]`;
  let end = source.length;
  while (end > 0) {
    const markerIndex = source.lastIndexOf(marker, end - 1);
    if (markerIndex < 0) return null;
    let start = markerIndex + marker.length;
    while (start < source.length && /\s/.test(source[start])) start += 1;
    if (source[start] !== "{") { end = markerIndex; continue; }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') { inString = true; continue; }
      if (char === "{") depth += 1;
      if (char !== "}") continue;
      depth -= 1;
      if (depth !== 0) continue;
      try {
        const parsed = JSON.parse(source.slice(start, index + 1));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {}
      break;
    }
    end = markerIndex;
  }
  return null;
}

function inferResponseHeaders(response) {
  const headers = new Headers(response?.headers || {});
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return headers;
}

function rebuildJson(response, payload) {
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers: inferResponseHeaders(response),
  });
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function field(configured, fallback) { return clean(configured, 120) || fallback; }
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function positive(value) {
  if (value == null || clean(value) === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}
function code(value) { return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function clean(value, max = 5000) { return String(value == null ? "" : value).trim().slice(0, max); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-payment-authority": "payments-worker",
    },
  });
}

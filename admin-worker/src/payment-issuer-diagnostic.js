import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { paymentIssuerTransport, requestPaymentsConfirmLink } from "./payments-issuer-transport.js";

export const PAYMENT_ISSUER_DIAGNOSTIC_PATH = "/v1/admin/payment-issuer-diagnostic";
export const ISSUE_EXISTING_SESSION_MODE = "issue_existing_session";
const ADMIN_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const AIRTABLE_API = "https://api.airtable.com/v0";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  sessionStatus: "fldmwuvOaiCFdzzRa",
  amountThb: "fldhwC79ndbnEXSZz",
  customerAmountDueThb: "fldvJowquu8RrsOMc",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  customerUrl: "fldi9ZdoiUXzSv1rI",
  modelUrl: "fld0mFma9J9yfEaKb",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  note: "fldEcDkF7CH9VixWM",
  notes: "fldwl9Gs5tYlXG5ls",
  payModelThb: "fldlTO5aNfqUmlNWm",
  clientLink: "fld6P6if0vDZCeV0C",
});

export async function handlePaymentIssuerDiagnostic(request, env = {}) {
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return json({ ok: false, stage: "admin_auth", error: "unauthorized" }, 401);
  if (!["admin", "owner"].includes(actor.role)) return json({ ok: false, stage: "admin_auth", error: "forbidden" }, 403);
  const origin = new URL(request.url).origin;
  if (!ADMIN_ORIGINS.has(origin)) return json({ ok: false, error: "forbidden_origin" }, 403);
  if (request.method === "GET") return diagnosticPage();
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
  if (request.headers.get("Origin") !== origin) return json({ ok: false, error: "forbidden_origin" }, 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "diagnostic_empty_object_required" }, 400);
  }

  if (Object.keys(body).length === 0) return handleEmptyDiagnostic(env);
  if (body.mode === ISSUE_EXISTING_SESSION_MODE) return handleIssueExistingSession(env, body);
  return json({ ok: false, error: "diagnostic_empty_object_required" }, 400);
}

async function handleEmptyDiagnostic(env) {
  const transport = paymentIssuerTransport(env);
  let response;
  try {
    // Never forward caller fields, URLs, cookies or bearer credentials.
    // Canonical payments validation rejects this before any durable write.
    response = await requestPaymentsConfirmLink(env, {});
  } catch (error) {
    const configurationError = ["missing_AUTH_SERVICE_ADMIN_TO_PAYMENTS", "invalid_PAYMENTS_BASE_URL"].includes(error?.message);
    return json({ ok: false, transport, stage: configurationError ? "configuration" : "transport",
      error: configurationError ? error.message : "payments_worker_unreachable" }, 503);
  }
  const data = await response.json().catch(() => null);
  const status = response.status;
  if (status === 400 && data?.ok === false && data?.error === "client_name_required") {
    return json({ ok: true, transport, stage: "validation_reached", service_authenticated: true,
      upstream_status: status, upstream_error: "client_name_required", probe: "empty_confirm_link_request" });
  }

  // Project only known codes; never echo tokens, links, IDs or raw upstream data.
  const knownErrors = new Set(["service_auth_required", "airtable_not_ready", "invalid_confirm_link_request"]);
  const upstreamError = knownErrors.has(data?.error) ? data.error : "unexpected_response";
  const stage = status === 401 || status === 403 ? "service_auth"
    : status >= 300 && status < 400 ? "redirect_blocked"
    : status >= 500 ? "upstream_unavailable" : "unexpected_response";
  return json({ ok: false, transport, stage, upstream_status: status, upstream_error: upstreamError,
    error: response.ok ? "unexpected_success_for_empty_probe" : "payment_issuer_probe_failed" }, 502);
}

async function handleIssueExistingSession(env, body) {
  const allowedKeys = new Set(["mode", "session_id", "payment_type", "deposit_percent"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return json({ ok: false, error: "unsupported_issue_field" }, 400);
  }

  const sessionId = clean(body.session_id, 200);
  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);
  const paymentType = clean(body.payment_type || "full", 40).toLowerCase();
  if (!new Set(["full", "deposit"]).has(paymentType)) {
    return json({ ok: false, error: "payment_type_invalid" }, 400);
  }
  const depositPercent = Number(body.deposit_percent);
  if (paymentType === "deposit" && (!Number.isFinite(depositPercent) || depositPercent <= 0 || depositPercent >= 100)) {
    return json({ ok: false, error: "deposit_percent_invalid" }, 400);
  }

  let session;
  try {
    session = await findSession(env, sessionId);
  } catch (error) {
    return json({ ok: false, stage: "session_lookup", error: safeError(error, "session_lookup_failed") }, error?.status || 503);
  }
  if (!session?.id) return json({ ok: false, error: "session_not_found" }, 404);
  const fields = session.fields || {};

  const existingPaymentRef = text(fields[SESSION_FIELDS.paymentRef], 200);
  const existingCustomerUrl = safeConfirmationUrl(fields[SESSION_FIELDS.customerUrl], "/sigil/confirm/job-confirmation");
  const existingModelUrl = safeConfirmationUrl(fields[SESSION_FIELDS.modelUrl], "/sigil/confirm/job-model");
  if (existingPaymentRef && existingCustomerUrl && existingModelUrl) {
    return json({
      ok: true,
      stage: "existing_links",
      issued: false,
      session_id: sessionId,
      payment_ref: existingPaymentRef,
      customer_confirmation_url_present: true,
      model_confirmation_url_present: true,
    });
  }
  if (existingPaymentRef || fields[SESSION_FIELDS.customerUrl] || fields[SESSION_FIELDS.modelUrl]) {
    return json({ ok: false, stage: "preflight", error: "partial_confirmation_state" }, 409);
  }

  const linkedClient = Array.isArray(fields[SESSION_FIELDS.clientLink]) ? fields[SESSION_FIELDS.clientLink] : [];
  if (!linkedClient.length) return json({ ok: false, stage: "preflight", error: "canonical_client_link_required" }, 409);

  let paymentCollision;
  try {
    paymentCollision = await findPaymentForSession(env, sessionId);
  } catch (error) {
    return json({ ok: false, stage: "payment_preflight", error: safeError(error, "payment_lookup_failed") }, error?.status || 503);
  }
  if (paymentCollision) {
    return json({ ok: false, stage: "payment_preflight", error: "existing_payment_without_session_links" }, 409);
  }

  const clientName = requiredText(fields[SESSION_FIELDS.clientName], "client_name");
  const modelName = requiredText(fields[SESSION_FIELDS.modelName], "model_name");
  const jobType = requiredText(fields[SESSION_FIELDS.jobType], "job_type");
  const jobDate = requiredText(fields[SESSION_FIELDS.jobDate], "job_date");
  const startTime = requiredText(fields[SESSION_FIELDS.startTime], "start_time");
  const endTime = requiredText(fields[SESSION_FIELDS.endTime], "end_time");
  const locationName = requiredText(fields[SESSION_FIELDS.locationName], "location_name");
  const amountThb = positiveNumber(fields[SESSION_FIELDS.customerAmountDueThb] ?? fields[SESSION_FIELDS.amountThb], "amount_thb");
  const payModelThb = optionalNumber(fields[SESSION_FIELDS.payModelThb]);
  const googleMapUrl = clean(fields[SESSION_FIELDS.googleMapUrl], 2000);
  const baseNote = clean(fields[SESSION_FIELDS.note] || fields[SESSION_FIELDS.notes], 10000);
  const note = paymentType === "deposit" && !baseNote.includes("[SIGIL Pricing v1]")
    ? appendPricingMarker(baseNote, amountThb, depositPercent)
    : baseNote;

  const payload = {
    session_id: sessionId,
    client_name: clientName,
    model_name: modelName,
    job_type: jobType,
    job_date: jobDate,
    start_time: startTime,
    end_time: endTime,
    location_name: locationName,
    google_map_url: googleMapUrl,
    amount_thb: amountThb,
    ...(payModelThb === null ? {} : { pay_model_thb: payModelThb }),
    payment_type: paymentType,
    payment_stage: paymentType,
    payment_method: "promptpay",
    note,
    confirm_page: "https://mmdbkk.com/sigil/confirm/job-confirmation",
    model_confirm_page: "https://mmdbkk.com/sigil/confirm/job-model",
  };

  let response;
  try {
    response = await requestPaymentsConfirmLink(env, payload);
  } catch (error) {
    const configurationError = ["missing_AUTH_SERVICE_ADMIN_TO_PAYMENTS", "invalid_PAYMENTS_BASE_URL"].includes(error?.message);
    return json({ ok: false, stage: configurationError ? "configuration" : "transport",
      error: configurationError ? error.message : "payments_worker_unreachable" }, 503);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const allowed = new Set(["service_auth_required", "airtable_not_ready", "invalid_confirm_link_request", "session_update_failed", "payment_upsert_failed"]);
    return json({ ok: false, stage: "issuer", upstream_status: response.status,
      error: allowed.has(data?.error) ? data.error : "confirm_link_issue_failed" }, response.status >= 500 ? 503 : 502);
  }

  const paymentRef = text(data.payment_ref, 200);
  const customerUrl = safeConfirmationUrl(data.customer_confirmation_url, "/sigil/confirm/job-confirmation");
  const modelUrl = safeConfirmationUrl(data.model_confirmation_url, "/sigil/confirm/job-model");
  if (text(data.session_id, 200) !== sessionId || !paymentRef || !customerUrl || !modelUrl) {
    return json({ ok: false, stage: "issuer_validation", error: "issuer_response_contract_mismatch" }, 502);
  }

  return json({
    ok: true,
    stage: "issued",
    issued: true,
    session_id: sessionId,
    payment_ref: paymentRef,
    payment_type: paymentType,
    customer_confirmation_url_present: true,
    model_confirmation_url_present: true,
  });
}

function appendPricingMarker(note, amountThb, depositPercent) {
  const depositDue = Math.round((amountThb * depositPercent) * 100) / 10000;
  const balance = Math.round((amountThb - depositDue) * 100) / 100;
  const pricing = {
    full_price_thb: amountThb,
    discount_mode: "none",
    discount_percent: 0,
    discount_thb: 0,
    net_price_thb: amountThb,
    deposit_basis_thb: amountThb,
    deposit_percent: depositPercent,
    deposit_due_thb: depositDue,
    deposit_received_thb: 0,
    balance_thb: balance,
  };
  return [note, `[SIGIL Pricing v1] ${JSON.stringify(pricing)}`].filter(Boolean).join("\n");
}

async function findSession(env, sessionId) {
  return findSingle(env, env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", `{session_id}='${formulaValue(sessionId)}'`, "session_id_ambiguous");
}

async function findPaymentForSession(env, sessionId) {
  return findSingle(env, env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", `{session_id}='${formulaValue(sessionId)}'`, "payment_session_ambiguous");
}

async function findSingle(env, tableId, formula, ambiguousError) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !tableId || !apiKey) throw httpError(503, "airtable_not_ready");
  const query = new URLSearchParams({ maxRecords: "2", filterByFormula: formula, returnFieldsByFieldId: "true" });
  const req = new Request(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}?${query.toString()}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_request_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) throw httpError(409, ambiguousError);
  return records[0] || null;
}

function requiredText(value, field) {
  const out = clean(value, 1000);
  if (!out) throw httpError(409, `${field}_missing`);
  return out;
}

function positiveNumber(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw httpError(409, `${field}_missing`);
  return n;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function safeConfirmationUrl(value, expectedPath) {
  const raw = clean(value, 12000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !new Set(["mmdbkk.com", "www.mmdbkk.com"]).has(url.hostname)) return "";
    if (url.pathname !== expectedPath || !url.searchParams.get("t")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function text(value, max = 1000) {
  return clean(value, max);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeError(error, fallback) {
  const allowed = new Set([
    "airtable_not_ready", "airtable_request_failed", "session_id_ambiguous", "payment_session_ambiguous",
    "client_name_missing", "model_name_missing", "job_type_missing", "job_date_missing", "start_time_missing",
    "end_time_missing", "location_name_missing", "amount_thb_missing",
  ]);
  return allowed.has(error?.message) ? error.message : fallback;
}

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

function diagnosticPage() {
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="th"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment connection check · MMD Privé</title>
<style>body{margin:0;background:#11100e;color:#f5f1e8;font:16px/1.65 system-ui,sans-serif}main{max-width:640px;margin:10vh auto;padding:24px}h1{font-size:28px;line-height:1.3}p{color:#ccc5b9}button{padding:14px 20px;border:0;border-radius:12px;background:#dfc28c;color:#19140c;font:inherit;cursor:pointer}button:disabled{opacity:.6;cursor:default}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:18px;border:1px solid #514737;border-radius:12px;font-size:14px}a{color:#dfc28c}</style>
<main><p>MMD PRIVÉ · PAYMENT</p><h1>ตรวจการเชื่อมต่อชำระเงิน</h1>
<p>ตรวจด้วยข้อมูลว่าง {} โดยไม่สร้างรายการชำระเงินหรือรัน Job</p>
<button id="probe" type="button">ตรวจการเชื่อมต่อ</button>
<pre id="result" role="status" aria-live="polite">พร้อมตรวจ · ยังไม่ได้ส่งคำขอ</pre>
<a href="/internal/admin/control-room">กลับ Control Room</a></main>
<script nonce="${nonce}">
document.getElementById('probe').addEventListener('click', async function () {
  this.disabled = true;
  const result = document.getElementById('result');
  result.textContent = 'กำลังตรวจ…';
  try {
    const response = await fetch('${PAYMENT_ISSUER_DIAGNOSTIC_PATH}', {
      method: 'POST', credentials: 'same-origin', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    const data = await response.json();
    result.textContent = JSON.stringify({ http_status: response.status, ...data }, null, 2);
  } catch {
    result.textContent = 'ตรวจไม่สำเร็จ · ไม่ได้ส่งคำขอซ้ำ';
  }
});
</script></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  } });
}

import { KBANK_SANDBOX_MODE, KBANK_STATUS_MODE, requestKbankSandboxDiagnostic } from "./kbank-sandbox-diagnostic.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { paymentIssuerTransport, requestPaymentsConfirmLink, requestPaymentsConfirmationReissue } from "./payments-issuer-transport.js";

export const PAYMENT_ISSUER_DIAGNOSTIC_PATH = "/v1/admin/payment-issuer-diagnostic";
export const ISSUE_EXISTING_SESSION_MODE = "issue_existing_session";
export const REISSUE_EXISTING_SESSION_MODE = "reissue_existing_session";
export const REFRESH_CONFIRMATION_LINKS_MODE = "refresh_confirmation_links";
const ADMIN_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const AIRTABLE_API = "https://api.airtable.com/v0";

const PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentIntentStatus: "fld04fr3bRJTohO6y",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  paymentType: "fldydUWHhqVLMkNSC",
});

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

  if (body.mode === KBANK_SANDBOX_MODE || body.mode === KBANK_STATUS_MODE) {
    if (Object.keys(body).length !== 1) return json({ ok: false, error: "unsupported_sandbox_field" }, 400);
    return requestKbankSandboxDiagnostic(env, body.mode === KBANK_STATUS_MODE);
  }

  if (Object.keys(body).length === 0) return handleEmptyDiagnostic(env);
  if (body.mode === ISSUE_EXISTING_SESSION_MODE || body.mode === REISSUE_EXISTING_SESSION_MODE) {
    return handleIssueExistingSession(env, body);
  }
  if (body.mode === REFRESH_CONFIRMATION_LINKS_MODE) {
    const allowedKeys = new Set(["mode", "session_id"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) return json({ ok: false, error: "unsupported_issue_field" }, 400);
    const sessionId = clean(body.session_id, 200);
    if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);
    let response;
    try {
      response = await requestPaymentsConfirmationReissue(env, { session_id: sessionId });
    } catch (error) {
      const configurationError = ["missing_AUTH_SERVICE_ADMIN_TO_PAYMENTS", "invalid_PAYMENTS_BASE_URL"].includes(error?.message);
      return json({ ok: false, stage: configurationError ? "configuration" : "transport",
        error: configurationError ? error.message : "payments_worker_unreachable" }, 503);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      return json({
        ok: false,
        stage: "confirmation_reissue",
        upstream_status: response.status,
        error: clean(data?.error || "confirmation_reissue_failed", 160),
      }, response.status >= 500 ? 503 : response.status || 502);
    }
    return json({
      ok: true,
      stage: "confirmation_links_refreshed",
      session_id: sessionId,
      payment_ref: clean(data.payment_ref, 200),
      payment_type: clean(data.payment_type, 80),
      expires_at: Number(data.expires_at || 0) || null,
      customer_confirmation_url_present: data.customer_confirmation_url_present === true,
      model_confirmation_url_present: data.model_confirmation_url_present === true,
      payment_state_mutated: data.payment_state_mutated === true,
      notification_sent: data.notification_sent === true,
    });
  }
  return json({ ok: false, error: "diagnostic_empty_object_required" }, 400);
}

async function handleEmptyDiagnostic(env) {
  const transport = paymentIssuerTransport(env);
  let response;
  try {
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
  const knownErrors = new Set(["service_auth_required", "airtable_not_ready", "invalid_confirm_link_request"]);
  const upstreamError = knownErrors.has(data?.error) ? data.error : "unexpected_response";
  const stage = status === 401 || status === 403 ? "service_auth"
    : status >= 300 && status < 400 ? "redirect_blocked"
    : status >= 500 ? "upstream_unavailable" : "unexpected_response";
  return json({ ok: false, transport, stage, upstream_status: status, upstream_error: upstreamError,
    error: response.ok ? "unexpected_success_for_empty_probe" : "payment_issuer_probe_failed" }, 502);
}

async function handleIssueExistingSession(env, body) {
  const reissue = body.mode === REISSUE_EXISTING_SESSION_MODE;
  const allowedKeys = new Set(["mode", "session_id", "payment_type"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key)) || (!reissue && Object.prototype.hasOwnProperty.call(body, "payment_type"))) {
    return json({ ok: false, error: "unsupported_issue_field" }, 400);
  }

  const sessionId = clean(body.session_id, 200);
  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);
  const requestedType = clean(body.payment_type, 40).toLowerCase();
  const paymentType = reissue ? requestedType : "deposit";
  if (reissue && paymentType !== "full") {
    return json({ ok: false, error: "reissue_payment_type_must_be_full" }, 400);
  }
  const depositPercent = 30;

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
  if (!reissue && existingPaymentRef && existingCustomerUrl && existingModelUrl) {
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
  if (!reissue && (existingPaymentRef || fields[SESSION_FIELDS.customerUrl] || fields[SESSION_FIELDS.modelUrl])) {
    return json({ ok: false, stage: "preflight", error: "partial_confirmation_state" }, 409);
  }
  if (reissue && existingPaymentRef && existingCustomerUrl && existingModelUrl) {
    let currentPayment;
    try {
      currentPayment = await findPaymentByRef(env, existingPaymentRef);
    } catch (error) {
      return json({ ok: false, stage: "reissue_preflight", error: safeError(error, "payment_lookup_failed") }, error?.status || 503);
    }
    const paymentFields = currentPayment?.fields || {};
    const currentStage = clean(paymentFields[PAYMENT_FIELDS.paymentStage] || paymentFields[PAYMENT_FIELDS.paymentType], 80).toLowerCase();
    const currentIntent = clean(paymentFields[PAYMENT_FIELDS.paymentIntentStatus], 80).toLowerCase();
    if (currentStage === "full" && currentIntent !== "cancelled") {
      return json({
        ok: true,
        stage: "existing_full_links",
        issued: false,
        session_id: sessionId,
        payment_ref: existingPaymentRef,
        payment_type: "full",
        customer_confirmation_url_present: true,
        model_confirmation_url_present: true,
      });
    }
  }

  const linkedClient = Array.isArray(fields[SESSION_FIELDS.clientLink]) ? fields[SESSION_FIELDS.clientLink] : [];
  if (!linkedClient.length) return json({ ok: false, stage: "preflight", error: "canonical_client_link_required" }, 409);

  if (!reissue) {
    let paymentCollision;
    try {
      paymentCollision = await findPaymentForSession(env, sessionId);
    } catch (error) {
      return json({ ok: false, stage: "payment_preflight", error: safeError(error, "payment_lookup_failed") }, error?.status || 503);
    }
    if (paymentCollision) {
      return json({ ok: false, stage: "payment_preflight", error: "existing_payment_without_session_links" }, 409);
    }
  }

  let clientName, modelName, jobType, jobDate, startTime, endTime, locationName, amountThb;
  try {
    clientName = requiredText(fields[SESSION_FIELDS.clientName], "client_name");
    modelName = requiredText(fields[SESSION_FIELDS.modelName], "model_name");
    jobType = requiredText(fields[SESSION_FIELDS.jobType], "job_type");
    jobDate = requiredText(fields[SESSION_FIELDS.jobDate], "job_date");
    startTime = requiredText(fields[SESSION_FIELDS.startTime], "start_time");
    endTime = requiredText(fields[SESSION_FIELDS.endTime], "end_time");
    locationName = requiredText(fields[SESSION_FIELDS.locationName], "location_name");
    // An outstanding balance is not the job total used to calculate a deposit.
    amountThb = positiveNumber(fields[SESSION_FIELDS.amountThb] ?? fields[SESSION_FIELDS.customerAmountDueThb], "amount_thb");
  } catch (error) {
    return json({ ok: false, stage: "preflight", error: safeError(error, "session_data_incomplete") }, error?.status || 409);
  }

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
    ...(paymentType === "deposit" ? {
      deposit_percent: 30,
      deposit_amount_thb: Math.min(amountThb, Math.ceil(((amountThb * 30) / 100) / 500) * 500),
      balance_amount_thb: Math.max(0, amountThb - Math.min(amountThb, Math.ceil(((amountThb * 30) / 100) / 500) * 500)),
    } : {}),
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

function appendPricingMarker(note, amountThb, depositPercent = 30) {
  const depositDue = Math.min(amountThb, Math.ceil(((amountThb * depositPercent) / 100) / 500) * 500);
  const balance = Math.max(0, amountThb - depositDue);
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
    deposit_round_step_thb: 500,
    deposit_rounding: "ceil",
  };
  return [note, `[SIGIL Pricing v1] ${JSON.stringify(pricing)}`].filter(Boolean).join("\n");
}

async function findSession(env, sessionId) {
  return findSingle(env, env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", `{session_id}='${formulaValue(sessionId)}'`, "session_id_ambiguous");
}

async function findPaymentForSession(env, sessionId) {
  return findSingle(env, env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", `{session_id}='${formulaValue(sessionId)}'`, "payment_session_ambiguous");
}

async function findPaymentByRef(env, paymentRef) {
  return findSingle(env, env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", `{Payment Reference}='${formulaValue(paymentRef)}'`, "payment_ref_ambiguous");
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
    "airtable_not_ready", "airtable_request_failed", "session_id_ambiguous", "payment_session_ambiguous", "payment_ref_ambiguous",
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
<section aria-labelledby="kbank-heading" style="margin:40px 0;padding-top:24px;border-top:1px solid #514737">
<h2 id="kbank-heading">เชื่อมต่อกสิกร · Sandbox</h2>
<p>ตรวจว่าบัญชีทดสอบเชื่อมต่อได้ โดยไม่มีการโอนเงิน หากเพิ่งทดสอบ OAuth ผ่านเว็บธนาคาร ให้เว้น 30 นาทีก่อนกดปุ่มนี้</p>
<button id="kbank-status" type="button">ตรวจความพร้อม</button>
<pre id="kbank-readiness" role="status" aria-live="polite">ตรวจความพร้อมก่อนทดสอบ · ขั้นนี้ไม่เรียกธนาคาร</pre>
<button id="kbank-probe" type="button" disabled>ทดสอบการเชื่อมต่อกสิกร</button>
<pre id="kbank-result" role="status" aria-live="polite">ยังไม่ได้ทดสอบ</pre>
</section>
<section aria-labelledby="issue-heading" style="margin:40px 0;padding-top:24px;border-top:1px solid #514737">
<h2 id="issue-heading">ออกลิงก์ยืนยันของงานเดิม</h2>
<p>ใช้รายละเอียดล่าสุดจากงานที่บันทึกไว้ ระบบจะเก็บลิงก์ลูกค้าและโมเดลไว้ในรายการเดิม พร้อมสร้างรายการชำระเงินที่รอตรวจ หากมีลิงก์ครบแล้วจะใช้รายการเดิม</p>
<form id="issue-form">
<label for="issue-session">รหัส Session ของงาน</label>
<input id="issue-session" name="session_id" type="text" maxlength="200" required autocomplete="off" style="box-sizing:border-box;width:100%;padding:12px;margin:8px 0 20px;background:#191713;color:#f5f1e8;border:1px solid #70624c;border-radius:8px;font:inherit">
<p style="padding:12px;border:1px solid #70624c;border-radius:8px;background:#191713"><strong>มัดจำลูกค้า 30%</strong><br>ระบบปัดยอดขึ้นทุก 500 บาทอัตโนมัติ</p>
<button id="issue" type="submit">ออกลิงก์ของงานเดิม</button>
</form>
<pre id="issue-result" role="status" aria-live="polite">ยังไม่ได้ออกลิงก์</pre>
</section>
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
const bankMessages = {
  unauthorized: 'กรุณาเข้าสู่ระบบแอดมินอีกครั้ง', forbidden: 'บัญชีนี้ไม่มีสิทธิ์ทดสอบ',
  forbidden_origin: 'คำขอถูกปฏิเสธเพราะที่มาของหน้าไม่ตรงกัน',
  sandbox_disabled: 'ยังไม่ได้เปิด Sandbox ที่ payments-worker',
  sandbox_not_configured: 'การตั้งค่า Sandbox ยังไม่ครบ',
  service_auth_required: 'สิทธิ์เชื่อมต่อแอดมินกับ payments-worker ไม่ตรงกัน',
  sandbox_service_token_missing: 'แอดมินยังไม่มี Secret สำหรับเชื่อมต่อ payments-worker',
  sandbox_binding_missing: 'แอดมินยังไม่มีช่องทางเชื่อมต่อ payments-worker',
  sandbox_transport_unavailable: 'แอดมินติดต่อ payments-worker ไม่สำเร็จหรือหมดเวลารอ',
  sandbox_endpoint_missing: 'payments-worker ยังไม่มี endpoint รุ่นนี้ · ตรวจ deployment',
  sandbox_non_json_response: 'payments-worker ตอบกลับในรูปแบบที่อ่านไม่ได้ · ตรวจ deployment และเส้นทาง',
  unexpected_sandbox_response: 'คำตอบจาก payments-worker ไม่ตรงรูปแบบที่คาดไว้',
  kbank_oauth_failed: 'ธนาคารยังไม่ยืนยัน OAuth · เว้น 30 นาทีก่อนทดสอบอีกครั้ง',
  kbank_oauth_unavailable: 'payments-worker ติดต่อธนาคารไม่สำเร็จ · เว้น 30 นาทีก่อนทดสอบอีกครั้ง',
  diagnostic_empty_object_required: 'หน้าแอดมินกับระบบหลังบ้านเป็นคนละรุ่น · ตรวจ deployment'
};
function bankError(data, status) {
  const known = Object.prototype.hasOwnProperty.call(bankMessages, data?.error);
  const label = known ? bankMessages[data.error] : 'คำขอไม่สำเร็จและยังระบุสาเหตุไม่ได้';
  const oauthLabels = {
    invalid_client: 'KBank ไม่ยอมรับข้อมูลยืนยันตัวตนของแอป · ตรวจคู่ Consumer ID/Secret และสถานะแอป',
    unauthorized_client: 'แอปไม่มีสิทธิ์ใช้วิธีขอ Token นี้',
    invalid_request: 'คำขอ OAuth ขาดข้อมูลหรือรูปแบบไม่ถูกต้อง',
    invalid_grant: 'ข้อมูล grant ไม่ผ่านการตรวจสอบ',
    unsupported_grant_type: 'ธนาคารไม่รองรับ grant_type ที่ส่ง',
    invalid_scope: 'สิทธิ์ scope ไม่ถูกต้อง',
    server_error: 'ระบบ OAuth ของธนาคารมีข้อผิดพลาด',
    temporarily_unavailable: 'ระบบ OAuth ของธนาคารยังไม่พร้อมชั่วคราว'
  };
  const oauthKnown = Object.prototype.hasOwnProperty.call(oauthLabels, data?.oauth_error);
  const detail = oauthKnown ? oauthLabels[data.oauth_error] : label;
  const responseMediaLabels = { json: 'JSON', html: 'HTML', text: 'ข้อความ', other: 'ชนิดอื่น', missing: 'ไม่มี Content-Type' };
  const responseShapeLabels = { json_object: 'JSON object', json_array: 'JSON array', json_scalar: 'JSON scalar', empty: 'ว่าง', non_json: 'ไม่ใช่ JSON', size_limited: 'เกินขนาดที่อ่านได้อย่างปลอดภัย' };
  const errorShapeLabels = { oauth_error: 'ฟิลด์ OAuth error', kbank_error_code: 'ฟิลด์ ErrorCode', gateway_fault_detail: 'ฟิลด์ fault detail errorcode', none: 'ไม่พบฟิลด์รหัสที่รองรับ' };
  const responseMedia = Object.hasOwn(responseMediaLabels, data?.bank_response_media_type) ? responseMediaLabels[data.bank_response_media_type] : null;
  const responseShape = Object.hasOwn(responseShapeLabels, data?.bank_response_body_shape) ? responseShapeLabels[data.bank_response_body_shape] : null;
  const errorShape = Object.hasOwn(errorShapeLabels, data?.bank_error_shape) ? errorShapeLabels[data.bank_error_shape] : null;
  const responseDetails = [
    responseMedia && 'ชนิดคำตอบธนาคาร ' + responseMedia,
    responseShape && 'รูปแบบเนื้อหา ' + responseShape,
    errorShape && 'ตำแหน่งรหัส ' + errorShape,
    typeof data?.bank_error_code_recognized === 'boolean' && 'รหัสอยู่ในรายการที่รู้จัก ' + (data.bank_error_code_recognized ? 'ใช่' : 'ไม่ใช่')
  ].filter(Boolean).join(' · ');
  return detail + ' (HTTP ' + status + (known ? ' · ' + data.error : '') +
    (Number.isInteger(data?.upstream_status) ? ' · payments HTTP ' + data.upstream_status : '') +
    (Number.isInteger(data?.bank_http_status) ? ' · KBank HTTP ' + data.bank_http_status : '') +
    (oauthKnown ? ' · OAuth ' + data.oauth_error : '') +
    (responseDetails ? ' · ' + responseDetails : '') + ')';
}
async function bankRequest(mode) {
  const response = await fetch('${PAYMENT_ISSUER_DIAGNOSTIC_PATH}', {
    method: 'POST', credentials: 'same-origin', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode })
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
document.getElementById('kbank-status').addEventListener('click', async function () {
  if (this.disabled) return;
  this.disabled = true;
  const probe = document.getElementById('kbank-probe');
  probe.disabled = true;
  const result = document.getElementById('kbank-readiness');
  result.textContent = 'กำลังตรวจความพร้อม · ไม่เรียกธนาคาร…';
  try {
    const { response, data } = await bankRequest('${KBANK_STATUS_MODE}');
    if (!response.ok || data?.ok !== true || !data.checks) {
      result.textContent = data ? bankError(data, response.status) : 'ระบบตอบกลับเป็นข้อมูลที่อ่านไม่ได้ (HTTP ' + response.status + ')';
      return;
    }
    const labels = { enabled: 'เปิด Sandbox', consumer_id_present: 'บันทึก Consumer ID', consumer_secret_present: 'บันทึก Consumer Secret', coordinator_present: 'ระบบควบคุมการทดสอบ' };
    result.textContent = 'แอดมินเชื่อมต่อ payments-worker ได้' + '\\n' + Object.entries(labels).map(([key, label]) => label + ': ' + (data.checks[key] === true ? 'พร้อม' : 'ยังไม่พร้อม')).join('\\n') + '\\nยังไม่ได้ติดต่อธนาคาร';
    probe.disabled = data.ready !== true || probe.dataset.attempted === 'true';
  } catch {
    result.textContent = 'เบราว์เซอร์ติดต่อแอดมินไม่สำเร็จ · ยังตรวจความพร้อมไม่ได้';
  } finally { this.disabled = false; }
});
document.getElementById('kbank-probe').addEventListener('click', async function () {
  if (this.disabled) return;
  this.disabled = true;
  this.dataset.attempted = 'true';
  const result = document.getElementById('kbank-result');
  result.textContent = 'กำลังทดสอบการเชื่อมต่อกสิกร…';
  try {
    const { response, data } = await bankRequest('${KBANK_SANDBOX_MODE}');
    result.textContent = response.ok && data?.ok === true && data.oauth === 'connected'
      ? 'เชื่อมต่อกสิกร Sandbox สำเร็จ · ยังไม่มีการโอนเงิน'
      : data?.error === 'oauth_smoke_cooldown'
        ? 'อยู่ระหว่างพักการทดสอบ · รอประมาณ ' + Math.ceil((data.retry_after_seconds || 1800) / 60) + ' นาที · รอบนี้ไม่ได้ส่งคำขอไปธนาคาร'
        : data ? bankError(data, response.status) : 'ระบบตอบกลับเป็นข้อมูลที่อ่านไม่ได้ (HTTP ' + response.status + ') · ไม่ได้ส่งคำขอซ้ำ';
  } catch {
    result.textContent = 'เบราว์เซอร์ติดต่อแอดมินไม่สำเร็จหรือมีการเปลี่ยนเส้นทาง · ยังยืนยันไม่ได้ว่าคำขอถึงธนาคารหรือไม่ · ไม่ได้ส่งคำขอซ้ำ';
  }
});
const issueForm = document.getElementById('issue-form');
issueForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  const button = document.getElementById('issue');
  if (button.disabled || !issueForm.reportValidity()) return;
  const sessionId = document.getElementById('issue-session').value.trim();
  const result = document.getElementById('issue-result');
  if (!sessionId) { result.textContent = 'กรอกรหัส Session ก่อนออกลิงก์'; return; }
  const body = { mode: '${ISSUE_EXISTING_SESSION_MODE}', session_id: sessionId };
  button.disabled = true;
  result.textContent = 'กำลังตรวจรายการเดิมและออกลิงก์…';
  try {
    const response = await fetch('${PAYMENT_ISSUER_DIAGNOSTIC_PATH}', {
      method: 'POST', credentials: 'same-origin', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    const ready = response.ok && data.ok && data.customer_confirmation_url_present && data.model_confirmation_url_present;
    result.textContent = (ready ? 'ลิงก์ทั้งสองฝั่งพร้อมแล้ว · บันทึกอยู่ใน Session เดิม' : 'ยังออกลิงก์ไม่สำเร็จ · ตรวจรายการเดิมก่อนลองใหม่') + '\\n' + JSON.stringify({ http_status: response.status, ...data }, null, 2);
    if (ready) {
      for (const input of issueForm.querySelectorAll('input, select')) input.disabled = true;
    }
  } catch {
    result.textContent = 'ยังยืนยันผลไม่ได้ · ตรวจลิงก์ใน Session เดิมก่อนส่งคำขออีกครั้ง';
  }
});
</script></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  } });
}



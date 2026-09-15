import { handleCanonicalLinkedJobCreate } from "./create-session-canonical-link-runtime.js";
import { requestPaymentsConfirmLink } from "./payments-issuer-transport.js";

export const SIGIL_JOB_RECONCILE_PATH = "/v1/admin/job/reconcile-held";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const HOLD_MARKER = "[MMD_JOB_HOLD_V1]";
const IDENTITY_MARKER = "[MMD_PENDING_IDENTITY_V1]";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  amountThb: "fldhwC79ndbnEXSZz",
  paymentRef: "fldojgjSQLaO0uQLX",
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
  customerConfirmationUrl: "fldi9ZdoiUXzSv1rI",
  modelConfirmationUrl: "fld0mFma9J9yfEaKb",
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function token(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isRecordId(value) {
  return /^rec[A-Za-z0-9]{14,}$/.test(clean(value));
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", ...headers },
  });
}

function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function fieldValue(record, id) {
  return record?.fields?.[id];
}

function firstText(...values) {
  for (const value of values) {
    const out = clean(value);
    if (out) return out;
  }
  return "";
}

function dateOnly(value) {
  const raw = clean(value);
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : raw;
}

function timeOnly(value) {
  const raw = clean(value);
  const iso = raw.match(/T(\d{2}:\d{2})/);
  if (iso) return iso[1];
  const plain = raw.match(/^(\d{2}:\d{2})/);
  return plain ? plain[1] : raw;
}

function pendingStatus(hasClient, hasModel) {
  if (!hasClient && !hasModel) return "pending_identity_link";
  if (!hasClient) return "pending_client_link";
  if (!hasModel) return "pending_model_link";
  return "linked";
}

function identityMeta(note) {
  const raw = clean(note);
  const line = raw.split(/\r?\n/).find((item) => item.startsWith(IDENTITY_MARKER));
  if (!line) return {};
  try {
    const parsed = JSON.parse(clean(line.slice(IDENTITY_MARKER.length)));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stablePaymentRef(sessionId) {
  return `job_${clean(sessionId).replace(/[^A-Za-z0-9_-]+/g, "_")}`.slice(0, 180);
}

function sessionNote(record) {
  return firstText(fieldValue(record, SESSION_FIELDS.note), fieldValue(record, SESSION_FIELDS.notes));
}

function isHeld(record) {
  return sessionNote(record).includes(HOLD_MARKER);
}

function existingRelease(record) {
  const paymentRef = clean(fieldValue(record, SESSION_FIELDS.paymentRef));
  const customerUrl = clean(fieldValue(record, SESSION_FIELDS.customerConfirmationUrl));
  const modelUrl = clean(fieldValue(record, SESSION_FIELDS.modelConfirmationUrl));
  return paymentRef && customerUrl && modelUrl
    ? { payment_ref: paymentRef, customer_confirmation_url: customerUrl, model_confirmation_url: modelUrl }
    : null;
}

async function findSession(env, sessionId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE);
  if (!apiKey || !baseId) throw new Error("missing_airtable_env");
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{session_id}=${formulaText(sessionId)}`,
    returnFieldsByFieldId: "true",
  });
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_session_lookup_failed:${response.status}`);
  return data?.records?.[0] || null;
}

function canonicalRequestBody(body, session, clientId, modelId) {
  return {
    client_record_id: clientId || undefined,
    client_lineage: clientId ? { client_id: clientId, lineage_source: "sigil_jobs_held_reconcile" } : undefined,
    model_record_id: modelId || undefined,
    model: modelId ? { model_id: modelId, source: "airtable_models" } : undefined,
    job_date: dateOnly(fieldValue(session, SESSION_FIELDS.jobDate)),
    start_time: timeOnly(fieldValue(session, SESSION_FIELDS.startTime)),
    end_time: timeOnly(fieldValue(session, SESSION_FIELDS.endTime)),
    location_name: clean(fieldValue(session, SESSION_FIELDS.locationName)),
    amount_thb: Number(fieldValue(session, SESSION_FIELDS.amountThb) || 0),
    note: sessionNote(session),
    job_details: { source: "sigil_jobs_held_reconcile" },
  };
}

async function linkCanonicalIdentities(request, env, ctx, body, session, clientId, modelId) {
  const linkBody = canonicalRequestBody(body, session, clientId, modelId);
  const url = new URL(request.url);
  url.pathname = "/v1/admin/job/create";
  const linkRequest = new Request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", Origin: url.origin },
    body: JSON.stringify(linkBody),
  });
  const downstream = {
    fetch: async () => json({ ok: true, session_id: clean(body.session_id), job_id: clean(body.job_id) || null }),
  };
  const response = await handleCanonicalLinkedJobCreate(linkRequest, env, ctx, downstream);
  const data = await response.clone().json().catch(() => ({}));
  return { response, data, linkBody };
}

async function verifyPrivateGate(request, env, ctx, downstream, body, meta, clientId, modelId) {
  const url = new URL(request.url);
  url.pathname = "/v1/admin/job/create";
  const selectedFolder = clean(body?.private_access?.selected_private_folder || meta.folder || body?.job_details?.folder);
  const selectedOrientation = clean(body?.private_access?.selected_orientation || meta.lane || body?.job_details?.lane);
  const probe = {
    visibility: "private",
    job_visibility: "private",
    booking_visibility: "private",
    client_id: clientId,
    client_record_id: clientId,
    client_lineage: {
      ...(body.client_lineage || {}),
      client_id: clientId,
    },
    model_id: modelId,
    model_record_id: modelId,
    model: { ...(body.model || {}), model_id: modelId },
    work: { ...(body.work || {}), job_visibility: "private", model_folder: selectedFolder },
    private_access: {
      ...(body.private_access || {}),
      selected_private_folder: selectedFolder,
      selected_orientation: selectedOrientation,
    },
    telegram_gate: { ...(body.telegram_gate || {}) },
    selected_orientation: selectedOrientation,
    // Intentionally omit required job fields. createAdminJob evaluates the
    // authoritative private-access gate before required-field validation.
    source: "sigil_jobs_held_release_gate_probe",
  };
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const response = await downstream.fetch(new Request(url.toString(), { method: "POST", headers, body: JSON.stringify(probe) }), env, ctx);
  const data = await response.clone().json().catch(() => ({}));
  const code = clean(data?.error?.code || data?.error || data?.message);
  if (response.status === 400 && code === "missing_job_fields") return { ok: true };
  return { ok: false, response, data, code: code || `private_gate_probe_${response.status}` };
}

function paymentPayload(body, session, meta) {
  const note = sessionNote(session);
  const paymentType = firstText(body.payment_type, body.payment_stage, meta.payment_type, "full");
  const paymentMethod = firstText(body.payment_method, meta.payment_method, "promptpay");
  return {
    session_id: clean(body.session_id),
    payment_ref: stablePaymentRef(body.session_id),
    client_name: firstText(body.client_name, fieldValue(session, SESSION_FIELDS.clientName)),
    model_name: firstText(body.model_name, fieldValue(session, SESSION_FIELDS.modelName)),
    job_type: clean(fieldValue(session, SESSION_FIELDS.jobType)),
    job_date: dateOnly(fieldValue(session, SESSION_FIELDS.jobDate)),
    start_time: timeOnly(fieldValue(session, SESSION_FIELDS.startTime)),
    end_time: timeOnly(fieldValue(session, SESSION_FIELDS.endTime)),
    location_name: clean(fieldValue(session, SESSION_FIELDS.locationName)),
    google_map_url: clean(fieldValue(session, SESSION_FIELDS.googleMapUrl)),
    amount_thb: Number(fieldValue(session, SESSION_FIELDS.amountThb) || 0),
    pay_model_thb: fieldValue(session, SESSION_FIELDS.payModelThb),
    payment_type: paymentType,
    payment_method: paymentMethod,
    confirm_page: "/confirm/job-confirmation",
    model_confirm_page: "/confirm/job-model",
    note: `${note}\n[MMD_JOB_HOLD_RELEASED_V1] ${new Date().toISOString()}`.slice(0, 4000),
  };
}

async function notifyReleased(env, data, payload) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  const chatId = clean(env.TELEGRAM_INTERNAL_CHAT_ID || env.TELEGRAM_CHAT_ID);
  if (!botToken || !chatId) return { ok: false, skipped: true };
  const threadId = clean(env.TELEGRAM_INTERNAL_THREAD_ID || env.TELEGRAM_THREAD_ID);
  const lines = [
    "🔗 <b>HELD JOB RELEASED</b>",
    `Session: <code>${escapeHtml(payload.session_id)}</code>`,
    `Client: <b>${escapeHtml(payload.client_name)}</b>`,
    `Model: <b>${escapeHtml(payload.model_name)}</b>`,
    `Customer: ${escapeHtml(data.customer_confirmation_url || "-")}`,
    `Model: ${escapeHtml(data.model_confirmation_url || "-")}`,
  ];
  const body = { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId) body.message_thread_id = Number(threadId) || threadId;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status };
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export async function reconcileHeldSigilJob(request, env, ctx, downstream) {
  const body = await request.clone().json().catch(() => ({}));
  const sessionId = clean(body.session_id);
  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);

  const clientId = clean(body.client_record_id || body.client_id || body?.client_lineage?.client_id);
  const modelId = clean(body.model_record_id || body.model_id || body?.model?.model_id);
  if (clientId && !isRecordId(clientId)) return json({ ok: false, error: "canonical_client_record_invalid" }, 400);
  if (modelId && !isRecordId(modelId)) return json({ ok: false, error: "canonical_model_record_invalid" }, 400);

  let session;
  try {
    session = await findSession(env, sessionId);
  } catch (error) {
    return json({ ok: false, error: clean(error?.message || error) }, 502);
  }
  if (!session?.id) return json({ ok: false, error: "held_session_not_found" }, 404);

  const already = existingRelease(session);
  if (already) {
    return json({ ok: true, session_id: sessionId, operational_status: "linked", released_from_hold: true, idempotent_replay: true, ...already });
  }
  if (!isHeld(session)) return json({ ok: false, error: "session_is_not_held" }, 409);

  const status = pendingStatus(Boolean(clientId), Boolean(modelId));
  const linked = await linkCanonicalIdentities(request, env, ctx, body, session, clientId, modelId);
  if (!linked.response.ok) return linked.response;
  if (status !== "linked") {
    return json({
      ok: true,
      session_id: sessionId,
      operational_status: status,
      confirmations_held: true,
      dispatch_held: true,
      entitlement_release_held: true,
      customer_confirmation_url: null,
      model_confirmation_url: null,
      linkage: linked.data.linkage || null,
    });
  }

  const note = sessionNote(session);
  const meta = identityMeta(note);
  const requestedWorld = token(body.requested_world || meta.requested_world || body?.job_details?.world || "public");
  if (requestedWorld === "private") {
    const gate = await verifyPrivateGate(request, env, ctx, downstream, body, meta, clientId, modelId);
    if (!gate.ok) return gate.response || json({ ok: false, error: gate.code || "private_release_gate_failed" }, 403);
  }

  const payload = paymentPayload(body, session, meta);
  let issuer;
  try {
    issuer = await requestPaymentsConfirmLink(env, payload);
  } catch (error) {
    return json({ ok: false, error: clean(error?.message || error || "payment_issuer_failed") }, 502);
  }
  const data = await issuer.clone().json().catch(() => ({}));
  if (!issuer.ok || data?.ok === false) {
    return json({ ok: false, error: data?.error || `payment_issuer_http_${issuer.status}` }, issuer.status || 502);
  }

  const telegram = await notifyReleased(env, data, payload).catch((error) => ({ ok: false, error: clean(error?.message || error) }));
  return json({
    ...data,
    ok: true,
    session_id: sessionId,
    operational_status: "linked",
    released_from_hold: true,
    confirmations_held: false,
    dispatch_held: false,
    entitlement_release_held: false,
    linkage: linked.data.linkage || null,
    notification_status: telegram,
  });
}

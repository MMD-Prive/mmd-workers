const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const DEFAULT_CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const DEFAULT_MODELS_TABLE = "tblI4B0bI446vp9GX";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  customerConfirmationUrl: "fldi9ZdoiUXzSv1rI",
  modelConfirmationUrl: "fld0mFma9J9yfEaKb",
  clientLink: "fld6P6if0vDZCeV0C",
  customerLineUserId: "fld5tzCzdTTh8AJyI",
  canonicalModel: "fldrXQAyOMPCvbOaY",
});

const CLIENT_FIELDS = Object.freeze({
  lineUserId: "fld5HfSGChKFbd4uh",
});

const MODEL_FIELDS = Object.freeze({
  lineUserId: "fld2ywTFI6MZhX6PV",
});

const INITIAL_JOB_PAYMENT_STAGES = new Set(["deposit", "full"]);

export async function dispatchApprovedJobLinks(env, { session_id, payment_stage, payment_ref } = {}) {
  const sessionId = clean(session_id, 220);
  const stage = code(payment_stage);
  if (!sessionId || !INITIAL_JOB_PAYMENT_STAGES.has(stage)) {
    return { status: "not_applicable", dispatched: false };
  }

  const session = await findSession(env, sessionId);
  if (!session?.id) return { status: "session_not_found", dispatched: false };

  const f = session.fields || {};
  const memberUrl = clean(f[SESSION_FIELDS.customerConfirmationUrl], 4000);
  const modelUrl = clean(f[SESSION_FIELDS.modelConfirmationUrl], 4000);
  if (!isCanonicalMemberUrl(memberUrl) || !isCanonicalModelUrl(modelUrl)) {
    return { status: "links_not_ready", dispatched: false };
  }

  const lineTargets = await resolveLineTargets(env, f);
  const identityCollision = Boolean(
    lineTargets.customer_line_user_id &&
    lineTargets.model_line_user_id &&
    lineTargets.customer_line_user_id === lineTargets.model_line_user_id
  );

  const [customerLine, modelLine] = identityCollision
    ? [
        { ok: false, status: "identity_collision" },
        { ok: false, status: "identity_collision" },
      ]
    : await Promise.all([
        pushLineConfirmation(env, {
          lineUserId: lineTargets.customer_line_user_id,
          role: "customer",
          name: f[SESSION_FIELDS.clientName],
          url: memberUrl,
        }),
        pushLineConfirmation(env, {
          lineUserId: lineTargets.model_line_user_id,
          role: "model",
          name: f[SESSION_FIELDS.modelName],
          url: modelUrl,
        }),
      ]);

  const sent = await sendTelegram(env, {
    chat_id: clean(env.TELEGRAM_CHAT_ID || "-1003546439681", 120),
    message_thread_id: Number(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 22),
    text: [
      "✅ <b>PAYMENT APPROVED · CONFIRMATION URLS</b>",
      `Client: <b>${escapeHtml(f[SESSION_FIELDS.clientName] || "-")}</b>`,
      `Model: <b>${escapeHtml(f[SESSION_FIELDS.modelName] || "-")}</b>`,
      `Type: <b>${escapeHtml(f[SESSION_FIELDS.jobType] || "-")}</b>`,
      `Date: <b>${escapeHtml(f[SESSION_FIELDS.jobDate] || "-")}</b>`,
      `Time: <b>${escapeHtml(f[SESSION_FIELDS.startTime] || "-")} - ${escapeHtml(f[SESSION_FIELDS.endTime] || "-")}</b>`,
      `Location: <b>${escapeHtml(f[SESSION_FIELDS.locationName] || "-")}</b>`,
      `Session: <code>${escapeHtml(sessionId)}</code>`,
      `Payment Ref: <code>${escapeHtml(payment_ref || "-")}</code>`,
      "",
      `MEMBER URL: ${escapeHtml(memberUrl)}`,
      `MODEL URL: ${escapeHtml(modelUrl)}`,
      "",
      "<b>Manual confirm fallback:</b> MEMBER URL → ลูกค้า · MODEL URL → โมเดล",
      `Customer LINE: <b>${escapeHtml(customerLine.ok ? "sent" : customerLine.status || "not_sent")}</b>`,
      `Model LINE: <b>${escapeHtml(modelLine.ok ? "sent" : modelLine.status || "not_sent")}</b>`,
      identityCollision ? "<b>LINE dispatch held: customer/model identity collision</b>" : "",
    ].filter(Boolean).join("\n"),
  });

  return {
    status: sent.ok ? "sent" : "failed",
    dispatched: sent.ok === true,
    member_url_present: true,
    model_url_present: true,
    telegram_status: sent.status || null,
    customer_line_sent: customerLine.ok === true,
    model_line_sent: modelLine.ok === true,
    customer_line_status: customerLine.status || null,
    model_line_status: modelLine.status || null,
    line_identity_collision: identityCollision,
  };
}

async function resolveLineTargets(env, sessionFields = {}) {
  let customerLine = canonicalLineUserId(sessionFields[SESSION_FIELDS.customerLineUserId]);
  let modelLine = "";

  const clientId = linkedRecordId(sessionFields[SESSION_FIELDS.clientLink]);
  if (!customerLine && clientId) {
    const client = await getRecord(env, clientsTable(env), clientId).catch(() => null);
    customerLine = canonicalLineUserId(client?.fields?.[CLIENT_FIELDS.lineUserId]);
  }

  const modelId = linkedRecordId(sessionFields[SESSION_FIELDS.canonicalModel]);
  if (modelId) {
    const model = await getRecord(env, modelsTable(env), modelId).catch(() => null);
    modelLine = canonicalLineUserId(model?.fields?.[MODEL_FIELDS.lineUserId]);
  }

  return {
    customer_line_user_id: customerLine,
    model_line_user_id: modelLine,
  };
}

async function pushLineConfirmation(env, { lineUserId, role, name, url } = {}) {
  const to = canonicalLineUserId(lineUserId);
  if (!to) return { ok: false, status: "line_identity_missing" };
  const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN, 5000);
  if (!token) return { ok: false, status: "line_runtime_unavailable" };

  const displayName = clean(name, 180);
  const isModel = role === "model";
  const text = isModel
    ? [
        "MMD MODEL · ยืนยันงาน",
        displayName ? `${displayName} รายละเอียดงานพร้อมแล้วครับ` : "รายละเอียดงานพร้อมแล้วครับ",
        "กรุณาเปิดลิงก์นี้เพื่อตรวจและยืนยันงาน",
        url,
        "",
        "ลิงก์นี้จัดไว้สำหรับบัญชีของคุณครับ",
      ].join("\n")
    : [
        "MMD · ยืนยันงาน",
        displayName ? `${displayName} รายละเอียดงานพร้อมแล้วครับ` : "รายละเอียดงานพร้อมแล้วครับ",
        "กรุณาเปิดลิงก์นี้เพื่อยืนยันรายละเอียดงาน",
        url,
        "",
        "ลิงก์นี้จัดไว้สำหรับบัญชีของคุณครับ",
      ].join("\n");

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });
  return {
    ok: response.ok,
    status: response.ok ? "sent" : `line_http_${response.status}`,
  };
}

async function getRecord(env, table, recordId) {
  const base = clean(env.AIRTABLE_BASE_ID, 120);
  const key = clean(env.AIRTABLE_API_KEY, 5000);
  if (!base || !key || !table || !recordId) return null;
  const request = new Request(
    `${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}?returnFieldsByFieldId=true`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) return null;
  return payload;
}

function clientsTable(env) {
  return clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || DEFAULT_CLIENTS_TABLE, 180);
}

function modelsTable(env) {
  return clean(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || DEFAULT_MODELS_TABLE, 180);
}

function linkedRecordId(value) {
  return Array.isArray(value) && value.length === 1 ? clean(value[0], 120) : "";
}

function canonicalLineUserId(value) {
  const candidate = clean(value, 100);
  return /^U[A-Za-z0-9_-]{20,80}$/.test(candidate) ? candidate : "";
}

async function findSession(env, sessionId) {
  const base = clean(env.AIRTABLE_BASE_ID, 120);
  const key = clean(env.AIRTABLE_API_KEY, 5000);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE, 180);
  if (!base || !key || !table) return null;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{session_id}='${formulaValue(sessionId)}'`);
  const request = new Request(url, { headers: { Authorization: `Bearer ${key}` } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length !== 1) return null;
  return records[0];
}

async function sendTelegram(env, payload) {
  const url = clean(env.TELEGRAM_INTERNAL_SEND_URL, 1200);
  const token = clean(env.INTERNAL_TOKEN, 5000);
  if (!url || !token) return { ok: false, status: "not_configured" };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify({
      ...payload,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok !== false, status: response.status, data };
}

function isCanonicalMemberUrl(value) {
  try {
    const url = new URL(value);
    return /^https:$/.test(url.protocol)
      && new Set(["mmdbkk.com", "www.mmdbkk.com"]).has(url.hostname)
      && new Set(["/sigil/confirm/job-confirmation", "/confirm/job-confirmation"]).has(url.pathname)
      && Boolean(url.searchParams.get("t"));
  } catch { return false; }
}

function isCanonicalModelUrl(value) {
  try {
    const url = new URL(value);
    return /^https:$/.test(url.protocol)
      && new Set(["mmdbkk.com", "www.mmdbkk.com"]).has(url.hostname)
      && new Set(["/sigil/confirm/job-model", "/confirm/job-model"]).has(url.pathname)
      && Boolean(url.searchParams.get("t"));
  } catch { return false; }
}

function escapeHtml(value) {
  return clean(value, 5000).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function code(value) { return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function clean(value, max = 5000) { return String(value == null ? "" : value).trim().slice(0, max); }

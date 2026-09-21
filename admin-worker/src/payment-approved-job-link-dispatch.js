import { dispatchPaymentNotification, drainPaymentNotifications, notificationDigest } from "../../shared/payment-notification-outbox.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const DEFAULT_CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const DEFAULT_MODELS_TABLE = "tblI4B0bI446vp9GX";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  sessionStatus: "fldmwuvOaiCFdzzRa",
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
  telegramUserId: "fldAmysO51nIneg0C",
  telegramVerificationStatus: "fldlPum9VYKboCofh",
});

const MODEL_FIELDS = Object.freeze({
  lineUserId: "fld2ywTFI6MZhX6PV",
  telegramUserId: "fldLogasesRw5zwyB",
  telegramVerificationStatus: "fldlSR082K0O0wLqY",
});

const INITIAL_JOB_PAYMENT_STAGES = new Set(["deposit", "full"]);

export async function dispatchApprovedJobLinks(env, { session_id, payment_stage, payment_ref } = {}) {
  if (!clean(session_id, 220) || !INITIAL_JOB_PAYMENT_STAGES.has(code(payment_stage))) {
    return { status: "not_applicable", dispatched: false };
  }
  const delivery = await dispatchPaymentNotification({
    bucket: env.LINE_SLIP_EVIDENCE,
    lane: "approved-job-links",
    eventKey: `${clean(session_id, 220)}:${code(payment_stage)}`,
    payload: { session_id, payment_stage, payment_ref },
    deliver: (record, checkpoint) => deliverApprovedNotification(env, record, checkpoint),
  });
  return {
    ...(delivery.result || { status: delivery.status, dispatched: false }),
    delivery_status: delivery.status,
    retry_queued: delivery.queued === true,
    delivery_durable: delivery.durable === true,
  };
}

export async function drainApprovedJobLinkNotifications(env, options = {}) {
  return drainPaymentNotifications({
    ...options,
    bucket: env.LINE_SLIP_EVIDENCE,
    lane: "approved-job-links",
    deliver: (record, checkpoint) => deliverApprovedNotification(env, record, checkpoint),
  });
}

async function deliverApprovedNotification(env, record, checkpoint) {
  const result = await deliverApprovedJobLinks(env, record.payload, async (channel, target, send) => {
    const digest = await notificationDigest(`${record.id}:${channel}:${JSON.stringify(target)}`);
    if (record.state?.[digest]) return { ok: true, status: "sent", duplicate: true };
    // A UUID derived from the exact recipient/content identity remains stable
    // across uncertain LINE responses and process restarts.
    const retryKey = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    let outcome;
    try { outcome = await send(retryKey); }
    catch { outcome = { ok: false, status: "transport_failed" }; }
    if (outcome.ok) {
      const state = { ...record.state, [digest]: true };
      await checkpoint(state);
      record.state = state;
    }
    return outcome;
  });
  return { ok: result.dispatched === true && result.retry_required !== true, retryable: result.retryable !== false, result, error: result.status };
}

async function deliverApprovedJobLinks(env, { session_id, payment_stage, payment_ref } = {}, once) {
  const sessionId = clean(session_id, 220);
  const stage = code(payment_stage);
  if (!sessionId || !INITIAL_JOB_PAYMENT_STAGES.has(stage)) {
    return { status: "not_applicable", dispatched: false };
  }

  const session = await findSession(env, sessionId);
  if (!session?.id) return { status: "session_not_found", dispatched: false };

  const f = session.fields || {};
  if (["cancelled", "canceled", "rejected", "void"].includes(code(f[SESSION_FIELDS.sessionStatus]))) {
    return { status: "session_cancelled", dispatched: false, retryable: false, manual_delivery_required: true };
  }
  const memberUrl = clean(f[SESSION_FIELDS.customerConfirmationUrl], 4000);
  const modelUrl = clean(f[SESSION_FIELDS.modelConfirmationUrl], 4000);
  if (!isCanonicalMemberUrl(memberUrl) || !isCanonicalModelUrl(modelUrl)) {
    return { status: "links_not_ready", dispatched: false };
  }

  const targets = await resolveNotificationTargets(env, f);
  const lineIdentityCollision = Boolean(
    targets.customer_line_user_id &&
    targets.model_line_user_id &&
    targets.customer_line_user_id === targets.model_line_user_id
  );
  const telegramIdentityCollision = Boolean(
    targets.customer_telegram_user_id &&
    targets.model_telegram_user_id &&
    targets.customer_telegram_user_id === targets.model_telegram_user_id
  );

  const sendLine = (role, lineUserId, name, url) => once("line", { role, lineUserId, name, url },
    (retryKey) => pushLineConfirmation(env, { lineUserId, role, name, url, retryKey }));
  const sendDm = (role, telegramUserId, name, url) => once("telegram", { role, telegramUserId, name, url },
    () => pushTelegramConfirmation(env, { telegramUserId, role, name, url }));
  const [customerLine, modelLine] = lineIdentityCollision
    ? [
        { ok: false, status: "identity_collision" },
        { ok: false, status: "identity_collision" },
      ]
    : [
        await sendLine("customer", targets.customer_line_user_id, f[SESSION_FIELDS.clientName], memberUrl),
        await sendLine("model", targets.model_line_user_id, f[SESSION_FIELDS.modelName], modelUrl),
      ];

  const [customerTelegram, modelTelegram] = telegramIdentityCollision
    ? [
        { ok: false, status: "identity_collision" },
        { ok: false, status: "identity_collision" },
      ]
    : [
        await sendDm("customer", targets.customer_telegram_user_id, f[SESSION_FIELDS.clientName], memberUrl),
        await sendDm("model", targets.model_telegram_user_id, f[SESSION_FIELDS.modelName], modelUrl),
      ];

  const opsTarget = {
    chat_id: clean(env.TELEGRAM_CHAT_ID || "-1003546439681", 120),
    message_thread_id: Number(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 22),
    memberUrl, modelUrl,
  };
  const sent = await once("telegram_ops", opsTarget, () => sendTelegram(env, {
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
      `Customer Telegram: <b>${escapeHtml(customerTelegram.ok ? "sent" : customerTelegram.status || "not_sent")}</b>`,
      `Model Telegram: <b>${escapeHtml(modelTelegram.ok ? "sent" : modelTelegram.status || "not_sent")}</b>`,
      lineIdentityCollision ? "<b>LINE dispatch held: customer/model identity collision</b>" : "",
      telegramIdentityCollision ? "<b>Telegram dispatch held: customer/model identity collision</b>" : "",
    ].filter(Boolean).join("\n"),
  }));

  const retryRequired = !sent.ok
    || (!lineIdentityCollision && ((targets.customer_line_user_id && !customerLine.ok) || (targets.model_line_user_id && !modelLine.ok)))
    || (!telegramIdentityCollision && ((targets.customer_telegram_user_id && !customerTelegram.ok) || (targets.model_telegram_user_id && !modelTelegram.ok)));
  return {
    status: sent.ok ? retryRequired ? "partial" : "sent" : "failed",
    dispatched: sent.ok === true,
    retry_required: Boolean(retryRequired),
    manual_delivery_required: !(customerLine.ok || customerTelegram.ok) || !(modelLine.ok || modelTelegram.ok),
    member_url_present: true,
    model_url_present: true,
    telegram_status: sent.status || null,
    customer_line_sent: customerLine.ok === true,
    model_line_sent: modelLine.ok === true,
    customer_line_status: customerLine.status || null,
    model_line_status: modelLine.status || null,
    customer_telegram_sent: customerTelegram.ok === true,
    model_telegram_sent: modelTelegram.ok === true,
    customer_telegram_status: customerTelegram.status || null,
    model_telegram_status: modelTelegram.status || null,
    line_identity_collision: lineIdentityCollision,
    telegram_identity_collision: telegramIdentityCollision,
  };
}

async function resolveNotificationTargets(env, sessionFields = {}) {
  let customerLine = canonicalLineUserId(sessionFields[SESSION_FIELDS.customerLineUserId]);
  let modelLine = "";
  let customerTelegram = "";
  let modelTelegram = "";

  const clientId = linkedRecordId(sessionFields[SESSION_FIELDS.clientLink]);
  if (clientId) {
    const client = await getRecord(env, clientsTable(env), clientId).catch(() => null);
    customerLine = customerLine || canonicalLineUserId(client?.fields?.[CLIENT_FIELDS.lineUserId]);
    customerTelegram = verifiedTelegramUserId(
      client?.fields?.[CLIENT_FIELDS.telegramUserId],
      client?.fields?.[CLIENT_FIELDS.telegramVerificationStatus],
    );
  }

  const modelId = linkedRecordId(sessionFields[SESSION_FIELDS.canonicalModel]);
  if (modelId) {
    const model = await getRecord(env, modelsTable(env), modelId).catch(() => null);
    modelLine = canonicalLineUserId(model?.fields?.[MODEL_FIELDS.lineUserId]);
    modelTelegram = verifiedTelegramUserId(
      model?.fields?.[MODEL_FIELDS.telegramUserId],
      model?.fields?.[MODEL_FIELDS.telegramVerificationStatus],
    );
  }

  return {
    customer_line_user_id: customerLine,
    model_line_user_id: modelLine,
    customer_telegram_user_id: customerTelegram,
    model_telegram_user_id: modelTelegram,
  };
}

async function pushLineConfirmation(env, { lineUserId, role, name, url, retryKey } = {}) {
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
      "x-line-retry-key": retryKey,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  const accepted = response.ok || (response.status === 409 && Boolean(response.headers.get("x-line-accepted-request-id")));
  return {
    ok: accepted,
    status: accepted ? "sent" : `line_http_${response.status}`,
  };
}

async function pushTelegramConfirmation(env, { telegramUserId, role, name, url } = {}) {
  const chatId = canonicalTelegramUserId(telegramUserId);
  if (!chatId) return { ok: false, status: "telegram_identity_missing_or_unverified" };
  const displayName = clean(name, 180);
  const isModel = role === "model";
  const text = isModel
    ? [
        "MMD MODEL · ยืนยันงาน",
        displayName ? `${displayName} รายละเอียดงานพร้อมแล้วครับ` : "รายละเอียดงานพร้อมแล้วครับ",
        "เปิดลิงก์นี้เพื่อตรวจและยืนยันงาน",
        url,
        "",
        "ลิงก์นี้เป็นลิงก์เฉพาะสำหรับบัญชีของคุณครับ",
      ].join("\n")
    : [
        "MMD · ยืนยันงาน",
        displayName ? `${displayName} รายละเอียดงานพร้อมแล้วครับ` : "รายละเอียดงานพร้อมแล้วครับ",
        "เปิดลิงก์นี้เพื่อยืนยันรายละเอียดงาน",
        url,
        "",
        "ลิงก์นี้เป็นลิงก์เฉพาะสำหรับบัญชีของคุณครับ",
      ].join("\n");
  const result = await sendTelegram(env, {
    chat_id: chatId,
    text,
  });
  return {
    ok: result.ok === true,
    status: result.ok === true ? "sent" : (result.status || "telegram_send_failed"),
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

function canonicalTelegramUserId(value) {
  const candidate = clean(value, 40);
  return /^\d{5,20}$/.test(candidate) ? candidate : "";
}

function verifiedTelegramUserId(value, status) {
  return code(status) === "verified" ? canonicalTelegramUserId(value) : "";
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
    signal: AbortSignal.timeout(15000),
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

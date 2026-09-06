const AIRTABLE_BASE_ID = "appsV1ILPRfIjkaYg";
const AIRTABLE_APPLICATION_TABLE_ID = "tblwUa8ySWln8OfaJ";

export const TELEGRAM_NOTIFY_FIELDS = Object.freeze({
  status: "fldRrIPWM8CdRntW2",
  notifiedAt: "fldrlf7suioICDmFW",
  error: "fld7lKx6USwEaG9am",
});

const APPLICATION_ID_FIELD_NAME = "application_id";
const APPLICATION_ID_RE = /^pma_[A-Za-z0-9_-]{8,120}$/;
const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_PUBLIC_MODEL_REVIEW_BASE_URL = "https://mmdbkk.com/internal/ceo/models";

export function shouldAttemptPublicModelNotification({ duplicate, status }) {
  const current = String(status || "").trim().toLowerCase();
  if (current === "sent" || current === "pending" || current === "skipped") return false;
  if (!duplicate) return true;
  return current === "failed" || current === "";
}

export function publicModelChatId(env = {}) {
  return String(env.TELEGRAM_PUBLIC_MODEL_CHAT_ID || "").trim();
}

export function publicModelThreadId(env = {}) {
  const threadId = Number(env.TELEGRAM_PUBLIC_MODEL_THREAD_ID || "");
  return Number.isFinite(threadId) && threadId > 0 ? threadId : undefined;
}

export function buildPublicModelReviewUrl(env = {}, applicationId) {
  if (!APPLICATION_ID_RE.test(String(applicationId || ""))) return "";
  const configured = String(env.PUBLIC_MODEL_REVIEW_BASE_URL || DEFAULT_PUBLIC_MODEL_REVIEW_BASE_URL).trim();
  try {
    const url = new URL(configured);
    url.searchParams.set("application_id", applicationId);
    return url.toString();
  } catch {
    return "";
  }
}

export function buildPublicModelTelegramMessage(payload = {}, applicationId, reviewUrl = "") {
  const uploads = Array.isArray(payload.uploads) ? payload.uploads : Array.isArray(payload.upload_refs) ? payload.upload_refs : Array.isArray(payload.uploadRefs) ? payload.uploadRefs : [];
  const photos = uploads.filter((item) => normalizeToken(item?.kind) === "photo").length;
  const documents = uploads.filter((item) => normalizeToken(item?.kind) === "document").length;
  const workTypes = normalizeList(payload.work_types ?? payload.interested_work_types ?? payload.workTypes, 10);
  const lines = [
    "MMD Public Model Application",
    "",
    `Nickname: ${shortText(payload.nickname, 120) || "-"}`,
    `Age: ${numberOrDash(payload.age)}`,
    `Height: ${numberOrText(payload.height, 40)}`,
    `Location: ${shortText(payload.location ?? payload.talent_location, 160) || "-"}`,
    `Occupation: ${shortText(payload.occupation_detail ?? payload.occupation, 180) || "-"}`,
    `Work interests: ${workTypes.join(", ") || "-"}`,
    `Photos: ${photos}`,
    `Documents: ${documents}`,
    `Application ID: ${applicationId}`,
  ];
  if (reviewUrl) lines.push("", `Open application: ${reviewUrl}`);
  return lines.join("\n");
}

export async function notifyPublicModelApplication({ env, payload, applicationId, duplicate = false }) {
  if (!APPLICATION_ID_RE.test(String(applicationId || ""))) throw new Error("invalid_public_model_application_id");
  if (!env?.AIRTABLE_API_TOKEN) throw new Error("public_model_notification_airtable_not_configured");
  const record = await findApplicationById(env, applicationId);
  if (!record?.id) throw new Error("public_model_notification_record_not_found");

  const currentStatus = String(record.fields?.[TELEGRAM_NOTIFY_FIELDS.status] || "").trim().toLowerCase();
  if (!shouldAttemptPublicModelNotification({ duplicate: Boolean(duplicate), status: currentStatus })) {
    const reason = currentStatus === "sent" ? "already_sent" : currentStatus === "pending" ? "already_pending" : "notification_not_retryable";
    return { ok: true, skipped: true, reason };
  }

  await updateNotificationState(env, record.id, {
    [TELEGRAM_NOTIFY_FIELDS.status]: "pending",
    [TELEGRAM_NOTIFY_FIELDS.error]: null,
  });

  try {
    const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = publicModelChatId(env);
    if (!token || !chatId) throw new Error("missing_public_model_telegram_configuration");
    const reviewUrl = buildPublicModelReviewUrl(env, applicationId);
    const telegramPayload = {
      chat_id: chatId,
      text: buildPublicModelTelegramMessage(payload, applicationId, reviewUrl),
    };
    if (reviewUrl) {
      telegramPayload.reply_markup = {
        inline_keyboard: [[{ text: "เปิดใบสมัคร", url: reviewUrl }]],
      };
    }
    const threadId = publicModelThreadId(env);
    if (threadId) telegramPayload.message_thread_id = threadId;
    const fetcher = typeof env.TELEGRAM_FETCH === "function" ? env.TELEGRAM_FETCH : fetch;
    const response = await fetcher(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(telegramPayload),
    });
    if (!response.ok) {
      const providerText = sanitizeErrorText(await response.text().catch(() => ""));
      throw new Error(`telegram_http_${response.status}${providerText ? `:${providerText}` : ""}`);
    }
    await updateNotificationState(env, record.id, {
      [TELEGRAM_NOTIFY_FIELDS.status]: "sent",
      [TELEGRAM_NOTIFY_FIELDS.notifiedAt]: new Date().toISOString(),
      [TELEGRAM_NOTIFY_FIELDS.error]: null,
    });
    return { ok: true, skipped: false };
  } catch (error) {
    const message = sanitizeErrorText(error instanceof Error ? error.message : "telegram_notify_failed");
    await updateNotificationState(env, record.id, {
      [TELEGRAM_NOTIFY_FIELDS.status]: "failed",
      [TELEGRAM_NOTIFY_FIELDS.error]: message || "telegram_notify_failed",
    }).catch((stateError) => {
      console.error(JSON.stringify({ event: "public_model_telegram_state_update_failed", application_id: applicationId, error: sanitizeErrorText(stateError instanceof Error ? stateError.message : "state_update_failed") }));
    });
    throw error;
  }
}

async function findApplicationById(env, applicationId) {
  const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_APPLICATION_TABLE_ID}`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{${APPLICATION_ID_FIELD_NAME}}='${applicationId}'`);
  const payload = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(payload.records) ? payload.records[0] || null : null;
}

async function updateNotificationState(env, recordId, fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_APPLICATION_TABLE_ID}/${encodeURIComponent(recordId)}?returnFieldsByFieldId=true`;
  return airtableRequest(env, url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields, typecast: false }) });
}

async function airtableRequest(env, url, init) {
  const headers = new Headers(init?.headers || {});
  headers.set("authorization", `Bearer ${String(env.AIRTABLE_API_TOKEN || "").trim()}`);
  const fetcher = typeof env.AIRTABLE_FETCH === "function" ? env.AIRTABLE_FETCH : fetch;
  const response = await fetcher(url, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const type = sanitizeErrorText(payload?.error?.type || `HTTP_${response.status}`);
    throw new Error(`airtable_public_model_notification_failed:${type || response.status}`);
  }
  return payload || {};
}

function shortText(value, max) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : ""; }
function normalizeList(value, maxItems) { return Array.isArray(value) ? value.map((item) => shortText(item, 100)).filter(Boolean).slice(0, maxItems) : []; }
function normalizeToken(value) { return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : ""; }
function numberOrDash(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? String(number) : "-"; }
function numberOrText(value, max) { const text = shortText(String(value ?? ""), max); return text || "-"; }
function sanitizeErrorText(value) { return String(value || "").replace(/bot\d+:[A-Za-z0-9_-]+/gi, "bot[redacted]").replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 240); }

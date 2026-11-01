import { TELEGRAM_NOTIFY_FIELDS } from "./public-model-notify.js";

export const PRIVATE_NOTIFICATION_PATH = "/private-model-notification/enqueue";
export const PRIVATE_NOTIFICATION_KEY = "private-model-notification-v1";
const APPLICATION_ID_RE = /^pma_[A-Za-z0-9_-]{8,120}$/;
const APPLICATION_ID_FIELD = "fldE5jq01JlYtvSP7";
const APPLICATION_TYPE_FIELD = "fld3KMefCywUTNIoQ";
const APPLICATIONS_URL = "https://api.airtable.com/v0/appsV1ILPRfIjkaYg/tblwUa8ySWln8OfaJ";
const REVIEW_URL = "https://www.mmdbkk.com/internal/admin/model-applications?application_type=private_model";
const MAX_ATTEMPTS = 5;
const WATCHDOG_MS = 60_000;

// Persist the outbox before returning the successful intake response. Delivery
// runs in an alarm on the existing coordinator namespace, isolated by app ID.
export async function queuePrivateModelNotificationAfterResponse(response, env) {
  if (!response.ok) return;
  let applicationId;
  try {
    const result = await response.clone().json();
    if (result?.ok !== true || result.service !== "mmd_private_model_apply" ||
        result.mode !== "intake_received" || result.application_type !== "private_model" ||
        result.storage?.persisted !== true || !APPLICATION_ID_RE.test(result.application_id || "")) return;
    applicationId = result.application_id;
    const namespace = env.PUBLIC_MODEL_COORDINATOR;
    const id = namespace.idFromName(`private-model:telegram:${applicationId}`);
    const queued = await namespace.get(id).fetch(`https://public-model-coordinator${PRIVATE_NOTIFICATION_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ application_id: applicationId }),
    });
    if (!queued.ok || (await queued.json()).ok !== true) throw new Error("enqueue_failed");
  } catch {
    // The application is already saved. Never turn this into a failed intake.
    console.error(JSON.stringify({ event: "private_model_telegram_enqueue_failed", application_id: applicationId || null }));
  }
}

export async function enqueuePrivateModelNotification(storage, applicationId) {
  if (!APPLICATION_ID_RE.test(applicationId || "")) return Response.json({ ok: false, error: "invalid_application_id" }, { status: 400 });
  const job = await storage.transaction(async (tx) => {
    const existing = await tx.get(PRIVATE_NOTIFICATION_KEY);
    if (existing) return existing;
    const created = { applicationId, status: "queued", attempts: 0, createdAt: new Date().toISOString() };
    await tx.put(PRIVATE_NOTIFICATION_KEY, created);
    await tx.setAlarm(Date.now() + 1000);
    return created;
  });
  if (job.applicationId !== applicationId) return Response.json({ ok: false, error: "application_mismatch" }, { status: 409 });
  return Response.json({ ok: true, status: job.status });
}

export function buildPrivateModelTelegramAlert(applicationId) {
  if (!APPLICATION_ID_RE.test(applicationId || "")) throw new Error("invalid_application_id");
  return {
    // Existing Applications topic and service auth; caller never chooses a chat.
    flow: "applications",
    text: `Private Model application received\nApplication ID: ${applicationId}\nOpen the review queue to check the current status.`,
    reply_markup: { inline_keyboard: [[{ text: "Open Private Model review queue", url: REVIEW_URL }]] },
  };
}

export async function runPrivateModelNotificationAlarm(storage, env) {
  let job = await storage.get(PRIVATE_NOTIFICATION_KEY);
  if (!job) return false;
  if (["sent", "uncertain", "failed", "skipped"].includes(job.status)) {
    await auditNotification(storage, env, job);
    return true;
  }
  if (job.status === "sending") {
    // Alarm redelivery / crash after dispatch: Telegram has no idempotency key.
    // Preserve uncertainty instead of sending a second notification.
    job = { ...job, status: "uncertain", error: "delivery_uncertain_manual_review" };
    await storage.put(PRIVATE_NOTIFICATION_KEY, job);
    await auditNotification(storage, env, job);
    return true;
  }

  job = { ...job, status: "reading", attempts: job.attempts + 1 };
  await storage.transaction(async (tx) => {
    await tx.put(PRIVATE_NOTIFICATION_KEY, job);
    await tx.setAlarm(Date.now() + WATCHDOG_MS);
  });
  try {
    if (!env.AIRTABLE_API_TOKEN || !env.TELEGRAM_WORKER?.fetch || !env.AUTH_SERVICE_SIGIL_TO_TELEGRAM) {
      throw new Error("notification_configuration_missing");
    }
    const url = new URL(APPLICATIONS_URL);
    url.searchParams.set("filterByFormula", `{application_id}='${job.applicationId}'`);
    url.searchParams.set("returnFieldsByFieldId", "true");
    url.searchParams.set("maxRecords", "2");
    const data = await airtable(env, url.toString(), { method: "GET" });
    const records = data.records || [];
    if (records.length !== 1 || data.offset || records[0].fields?.[APPLICATION_ID_FIELD] !== job.applicationId ||
        records[0].fields?.[APPLICATION_TYPE_FIELD] !== "private_model" || !/^rec[A-Za-z0-9]+$/.test(records[0].id || "")) {
      throw new Error("persisted_private_application_not_unique");
    }
    job.recordId = records[0].id;
    const prior = String(records[0].fields?.[TELEGRAM_NOTIFY_FIELDS.status] || "").trim().toLowerCase();
    if (prior === "skipped") {
      await storage.put(PRIVATE_NOTIFICATION_KEY, { ...job, status: "skipped", auditDone: true });
      return true;
    }
    if (!["", "failed", "pending", "sent"].includes(prior)) {
      await storage.put(PRIVATE_NOTIFICATION_KEY, { ...job, status: "failed", error: "notification_state_unknown", auditDone: true });
      console.error(JSON.stringify({ event: "private_model_telegram_state_unknown", application_id: job.applicationId }));
      return true;
    }
    if (prior === "sent" || (prior === "pending" && job.attempts === 1)) {
      job = { ...job, status: prior === "sent" ? "sent" : "uncertain", error: prior === "pending" ? "delivery_uncertain_manual_review" : null,
        sentAt: records[0].fields?.[TELEGRAM_NOTIFY_FIELDS.notifiedAt] || null };
      await storage.put(PRIVATE_NOTIFICATION_KEY, job);
      await auditNotification(storage, env, job);
      return true;
    }
    await patchNotification(env, job.recordId, { [TELEGRAM_NOTIFY_FIELDS.status]: "pending", [TELEGRAM_NOTIFY_FIELDS.error]: null });
  } catch {
    await retryBeforeSend(storage, env, job, "notification_preflight_failed");
    return true;
  }

  // This durable marker must complete before the external side effect starts.
  job = { ...job, status: "sending" };
  await storage.put(PRIVATE_NOTIFICATION_KEY, job);
  let routed;
  try {
    const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AUTH_SERVICE_SIGIL_TO_TELEGRAM}` },
      body: JSON.stringify(buildPrivateModelTelegramAlert(job.applicationId)),
      signal: AbortSignal.timeout(15_000),
    }));
    routed = await response.json();
    if (response.ok && routed?.ok === true && routed?.telegram?.ok === true && routed.telegram.result?.message_id) {
      job = { ...job, status: "sent", sentAt: new Date().toISOString(), messageId: routed.telegram.result.message_id, error: null };
    } else if (routed?.ok === true && routed?.telegram?.ok === false &&
        (routed.telegram.error?.ok === false || routed.telegram.skipped === true ||
         ["missing_chat_id", "missing_text", "thread_lock_missing"].includes(routed.telegram.error))) {
      // A structured provider rejection / router skip confirms no message sent.
      await retryBeforeSend(storage, env, job, "telegram_rejected", routed.telegram.error?.parameters?.retry_after);
      return true;
    } else {
      job = { ...job, status: "uncertain", error: "delivery_uncertain_manual_review" };
    }
  } catch {
    job = { ...job, status: "uncertain", error: "delivery_uncertain_manual_review" };
  }
  await storage.put(PRIVATE_NOTIFICATION_KEY, job);
  await auditNotification(storage, env, job);
  return true;
}

async function retryBeforeSend(storage, env, job, error, retryAfter) {
  const exhausted = job.attempts >= MAX_ATTEMPTS;
  const next = { ...job, status: exhausted ? "failed" : "queued", error };
  await storage.transaction(async (tx) => {
    await tx.put(PRIVATE_NOTIFICATION_KEY, next);
    if (!exhausted) await tx.setAlarm(Date.now() + Math.max(60_000 * 2 ** (job.attempts - 1), Math.min(Number(retryAfter) || 0, 86400) * 1000));
  });
  if (job.recordId) await patchNotification(env, job.recordId, { [TELEGRAM_NOTIFY_FIELDS.status]: "failed", [TELEGRAM_NOTIFY_FIELDS.error]: error }).catch(() => {});
  console.error(JSON.stringify({ event: "private_model_telegram_retry", application_id: job.applicationId, attempts: job.attempts, exhausted }));
}

async function auditNotification(storage, env, job) {
  if (!job.recordId || job.auditDone) return;
  try {
    await patchNotification(env, job.recordId, {
      [TELEGRAM_NOTIFY_FIELDS.status]: job.status === "sent" ? "sent" : "failed",
      [TELEGRAM_NOTIFY_FIELDS.error]: job.error || null,
      ...(job.sentAt ? { [TELEGRAM_NOTIFY_FIELDS.notifiedAt]: job.sentAt } : {}),
    });
    await storage.put(PRIVATE_NOTIFICATION_KEY, { ...job, auditDone: true });
  } catch {
    const auditAttempts = (job.auditAttempts || 0) + 1;
    await storage.put(PRIVATE_NOTIFICATION_KEY, { ...job, auditAttempts });
    if (auditAttempts < MAX_ATTEMPTS) await storage.setAlarm(Date.now() + 60_000 * 2 ** auditAttempts);
    console.error(JSON.stringify({ event: "private_model_telegram_audit_failed", application_id: job.applicationId, auditAttempts }));
  }
}

async function patchNotification(env, recordId, fields) {
  return airtable(env, `${APPLICATIONS_URL}/${recordId}?returnFieldsByFieldId=true`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields, typecast: false }),
  });
}

async function airtable(env, url, init) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${env.AIRTABLE_API_TOKEN}`);
  const fetcher = env.AIRTABLE_FETCH || fetch;
  const response = await fetcher(url, { ...init, headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("notification_audit_unavailable");
  return response.json();
}

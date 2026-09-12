const TOPIC_ENV = Object.freeze({
  applications: "MMS_TG_THREAD_APPLICATIONS",
  booking: "MMS_TG_THREAD_BOOKING",
  dispatch: "MMS_TG_THREAD_DISPATCH",
  alerts: "MMS_TG_THREAD_ALERTS",
});

const OPERATIONAL_ALERT_CODES = new Set([
  "MANUAL_COORDINATION_REQUIRED",
  "NO_AVAILABLE_APPROVED_THERAPIST",
  "DISPATCH_UNAVAILABLE",
  "PREBOOKING_STORAGE_PENDING",
  "DISPATCH_COORDINATOR_NOT_CONFIGURED",
  "MMS_DISPATCH_NOT_CONFIGURED",
  "AIRTABLE_UNAVAILABLE",
]);

const ACCEPT_RE = /^\/male-massage\/therapists\/api\/app\/offers\/(mmsjob_[a-f0-9]{24})\/accept$/;
const DECLINE_RE = /^\/male-massage\/therapists\/api\/app\/offers\/(mmsjob_[a-f0-9]{24})\/decline$/;
const START_RE = /^\/male-massage\/therapists\/api\/app\/jobs\/(mmsjob_[a-f0-9]{24})\/start$/;
const COMPLETE_RE = /^\/male-massage\/therapists\/api\/app\/jobs\/(mmsjob_[a-f0-9]{24})\/complete$/;
const INTERNAL_MATCH_RE = /^\/internal\/mms\/dispatch\/prebookings\/(mmspre_[a-f0-9]{24})\/match$/;
const INTERNAL_CANCEL_RE = /^\/internal\/mms\/dispatch\/jobs\/(mmsjob_[a-f0-9]{24})\/cancel$/;

function clean(value, max = 240) {
  return String(value ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, max);
}

function int(value) {
  const number = Number(clean(value, 32));
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function pathOf(request) {
  try {
    return new URL(request.url).pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  } catch {
    return "/";
  }
}

function errorCode(payload) {
  return clean(payload?.error?.code || payload?.dispatch?.code || "", 120).toUpperCase();
}

export function mmsTelegramTopic(env = {}, flow = "") {
  const key = clean(flow, 40).toLowerCase();
  const envName = TOPIC_ENV[key];
  if (!envName) return 0;
  return int(env[envName]);
}

export function mmsTelegramTopicRegistry(env = {}) {
  return Object.entries(TOPIC_ENV).map(([key, envName]) => ({
    key,
    env: envName,
    thread_id: int(env[envName]),
  }));
}

export function classifyMmsOpsAlert(request, payload = {}, responseStatus = 200) {
  const method = clean(request?.method || "GET", 12).toUpperCase();
  const path = pathOf(request);
  if (method !== "POST") return null;

  if (path === "/mms/api/prebookings") {
    if (payload?.duplicate === true) return null;
    const prebookingId = clean(payload?.prebooking?.prebooking_id || payload?.prebooking?.id, 80);
    const dispatch = payload?.dispatch && typeof payload.dispatch === "object" ? payload.dispatch : {};
    const code = errorCode(payload);
    if (dispatch?.state === "PENDING_COORDINATION" && code && OPERATIONAL_ALERT_CODES.has(code)) {
      return {
        flow: "alerts",
        event: "booking_needs_coordination",
        prebooking_id: prebookingId,
        job_id: clean(dispatch?.job_id, 80),
        state: "PENDING_COORDINATION",
        code,
      };
    }
    if (responseStatus >= 200 && responseStatus < 300 && prebookingId) {
      return {
        flow: "booking",
        event: "prebooking_received",
        prebooking_id: prebookingId,
        job_id: clean(dispatch?.job_id, 80),
        state: clean(dispatch?.state || payload?.prebooking?.status || "RECEIVED", 80).toUpperCase(),
        offered_count: Number(dispatch?.offered_count ?? 0) || 0,
        service_zone: clean(payload?.service_zone?.safe_label_th || payload?.service_zone?.label_th || payload?.service_zone?.code, 160),
      };
    }
  }

  const internalMatch = path.match(INTERNAL_MATCH_RE);
  if (internalMatch) {
    const data = payload?.data || {};
    if (payload?.ok && data?.duplicate !== true) {
      return {
        flow: "dispatch",
        event: "dispatch_offered",
        prebooking_id: internalMatch[1],
        job_id: clean(data?.job_id || data?.job?.job_id, 80),
        state: clean(data?.state || "OFFERED", 80).toUpperCase(),
        offered_count: Number(data?.offered_count ?? data?.offers?.length ?? 0) || 0,
      };
    }
    const code = errorCode(payload);
    if (code && OPERATIONAL_ALERT_CODES.has(code)) {
      return { flow: "alerts", event: "dispatch_needs_coordination", prebooking_id: internalMatch[1], state: "PENDING_COORDINATION", code };
    }
  }

  const accept = path.match(ACCEPT_RE);
  if (accept && payload?.ok && clean(payload?.data?.state, 40).toUpperCase() === "ACCEPTED") {
    return { flow: "dispatch", event: "therapist_accepted", job_id: accept[1], state: "ACCEPTED" };
  }

  if (DECLINE_RE.test(path)) return null;

  const start = path.match(START_RE);
  if (start && payload?.ok && clean(payload?.data?.state, 40).toUpperCase() === "IN_PROGRESS") {
    return { flow: "dispatch", event: "service_started", job_id: start[1], state: "IN_PROGRESS" };
  }

  const complete = path.match(COMPLETE_RE);
  if (complete && payload?.ok && clean(payload?.data?.state, 40).toUpperCase() === "COMPLETED") {
    return { flow: "dispatch", event: "service_completed", job_id: complete[1], state: "COMPLETED" };
  }

  const cancel = path.match(INTERNAL_CANCEL_RE);
  if (cancel && payload?.ok && clean(payload?.data?.state, 40).toUpperCase() === "CANCELLED") {
    return { flow: "dispatch", event: "job_cancelled", job_id: cancel[1], state: "CANCELLED" };
  }

  const code = errorCode(payload);
  if (responseStatus >= 400 && code && OPERATIONAL_ALERT_CODES.has(code)) {
    return { flow: "alerts", event: "mms_operation_attention", code, state: "ATTENTION" };
  }

  return null;
}

export function formatMmsOpsAlert(event = {}) {
  const labels = {
    prebooking_received: "NEW PREBOOKING",
    booking_needs_coordination: "BOOKING NEEDS COORDINATION",
    dispatch_offered: "DISPATCH OFFERED",
    dispatch_needs_coordination: "DISPATCH NEEDS COORDINATION",
    therapist_accepted: "THERAPIST ACCEPTED",
    service_started: "SERVICE STARTED",
    service_completed: "SERVICE COMPLETED",
    job_cancelled: "JOB CANCELLED",
    mms_operation_attention: "OPERATIONS ATTENTION",
  };
  const title = event.flow === "alerts" ? "🚨 MMS • ALERT" : event.flow === "booking" ? "🧾 MMS • BOOKING" : "🧭 MMS • DISPATCH";
  const lines = [title, `Event: ${labels[event.event] || clean(event.event, 100) || "MMS EVENT"}`];
  if (event.prebooking_id) lines.push(`Prebooking: ${clean(event.prebooking_id, 80)}`);
  if (event.job_id) lines.push(`Job: ${clean(event.job_id, 80)}`);
  if (event.state) lines.push(`State: ${clean(event.state, 80)}`);
  if (Number(event.offered_count) > 0) lines.push(`Offers: ${Number(event.offered_count)}`);
  if (event.service_zone) lines.push(`Zone: ${clean(event.service_zone, 160)}`);
  if (event.code) lines.push(`Code: ${clean(event.code, 120)}`);
  lines.push(`TS: ${new Date().toISOString()}`);
  return lines.join("\n");
}

export async function notifyMmsOpsResponse(request, response, env = {}) {
  if (!response) return { ok: false, skipped: true, reason: "missing_response" };
  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return { ok: false, skipped: true, reason: "non_json_response" };
  }

  const event = classifyMmsOpsAlert(request, payload, response.status);
  if (!event) return { ok: false, skipped: true, reason: "no_alert_event" };

  const botToken = clean(env.TELEGRAM_BOT_TOKEN, 200);
  const chatId = clean(env.MMS_TELEGRAM_CHAT_ID, 80);
  if (!botToken || !chatId) return { ok: false, skipped: true, reason: "telegram_not_configured", event };

  const threadId = mmsTelegramTopic(env, event.flow);
  if (!threadId) return { ok: false, skipped: true, reason: `thread_not_configured:${event.flow}`, event };

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId,
        text: formatMmsOpsAlert(event),
        disable_web_page_preview: true,
      }),
    });
    const telegramPayload = await telegramResponse.json().catch(() => ({}));
    if (!telegramResponse.ok || telegramPayload?.ok !== true) {
      return { ok: false, skipped: false, reason: `telegram_http_${telegramResponse.status}`, event };
    }
    return { ok: true, event, message_id: telegramPayload?.result?.message_id || null };
  } catch (error) {
    return { ok: false, skipped: false, reason: clean(error?.message || "telegram_network_error", 120), event };
  }
}

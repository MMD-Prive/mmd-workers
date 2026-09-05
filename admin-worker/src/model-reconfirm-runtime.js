const AIRTABLE_API = "https://api.airtable.com/v0";

export const ADMIN_JOB_CREATE_PATH = "/v1/admin/job/create";
export const MODEL_SESSION_CURRENT_PATH = "/v1/model/session/current";
export const MODEL_SESSION_ACTION_PATH = "/v1/model/session/action";
export const ACK_RECONFIRM_ACTION = "acknowledge_reconfirm";

const RECONFIRM_LIFECYCLE_STATES = new Set(["confirmed", "accepted"]);
const RECONFIRM_OPEN_STATUSES = new Set(["scheduled", "pending", "overdue"]);
const SESSION_TABLE_DEFAULT = "tblC98mKWbzmPuNzX";
const MODEL_TABLE_DEFAULT = "models";

export function isModelReconfirmRequest(path, method = "GET") {
  const verb = String(method || "GET").toUpperCase();
  return (
    (path === ADMIN_JOB_CREATE_PATH && verb === "POST") ||
    (path === MODEL_SESSION_CURRENT_PATH && verb === "GET") ||
    (path === MODEL_SESSION_ACTION_PATH && verb === "POST")
  );
}

export async function handleModelReconfirmRequest(request, env, ctx, downstream) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (path === ADMIN_JOB_CREATE_PATH && method === "POST") {
    return handleCreateSessionWithReconfirm(request, env, ctx, downstream);
  }

  if (path === MODEL_SESSION_CURRENT_PATH && method === "GET") {
    return handleCurrentSessionWithReconfirm(request, env, ctx, downstream);
  }

  if (path === MODEL_SESSION_ACTION_PATH && method === "POST") {
    const body = await request.clone().json().catch(() => ({}));
    if (normalizeWord(body?.action) === ACK_RECONFIRM_ACTION) {
      return handleAcknowledgeReconfirm(request, env, ctx, downstream, body);
    }
  }

  return downstream.fetch(request, env, ctx);
}

async function handleCreateSessionWithReconfirm(request, env, ctx, downstream) {
  const body = await request.clone().json().catch(() => ({}));
  const response = await downstream.fetch(request, env, ctx);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload || payload.ok === false) return response;

  const sessionId = clean(payload.session_id || payload.session_ref || payload?.raw?.session_id);
  const jobDate = clean(body.job_date || body?.job_details?.job_date);
  if (!sessionId || !jobDate) {
    return mergeJsonResponse(response, payload, {
      reconfirm: null,
      warnings: unique([...(Array.isArray(payload.warnings) ? payload.warnings : []), "reconfirm_schedule_input_missing"]),
    });
  }

  const schedule = buildReconfirmSchedule(jobDate);
  if (!schedule) {
    return mergeJsonResponse(response, payload, {
      reconfirm: null,
      warnings: unique([...(Array.isArray(payload.warnings) ? payload.warnings : []), "reconfirm_job_date_invalid"]),
    });
  }

  const persisted = await persistReconfirmSchedule(env, sessionId, schedule);
  if (!persisted.ok) {
    return mergeJsonResponse(response, payload, {
      reconfirm: null,
      warnings: unique([...(Array.isArray(payload.warnings) ? payload.warnings : []), persisted.error || "reconfirm_schema_not_ready"]),
    });
  }

  const reconfirm = reconfirmFromFields(env, persisted.record.fields || {}, Date.now());
  return mergeJsonResponse(response, payload, { reconfirm });
}

async function handleCurrentSessionWithReconfirm(request, env, ctx, downstream) {
  const response = await downstream.fetch(request, env, ctx);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => null);
  const session = payload?.session;
  const sessionId = clean(session?.session_id);
  if (!payload || !session || !sessionId) return response;

  const found = await findSessionBySessionId(env, sessionId);
  if (!found.ok || !found.record) return response;

  let record = found.record;
  let reconfirm = reconfirmFromFields(env, record.fields || {}, Date.now());

  // Lazy repair for sessions created before the create-route reconfirm hook.
  if (!reconfirm && isReconfirmLifecycleState(session.normalized_state || session.state)) {
    const jobDate = sessionJobDate(env, record.fields || {});
    const schedule = buildReconfirmSchedule(jobDate);
    if (schedule) {
      const persisted = await persistReconfirmSchedule(env, sessionId, schedule, record);
      if (persisted.ok) {
        record = persisted.record;
        reconfirm = reconfirmFromFields(env, record.fields || {}, Date.now());
      }
    }
  }

  if (!reconfirm) return response;

  const allowedActions = unique(Array.isArray(session.allowed_actions) ? session.allowed_actions : []);
  if (shouldOfferReconfirmAction(session.normalized_state || session.state, reconfirm.status)) {
    allowedActions.push(ACK_RECONFIRM_ACTION);
  }

  return mergeJsonResponse(response, payload, {
    session: {
      ...session,
      allowed_actions: unique(allowedActions),
      reconfirm,
      ...flatReconfirm(reconfirm),
    },
  });
}

async function handleAcknowledgeReconfirm(request, env, ctx, downstream, body) {
  const currentUrl = new URL(MODEL_SESSION_CURRENT_PATH, request.url);
  const suppliedT = clean(body?.t || new URL(request.url).searchParams.get("t"));
  if (suppliedT) currentUrl.searchParams.set("t", suppliedT);

  const currentHeaders = new Headers(request.headers);
  currentHeaders.delete("content-type");
  currentHeaders.delete("content-length");
  const currentRequest = new Request(currentUrl.toString(), { method: "GET", headers: currentHeaders });
  const currentResponse = await downstream.fetch(currentRequest, env, ctx);
  const currentPayload = await currentResponse.clone().json().catch(() => null);
  if (!currentResponse.ok || currentPayload?.ok === false) return currentResponse;

  const session = currentPayload?.session;
  const authenticatedSessionId = clean(session?.session_id);
  if (!authenticatedSessionId) return jsonLike(currentResponse, { ok: false, error: "session_not_found" }, 404);

  const requestedSessionId = clean(body?.session_id);
  if (requestedSessionId && requestedSessionId !== authenticatedSessionId) {
    return jsonLike(currentResponse, { ok: false, error: "session_mismatch" }, 403);
  }

  if (!isReconfirmLifecycleState(session?.normalized_state || session?.state)) {
    return jsonLike(currentResponse, { ok: false, error: "reconfirm_not_available" }, 409);
  }

  const found = await findSessionBySessionId(env, authenticatedSessionId);
  if (!found.ok || !found.record) {
    return jsonLike(currentResponse, { ok: false, error: found.error || "session_not_found" }, found.status || 404);
  }

  let reconfirm = reconfirmFromFields(env, found.record.fields || {}, Date.now());
  if (!reconfirm) {
    const schedule = buildReconfirmSchedule(sessionJobDate(env, found.record.fields || {}));
    if (!schedule) return jsonLike(currentResponse, { ok: false, error: "reconfirm_schema_not_ready" }, 503);
    const persisted = await persistReconfirmSchedule(env, authenticatedSessionId, schedule, found.record);
    if (!persisted.ok) return jsonLike(currentResponse, { ok: false, error: persisted.error }, persisted.status || 503);
    found.record = persisted.record;
    reconfirm = reconfirmFromFields(env, found.record.fields || {}, Date.now());
  }

  if (reconfirm?.status === "acknowledged") {
    return jsonLike(currentResponse, {
      ok: true,
      idempotent: true,
      session: enrichSessionWithReconfirm(session, reconfirm, false),
    });
  }

  const fields = reconfirmFields(env);
  const acknowledgedAt = new Date().toISOString();
  const patched = await patchSessionById(env, found.record.id, {
    [fields.status]: "acknowledged",
    [fields.acknowledgedAt]: acknowledgedAt,
    [fields.followupStatus]: "acknowledged",
    [fields.riskLevel]: "normal",
    [fields.backupRequired]: false,
  });
  if (!patched.ok) return jsonLike(currentResponse, { ok: false, error: patched.error || "reconfirm_write_failed" }, patched.status || 503);

  reconfirm = reconfirmFromFields(env, patched.record.fields || {}, Date.now());
  return jsonLike(currentResponse, {
    ok: true,
    session: enrichSessionWithReconfirm(session, reconfirm, false),
  });
}

export function buildReconfirmSchedule(jobDate) {
  const value = clean(jobDate);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (
    base.getUTCFullYear() !== year ||
    base.getUTCMonth() !== month - 1 ||
    base.getUTCDate() !== day
  ) return null;
  base.setUTCDate(base.getUTCDate() - 1);
  const ymd = base.toISOString().slice(0, 10);
  return {
    status: "scheduled",
    required_at: `${ymd}T16:00:00+07:00`,
    reminder_at: `${ymd}T18:00:00+07:00`,
    overdue_at: `${ymd}T19:00:00+07:00`,
    acknowledged_at: null,
    notified_at: null,
    reminder_notified_at: null,
    ops_alerted_at: null,
    followup_status: "none",
    risk_level: "normal",
    backup_required: false,
  };
}

export function deriveReconfirmStatus(reconfirm, nowMs = Date.now()) {
  if (!reconfirm) return null;
  if (clean(reconfirm.acknowledged_at)) return "acknowledged";
  const overdue = Date.parse(clean(reconfirm.overdue_at));
  const required = Date.parse(clean(reconfirm.required_at));
  if (Number.isFinite(overdue) && nowMs >= overdue) return "overdue";
  if (Number.isFinite(required) && nowMs >= required) return "pending";
  return "scheduled";
}

export function shouldOfferReconfirmAction(lifecycleState, reconfirmStatus) {
  return isReconfirmLifecycleState(lifecycleState) && RECONFIRM_OPEN_STATUSES.has(normalizeWord(reconfirmStatus));
}

export async function runModelReconfirmSweep(env, { now = Date.now(), maxRecords = 500 } = {}) {
  if (normalizeWord(env.MODEL_RECONFIRM_ENABLED || "false") !== "true") {
    return { ok: true, enabled: false, processed: 0, notified: 0, reminded: 0, escalated: 0 };
  }

  const listed = await listSessions(env, Math.max(1, Math.min(1000, Number(maxRecords) || 500)));
  if (!listed.ok) return { ok: false, error: listed.error, processed: 0 };

  const counters = { processed: 0, notified: 0, reminded: 0, escalated: 0, errors: 0 };
  for (const record of listed.records) {
    const fields = record.fields || {};
    if (!isReconfirmLifecycleState(sessionLifecycleState(env, fields))) continue;

    let reconfirm = reconfirmFromFields(env, fields, now);
    if (!reconfirm) {
      const schedule = buildReconfirmSchedule(sessionJobDate(env, fields));
      if (!schedule) continue;
      const persisted = await persistReconfirmSchedule(env, sessionIdFromFields(env, fields), schedule, record);
      if (!persisted.ok) { counters.errors += 1; continue; }
      record.fields = persisted.record.fields || {};
      reconfirm = reconfirmFromFields(env, record.fields, now);
    }
    if (!reconfirm || reconfirm.status === "acknowledged") continue;

    counters.processed += 1;
    const requiredMs = Date.parse(reconfirm.required_at);
    const reminderMs = Date.parse(reconfirm.reminder_at);
    const overdueMs = Date.parse(reconfirm.overdue_at);

    if (Number.isFinite(requiredMs) && now >= requiredMs && !reconfirm.notified_at) {
      const sent = await pushModelReconfirm(env, record, false);
      if (sent.ok) {
        const patched = await patchReconfirm(env, record, {
          status: now >= overdueMs ? "overdue" : "pending",
          notifiedAt: new Date(now).toISOString(),
        });
        if (patched.ok) { record.fields = patched.record.fields; counters.notified += 1; }
        else counters.errors += 1;
      } else counters.errors += 1;
      reconfirm = reconfirmFromFields(env, record.fields || {}, now) || reconfirm;
    }

    if (Number.isFinite(reminderMs) && now >= reminderMs && !reconfirm.reminder_notified_at && reconfirm.status !== "acknowledged") {
      const sent = await pushModelReconfirm(env, record, true);
      if (sent.ok) {
        const patched = await patchReconfirm(env, record, {
          reminderNotifiedAt: new Date(now).toISOString(),
          followupStatus: "reminded",
          riskLevel: "normal",
        });
        if (patched.ok) { record.fields = patched.record.fields; counters.reminded += 1; }
        else counters.errors += 1;
      } else counters.errors += 1;
      reconfirm = reconfirmFromFields(env, record.fields || {}, now) || reconfirm;
    }

    if (Number.isFinite(overdueMs) && now >= overdueMs && !reconfirm.ops_alerted_at && reconfirm.status !== "acknowledged") {
      const alert = await sendOpsReconfirmOverdue(env, record);
      if (alert.ok) {
        const patched = await patchReconfirm(env, record, {
          status: "overdue",
          opsAlertedAt: new Date(now).toISOString(),
          followupStatus: "followup_required",
          riskLevel: "elevated",
          backupRequired: false,
        });
        if (patched.ok) { record.fields = patched.record.fields; counters.escalated += 1; }
        else counters.errors += 1;
      } else counters.errors += 1;
    }
  }

  return { ok: counters.errors === 0, enabled: true, ...counters };
}

function enrichSessionWithReconfirm(session, reconfirm, offerAction = true) {
  const allowed = unique(Array.isArray(session?.allowed_actions) ? session.allowed_actions : []);
  const filtered = allowed.filter((action) => action !== ACK_RECONFIRM_ACTION);
  if (offerAction && shouldOfferReconfirmAction(session?.normalized_state || session?.state, reconfirm?.status)) {
    filtered.push(ACK_RECONFIRM_ACTION);
  }
  return {
    ...session,
    allowed_actions: unique(filtered),
    reconfirm,
    ...flatReconfirm(reconfirm),
  };
}

function flatReconfirm(reconfirm) {
  if (!reconfirm) return {};
  return {
    reconfirm_status: reconfirm.status,
    reconfirm_required_at: reconfirm.required_at,
    reconfirm_notified_at: reconfirm.notified_at,
    reconfirm_acknowledged_at: reconfirm.acknowledged_at,
    followup_status: reconfirm.followup_status,
    risk_level: reconfirm.risk_level,
    backup_required: reconfirm.backup_required,
  };
}

function reconfirmFields(env) {
  return {
    status: clean(env.AT_SESSIONS__RECONFIRM_STATUS || "reconfirm_status"),
    requiredAt: clean(env.AT_SESSIONS__RECONFIRM_REQUIRED_AT || "reconfirm_required_at"),
    reminderAt: clean(env.AT_SESSIONS__RECONFIRM_REMINDER_AT || "reconfirm_reminder_at"),
    overdueAt: clean(env.AT_SESSIONS__RECONFIRM_OVERDUE_AT || "reconfirm_overdue_at"),
    notifiedAt: clean(env.AT_SESSIONS__RECONFIRM_NOTIFIED_AT || "reconfirm_notified_at"),
    reminderNotifiedAt: clean(env.AT_SESSIONS__RECONFIRM_REMINDER_NOTIFIED_AT || "reconfirm_reminder_notified_at"),
    acknowledgedAt: clean(env.AT_SESSIONS__RECONFIRM_ACKNOWLEDGED_AT || "reconfirm_acknowledged_at"),
    followupStatus: clean(env.AT_SESSIONS__RECONFIRM_FOLLOWUP_STATUS || "reconfirm_followup_status"),
    riskLevel: clean(env.AT_SESSIONS__RECONFIRM_RISK_LEVEL || "reconfirm_risk_level"),
    backupRequired: clean(env.AT_SESSIONS__RECONFIRM_BACKUP_REQUIRED || "reconfirm_backup_required"),
    opsAlertedAt: clean(env.AT_SESSIONS__RECONFIRM_OPS_ALERTED_AT || "reconfirm_ops_alerted_at"),
  };
}

function sessionFields(env) {
  return {
    sessionId: clean(env.AT_SESSIONS__SESSION_ID || "session_id"),
    state: clean(env.AT_SESSIONS__STATE || "session_state"),
    status: clean(env.AT_SESSIONS__STATUS || "status"),
    jobDate: clean(env.AT_SESSIONS__JOB_DATE || "job_date"),
    modelRecordId: clean(env.AT_SESSIONS__MODEL_RECORD_ID || "Assigned Model"),
    modelName: clean(env.AT_SESSIONS__MODEL_NAME || "model_name"),
  };
}

function reconfirmFromFields(env, fields, nowMs) {
  const names = reconfirmFields(env);
  const requiredAt = clean(fields?.[names.requiredAt]);
  const reminderAt = clean(fields?.[names.reminderAt]);
  const overdueAt = clean(fields?.[names.overdueAt]);
  if (!requiredAt || !reminderAt || !overdueAt) return null;
  const reconfirm = {
    status: clean(fields?.[names.status]),
    required_at: requiredAt,
    reminder_at: reminderAt,
    overdue_at: overdueAt,
    notified_at: clean(fields?.[names.notifiedAt]) || null,
    reminder_notified_at: clean(fields?.[names.reminderNotifiedAt]) || null,
    acknowledged_at: clean(fields?.[names.acknowledgedAt]) || null,
    ops_alerted_at: clean(fields?.[names.opsAlertedAt]) || null,
    followup_status: clean(fields?.[names.followupStatus]) || "none",
    risk_level: clean(fields?.[names.riskLevel]) || "normal",
    backup_required: truthy(fields?.[names.backupRequired]),
  };
  reconfirm.status = reconfirm.status === "acknowledged" ? "acknowledged" : deriveReconfirmStatus(reconfirm, nowMs);
  return reconfirm;
}

async function persistReconfirmSchedule(env, sessionId, schedule, knownRecord = null) {
  const found = knownRecord ? { ok: true, record: knownRecord } : await findSessionBySessionId(env, sessionId);
  if (!found.ok || !found.record) return { ok: false, status: found.status || 404, error: found.error || "reconfirm_session_not_found" };
  const names = reconfirmFields(env);
  return patchSessionById(env, found.record.id, {
    [names.status]: schedule.status,
    [names.requiredAt]: schedule.required_at,
    [names.reminderAt]: schedule.reminder_at,
    [names.overdueAt]: schedule.overdue_at,
    [names.followupStatus]: "none",
    [names.riskLevel]: "normal",
    [names.backupRequired]: false,
  });
}

async function patchReconfirm(env, record, patch) {
  const names = reconfirmFields(env);
  const fields = {};
  if (patch.status !== undefined) fields[names.status] = patch.status;
  if (patch.notifiedAt !== undefined) fields[names.notifiedAt] = patch.notifiedAt;
  if (patch.reminderNotifiedAt !== undefined) fields[names.reminderNotifiedAt] = patch.reminderNotifiedAt;
  if (patch.opsAlertedAt !== undefined) fields[names.opsAlertedAt] = patch.opsAlertedAt;
  if (patch.followupStatus !== undefined) fields[names.followupStatus] = patch.followupStatus;
  if (patch.riskLevel !== undefined) fields[names.riskLevel] = patch.riskLevel;
  if (patch.backupRequired !== undefined) fields[names.backupRequired] = patch.backupRequired;
  return patchSessionById(env, record.id, fields);
}

async function findSessionBySessionId(env, sessionId) {
  const id = clean(sessionId);
  if (!id) return { ok: false, status: 400, error: "session_id_required" };
  const names = sessionFields(env);
  const params = new URLSearchParams({ pageSize: "1", filterByFormula: `{${names.sessionId}}="${escapeFormula(id)}"` });
  const result = await airtable(env, sessionTable(env), `?${params.toString()}`);
  if (!result.ok) return result;
  const record = result.data?.records?.[0];
  return record ? { ok: true, status: 200, record: { id: record.id, fields: record.fields || {} } } : { ok: false, status: 404, error: "session_not_found" };
}

async function listSessions(env, maxRecords) {
  const records = [];
  let offset = "";
  while (records.length < maxRecords) {
    const params = new URLSearchParams({ pageSize: String(Math.min(100, maxRecords - records.length)) });
    if (offset) params.set("offset", offset);
    const result = await airtable(env, sessionTable(env), `?${params.toString()}`);
    if (!result.ok) return { ok: false, status: result.status, error: result.error, records };
    records.push(...(result.data?.records || []).map((record) => ({ id: record.id, fields: record.fields || {} })));
    offset = clean(result.data?.offset);
    if (!offset) break;
  }
  return { ok: true, records };
}

async function patchSessionById(env, recordId, fields) {
  const result = await airtable(env, sessionTable(env), `/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!result.ok) return result;
  return { ok: true, status: 200, record: { id: result.data?.id || recordId, fields: result.data?.fields || {} } };
}

async function pushModelReconfirm(env, sessionRecord, reminder) {
  const lineUserId = await resolveModelLineUserId(env, sessionRecord.fields || {});
  if (!lineUserId) return { ok: false, error: "model_line_user_id_missing" };
  const token = clean(env.MODEL_LINE_CHANNEL_ACCESS_TOKEN || env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) return { ok: false, error: "model_line_channel_access_token_missing" };

  const fields = sessionRecord.fields || {};
  const modelName = sessionModelName(env, fields) || "Model";
  const date = sessionJobDate(env, fields) || "วันพรุ่งนี้";
  const text = reminder
    ? `MMD MODEL · Reminder\n${modelName} ยังไม่ได้กดรับทราบงานวันที่ ${date}\nกรุณาเปิด MMD MODEL และกด “รับทราบงานแล้ว”`
    : `MMD MODEL · งานของคุณพรุ่งนี้\nงานวันที่ ${date}\nกรุณาเปิด MMD MODEL เพื่อตรวจรายละเอียดและกด “รับทราบงานแล้ว”`;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
  });
  return response.ok ? { ok: true } : { ok: false, error: `line_push_http_${response.status}` };
}

async function sendOpsReconfirmOverdue(env, sessionRecord) {
  const endpoint = clean(env.TELEGRAM_INTERNAL_SEND_URL);
  const serviceToken = clean(env.AUTH_SERVICE_EVENTS_TO_TELEGRAM || env.AUTH_SERVICE_STUDIO_TO_TELEGRAM);
  const chatId = clean(env.TELEGRAM_BOOKING_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID);
  if (!endpoint || !serviceToken || !chatId) return { ok: false, error: "reconfirm_ops_notify_config_missing" };

  const fields = sessionRecord.fields || {};
  const sessionId = sessionIdFromFields(env, fields) || sessionRecord.id;
  const modelName = sessionModelName(env, fields) || "Model";
  const jobDate = sessionJobDate(env, fields) || "-";
  const text = [
    "⚠️ <b>Reconfirm Overdue</b>",
    `Model: <b>${escapeHtml(modelName)}</b>`,
    `Job date: <b>${escapeHtml(jobDate)}</b>`,
    `Session: <code>${escapeHtml(sessionId)}</code>`,
    "",
    "Model ยังไม่ได้รับทราบงานสำหรับวันพรุ่งนี้",
    "กรุณาติดตาม Model และเฝ้าดูความเสี่ยง / เตรียมแผนสำรองหากยังไม่มีการตอบกลับ",
    "งานยังไม่ถูกยกเลิก และยังไม่แจ้งลูกค้าว่างานมีปัญหา",
  ].join("\n");

  const threadId = clean(env.TG_THREAD_BOOKING || env.TG_THREAD_ALERTS_EXCEPTIONS || env.TG_THREAD_ALERT || env.TELEGRAM_THREAD_ID);
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    source: "events-worker",
    intent: "model_reconfirm_overdue",
    session_id: sessionId,
  };
  if (threadId) {
    payload.message_thread_id = threadId;
    payload.thread_id = threadId;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": serviceToken },
    body: JSON.stringify(payload),
  });
  return response.ok ? { ok: true } : { ok: false, error: `telegram_http_${response.status}` };
}

async function resolveModelLineUserId(env, sessionFieldsValue) {
  const fields = sessionFields(env);
  const ref = sessionFieldsValue?.[fields.modelRecordId];
  const recordId = Array.isArray(ref) ? clean(ref[0]) : clean(ref);
  if (!recordId || !/^rec[A-Za-z0-9]+$/.test(recordId)) return "";
  const result = await airtable(env, modelTable(env), `/${encodeURIComponent(recordId)}`);
  if (!result.ok) return "";
  const modelFields = result.data?.fields || {};
  const lineField = clean(env.AT_MODELS__LINE_USER_ID || "line_user_id");
  return clean(modelFields?.[lineField]);
}

async function airtable(env, table, suffix = "", init = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const apiKey = clean(env.AIRTABLE_API_KEY);
  if (!baseId || !apiKey || !table) return { ok: false, status: 503, error: "reconfirm_storage_not_ready" };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}${suffix}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const type = clean(data?.error?.type || data?.error);
    const message = clean(data?.error?.message);
    const schema = response.status === 422 || /unknown field|field.*not found/i.test(`${type} ${message}`);
    return { ok: false, status: schema ? 503 : response.status, error: schema ? "reconfirm_schema_not_ready" : "reconfirm_storage_request_failed", detail: data };
  }
  return { ok: true, status: response.status, data };
}

function sessionTable(env) { return clean(env.AIRTABLE_TABLE_SESSIONS || SESSION_TABLE_DEFAULT); }
function modelTable(env) { return clean(env.AIRTABLE_TABLE_MODELS || MODEL_TABLE_DEFAULT); }
function sessionIdFromFields(env, fields) { return clean(fields?.[sessionFields(env).sessionId]); }
function sessionJobDate(env, fields) { return clean(fields?.[sessionFields(env).jobDate] || fields?.service_date || fields?.date); }
function sessionModelName(env, fields) { return clean(fields?.[sessionFields(env).modelName] || fields?.["Model Name"]); }
function sessionLifecycleState(env, fields) { return normalizeWord(fields?.[sessionFields(env).state] || fields?.[sessionFields(env).status]); }
function isReconfirmLifecycleState(value) { return RECONFIRM_LIFECYCLE_STATES.has(normalizeWord(value)); }

function mergeJsonResponse(response, original, additions) {
  return jsonLike(response, { ...original, ...additions }, response.status);
}

function jsonLike(response, payload, status = response.status || 200) {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}

function normalizePath(pathname) {
  const value = String(pathname || "/").replace(/\/{2,}/g, "/");
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}
function normalizeWord(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function clean(value) { return String(value ?? "").trim(); }
function unique(values) { return [...new Set((values || []).map((value) => clean(value)).filter(Boolean))]; }
function truthy(value) { return value === true || ["true", "1", "yes", "y"].includes(normalizeWord(value)); }
function escapeFormula(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function escapeHtml(value) { return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

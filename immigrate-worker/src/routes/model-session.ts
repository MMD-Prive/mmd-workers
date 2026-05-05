import {
  airtableTable,
  createRecordWithFallbacks,
  encodeFormulaValue,
  type AirtableFields,
  type AirtableFieldValue,
  type AirtableWriteResult,
} from "../lib/airtable-schema";
import { verifyInviteToken, type InviteTokenPayload } from "../lib/invite";
import { json, makeMeta } from "../lib/response";
import type { Env, Meta } from "../types";

export const MODEL_SESSION_DASHBOARD_PATH = "/v1/model/session/dashboard";
export const MODEL_SESSION_STATUS_PATH = "/v1/model/session/status";

const MODEL_SESSION_STATUSES = new Set([
  "en_route",
  "arrived",
  "met",
  "work_started",
  "work_finished",
  "separated",
]);

type AirtableRecord = {
  id: string;
  fields?: Record<string, AirtableFieldValue>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
};

type ModelDashboardSession = {
  session_id: string;
  status: string;
  job_type: string;
  job_date: string;
  start_time: string;
  end_time: string;
  location_name: string;
  google_map_url: string;
  amount_thb: number | null;
  payment_status: string;
  note: string;
  client_vibe: string;
  suggested_tone: string;
  caution: string;
};

type ModelSessionContext = {
  invite: InviteTokenPayload;
  assignmentKey: string;
  session: AirtableRecord;
};

function toStr(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => toStr(item)).filter(Boolean).join(", ");
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeComparable(value: unknown): string {
  return toStr(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickString(fields: Record<string, AirtableFieldValue> | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    const text = toStr(value);
    if (text) return text;
  }
  return "";
}

function pickNumber(fields: Record<string, AirtableFieldValue> | undefined, keys: string[]): number | null {
  for (const key of keys) {
    const value = fields?.[key];
    const amount = toNum(value);
    if (amount != null) return amount;
  }
  return null;
}

function airtableConfigured(env: Env): boolean {
  return Boolean(env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID);
}

function airtableUrl(env: Env, table: string): string {
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
}

function airtableHeaders(env: Env): HeadersInit {
  return {
    authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "content-type": "application/json",
  };
}

function isUnknownFieldError(message: string): boolean {
  return /Unknown field name/i.test(message) || /INVALID_FILTER_BY_FORMULA/i.test(message);
}

async function listAirtableRecords(
  env: Env,
  table: string,
  formula: string,
  maxRecords = 10,
): Promise<AirtableRecord[]> {
  const url = new URL(airtableUrl(env, table));
  url.searchParams.set("pageSize", String(Math.max(1, Math.min(maxRecords, 100))));
  url.searchParams.set("filterByFormula", formula);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: airtableHeaders(env),
  });

  const text = await response.text();
  const data = (() => {
    try {
      return JSON.parse(text) as AirtableListResponse;
    } catch {
      return {};
    }
  })();

  if (!response.ok) {
    throw new Error(`Airtable ${table} lookup failed: ${response.status} ${text}`);
  }

  return data.records ?? [];
}

async function findFirstByFormulas(
  env: Env,
  table: string,
  formulas: string[],
  predicate: (record: AirtableRecord) => boolean,
): Promise<AirtableRecord | null> {
  let lastError: Error | null = null;

  for (const formula of formulas) {
    try {
      const records = await listAirtableRecords(env, table, formula);
      const record = records.find(predicate);
      if (record) return record;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!isUnknownFieldError(err.message)) lastError = err;
    }
  }

  if (lastError) throw lastError;
  return null;
}

function exactFormula(field: string, value: string): string {
  return `{${field}}="${encodeFormulaValue(value)}"`;
}

function sessionLookupFormulas(assignmentKey: string): string[] {
  return [
    exactFormula("session_id", assignmentKey),
    exactFormula("Session ID", assignmentKey),
    exactFormula("fldLTq2kZbyRv22IA", assignmentKey),
    exactFormula("payment_ref", assignmentKey),
    exactFormula("Payment Reference", assignmentKey),
    exactFormula("fldojgjSQLaO0uQLX", assignmentKey),
  ];
}

function jobLookupFormulas(input: { sessionId: string; paymentRef: string; jobId: string }): string[] {
  const formulas: string[] = [];
  if (input.jobId) {
    formulas.push(exactFormula("job_id", input.jobId), exactFormula("Job ID", input.jobId));
  }
  if (input.sessionId) {
    formulas.push(exactFormula("session_id", input.sessionId), exactFormula("Session ID", input.sessionId));
  }
  if (input.paymentRef) {
    formulas.push(exactFormula("payment_ref", input.paymentRef), exactFormula("Payment Reference", input.paymentRef));
  }
  return formulas;
}

function paymentLookupFormulas(input: { sessionId: string; paymentRef: string }): string[] {
  const formulas: string[] = [];
  if (input.paymentRef) {
    formulas.push(exactFormula("payment_ref", input.paymentRef), exactFormula("Payment Reference", input.paymentRef));
  }
  if (input.sessionId) {
    formulas.push(exactFormula("session_id", input.sessionId), exactFormula("Session ID", input.sessionId));
  }
  return formulas;
}

function sessionIdFromFields(fields: Record<string, AirtableFieldValue> | undefined): string {
  return pickString(fields, ["session_id", "Session ID", "fldLTq2kZbyRv22IA"]);
}

function paymentRefFromFields(fields: Record<string, AirtableFieldValue> | undefined): string {
  return pickString(fields, ["payment_ref", "Payment Reference", "fldojgjSQLaO0uQLX"]);
}

function modelRecordIdFromFields(fields: Record<string, AirtableFieldValue> | undefined): string {
  return pickString(fields, ["model_record_id", "Model Record ID", "model_id", "Model"]);
}

function modelNameFromFields(fields: Record<string, AirtableFieldValue> | undefined): string {
  return pickString(fields, ["model_name", "Model Name", "model_display_name", "Model Display Name"]);
}

function isAssignedSession(record: AirtableRecord, invite: InviteTokenPayload, assignmentKey: string): boolean {
  const fields = record.fields;
  const sessionId = sessionIdFromFields(fields);
  const paymentRef = paymentRefFromFields(fields);
  const keyMatches = sessionId === assignmentKey || paymentRef === assignmentKey;

  if (!keyMatches) return false;

  const tokenModelRecordId = toStr(invite.model_record_id);
  const sessionModelRecordId = modelRecordIdFromFields(fields);
  if (
    tokenModelRecordId &&
    sessionModelRecordId &&
    !sessionModelRecordId.split(/\s*,\s*/).includes(tokenModelRecordId)
  ) {
    return false;
  }

  const tokenModelName = normalizeComparable(invite.model_name);
  const sessionModelName = normalizeComparable(modelNameFromFields(fields));
  if (tokenModelName && sessionModelName && tokenModelName !== sessionModelName) {
    return false;
  }

  return true;
}

async function resolveModelSession(env: Env, token: string): Promise<ModelSessionContext> {
  if (!airtableConfigured(env)) {
    throw new Error("airtable_not_configured");
  }

  const invite = await verifyInviteToken(token, String(env.CONFIRM_KEY || env.INTERNAL_TOKEN || ""));
  if (invite.role !== "model" || invite.lane !== "model_console") {
    throw new Error("invalid_model_session_token");
  }

  const assignmentKey = toStr(invite.immigration_id);
  if (!assignmentKey) {
    throw new Error("missing_model_session_assignment");
  }

  const session = await findFirstByFormulas(
    env,
    airtableTable(env, "sessions"),
    sessionLookupFormulas(assignmentKey),
    (record) => isAssignedSession(record, invite, assignmentKey),
  );

  if (!session) {
    throw new Error("session_not_found");
  }

  return { invite, assignmentKey, session };
}

async function findPaymentStatus(
  env: Env,
  input: { sessionId: string; paymentRef: string },
): Promise<string> {
  const fallback = "";
  const formulas = paymentLookupFormulas(input);
  if (!formulas.length) return fallback;

  try {
    const payment = await findFirstByFormulas(env, airtableTable(env, "payments"), formulas, () => true);
    return pickString(payment?.fields, ["status", "payment_status", "Payment Status", "fldTY5lE6m0kQf72n"]);
  } catch (error) {
    console.warn("immigrate-worker model payment status lookup failed", error);
    return fallback;
  }
}

function buildDashboardSession(
  session: AirtableRecord,
  paymentStatus: string,
): ModelDashboardSession {
  const fields = session.fields;
  const status = pickString(fields, ["status", "session_status", "Status", "fldHAlxnRfpKucnNV"]) || "confirmed";

  return {
    session_id: sessionIdFromFields(fields),
    status,
    job_type: pickString(fields, ["job_type", "work_type", "Job Type", "Work Type", "package_code"]),
    job_date: pickString(fields, ["job_date", "service_date", "Date", "Service Date"]),
    start_time: pickString(fields, ["start_time", "Start Time", "start"]),
    end_time: pickString(fields, ["end_time", "End Time", "end"]),
    location_name: pickString(fields, ["location_name", "Location Name", "location"]),
    google_map_url: pickString(fields, ["google_map_url", "Google Map URL", "map_url"]),
    amount_thb: pickNumber(fields, [
      "amount_thb",
      "amount_total_thb",
      "final_price_thb",
      "Amount THB",
      "Final Price THB",
      "fldhwC79ndbnEXSZz",
      "fldug5LUyiLyLvrCV",
    ]),
    payment_status:
      paymentStatus ||
      pickString(fields, ["payment_status", "Payment Status", "payment_stage", "fldTY5lE6m0kQf72n"]),
    note: pickString(fields, ["model_console_note", "model_note_public", "model_brief", "session_note", "note"]),
    client_vibe: pickString(fields, ["client_vibe", "Client Vibe", "model_client_vibe"]),
    suggested_tone: pickString(fields, ["suggested_tone", "Suggested Tone", "model_suggested_tone"]),
    caution: pickString(fields, ["model_caution", "model_console_caution", "caution"]),
  };
}

function errorStatus(message: string): number {
  switch (message) {
    case "expired_invite_token":
      return 410;
    case "session_not_found":
      return 404;
    case "airtable_not_configured":
      return 503;
    case "missing_t":
    case "missing_status":
    case "invalid_status":
    case "invalid_request_body":
      return 400;
    default:
      return 401;
  }
}

function errorCode(status: number): string {
  if (status === 404) return "SESSION_NOT_FOUND";
  if (status === 410) return "TOKEN_EXPIRED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status === 400) return "INVALID_INPUT";
  return "UNAUTHORIZED";
}

function errorJson(meta: Meta, message: string): Response {
  const status = errorStatus(message);
  return json(
    {
      ok: false,
      error: {
        code: errorCode(status),
        message,
      },
      meta,
    },
    { status },
  );
}

export async function handleModelSessionDashboard(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const token = toStr(new URL(request.url).searchParams.get("t"));

  if (!token) {
    return errorJson(meta, "missing_t");
  }

  try {
    const context = await resolveModelSession(env, token);
    const fields = context.session.fields;
    const paymentStatus = await findPaymentStatus(env, {
      sessionId: sessionIdFromFields(fields),
      paymentRef: paymentRefFromFields(fields),
    });

    return json({
      ok: true,
      session: buildDashboardSession(context.session, paymentStatus),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_model_session_token";
    return errorJson(meta, message);
  }
}

async function patchStatusRecord(
  env: Env,
  table: string,
  recordId: string,
  fields: AirtableFields,
): Promise<AirtableWriteResult> {
  const candidate = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""),
  ) as AirtableFields;

  while (Object.keys(candidate).length) {
    const response = await fetch(`${airtableUrl(env, table)}/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      headers: airtableHeaders(env),
      body: JSON.stringify({ fields: candidate, typecast: true }),
    });

    const text = await response.text();
    if (response.ok) {
      const data = (() => {
        try {
          return JSON.parse(text) as { id?: string };
        } catch {
          return {};
        }
      })();
      return { table, action: "updated", record_id: toStr(data.id) || recordId };
    }

    const unknownField =
      text.match(/Unknown field name:\s+\\"([^"]+)\\"/)?.[1] ||
      text.match(/Unknown field name:\s+"([^"]+)"/)?.[1] ||
      "";

    if (unknownField && unknownField in candidate) {
      delete candidate[unknownField];
      continue;
    }

    return {
      table,
      action: "error",
      error: `Airtable ${response.status}: ${text}`,
    };
  }

  return { table, action: "skipped", error: "no_known_status_fields" };
}

async function findLinkedJob(env: Env, session: AirtableRecord): Promise<AirtableRecord | null> {
  const fields = session.fields;
  const formulas = jobLookupFormulas({
    sessionId: sessionIdFromFields(fields),
    paymentRef: paymentRefFromFields(fields),
    jobId: pickString(fields, ["job_id", "Job ID", "job_record_id", "Job Record ID"]),
  });

  if (!formulas.length) return null;

  try {
    return await findFirstByFormulas(env, airtableTable(env, "jobs"), formulas, () => true);
  } catch (error) {
    console.warn("immigrate-worker model job lookup failed", error);
    return null;
  }
}

async function updateSessionStatus(env: Env, session: AirtableRecord, status: string): Promise<AirtableWriteResult> {
  return patchStatusRecord(env, airtableTable(env, "sessions"), session.id, {
    [toStr(env.AIRTABLE_SESSION_FIELD_STATUS) || "status"]: status,
    status,
    session_status: status,
    fldHAlxnRfpKucnNV: status,
    updated_at: new Date().toISOString(),
  });
}

async function updateJobStatus(env: Env, session: AirtableRecord, status: string): Promise<AirtableWriteResult> {
  const job = await findLinkedJob(env, session);
  if (!job?.id) {
    return { table: airtableTable(env, "jobs"), action: "skipped", error: "job_not_found" };
  }

  return patchStatusRecord(env, airtableTable(env, "jobs"), job.id, {
    status,
    job_status: status,
    session_status: status,
    updated_at: new Date().toISOString(),
  });
}

async function writeActivityLog(
  env: Env,
  context: ModelSessionContext,
  status: string,
): Promise<AirtableWriteResult> {
  const fields = context.session.fields;
  const sessionId = sessionIdFromFields(fields) || context.assignmentKey;
  const now = new Date().toISOString();

  return createRecordWithFallbacks(env, airtableTable(env, "activity_logs"), {
    Name: `model-session-status:${sessionId}:${status}`,
    action: "model_session_status",
    actor: "model",
    role: "model",
    session_id: sessionId,
    payment_ref: paymentRefFromFields(fields),
    model_name: modelNameFromFields(fields) || toStr(context.invite.model_name),
    model_record_id: modelRecordIdFromFields(fields) || toStr(context.invite.model_record_id),
    status,
    payload_json: JSON.stringify({
      session_id: sessionId,
      status,
      model_invite_id: context.invite.invite_id,
      at: now,
    }),
    created_at: now,
  });
}

export async function handleModelSessionStatus(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const body = (await request.json().catch(() => null)) as { t?: unknown; status?: unknown } | null;

  if (!body || typeof body !== "object") {
    return errorJson(meta, "invalid_request_body");
  }

  const token = toStr(body.t);
  const status = toStr(body.status);
  if (!token) return errorJson(meta, "missing_t");
  if (!status) return errorJson(meta, "missing_status");
  if (!MODEL_SESSION_STATUSES.has(status)) return errorJson(meta, "invalid_status");

  try {
    const context = await resolveModelSession(env, token);
    const sessionWrite = await updateSessionStatus(env, context.session, status);
    if (sessionWrite.action === "error") {
      throw new Error(sessionWrite.error || "session_status_update_failed");
    }

    const jobWrite = await updateJobStatus(env, context.session, status);
    if (jobWrite.action === "error") {
      console.warn("immigrate-worker model job status update failed", jobWrite.error);
    }

    const logWrite = await writeActivityLog(env, context, status);
    if (logWrite.action === "error") {
      console.warn("immigrate-worker model status activity log failed", logWrite.error);
    }

    return json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "model_session_status_failed";
    return errorJson(meta, message);
  }
}

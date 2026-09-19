const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const DEFAULT_ADJUSTMENTS_TABLE = "tbl2624vwyWkOeP0y";
const PATH = "/v1/admin/model-payout/adjustments";
const SOURCE = "mmd_owner_model_payout_adjustment_v1";
const ALLOWED_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);
const TYPES = new Set([
  "travel",
  "overtime",
  "parking_toll",
  "waiting",
  "bonus",
  "reimbursement",
  "correction",
  "other",
]);
const DIRECTIONS = new Set(["add", "deduct"]);

export const MODEL_PAYOUT_ADJUSTMENTS_PATH = PATH;

export function isModelPayoutAdjustmentRequest(path, method = "GET") {
  return normalizePath(path) === PATH && ["GET", "POST"].includes(String(method || "").toUpperCase());
}

export async function handleModelPayoutAdjustments(request, env = {}, actor = null) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (normalizePath(url.pathname) !== PATH) return json({ ok: false, error: "not_found" }, 404);
  if (!["GET", "POST"].includes(method)) return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!ALLOWED_HOSTS.has(url.hostname)) return json({ ok: false, error: "host_not_allowed" }, 403);

  const role = clean(actor?.role).toLowerCase();
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (!["owner", "admin"].includes(role)) return json({ ok: false, error: "forbidden" }, 403);

  if (method === "POST") {
    const origin = clean(request.headers.get("origin"));
    if (origin !== url.origin) return json({ ok: false, error: "forbidden_origin" }, 403);
  }

  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY)) {
    return json({ ok: false, error: "airtable_not_ready" }, 503);
  }

  if (method === "GET") return handleGet(url, env);
  return handlePost(request, env, actor);
}

async function handleGet(url, env) {
  const sessionId = clean(url.searchParams.get("session_id"), 180);
  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);

  const session = await findCanonicalSession(env, sessionId);
  if (!session.ok) return json({ ok: false, error: session.error }, session.status);

  const adjustments = await listAdjustments(env, sessionId);
  if (!adjustments.ok) return json({ ok: false, error: "adjustment_lookup_unavailable" }, 503);

  return json({
    ok: true,
    session: safeSessionProjection(session.record),
    adjustments: adjustments.records
      .map(safeAdjustmentProjection)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    policy: {
      customer_amount_affected: false,
      payment_verification_affected: false,
      current_total_field: "Sessions.pay_model_thb",
      immutable_ledger: true,
      correction_method: "add_opposite_adjustment",
    },
  }, 200);
}

async function handlePost(request, env, actor) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const sessionId = clean(body.session_id, 180);
  const direction = clean(body.direction).toLowerCase() || "add";
  const adjustmentType = clean(body.adjustment_type).toLowerCase();
  const amount = money(body.amount_thb);
  const note = clean(body.note, 1000);
  const callerKey = clean(body.idempotency_key, 180);

  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);
  if (!DIRECTIONS.has(direction)) return json({ ok: false, error: "direction_invalid" }, 400);
  if (!TYPES.has(adjustmentType)) return json({ ok: false, error: "adjustment_type_invalid" }, 400);
  if (amount === null || amount <= 0 || amount > 1000000) {
    return json({ ok: false, error: "amount_thb_invalid" }, 400);
  }
  if (adjustmentType === "other" && !note) {
    return json({ ok: false, error: "note_required_for_other" }, 400);
  }

  const idempotencyKey = callerKey || `mpa_${crypto.randomUUID().replace(/-/g, "")}`;

  const existing = await findAdjustmentByIdempotency(env, idempotencyKey);
  if (!existing.ok) return json({ ok: false, error: "adjustment_lookup_unavailable" }, 503);
  if (existing.record) {
    const projected = safeAdjustmentProjection(existing.record);
    if (projected.session_id !== sessionId) {
      return json({ ok: false, error: "idempotency_key_conflict" }, 409);
    }
    const session = await findCanonicalSession(env, sessionId);
    return json({
      ok: true,
      replayed: true,
      adjustment: projected,
      session: session.ok ? safeSessionProjection(session.record) : null,
    }, 200);
  }

  const session = await findCanonicalSession(env, sessionId);
  if (!session.ok) return json({ ok: false, error: session.error }, session.status);

  const fields = session.record.fields || {};
  const current = money(fields.pay_model_thb);
  if (current === null) return json({ ok: false, error: "model_payout_missing" }, 409);

  const modelIds = linkedRecordIds(fields["Canonical Model"]);
  if (modelIds.length !== 1) {
    return json({ ok: false, error: "canonical_model_link_required" }, 409);
  }

  const signed = direction === "deduct" ? -amount : amount;
  const next = current + signed;
  if (!Number.isInteger(next) || next < 0 || next > 100000000) {
    return json({ ok: false, error: "resulting_payout_invalid" }, 409);
  }

  const now = new Date().toISOString();
  const adjustmentId = `mpa_${crypto.randomUUID().replace(/-/g, "")}`;
  const recordFields = {
    adjustment_id: adjustmentId,
    Session: [session.record.id],
    Model: modelIds,
    session_id: sessionId,
    model_name: clean(fields.model_name || fields["Assigned Model"], 180),
    direction,
    adjustment_type: adjustmentType,
    amount_thb: amount,
    payout_before_thb: current,
    payout_after_thb: next,
    note,
    created_by: clean(actor?.id || actor?.email || actor?.role || "admin", 180),
    created_at: now,
    source: SOURCE,
    idempotency_key: idempotencyKey,
  };

  const created = await createAdjustment(env, recordFields);
  if (!created.ok) return json({ ok: false, error: "adjustment_create_failed" }, created.status || 503);

  const patched = await patchSessionPayout(env, session.record.id, next);
  if (!patched.ok || money(patched.record?.fields?.pay_model_thb) !== next) {
    const cleanup = await deleteAdjustment(env, created.record.id);
    return json({
      ok: false,
      error: cleanup.ok ? "session_payout_update_failed" : "adjustment_rollback_required",
      adjustment_id: adjustmentId,
    }, 503);
  }

  return json({
    ok: true,
    replayed: false,
    adjustment: safeAdjustmentProjection(created.record),
    session: safeSessionProjection(patched.record),
    policy: {
      customer_amount_affected: false,
      payment_verification_affected: false,
    },
  }, 201);
}

async function findCanonicalSession(env, sessionId) {
  const table = sessionsTable(env);
  const result = await airtableList(env, table, {
    maxRecords: 2,
    filterByFormula: `{session_id}="${escapeFormula(sessionId)}"`,
  });
  if (!result.ok) return { ok: false, status: 503, error: "session_lookup_unavailable" };
  if (result.records.length === 0) return { ok: false, status: 404, error: "session_not_found" };
  if (result.records.length > 1) return { ok: false, status: 409, error: "session_identity_conflict" };
  return { ok: true, status: 200, record: result.records[0] };
}

async function listAdjustments(env, sessionId) {
  return airtableList(env, adjustmentsTable(env), {
    maxRecords: 100,
    filterByFormula: `{session_id}="${escapeFormula(sessionId)}"`,
  });
}

async function findAdjustmentByIdempotency(env, key) {
  const result = await airtableList(env, adjustmentsTable(env), {
    maxRecords: 2,
    filterByFormula: `{idempotency_key}="${escapeFormula(key)}"`,
  });
  if (!result.ok) return result;
  if (result.records.length > 1) return { ok: false, status: 409, records: [] };
  return { ok: true, status: 200, record: result.records[0] || null, records: result.records };
}

async function createAdjustment(env, fields) {
  return airtableWrite(env, adjustmentsTable(env), "", {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

async function deleteAdjustment(env, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const url = `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(adjustmentsTable(env))}/${encodeURIComponent(recordId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  return { ok: response.ok, status: response.status };
}

async function patchSessionPayout(env, recordId, amount) {
  return airtableWrite(env, sessionsTable(env), `/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { pay_model_thb: amount }, typecast: false }),
  });
}

async function airtableList(env, table, { maxRecords = 10, filterByFormula = "" } = {}) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("pageSize", String(Math.min(100, maxRecords)));
  if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, records: [] };
  return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
}

async function airtableWrite(env, table, suffix, init) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const url = `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}${suffix}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: response.status, record: data };
}

function safeSessionProjection(record) {
  const fields = record?.fields || {};
  return {
    session_id: clean(fields.session_id, 180),
    model_name: clean(fields.model_name || fields["Assigned Model"], 180),
    model_record_id: linkedRecordIds(fields["Canonical Model"])[0] || "",
    current_payout_thb: money(fields.pay_model_thb),
  };
}

function safeAdjustmentProjection(record) {
  const fields = record?.fields || {};
  return {
    adjustment_id: clean(fields.adjustment_id, 180),
    session_id: clean(fields.session_id, 180),
    model_name: clean(fields.model_name, 180),
    direction: clean(selectName(fields.direction)).toLowerCase(),
    adjustment_type: clean(selectName(fields.adjustment_type)).toLowerCase(),
    amount_thb: money(fields.amount_thb),
    signed_amount_thb: signedMoney(fields.signed_amount_thb, fields.direction, fields.amount_thb),
    payout_before_thb: money(fields.payout_before_thb),
    payout_after_thb: money(fields.payout_after_thb),
    note: clean(fields.note, 1000),
    created_by: clean(fields.created_by, 180),
    created_at: clean(fields.created_at, 180),
  };
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(typeof item === "string" ? item : item?.id))
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
}

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value.name || "";
  return value;
}

function signedMoney(value, direction, amount) {
  const direct = Number(value);
  if (Number.isInteger(direct)) return direct;
  const base = money(amount);
  if (base === null) return null;
  return clean(selectName(direction)).toLowerCase() === "deduct" ? -base : base;
}

function money(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100000000 ? number : null;
}

function sessionsTable(env) {
  return clean(env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE);
}

function adjustmentsTable(env) {
  return clean(env.AIRTABLE_TABLE_MODEL_PAYOUT_ADJUSTMENTS || DEFAULT_ADJUSTMENTS_TABLE);
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizePath(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/g, "") : normalized || "/";
}

function clean(value, max = 1000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
    },
  });
}

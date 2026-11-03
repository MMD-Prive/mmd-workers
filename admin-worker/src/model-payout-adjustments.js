import { payoutOperationHash, readPayoutOperation, withPayoutOperation } from "./model-payout-operation.js";

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

  try {
    if (method === "GET") return await handleGet(url, env);
    return await handlePost(request, env, actor);
  } catch {
    return json({ ok: false, error: "payout_upstream_unavailable", retryable: false }, 503);
  }
}

async function handleGet(url, env) {
  const sessionId = clean(url.searchParams.get("session_id"), 180);
  const audit = await readModelPayoutAdjustmentAudit(env, sessionId);
  return json(audit.body, audit.status);
}

export async function readModelPayoutAdjustmentAudit(env, sessionIdInput) {
  const sessionId = clean(sessionIdInput, 180);
  if (!sessionId) return { status: 400, body: { ok: false, error: "session_id_required" } };
  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY)) {
    return { status: 503, body: { ok: false, error: "airtable_not_ready" } };
  }

  const session = await findCanonicalSession(env, sessionId);
  if (!session.ok) return { status: session.status, body: { ok: false, error: session.error } };
  const adjustments = await listAdjustments(env, sessionId);
  if (!adjustments.ok) return { status: 503, body: { ok: false, error: "adjustment_lookup_unavailable" } };

  const projected = adjustments.records.map(safeAdjustmentProjection)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const sessionProjection = safeSessionProjection(session.record);
  const integrity = reconcileAdjustmentChain(sessionProjection.current_payout_thb, projected);
  const operation = await readPayoutOperation(env.LINE_SLIP_EVIDENCE, sessionId);
  if (operation.review_required) {
    integrity.ok = false; integrity.needs_reconciliation = true;
    integrity.issues.push({ code: "model_payout_operation_unresolved", severity: "high" });
    integrity.issue_count = integrity.issues.length;
  }

  return {
    status: 200,
    body: {
      ok: true,
      session: sessionProjection,
      adjustments: projected.slice().reverse(),
      integrity,
      operation,
      policy: {
        customer_amount_affected: false,
        payment_verification_affected: false,
        current_total_field: "Sessions.pay_model_thb",
        immutable_ledger: true,
        correction_method: "add_opposite_adjustment",
      },
    },
  };
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

  if (typeof body.idempotency_key !== "string" || !callerKey || body.idempotency_key.trim().length > 180) return json({ ok: false, error: "idempotency_key_required" }, 400);
  const idempotencyKey = callerKey;
  const identity = await payoutOperationHash([sessionId, direction, adjustmentType, amount, note]);
  return withPayoutOperation(env.LINE_SLIP_EVIDENCE, sessionId, callerKey, identity, async (operation) => {

    const existing = await findAdjustmentByIdempotency(env, idempotencyKey);
    if (!existing.ok) return json({ ok: false, error: "adjustment_lookup_unavailable" }, 503);
    if (existing.record) {
      const projected = safeAdjustmentProjection(existing.record);
      const f = existing.record.fields || {};
      if (f.source !== SOURCE || f.idempotency_key !== idempotencyKey || projected.session_id !== sessionId || projected.direction !== direction || projected.adjustment_type !== adjustmentType || projected.amount_thb !== amount || projected.note !== note) {
        return json({ ok: false, error: "idempotency_key_conflict" }, 409);
      }
      // A historical ledger row alone does not prove that its Session PATCH committed.
      if (!operation.completed) return json({ ok: false, error: "payout_legacy_outcome_unproven", review_required: true }, 409);
      const session = await findCanonicalSession(env, sessionId);
      if (!session.ok) return json({ ok: false, error: session.error }, session.status);
      if (linkedRecordIds(session.record.fields?.["Canonical Model"]).length !== 1 || JSON.stringify(linkedRecordIds(f.Session)) !== JSON.stringify([session.record.id]) || JSON.stringify(linkedRecordIds(f.Model)) !== JSON.stringify(linkedRecordIds(session.record.fields?.["Canonical Model"]))) return json({ ok: false, error: "payout_identity_conflict" }, 409);
      const history = await listAdjustments(env, sessionId);
      if (!history.ok) return json({ok:false,error:"adjustment_lookup_unavailable"},503);
      const rows=history.records.map(safeAdjustmentProjection).sort((a,b)=>a.created_at.localeCompare(b.created_at));
      if (!reconcileAdjustmentChain(money(session.record.fields?.pay_model_thb), rows).ok) return json({ok:false,error:"payout_reconciliation_required",review_required:true},409);
      return json({ok:true,replayed:true,adjustment:projected,session:safeSessionProjection(session.record)},200);
    }
    if (operation.completed) return json({ ok: false, error: "payout_ledger_missing", review_required: true }, 409);

    const session = await findCanonicalSession(env, sessionId);
    if (!session.ok) return json({ ok: false, error: session.error }, session.status);

    const evidence = await adjustmentEvidenceGuard(env, sessionId, session.record.fields);
    if (evidence) return evidence;

    const fields = session.record.fields || {};
    const current = money(fields.pay_model_thb);
    if (current === null) return json({ ok: false, error: "model_payout_missing" }, 409);

    const modelIds = linkedRecordIds(fields["Canonical Model"]);
    if (modelIds.length !== 1) {
      return json({ ok: false, error: "canonical_model_link_required" }, 409);
    }

    const history = await listAdjustments(env, sessionId);
    if (!history.ok) return json({ ok: false, error: "adjustment_lookup_unavailable" }, 503);
    const chain = history.records.map(safeAdjustmentProjection).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    if (!reconcileAdjustmentChain(current,chain).ok) return json({ ok: false, error: "payout_reconciliation_required", review_required: true }, 409);

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

    await operation.stage("creating_ledger");
    const created = await createAdjustment(env, recordFields);
    if (!created.ok || !created.record?.id || Object.entries(recordFields).some(([key,value]) => !sameWrittenValue(created.record.fields?.[key], value))) return json({ ok: false, error: "adjustment_create_unconfirmed" }, 503);
    // Recheck before writing: catches an external edit observed after our ledger intent.
    const beforePatch = await findCanonicalSession(env, sessionId);
    if (!beforePatch.ok || beforePatch.record.id !== session.record.id || money(beforePatch.record.fields?.pay_model_thb) !== current || JSON.stringify(linkedRecordIds(beforePatch.record.fields?.["Canonical Model"])) !== JSON.stringify(modelIds)) return json({ ok:false,error:"payout_revision_conflict" },503);
    const evidenceBeforePatch = await adjustmentEvidenceGuard(env, sessionId, beforePatch.record.fields);
    if (evidenceBeforePatch) return evidenceBeforePatch;
    await operation.stage("patching_session");

    const patched = await patchSessionPayout(env, session.record.id, next);
    if (!patched.ok || patched.record?.id !== session.record.id || money(patched.record?.fields?.pay_model_thb) !== next) return json({ ok:false,error:"session_payout_update_unconfirmed" },503);
    const readback = await findCanonicalSession(env, sessionId);
    const ledger = await findAdjustmentByIdempotency(env, idempotencyKey);
    if (!readback.ok || readback.record.id !== session.record.id || money(readback.record.fields?.pay_model_thb) !== next || JSON.stringify(linkedRecordIds(readback.record.fields?.["Canonical Model"])) !== JSON.stringify(modelIds) || !ledger.ok || ledger.record?.id !== created.record.id || Object.entries(recordFields).some(([key,value]) => !sameWrittenValue(ledger.record.fields?.[key], value))) return json({ok:false,error:"payout_readback_unconfirmed"},503);

    return json({
      ok: true,
      replayed: false,
      adjustment: safeAdjustmentProjection(created.record),
      session: safeSessionProjection(readback.record),
      policy: {
        customer_amount_affected: false,
        payment_verification_affected: false,
      },
    }, 201);
  });
}

function sameWrittenValue(actual, expected) {
  // Airtable omits empty text fields from its record response.
  return expected === "" && actual === undefined || JSON.stringify(actual) === JSON.stringify(expected);
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
  if (result.records[0].fields.session_id !== sessionId) return { ok: false, status: 409, error: "session_identity_conflict" };
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
  if (!response.ok || !Array.isArray(data.records) || data.offset || (maxRecords === 100 && data.records.length >= 100) || data.records.some(record => !record?.id || !record.fields || typeof record.fields !== "object")) return { ok: false, status: 503, records: [] };
  return { ok: true, status: 200, records: data.records };
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

function reconcileAdjustmentChain(currentPayout, adjustments) {
  const issues = [];
  const rows = Array.isArray(adjustments) ? adjustments : [];
  const number = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  let expected = rows.length ? number(rows[0]?.payout_before_thb) : number(currentPayout);
  const startingPayout = expected;

  rows.forEach((row, index) => {
    const before = number(row?.payout_before_thb);
    const after = number(row?.payout_after_thb);
    const signed = number(row?.signed_amount_thb);
    if (before === null || after === null || signed === null) {
      issues.push({ code: "model_payout_adjustment_incomplete", severity: "high", adjustment_id: row?.adjustment_id || "", index });
      return;
    }
    if (expected !== null && before !== expected) {
      issues.push({ code: "model_payout_chain_break", severity: "high", adjustment_id: row?.adjustment_id || "", expected_before_thb: expected, actual_before_thb: before, index });
    }
    const calculated = before + signed;
    if (after !== calculated) {
      issues.push({ code: "model_payout_adjustment_math_mismatch", severity: "high", adjustment_id: row?.adjustment_id || "", expected_after_thb: calculated, actual_after_thb: after, index });
    }
    expected = after;
  });

  const current = number(currentPayout);
  if (current === null) {
    issues.push({ code: "model_payout_missing", severity: "high" });
  } else if (rows.length && expected !== current) {
    issues.push({ code: "model_payout_current_total_mismatch", severity: "high", expected_current_thb: expected, actual_current_thb: current });
  }

  return {
    ok: issues.length === 0,
    needs_reconciliation: issues.length > 0,
    starting_payout_thb: startingPayout,
    adjustment_net_thb: rows.reduce((sum, row) => sum + (number(row?.signed_amount_thb) || 0), 0),
    expected_current_payout_thb: rows.length ? expected : current,
    actual_current_payout_thb: current,
    issue_count: issues.length,
    issues,
  };
}

function safeSessionProjection(record) {
  const fields = record?.fields || {};
  return {
    session_id: clean(fields.session_id, 180),
    model_name: clean(fields.model_name || fields["Assigned Model"], 180),
    model_record_id: linkedRecordIds(fields["Canonical Model"])[0] || "",
    current_payout_thb: money(fields.pay_model_thb),
    created_at: clean(fields.created_at || fields["Created At"] || record?.createdTime, 180),
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
  const direct = !["number", "string"].includes(typeof value) || value === "" ? null : Number(value);
  if (direct !== null && Number.isSafeInteger(direct)) return direct;
  const base = money(amount);
  if (base === null) return null;
  return clean(selectName(direction)).toLowerCase() === "deduct" ? -base : base;
}

function money(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  if (!["number", "string"].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 100000000 ? number : null;
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

// Payout Evidence is a transfer snapshot, not another adjustable total. Do not
// rewrite paid evidence or silently invalidate a pending transfer instruction.
async function adjustmentEvidenceGuard(env, sessionId, sessionFields) {
  const u=new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/tblMvsl7qYozD05e5`);
  u.searchParams.set("returnFieldsByFieldId","true");
  u.searchParams.set("filterByFormula",`AND({fldwmqaIq9QubX9Uy}="${escapeFormula(sessionId)}",{fldgITP2xFiS2YHCG}="session_payout")`);
  u.searchParams.set("maxRecords","2");
  const r=await fetch(u,{headers:{authorization:`Bearer ${env.AIRTABLE_API_KEY}`}});
  const p=await r.json().catch(()=>null);
  if(!r.ok||!Array.isArray(p?.records)||p.offset||p.records.some(x=>!x?.id||!x.fields||x.fields.fldwmqaIq9QubX9Uy!==sessionId||x.fields.fldgITP2xFiS2YHCG!=="session_payout"))return json({ok:false,error:"payout_evidence_unavailable"},503);
  const state=clean(sessionFields?.model_session_state||sessionFields?.fld57fhdWqIcOy4Jp).toLowerCase();
  if(p.records.length>1)return json({ok:false,error:"payout_evidence_ambiguous",review_required:true},409);
  const raw=p.records[0]?.fields?.fldy2TgwO7Ayp6uhh;
  const status=clean(raw?.name||raw).toLowerCase();
  if(["payout_pending","closed"].includes(state)||p.records.length&&status!=="payout_under_review")return json({ok:false,error:"payout_evidence_requires_review",review_required:true},409);
  return null;
}

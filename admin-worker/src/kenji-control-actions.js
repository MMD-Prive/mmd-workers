const BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const TABLES = Object.freeze({
  actions: "tblUzZ8ImRZOkks4c",
  controls: "tblfyuNIB4BWThHSf",
  drafts: "tbljnfx8ewOt2mUWc",
  runtime: "tblPRUGp6AxWMM5gQ",
  modelReviews: "tblJ52hVu0f4uhEmS",
});

export const KENJI_CONTROL_ACTION_PATHS = Object.freeze({
  approval: "/v1/admin/kenji/control/approvals/",
  takeover: "/v1/admin/kenji/control/conversations/",
  draft: "/v1/admin/kenji/control/messages/draft",
  send: "/v1/admin/kenji/control/messages/",
  killSwitch: "/v1/admin/kenji/control/runtime/kill-switch",
});

export function isKenjiControlActionRequest(path, method = "POST") {
  return method === "POST" && (
    path.startsWith(KENJI_CONTROL_ACTION_PATHS.approval) && path.endsWith("/decision") ||
    path.startsWith(KENJI_CONTROL_ACTION_PATHS.takeover) && path.endsWith("/takeover") ||
    path === KENJI_CONTROL_ACTION_PATHS.draft ||
    path.startsWith(KENJI_CONTROL_ACTION_PATHS.send) && path.endsWith("/send") ||
    path === KENJI_CONTROL_ACTION_PATHS.killSwitch
  );
}

export async function handleKenjiControlAction(request, env, actor = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (!isKenjiControlActionRequest(path, request.method.toUpperCase())) return json({ ok: false, error: "not_found" }, 404);

  const idempotencyKey = clean(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey || idempotencyKey.length > 200) return json({ ok: false, error: "invalid_request", detail: "idempotency_key_required" }, 400);

  const identity = {
    id: clean(actor.id || "unknown"),
    role: clean(actor.role || "unknown").toLowerCase(),
  };
  if (identity.role === "unknown") return json({ ok: false, error: "insufficient_role" }, 403);

  try {
    const duplicate = await findActionByIdempotency(env, idempotencyKey);
    if (duplicate) return json({ ok: true, duplicate: true, action: projectAction(duplicate) });

    if (path.startsWith(KENJI_CONTROL_ACTION_PATHS.approval)) {
      if (!can(identity, "approval_decision")) return json({ ok: false, error: "insufficient_role" }, 403);
      return await approvalDecision(request, env, actor, idempotencyKey, path);
    }
    if (path.startsWith(KENJI_CONTROL_ACTION_PATHS.takeover)) {
      if (!can(identity, "conversation_takeover")) return json({ ok: false, error: "insufficient_role" }, 403);
      return await conversationTakeover(request, env, actor, idempotencyKey, path);
    }
    if (path === KENJI_CONTROL_ACTION_PATHS.draft) {
      if (!can(identity, "message_draft")) return json({ ok: false, error: "insufficient_role" }, 403);
      return await createMessageDraft(request, env, actor, idempotencyKey);
    }
    if (path.startsWith(KENJI_CONTROL_ACTION_PATHS.send)) {
      if (!can(identity, "message_send")) return json({ ok: false, error: "insufficient_role" }, 403);
      return json({ ok: false, error: "mutation_not_ready", detail: "delivery_adapter_not_connected" }, 503);
    }
    if (!can(identity, "kill_switch")) return json({ ok: false, error: "insufficient_role" }, 403);
    return await updateKillSwitch(request, env, actor, idempotencyKey);
  } catch (error) {
    const code = clean(error && error.message);
    if (code === "invalid_request") return json({ ok: false, error: code }, 400);
    if (code === "version_conflict") return json({ ok: false, error: code }, 409);
    if (code === "not_found") return json({ ok: false, error: code }, 404);
    if (code === "transition_not_allowed" || code === "unsafe_customer_copy") return json({ ok: false, error: code }, 422);
    if (code === "kill_switch_active") return json({ ok: false, error: code }, 423);
    return json({ ok: false, error: "mutation_unavailable" }, 503);
  }
}

async function approvalDecision(request, env, actor, idem, path) {
  const recordId = segment(path, KENJI_CONTROL_ACTION_PATHS.approval, "/decision");
  const body = await bodyJson(request);
  const decision = clean(body.decision).toLowerCase();
  const expected = requiredVersion(body.expected_version);
  const reason = requiredReason(body.reason);
  if (!["approve", "reject", "request_changes", "escalate"].includes(decision)) throw new Error("invalid_request");
  const record = await airtableGet(env, TABLES.modelReviews, recordId);
  if (!record) throw new Error("not_found");
  const fields = record.fields || {};
  const actual = numberValue(fields.version, 1);
  if (actual !== expected) throw new Error("version_conflict");
  const nextStatus = { approve: "approved", reject: "rejected", request_changes: "changes_requested", escalate: "escalated" }[decision];
  const audit = await createActionAudit(env, { idem, operation: "approval_decision", target: recordId, actor, expected, actual, result: "accepted", reason, summary: nextStatus });
  try {
    await airtableUpdate(env, TABLES.modelReviews, recordId, { request_status: nextStatus, decision_note: reason, version: actual + 1 });
    await completeAudit(env, audit.id, { actual_version: actual + 1, result: "accepted", summary: nextStatus });
  } catch (error) {
    await completeAudit(env, audit.id, { result: "failed", summary: "source_update_failed" });
    throw error;
  }
  return json({ ok: true, operation: "approval_decision", record_id: recordId, decision, status: nextStatus, version: actual + 1, audit_id: audit.action_id });
}

async function conversationTakeover(request, env, actor, idem, path) {
  const conversationId = segment(path, KENJI_CONTROL_ACTION_PATHS.takeover, "/takeover");
  const body = await bodyJson(request);
  const action = clean(body.action).toLowerCase();
  const expected = requiredVersion(body.expected_version);
  const reason = requiredReason(body.reason);
  if (!["claim", "release", "pause_kenji", "resume_kenji"].includes(action)) throw new Error("invalid_request");
  const latest = await latestByField(env, TABLES.controls, "conversation_id", conversationId, "version");
  const actual = numberValue(latest && latest.fields && latest.fields.version, 0);
  if (actual !== expected) throw new Error("version_conflict");
  if (action === "resume_kenji" && !reason) throw new Error("invalid_request");
  const next = { claim: "active", release: "released", pause_kenji: "paused", resume_kenji: "resumed" }[action];
  const controlId = "kctrl_" + crypto.randomUUID();
  const audit = await createActionAudit(env, { idem, operation: "conversation_takeover", target: conversationId, actor, expected, actual, result: "accepted", reason, summary: action });
  try {
    await airtableCreate(env, TABLES.controls, { control_id: controlId, conversation_id: conversationId, action, control_status: next, owner: clean(body.owner || actor.id), reason, version: actual + 1, actor_id: actor.id, actor_role: actor.role, updated_at: new Date().toISOString() });
    await completeAudit(env, audit.id, { actual_version: actual + 1, result: "accepted", summary: action });
  } catch (error) {
    await completeAudit(env, audit.id, { result: "failed", summary: "control_write_failed" });
    throw error;
  }
  return json({ ok: true, operation: "conversation_takeover", conversation_id: conversationId, action, version: actual + 1, audit_id: audit.action_id });
}

async function createMessageDraft(request, env, actor, idem) {
  const body = await bodyJson(request);
  const conversationId = clean(body.conversation_id);
  const channel = clean(body.channel).toLowerCase();
  const reply = clean(body.reply);
  const reason = requiredReason(body.reason);
  if (!conversationId || !["line_oa", "telegram", "web"].includes(channel) || !reply || reply.length > 4000) throw new Error("invalid_request");
  if (unsafeCopy(reply)) throw new Error("unsafe_customer_copy");
  const draftId = "draft_" + crypto.randomUUID();
  const version = 1;
  const hash = await sha256(reply);
  const audit = await createActionAudit(env, { idem, operation: "message_draft", target: draftId, actor, expected: 0, actual: 0, result: "accepted", reason, summary: "draft_created" });
  try {
    await airtableCreate(env, TABLES.drafts, { draft_id: draftId, conversation_id: conversationId, channel, reply, draft_status: "draft", reason, version, actor_id: actor.id, actor_role: actor.role, payload_hash: hash, created_at: new Date().toISOString(), sent_at: "" });
    await completeAudit(env, audit.id, { actual_version: version, result: "accepted", summary: "draft_created" });
  } catch (error) {
    await completeAudit(env, audit.id, { result: "failed", summary: "draft_write_failed" });
    throw error;
  }
  return json({ ok: true, operation: "message_draft", draft_id: draftId, status: "draft", version, audit_id: audit.action_id });
}

async function updateKillSwitch(request, env, actor, idem) {
  const body = await bodyJson(request);
  const scope = clean(body.scope).toLowerCase();
  const enabled = body.enabled === true;
  const expected = requiredVersion(body.expected_version);
  const reason = requiredReason(body.reason);
  if (!["line_oa_auto_reply", "model_keyword_auto_reply", "all_kenji_mutations"].includes(scope)) throw new Error("invalid_request");
  const latest = await latestByField(env, TABLES.runtime, "scope", scope, "version");
  const actual = numberValue(latest && latest.fields && latest.fields.version, 0);
  if (actual !== expected) throw new Error("version_conflict");
  const controlId = "runtime_" + scope;
  const audit = await createActionAudit(env, { idem, operation: "kill_switch", target: scope, actor, expected, actual, result: "accepted", reason, summary: enabled ? "enabled" : "disabled" });
  try {
    await airtableCreate(env, TABLES.runtime, { control_id: controlId + "_" + (actual + 1), scope, enabled_state: enabled ? "enabled" : "disabled", reason, version: actual + 1, actor_id: actor.id, actor_role: actor.role, updated_at: new Date().toISOString() });
    await completeAudit(env, audit.id, { actual_version: actual + 1, result: "accepted", summary: enabled ? "enabled" : "disabled" });
  } catch (error) {
    await completeAudit(env, audit.id, { result: "failed", summary: "runtime_write_failed" });
    throw error;
  }
  return json({ ok: true, operation: "kill_switch", scope, enabled, version: actual + 1, audit_id: audit.action_id });
}

async function createActionAudit(env, input) {
  const actionId = "audit_" + crypto.randomUUID();
  const fields = { action_id: actionId, idempotency_key: input.idem, operation: input.operation, target_id: input.target, actor_id: input.actor.id, actor_role: input.actor.role, expected_version: input.expected, actual_version: input.actual, result: input.result, reason: input.reason, redacted_summary: input.summary, payload_hash: "", request_id: "req_" + crypto.randomUUID(), created_at: new Date().toISOString() };
  return { action_id: actionId, id: (await airtableCreate(env, TABLES.actions, fields)).id };
}

async function completeAudit(env, recordId, patch) {
  await airtableUpdate(env, TABLES.actions, recordId, patch);
}

async function findActionByIdempotency(env, idem) {
  const rows = await airtableList(env, TABLES.actions, "idempotency_key", idem, 1, ["action_id", "operation", "target_id", "actor_id", "actor_role", "expected_version", "actual_version", "result", "redacted_summary", "created_at"]);
  return rows[0] || null;
}

function projectAction(record) {
  const f = record.fields || {};
  return { action_id: f.action_id || record.id, operation: f.operation || null, target_id: f.target_id || null, result: f.result || null, created_at: f.created_at || null };
}

async function airtableGet(env, table, recordId) {
  const config = airtableConfig(env);
  const response = await fetch("https://api.airtable.com/v0/" + config.base + "/" + table + "/" + recordId, { headers: { Authorization: "Bearer " + config.token } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

async function airtableList(env, table, field, value, limit, fields = []) {
  const query = new URLSearchParams({ pageSize: String(limit), maxRecords: String(limit), filterByFormula: "{" + field + "}=\"" + escapeFormula(value) + "\"" });
  for (const name of fields) query.append("fields[]", name);
  const config = airtableConfig(env);
  const response = await fetch("https://api.airtable.com/v0/" + config.base + "/" + table + "?" + query.toString(), { headers: { Authorization: "Bearer " + config.token } });
  if (!response.ok) throw new Error("airtable_" + response.status);
  const data = await response.json();
  return Array.isArray(data.records) ? data.records.slice(0, limit) : [];
}

async function latestByField(env, table, field, value, sortField) {
  const rows = await airtableList(env, table, field, value, 1, [field, "version", "updated_at"]);
  if (!rows.length) return null;
  return rows[0];
}

async function airtableCreate(env, table, fields) {
  const config = airtableConfig(env);
  const response = await fetch("https://api.airtable.com/v0/" + config.base + "/" + table, { method: "POST", headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

async function airtableUpdate(env, table, recordId, fields) {
  const config = airtableConfig(env);
  const response = await fetch("https://api.airtable.com/v0/" + config.base + "/" + table + "/" + recordId, { method: "PATCH", headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

function airtableConfig(env) {
  const base = clean(env.AIRTABLE_BASE_ID || BASE_ID_DEFAULT);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!base || !token) throw new Error("airtable_config_missing");
  return { base, token };
}

async function bodyJson(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
    return value;
  } catch (error) {
    if (error.message === "invalid_request") throw error;
    throw new Error("invalid_request");
  }
}

function requiredVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) throw new Error("invalid_request");
  return version;
}

function requiredReason(value) {
  const reason = clean(value);
  if (!reason || reason.length > 1000) throw new Error("invalid_request");
  return reason;
}

function unsafeCopy(value) {
  return /(password|bearer|authorization|api[_ -]?key|secret|bank account|พร้อมเพย์|รับประกัน|การันตี|guarantee)/i.test(value);
}

function can(actor, operation) {
  if (actor.role === "owner") return true;
  if (actor.role === "delegate") return operation !== "kill_switch";
  if (actor.role === "reviewer") return ["approval_decision", "message_draft"].includes(operation);
  if (actor.role === "service") return ["approval_decision", "message_draft"].includes(operation);
  return false;
}

function segment(path, prefix, suffix) {
  const value = path.slice(prefix.length, -suffix.length);
  const decoded = decodeURIComponent(value);
  if (!decoded || decoded.includes("/")) throw new Error("invalid_request");
  return decoded;
}

function escapeFormula(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function numberValue(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sha256(value) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((bytes) => {
    let hex = "";
    for (const byte of new Uint8Array(bytes)) hex += byte.toString(16).padStart(2, "0");
    return hex;
  });
}

function clean(value) { return String(value ?? "").trim(); }
function normalizePath(value) { const path = String(value || "/").replace(/\\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\\/+$/g, "") : path; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8" } }); }

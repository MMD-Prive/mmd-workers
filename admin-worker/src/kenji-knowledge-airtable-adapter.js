import {
  KNOWLEDGE_ACTION,
  KnowledgeContractError,
  executeKnowledgeCommand,
} from "./kenji-knowledge-publish-contract.js";

const API = "https://api.airtable.com/v0";
const DEFAULT_BASE = "appsV1ILPRfIjkaYg";
const DEFAULT_TABLE = "tblsLd1uVOtG2kHoU";
const PATH = /^\/v1\/admin\/kenji\/knowledge\/([A-Za-z0-9][A-Za-z0-9_-]{2,79})\/(review|qa|publish|audit)$/;
const FIELD = Object.freeze({
  id: "knowledge_id",
  title: "title",
  category: "category",
  language: "language",
  answer: "customer_answer",
  audience: "allowed_audience",
  risk: "risk_level",
  status: "status",
  effective: "effective_from",
  sourcePath: "source_path",
  sourceRef: "source_ref",
  owner: "owner",
  reviewedBy: "reviewed_by",
  reviewNote: "review_note",
  payload: "payload_json",
  stage: "workflow_stage",
  version: "workflow_version",
  commandId: "last_command_id",
  updatedAt: "workflow_updated_at",
});

export function isKenjiKnowledgeWorkflowRequest(path, method = "GET") {
  const match = normalizePath(path).match(PATH);
  if (!match) return false;
  const verb = clean(method).toUpperCase();
  if (verb === "OPTIONS" || verb === "HEAD") return true;
  return match[2] === "audit" ? verb === "GET" : verb === "POST";
}

export async function handleKenjiKnowledgeWorkflowRequest(request, env = {}, options = {}) {
  if (!env.KENJI_KNOWLEDGE_COORDINATOR) {
    return json({ ok: false, error: "knowledge_coordinator_not_configured" }, 503);
  }
  const actor = trustedActor(options.actor);
  if (!actor) return json({ ok: false, error: "trusted_actor_required" }, 401);
  const headers = new Headers(request.headers);
  headers.set("X-MMD-Trusted-Actor-Id", actor.id);
  headers.set("X-MMD-Trusted-Actor-Role", actor.role);
  const stub = env.KENJI_KNOWLEDGE_COORDINATOR.getByName("kenji-knowledge-global-v1");
  return stub.fetch(new Request(request, { headers }));
}

export class KenjiKnowledgeCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.tail = Promise.resolve();
  }

  async fetch(request) {
    const prior = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      return await this.handle(request);
    } finally {
      release();
    }
  }

  async handle(request) {
    const match = normalizePath(new URL(request.url).pathname).match(PATH);
    if (!match) return json({ ok: false, error: "not_found" }, 404);
    const knowledgeId = match[1];
    const routeAction = match[2];
    const method = request.method.toUpperCase();
    if (method === "HEAD") return json(null);
    if ((routeAction === "audit" && method !== "GET") ||
        (routeAction !== "audit" && method !== "POST")) {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const actor = trustedActor({
      id: request.headers.get("X-MMD-Trusted-Actor-Id"),
      role: request.headers.get("X-MMD-Trusted-Actor-Role"),
    });
    if (!actor) return json({ ok: false, error: "trusted_actor_required" }, 401);
    if (!this.env.AIRTABLE_API_KEY) {
      return json({ ok: false, error: "airtable_storage_not_configured" }, 503);
    }

    const loaded = await loadRecord(this.env, knowledgeId);
    if (!loaded) return json({ ok: false, error: "knowledge_not_found", knowledge_id: knowledgeId }, 404);
    const current = toContractRecord(loaded);

    if (routeAction === "audit") {
      return json({
        ok: true,
        knowledge_id: knowledgeId,
        stage: current.stage,
        version: current.version,
        events: current.audit_log,
        count: current.audit_log.length,
      });
    }

    const parsed = await parseJson(request);
    if (!parsed.ok) return json({ ok: false, error: "invalid_json" }, 400);
    const commandId = clean(request.headers.get("Idempotency-Key"));
    if (commandId.length < 8 || commandId.length > 160) {
      return json({ ok: false, error: "idempotency_key_required" }, 428);
    }
    if (clean(loaded.fields?.[FIELD.commandId]) === commandId) {
      return json({
        ok: true,
        idempotent_replay: true,
        knowledge_id: knowledgeId,
        stage: current.stage,
        version: current.version,
        event: last(current.audit_log),
      });
    }

    const action = {
      review: KNOWLEDGE_ACTION.SUBMIT_REVIEW,
      qa: KNOWLEDGE_ACTION.RECORD_QA,
      publish: KNOWLEDGE_ACTION.PUBLISH,
    }[routeAction];

    let result;
    try {
      result = executeKnowledgeCommand(
        current,
        { action, qa: parsed.data.qa },
        {
          actor,
          expectedVersion: Number(parsed.data.expected_version),
          now: new Date().toISOString(),
        },
      );
    } catch (error) {
      if (error instanceof KnowledgeContractError) {
        return json({ ok: false, error: error.code, details: error.details }, error.status);
      }
      throw error;
    }

    const oldPayload = parsePayload(loaded.fields?.[FIELD.payload]);
    const oldWorkflow = object(oldPayload.workflow);
    const nextPayload = {
      ...oldPayload,
      workflow: {
        ...oldWorkflow,
        stage: result.record.stage,
        version: result.record.version,
        qa_snapshot: result.record.qa_snapshot || null,
        audit_log: result.record.audit_log,
        updated_at: result.record.updated_at,
        updated_by: result.record.updated_by,
        published_at: result.record.published_at || oldWorkflow.published_at || null,
        published_by: result.record.published_by || oldWorkflow.published_by || null,
      },
    };
    const fields = {
      [FIELD.status]: legacyStatus(result.record.stage),
      [FIELD.stage]: result.record.stage,
      [FIELD.version]: result.record.version,
      [FIELD.commandId]: commandId,
      [FIELD.updatedAt]: result.record.updated_at,
      [FIELD.reviewedBy]: actor.id,
      [FIELD.reviewNote]: reviewNote(routeAction, result),
      [FIELD.payload]: JSON.stringify(nextPayload),
    };
    if (result.record.stage === "published") {
      fields[FIELD.effective] = result.record.published_at.slice(0, 10);
    }

    const saved = await patchRecord(this.env, loaded.id, fields);
    const savedRecord = toContractRecord(saved);
    return json({
      ok: result.ok,
      transitioned: result.transitioned,
      knowledge_id: knowledgeId,
      stage: savedRecord.stage,
      version: savedRecord.version,
      event: result.event,
      qa: result.qa || result.event?.qa || null,
    }, result.ok ? 200 : 422);
  }
}

async function loadRecord(env, knowledgeId) {
  const params = new URLSearchParams({
    maxRecords: "2",
    pageSize: "2",
    filterByFormula: "{knowledge_id} = '" + escapeFormula(knowledgeId) + "'",
  });
  const url = API + "/" + baseId(env) + "/" + encodeURIComponent(tableId(env)) + "?" + params;
  const response = await fetch(url, { headers: headers(env) });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(data?.error?.message || "airtable_read_" + response.status);
  const records = Array.isArray(data.records) ? data.records : [];
  if (records.length > 1) throw new Error("duplicate_knowledge_id");
  return records[0] || null;
}

async function patchRecord(env, recordId, fields) {
  const url = API + "/" + baseId(env) + "/" + encodeURIComponent(tableId(env));
  const response = await fetch(url, {
    method: "PATCH",
    headers: headers(env),
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: true }),
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(data?.error?.message || "airtable_patch_" + response.status);
  const record = Array.isArray(data.records) ? data.records[0] : null;
  if (!record) throw new Error("airtable_patch_missing_record");
  return record;
}

function toContractRecord(record = {}) {
  const fields = object(record.fields);
  const workflow = object(parsePayload(fields[FIELD.payload]).workflow);
  return {
    knowledge_id: clean(fields[FIELD.id]),
    title: clean(fields[FIELD.title]),
    category: clean(fields[FIELD.category]),
    language: clean(fields[FIELD.language]),
    approved_answer: clean(fields[FIELD.answer]),
    allowed_audience: arrayValue(fields[FIELD.audience]),
    source: clean(fields[FIELD.sourceRef] || fields[FIELD.sourcePath]),
    owner: clean(fields[FIELD.owner]),
    risk_level: clean(fields[FIELD.risk]),
    stage: clean(fields[FIELD.stage]) || workflow.stage || stageFromLegacy(fields[FIELD.status]),
    version: positiveInteger(fields[FIELD.version] || workflow.version, 1),
    qa_snapshot: objectOrNull(workflow.qa_snapshot),
    audit_log: Array.isArray(workflow.audit_log) ? workflow.audit_log : [],
  };
}

function legacyStatus(stage) {
  return ({ draft: "draft", review: "pending_review", qa_passed: "approved",
    published: "active", archived: "archived" })[stage] || "draft";
}

function stageFromLegacy(value) {
  return ({ draft: "draft", pending_review: "review", approved: "qa_passed",
    active: "published", archived: "archived" })[clean(value).toLowerCase()] || "draft";
}

function reviewNote(action, result) {
  if (action === "qa" && !result.ok) return "QA failed; record remains in Review. See payload_json workflow audit.";
  if (action === "qa") return "QA passed for this exact workflow version.";
  if (action === "publish") return "Published through signed Worker contract after Review and QA.";
  return "Submitted for Review through signed Worker contract.";
}

function baseId(env) {
  return clean(env.AIRTABLE_KENJI_KNOWLEDGE_BASE_ID || env.AIRTABLE_BASE_ID || DEFAULT_BASE);
}
function tableId(env) {
  return clean(env.AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID || env.AIRTABLE_KNOWLEDGE_TABLE_ID || DEFAULT_TABLE);
}
function headers(env) {
  return { Authorization: "Bearer " + env.AIRTABLE_API_KEY, "Content-Type": "application/json" };
}
function trustedActor(input) {
  const source = object(input);
  const id = clean(source.id);
  const role = clean(source.role).toLowerCase();
  return id && role ? { id, role } : null;
}
async function parseJson(request) {
  try {
    const data = await request.json();
    return { ok: Boolean(data && typeof data === "object" && !Array.isArray(data)), data };
  } catch {
    return { ok: false, data: null };
  }
}
async function safeJson(response) {
  return response.json().catch(() => ({}));
}
function json(data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function parsePayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try { return object(JSON.parse(clean(value) || "{}")); } catch { return {}; }
}
function arrayValue(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item?.name || item)).filter(Boolean);
  return clean(value).split(",").map(clean).filter(Boolean);
}
function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function objectOrNull(value) {
  const output = object(value);
  return Object.keys(output).length ? output : null;
}
function last(items) {
  return Array.isArray(items) && items.length ? items[items.length - 1] : null;
}
function escapeFormula(value) {
  return clean(value).replace(/'/g, "\\'");
}
function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function clean(value) {
  return String(value ?? "").trim();
}

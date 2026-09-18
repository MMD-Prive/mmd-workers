const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const DEFAULT_REGISTRY_TABLE = "tbllGMkWNjdhuaTyh";
const DEFAULT_QA_TABLE = "tblnaZZ0SXTRTQRK4";
const DEFAULT_ACTIVITY_TABLE = "tblbUWRoFL6OI6QMJ";
const CACHE_PREFIX = "mmd:protocol:v1:published:";
const PROTOCOL_PATH = /^\/v1\/admin\/protocols(?:\/([a-z0-9][a-z0-9-]{1,79})(?:\/(draft|review|qa\/run|publish|audit))?)?\/?$/;
const COOKIE_NAME = "mmd_admin_gate_v1";

const REGISTRY = Object.freeze({
  key: "Protocol Key",
  title: "Title",
  domain: "Domain",
  status: "Status",
  draftVersion: "Draft Version",
  draftText: "Draft Text",
  publishedVersion: "Published Version",
  publishedText: "Published Text",
  changeSummary: "Change Summary",
  owner: "Owner",
  riskLevel: "Risk Level",
  effectiveFrom: "Effective From",
  publishedAt: "Published At",
  workflowUpdatedAt: "Workflow Updated At",
  lastRequestId: "Last Request ID",
  consumersJson: "Consumers JSON",
  sourceOfTruth: "Source of Truth",
  payloadJson: "Payload JSON",
});

const QA = Object.freeze({
  runId: "QA Run ID",
  protocol: "Protocol",
  key: "Protocol Key",
  draftVersion: "Draft Version",
  passed: "Passed",
  checksJson: "Checks JSON",
  resultSummary: "Result Summary",
  ranAt: "Ran At",
  ranBy: "Ran By",
  requestId: "Request ID",
});

const AUDIT = Object.freeze({
  action: "Action Performed",
  timestamp: "Timestamp",
  actor: "Performed By",
  entityType: "Entity Type",
  details: "Details",
  verification: "Verification Status",
  requestId: "request_id",
  eventType: "event_type",
  afterJson: "after_json",
  reasonCode: "reason_code",
  idempotencyKey: "idempotency_key",
  beforeJson: "before_json",
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders() });
    const match = path.match(PROTOCOL_PATH);
    if (!match) return json({ ok: false, error: "not_found" }, 404);

    if (isMutation(method) && !sameOriginMutation(request)) {
      return json({ ok: false, error: "forbidden_origin" }, 403);
    }

    const actor = await verifyOperator(request, env);
    if (!actor) return json({ ok: false, authenticated: false, error: "unauthorized" }, 401);

    if (isMutation(method)) {
      if (!env.PROTOCOL_COORDINATOR) {
        return json({ ok: false, error: "protocol_coordinator_not_configured" }, 503);
      }
      const headers = new Headers(request.headers);
      headers.set("X-MMD-Protocol-Trusted", "1");
      headers.set("X-MMD-Protocol-Actor-Id", actor.id);
      headers.set("X-MMD-Protocol-Actor-Role", actor.role);
      const stub = env.PROTOCOL_COORDINATOR.getByName("protocol-center-global-v1");
      return stub.fetch(new Request(request, { headers }));
    }

    return handleAuthorizedRequest(request, env, actor);
  },
};

export class ProtocolPublishCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.tail = Promise.resolve();
  }

  async fetch(request) {
    if (request.headers.get("X-MMD-Protocol-Trusted") !== "1") {
      return json({ ok: false, error: "trusted_actor_required" }, 401);
    }
    const actor = {
      id: clean(request.headers.get("X-MMD-Protocol-Actor-Id")) || "operator",
      role: clean(request.headers.get("X-MMD-Protocol-Actor-Role")) || "operator",
    };
    const prior = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      return await handleAuthorizedRequest(request, this.env, actor);
    } finally {
      release();
    }
  }
}

async function handleAuthorizedRequest(request, env, actor) {
  if (!env.AIRTABLE_API_KEY) return json({ ok: false, error: "airtable_not_configured" }, 503);
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();
  const match = path.match(PROTOCOL_PATH);
  if (!match) return json({ ok: false, error: "not_found" }, 404);
  const protocolKey = match[1] || "";
  const action = match[2] || "";

  if (!protocolKey) {
    if (method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    const records = await listProtocolRecords(env);
    return json({
      ok: true,
      authority: "airtable",
      source_of_truth: "Airtable canonical base",
      items: records.map(toSafeProtocol),
      count: records.length,
    });
  }

  if (!action) {
    if (method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    const record = await loadProtocol(env, protocolKey);
    if (!record) return json({ ok: false, error: "protocol_not_found", protocol_key: protocolKey }, 404);
    const qa = await latestQaForVersion(env, protocolKey, number(record.fields?.[REGISTRY.draftVersion]));
    return json({ ok: true, authority: "airtable", item: toSafeProtocol(record), qa: toSafeQa(qa) });
  }

  if (action === "audit") {
    if (method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    const events = await loadAudit(env, protocolKey);
    return json({ ok: true, protocol_key: protocolKey, events, count: events.length });
  }

  if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const requestId = clean(request.headers.get("Idempotency-Key"));
  if (requestId.length < 8 || requestId.length > 160) {
    return json({ ok: false, error: "idempotency_key_required" }, 428);
  }
  const parsed = await parseJson(request);
  if (!parsed.ok) return json({ ok: false, error: "invalid_json" }, 400);

  if (action === "draft") return writeDraft(env, protocolKey, parsed.data, actor, requestId);
  if (action === "review") return submitReview(env, protocolKey, parsed.data, actor, requestId);
  if (action === "qa/run") return runQa(env, protocolKey, parsed.data, actor, requestId);
  if (action === "publish") return publishProtocol(env, protocolKey, parsed.data, actor, requestId);
  return json({ ok: false, error: "not_found" }, 404);
}

async function writeDraft(env, protocolKey, body, actor, requestId) {
  const replay = await auditReplay(env, protocolKey, "protocol.draft", requestId);
  if (replay) return json({ ok: true, idempotent_replay: true, protocol_key: protocolKey, event: replay });

  const current = await loadProtocol(env, protocolKey);
  const now = new Date().toISOString();
  const draftText = clean(body.draft_text ?? body.text);
  if (!draftText || draftText.length > 100000) {
    return json({ ok: false, error: "invalid_draft_text" }, 400);
  }
  const currentDraft = number(current?.fields?.[REGISTRY.draftVersion]);
  const publishedVersion = number(current?.fields?.[REGISTRY.publishedVersion]);
  const nextDraftVersion = Math.max(currentDraft, publishedVersion) + 1;
  const fields = compactFields({
    [REGISTRY.key]: protocolKey,
    [REGISTRY.title]: clean(body.title) || clean(current?.fields?.[REGISTRY.title]) || protocolKey,
    [REGISTRY.domain]: clean(body.domain) || clean(current?.fields?.[REGISTRY.domain]) || protocolKey,
    [REGISTRY.status]: "Draft",
    [REGISTRY.draftVersion]: nextDraftVersion,
    [REGISTRY.draftText]: draftText,
    [REGISTRY.changeSummary]: clean(body.change_summary) || clean(current?.fields?.[REGISTRY.changeSummary]),
    [REGISTRY.owner]: clean(body.owner) || clean(current?.fields?.[REGISTRY.owner]) || actor.id,
    [REGISTRY.riskLevel]: clean(body.risk_level) || clean(current?.fields?.[REGISTRY.riskLevel]) || "High",
    [REGISTRY.consumersJson]: stringifyJson(body.consumers) || clean(current?.fields?.[REGISTRY.consumersJson]),
    [REGISTRY.sourceOfTruth]: "Airtable canonical base",
    [REGISTRY.workflowUpdatedAt]: now,
    [REGISTRY.lastRequestId]: requestId,
  });
  const saved = current
    ? await patchRecord(env, registryTable(env), current.id, fields)
    : await createRecord(env, registryTable(env), fields);
  const event = await appendAudit(env, {
    protocolKey,
    eventType: "protocol.draft",
    actor,
    requestId,
    before: current ? toSafeProtocol(current) : null,
    after: toSafeProtocol(saved),
    details: `Draft v${nextDraftVersion} saved`,
  });
  return json({ ok: true, protocol_key: protocolKey, item: toSafeProtocol(saved), event });
}

async function submitReview(env, protocolKey, body, actor, requestId) {
  const replay = await auditReplay(env, protocolKey, "protocol.review", requestId);
  if (replay) return json({ ok: true, idempotent_replay: true, protocol_key: protocolKey, event: replay });
  const current = await requireProtocol(env, protocolKey);
  if (current instanceof Response) return current;
  const expected = positiveInteger(body.expected_version);
  const draftVersion = number(current.fields?.[REGISTRY.draftVersion]);
  if (!expected || expected !== draftVersion) return versionConflict(draftVersion);
  if (clean(current.fields?.[REGISTRY.status]) !== "Draft") {
    return json({ ok: false, error: "draft_required", current_status: current.fields?.[REGISTRY.status] || null }, 409);
  }
  const now = new Date().toISOString();
  const saved = await patchRecord(env, registryTable(env), current.id, {
    [REGISTRY.status]: "In Review",
    [REGISTRY.workflowUpdatedAt]: now,
    [REGISTRY.lastRequestId]: requestId,
  });
  const event = await appendAudit(env, {
    protocolKey,
    eventType: "protocol.review",
    actor,
    requestId,
    before: toSafeProtocol(current),
    after: toSafeProtocol(saved),
    details: `Draft v${draftVersion} submitted for review`,
  });
  return json({ ok: true, protocol_key: protocolKey, item: toSafeProtocol(saved), event });
}

async function runQa(env, protocolKey, body, actor, requestId) {
  const replay = await qaReplay(env, requestId);
  if (replay) return json({ ok: true, idempotent_replay: true, protocol_key: protocolKey, qa: toSafeQa(replay) });
  const current = await requireProtocol(env, protocolKey);
  if (current instanceof Response) return current;
  const expected = positiveInteger(body.expected_version);
  const draftVersion = number(current.fields?.[REGISTRY.draftVersion]);
  if (!expected || expected !== draftVersion) return versionConflict(draftVersion);
  if (clean(current.fields?.[REGISTRY.status]) !== "In Review") {
    return json({ ok: false, error: "review_required", current_status: current.fields?.[REGISTRY.status] || null }, 409);
  }

  const checks = runQaChecks(current);
  const passed = checks.every((check) => check.passed);
  const now = new Date().toISOString();
  const qaRunId = `qa_${protocolKey}_${draftVersion}_${requestId}`.slice(0, 120);
  const qaRecord = await createRecord(env, qaTable(env), {
    [QA.runId]: qaRunId,
    [QA.protocol]: [current.id],
    [QA.key]: protocolKey,
    [QA.draftVersion]: draftVersion,
    [QA.passed]: passed,
    [QA.checksJson]: JSON.stringify(checks),
    [QA.resultSummary]: passed ? "All server QA checks passed." : checks.filter((c) => !c.passed).map((c) => c.name).join(", "),
    [QA.ranAt]: now,
    [QA.ranBy]: actor.id,
    [QA.requestId]: requestId,
  });
  const saved = await patchRecord(env, registryTable(env), current.id, {
    [REGISTRY.status]: passed ? "QA Passed" : "QA Failed",
    [REGISTRY.workflowUpdatedAt]: now,
    [REGISTRY.lastRequestId]: requestId,
  });
  const event = await appendAudit(env, {
    protocolKey,
    eventType: passed ? "protocol.qa_passed" : "protocol.qa_failed",
    actor,
    requestId,
    before: toSafeProtocol(current),
    after: toSafeProtocol(saved),
    details: passed ? `QA passed for draft v${draftVersion}` : `QA failed for draft v${draftVersion}`,
  });
  return json({ ok: passed, protocol_key: protocolKey, item: toSafeProtocol(saved), qa: toSafeQa(qaRecord), event }, passed ? 200 : 422);
}

async function publishProtocol(env, protocolKey, body, actor, requestId) {
  if (actor.role !== "owner") return json({ ok: false, error: "owner_required" }, 403);
  const replay = await auditReplay(env, protocolKey, "protocol.publish", requestId);
  if (replay) {
    const current = await loadProtocol(env, protocolKey);
    return json({ ok: true, idempotent_replay: true, protocol_key: protocolKey, item: current ? toSafeProtocol(current) : null, event: replay });
  }

  const current = await requireProtocol(env, protocolKey);
  if (current instanceof Response) return current;
  const expected = positiveInteger(body.expected_version);
  const draftVersion = number(current.fields?.[REGISTRY.draftVersion]);
  if (!expected || expected !== draftVersion) return versionConflict(draftVersion);
  if (clean(current.fields?.[REGISTRY.status]) !== "QA Passed") {
    return json({ ok: false, error: "qa_required", current_status: current.fields?.[REGISTRY.status] || null }, 409);
  }
  const qa = await latestQaForVersion(env, protocolKey, draftVersion);
  if (!qa || qa.fields?.[QA.passed] !== true) {
    return json({ ok: false, error: "qa_required", expected_version: draftVersion }, 409);
  }
  const draftText = clean(current.fields?.[REGISTRY.draftText]);
  if (!draftText) return json({ ok: false, error: "draft_text_missing" }, 409);
  const oldPublishedVersion = number(current.fields?.[REGISTRY.publishedVersion]);
  if (draftVersion <= oldPublishedVersion) {
    return json({ ok: false, error: "version_not_newer", published_version: oldPublishedVersion, draft_version: draftVersion }, 409);
  }

  const now = new Date().toISOString();
  const effectiveFrom = clean(body.effective_from) || clean(current.fields?.[REGISTRY.effectiveFrom]) || now;
  const changeSummary = clean(body.change_summary) || clean(current.fields?.[REGISTRY.changeSummary]);
  const before = toSafeProtocol(current);
  const publishFields = {
    [REGISTRY.status]: "Published",
    [REGISTRY.publishedVersion]: draftVersion,
    [REGISTRY.publishedText]: draftText,
    [REGISTRY.changeSummary]: changeSummary || null,
    [REGISTRY.effectiveFrom]: effectiveFrom,
    [REGISTRY.publishedAt]: now,
    [REGISTRY.workflowUpdatedAt]: now,
    [REGISTRY.lastRequestId]: requestId,
    [REGISTRY.sourceOfTruth]: "Airtable canonical base",
  };
  let saved;
  try {
    saved = await patchRecord(env, registryTable(env), current.id, publishFields);
  } catch (error) {
    return json({ ok: false, error: "airtable_write_failed", detail: operatorSafeError(error) }, 502);
  }

  let event;
  try {
    event = await appendAudit(env, {
      protocolKey,
      eventType: "protocol.publish",
      actor,
      requestId,
      before,
      after: toSafeProtocol(saved),
      details: `Published protocol v${draftVersion}`,
    });
  } catch (error) {
    const rollback = rollbackFields(current);
    try {
      await patchRecord(env, registryTable(env), current.id, rollback);
    } catch (rollbackError) {
      return json({
        ok: false,
        error: "audit_write_failed_reconciliation_required",
        detail: operatorSafeError(error),
        rollback_error: operatorSafeError(rollbackError),
        protocol_key: protocolKey,
      }, 500);
    }
    return json({ ok: false, error: "audit_write_failed", detail: operatorSafeError(error), rolled_back: true }, 502);
  }

  const snapshot = publishedSnapshot(saved);
  let cacheFresh = false;
  let cacheWarning = null;
  if (env.PROTOCOLS_KV?.put) {
    try {
      await env.PROTOCOLS_KV.put(`${CACHE_PREFIX}${protocolKey}`, JSON.stringify(snapshot));
      cacheFresh = true;
    } catch (error) {
      cacheWarning = "snapshot_cache_write_failed";
    }
  } else {
    cacheWarning = "snapshot_cache_not_configured";
  }

  return json({
    ok: true,
    protocol_key: protocolKey,
    authority: "airtable",
    source_of_truth: "Airtable canonical base",
    item: toSafeProtocol(saved),
    published: snapshot,
    event,
    cache: { fresh: cacheFresh, warning: cacheWarning },
  });
}

export function runQaChecks(record) {
  const fields = record?.fields || {};
  const text = clean(fields[REGISTRY.draftText]);
  const title = clean(fields[REGISTRY.title]);
  const domain = clean(fields[REGISTRY.domain]);
  const draftVersion = number(fields[REGISTRY.draftVersion]);
  const publishedVersion = number(fields[REGISTRY.publishedVersion]);
  return [
    { name: "review_stage", passed: clean(fields[REGISTRY.status]) === "In Review" },
    { name: "draft_text_present", passed: text.length >= 20 },
    { name: "title_present", passed: title.length >= 2 },
    { name: "domain_present", passed: domain.length >= 2 },
    { name: "version_is_newer", passed: draftVersion > publishedVersion },
  ];
}

export function publishedSnapshot(record) {
  const fields = record?.fields || {};
  return {
    protocol_key: clean(fields[REGISTRY.key]),
    title: clean(fields[REGISTRY.title]),
    domain: clean(fields[REGISTRY.domain]),
    version: number(fields[REGISTRY.publishedVersion]),
    text: clean(fields[REGISTRY.publishedText]),
    effective_from: fields[REGISTRY.effectiveFrom] || null,
    published_at: fields[REGISTRY.publishedAt] || null,
    owner: clean(fields[REGISTRY.owner]) || null,
    risk_level: clean(fields[REGISTRY.riskLevel]) || null,
    source_of_truth: "Airtable canonical base",
  };
}

async function verifyOperator(request, env) {
  if (!env.ADMIN_WORKER?.fetch) return null;
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.split(";").some((part) => part.trim().startsWith(`${COOKIE_NAME}=`))) return null;
  const authUrl = new URL("/v1/admin/auth/me", request.url);
  const headers = new Headers({ Accept: "application/json", Cookie: cookie });
  const origin = request.headers.get("Origin");
  if (origin) headers.set("Origin", origin);
  let response;
  try {
    response = await env.ADMIN_WORKER.fetch(new Request(authUrl.toString(), { method: "GET", headers }));
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const data = await safeJson(response);
  if (data?.authenticated === false || data?.ok === false) return null;
  return {
    id: clean(data?.actor_id || data?.actor?.id) || "boss-per",
    role: clean(data?.actor_role || data?.actor?.role) || "owner",
  };
}

async function requireProtocol(env, protocolKey) {
  const record = await loadProtocol(env, protocolKey);
  if (!record) return json({ ok: false, error: "protocol_not_found", protocol_key: protocolKey }, 404);
  return record;
}

async function listProtocolRecords(env) {
  const response = await airtableRequest(env, registryTable(env), "", { method: "GET" });
  return Array.isArray(response.records) ? response.records : [];
}

async function loadProtocol(env, protocolKey) {
  const formula = `{${REGISTRY.key}}='${escapeFormula(protocolKey)}'`;
  const query = `?maxRecords=2&pageSize=2&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableRequest(env, registryTable(env), query, { method: "GET" });
  const records = Array.isArray(data.records) ? data.records : [];
  if (records.length > 1) throw new Error("duplicate_protocol_key");
  return records[0] || null;
}

async function latestQaForVersion(env, protocolKey, version) {
  if (!version) return null;
  const formula = `AND({${QA.key}}='${escapeFormula(protocolKey)}',{${QA.draftVersion}}=${version},{${QA.passed}}=TRUE())`;
  const query = `?maxRecords=1&pageSize=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableRequest(env, qaTable(env), query, { method: "GET" });
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function qaReplay(env, requestId) {
  const formula = `{${QA.requestId}}='${escapeFormula(requestId)}'`;
  const query = `?maxRecords=1&pageSize=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableRequest(env, qaTable(env), query, { method: "GET" });
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function auditReplay(env, protocolKey, eventType, requestId) {
  const formula = `AND({${AUDIT.idempotencyKey}}='${escapeFormula(requestId)}',{${AUDIT.reasonCode}}='${escapeFormula(protocolKey)}',{${AUDIT.eventType}}='${escapeFormula(eventType)}')`;
  const query = `?maxRecords=1&pageSize=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableRequest(env, activityTable(env), query, { method: "GET" });
  const record = Array.isArray(data.records) ? data.records[0] || null : null;
  return record ? toSafeAudit(record) : null;
}

async function loadAudit(env, protocolKey) {
  const formula = `{${AUDIT.reasonCode}}='${escapeFormula(protocolKey)}'`;
  const query = `?pageSize=100&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableRequest(env, activityTable(env), query, { method: "GET" });
  return (Array.isArray(data.records) ? data.records : []).map(toSafeAudit).reverse();
}

async function appendAudit(env, { protocolKey, eventType, actor, requestId, before, after, details }) {
  const now = new Date().toISOString();
  const record = await createRecord(env, activityTable(env), {
    [AUDIT.action]: `${eventType}: ${protocolKey}`,
    [AUDIT.timestamp]: now.slice(0, 10),
    [AUDIT.actor]: actor.id,
    [AUDIT.entityType]: "Internal Note",
    [AUDIT.details]: details,
    [AUDIT.verification]: "Verified",
    [AUDIT.requestId]: requestId,
    [AUDIT.eventType]: eventType,
    [AUDIT.afterJson]: JSON.stringify(after ?? null),
    [AUDIT.reasonCode]: protocolKey,
    [AUDIT.idempotencyKey]: requestId,
    [AUDIT.beforeJson]: JSON.stringify(before ?? null),
  });
  return toSafeAudit(record);
}

async function createRecord(env, table, fields) {
  const data = await airtableRequest(env, table, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const record = Array.isArray(data.records) ? data.records[0] : null;
  if (!record) throw new Error("airtable_create_missing_record");
  return record;
}

async function patchRecord(env, table, recordId, fields) {
  const data = await airtableRequest(env, table, "", {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: true }),
  });
  const record = Array.isArray(data.records) ? data.records[0] : null;
  if (!record) throw new Error("airtable_patch_missing_record");
  return record;
}

async function airtableRequest(env, table, suffix, init) {
  const base = clean(env.AIRTABLE_BASE_ID) || DEFAULT_BASE_ID;
  const url = `${AIRTABLE_API}/${base}/${encodeURIComponent(table)}${suffix}`;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${env.AIRTABLE_API_KEY}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(data?.error?.message || data?.error?.type || `airtable_${response.status}`);
  return data || {};
}

function rollbackFields(record) {
  const fields = record?.fields || {};
  return {
    [REGISTRY.status]: fields[REGISTRY.status] || "QA Passed",
    [REGISTRY.publishedVersion]: fields[REGISTRY.publishedVersion] ?? 0,
    [REGISTRY.publishedText]: fields[REGISTRY.publishedText] ?? null,
    [REGISTRY.changeSummary]: fields[REGISTRY.changeSummary] ?? null,
    [REGISTRY.effectiveFrom]: fields[REGISTRY.effectiveFrom] ?? null,
    [REGISTRY.publishedAt]: fields[REGISTRY.publishedAt] ?? null,
    [REGISTRY.workflowUpdatedAt]: fields[REGISTRY.workflowUpdatedAt] ?? null,
    [REGISTRY.lastRequestId]: fields[REGISTRY.lastRequestId] ?? null,
  };
}

function toSafeProtocol(record) {
  const fields = record?.fields || {};
  return {
    record_id: record?.id || null,
    protocol_key: clean(fields[REGISTRY.key]),
    title: clean(fields[REGISTRY.title]),
    domain: clean(fields[REGISTRY.domain]),
    status: clean(fields[REGISTRY.status]) || "Draft",
    draft_version: number(fields[REGISTRY.draftVersion]),
    draft_text: clean(fields[REGISTRY.draftText]),
    published_version: number(fields[REGISTRY.publishedVersion]),
    published_text: clean(fields[REGISTRY.publishedText]),
    change_summary: clean(fields[REGISTRY.changeSummary]) || null,
    owner: clean(fields[REGISTRY.owner]) || null,
    risk_level: clean(fields[REGISTRY.riskLevel]) || null,
    effective_from: fields[REGISTRY.effectiveFrom] || null,
    published_at: fields[REGISTRY.publishedAt] || null,
    workflow_updated_at: fields[REGISTRY.workflowUpdatedAt] || null,
    consumers: parseJsonValue(fields[REGISTRY.consumersJson], []),
    source_of_truth: clean(fields[REGISTRY.sourceOfTruth]) || "Airtable canonical base",
    can_publish: clean(fields[REGISTRY.status]) === "QA Passed",
  };
}

function toSafeQa(record) {
  if (!record) return null;
  const fields = record.fields || {};
  return {
    qa_run_id: clean(fields[QA.runId]) || record.id,
    protocol_key: clean(fields[QA.key]),
    draft_version: number(fields[QA.draftVersion]),
    passed: fields[QA.passed] === true,
    checks: parseJsonValue(fields[QA.checksJson], []),
    result_summary: clean(fields[QA.resultSummary]) || null,
    ran_at: fields[QA.ranAt] || null,
    ran_by: clean(fields[QA.ranBy]) || null,
    request_id: clean(fields[QA.requestId]) || null,
  };
}

function toSafeAudit(record) {
  const fields = record?.fields || {};
  return {
    record_id: record?.id || null,
    event_type: clean(fields[AUDIT.eventType]),
    protocol_key: clean(fields[AUDIT.reasonCode]),
    action: clean(fields[AUDIT.action]),
    actor: clean(fields[AUDIT.actor]) || null,
    timestamp: fields[AUDIT.timestamp] || null,
    request_id: clean(fields[AUDIT.requestId]) || null,
    details: clean(fields[AUDIT.details]) || null,
    before: parseJsonValue(fields[AUDIT.beforeJson], null),
    after: parseJsonValue(fields[AUDIT.afterJson], null),
  };
}

function registryTable(env) { return clean(env.AIRTABLE_PROTOCOL_REGISTRY_ID) || DEFAULT_REGISTRY_TABLE; }
function qaTable(env) { return clean(env.AIRTABLE_PROTOCOL_QA_RUNS_ID) || DEFAULT_QA_TABLE; }
function activityTable(env) { return clean(env.AIRTABLE_ACTIVITY_LOGS_ID) || DEFAULT_ACTIVITY_TABLE; }

function versionConflict(currentVersion) {
  return json({ ok: false, error: "version_conflict", current_version: currentVersion }, 409);
}
function isMutation(method) { return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"; }
function sameOriginMutation(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
function positiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
function number(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}
function clean(value) { return String(value ?? "").trim(); }
function escapeFormula(value) { return clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function compactFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""));
}
function stringifyJson(value) {
  if (value === undefined || value === null) return "";
  try { return JSON.stringify(value); } catch { return ""; }
}
function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return fallback; }
}
async function parseJson(request) {
  try {
    const data = await request.json();
    return { ok: data && typeof data === "object" && !Array.isArray(data), data: data || {} };
  } catch {
    return { ok: false, data: null };
  }
}
async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}
function operatorSafeError(error) {
  const message = clean(error?.message || error);
  return message.slice(0, 240) || "unknown_error";
}
function responseHeaders() {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-MMD-Protocol-Authority": "airtable-canonical-v1",
  });
}
function json(data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), { status, headers: responseHeaders() });
}

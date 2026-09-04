const AIRTABLE_API = "https://api.airtable.com/v0";
const CREATE_JOB_PATH = "/v1/admin/job/create";

const DEFAULT_TABLES = Object.freeze({
  clients: "tblVv58TCbwh5j1fS",
  models: "tblI4B0bI446vp9GX",
  sessions: "tblC98mKWbzmPuNzX",
  jobs: "tbl0jxIjN8QYwGABX",
});

const SESSION_FIELDS = Object.freeze({
  client: "Client",
  model: "Canonical Model",
  clientSource: "Client Identity Source",
  modelProvenance: "Model Provenance",
  sessionId: "session_id",
  jobId: "job_id",
});

const JOB_FIELDS = Object.freeze({
  client: "Client (ลูกค้า)",
  model: "Canonical Model",
  modelName: "Model (โมเดล)",
  clientSource: "Client Identity Source",
  modelProvenance: "Model Provenance",
  sessionId: "session_id",
  jobId: "job_id",
  location: "Location (สถานที่)",
  dateTimeLocation: "Date / Time / Location",
  budget: "Budget",
  note: "Internal Notes",
});

export function isCanonicalLinkedJobCreate(path, method) {
  return method === "POST" && normalizePath(path) === CREATE_JOB_PATH;
}

export async function handleCanonicalLinkedJobCreate(request, env, ctx, downstream) {
  const body = await request.clone().json().catch(() => ({}));

  const clientId = clean(body?.client_lineage?.client_id || body?.client_record_id);
  const modelId = clean(body?.model?.model_id || body?.model_record_id);

  if (!isRecordId(clientId)) {
    return jsonLike(request, { ok: false, error: "canonical_client_record_required" }, 400);
  }
  if (!isRecordId(modelId)) {
    return jsonLike(request, { ok: false, error: "canonical_model_record_required" }, 400);
  }

  let canonical;
  try {
    canonical = await validateCanonicalSelection(env, body, { clientId, modelId });
  } catch (error) {
    return jsonLike(
      request,
      { ok: false, error: clean(error?.code || error?.message || "canonical_selection_invalid") },
      Number.isInteger(error?.status) ? error.status : 409,
    );
  }

  const response = await downstream.fetch(request, env, ctx);
  if (!response.ok) return response;

  let result;
  try {
    result = await response.clone().json();
  } catch {
    return response;
  }

  const sessionId = clean(result?.session_id || result?.sessionId || result?.session_ref);
  const jobId = clean(
    result?.job_id ||
    result?.jobId ||
    result?.raw?.job_id ||
    result?.raw?.jobId ||
    result?.raw?.data?.job_id,
  );

  if (!sessionId) {
    return mergeJsonResponse(response, {
      linkage: {
        status: "review_required",
        client_record_id: clientId,
        model_record_id: modelId,
        session_linked: false,
        job_linked: false,
        warning: "session_id_missing_from_create_response",
      },
    });
  }

  try {
    const linkage = await reconcileCanonicalLinks(env, body, canonical, {
      clientId,
      modelId,
      sessionId,
      jobId,
    });
    return mergeJsonResponse(response, { linkage });
  } catch (error) {
    return mergeJsonResponse(response, {
      linkage: {
        status: "review_required",
        client_record_id: clientId,
        model_record_id: modelId,
        session_id: sessionId,
        job_id: jobId || null,
        session_linked: false,
        job_linked: false,
        warning: clean(error?.code || error?.message || "canonical_link_reconciliation_failed"),
      },
    });
  }
}

async function validateCanonicalSelection(env, body, { clientId, modelId }) {
  requireAirtable(env);
  const tables = tablesFor(env);
  const [client, model] = await Promise.all([
    airtableGetRecord(env, tables.clients, clientId),
    airtableGetRecord(env, tables.models, modelId),
  ]);

  if (!client?.id) throw typedError(409, "canonical_client_not_found");
  if (!model?.id) throw typedError(409, "canonical_model_not_found");

  const requestedLineUserId = clean(body?.line_identity?.line_user_id || body?.client_lineage?.line_user_id);
  const canonicalLineUserId = clean(client?.fields?.line_user_id);
  if (requestedLineUserId && canonicalLineUserId && requestedLineUserId !== canonicalLineUserId) {
    throw typedError(409, "client_line_identity_mismatch");
  }

  const requestedModelName = normalizeName(body?.model_name || body?.model?.model_name);
  const canonicalModelName = normalizeName(
    model?.fields?.working_name || model?.fields?.display_name_compact || model?.fields?.nickname,
  );
  if (requestedModelName && canonicalModelName && requestedModelName !== canonicalModelName) {
    throw typedError(409, "canonical_model_name_mismatch");
  }

  const registryType = clean(model?.fields?.registry_record_type).toLowerCase();
  const intakeGate = clean(model?.fields?.intake_gate_status).toLowerCase();
  if (registryType.includes("synthetic") || registryType.includes("fixture") || registryType.includes("ghost")) {
    throw typedError(409, "canonical_model_fixture_blocked");
  }
  if (intakeGate === "quarantined") throw typedError(409, "canonical_model_quarantined");

  return { client, model };
}

async function reconcileCanonicalLinks(env, body, canonical, ids) {
  const tables = tablesFor(env);
  const clientSource = resolveClientSource(body, canonical.client);
  const modelProvenance = resolveModelProvenance(body, canonical.model);

  const session = await airtableFindOne(env, tables.sessions, SESSION_FIELDS.sessionId, ids.sessionId);
  if (!session?.id) throw typedError(502, "created_session_record_not_found");

  const sessionPatch = {
    [SESSION_FIELDS.client]: [ids.clientId],
    [SESSION_FIELDS.model]: [ids.modelId],
    [SESSION_FIELDS.clientSource]: clientSource,
    [SESSION_FIELDS.modelProvenance]: modelProvenance,
  };
  await airtablePatchRecord(env, tables.sessions, session.id, sessionPatch);

  const resolvedJobId = ids.jobId || clean(session?.fields?.[SESSION_FIELDS.jobId]);
  let job = null;
  if (resolvedJobId) job = await airtableFindOne(env, tables.jobs, JOB_FIELDS.jobId, resolvedJobId);
  if (!job?.id) job = await airtableFindOne(env, tables.jobs, JOB_FIELDS.sessionId, ids.sessionId);

  if (!job?.id) {
    job = await airtableCreateRecord(env, tables.jobs, buildJobFields(body, canonical, {
      ...ids,
      jobId: resolvedJobId || makeJobId(ids.sessionId),
      clientSource,
      modelProvenance,
    }));
  } else {
    await airtablePatchRecord(env, tables.jobs, job.id, {
      [JOB_FIELDS.client]: [ids.clientId],
      [JOB_FIELDS.model]: [ids.modelId],
      [JOB_FIELDS.clientSource]: clientSource,
      [JOB_FIELDS.modelProvenance]: modelProvenance,
    });
  }

  return {
    status: "linked",
    client_record_id: ids.clientId,
    model_record_id: ids.modelId,
    session_record_id: session.id,
    job_record_id: job?.id || null,
    session_id: ids.sessionId,
    job_id: clean(job?.fields?.[JOB_FIELDS.jobId] || resolvedJobId) || null,
    session_linked: true,
    job_linked: Boolean(job?.id),
    client_source: clientSource,
    model_provenance: modelProvenance,
  };
}

function buildJobFields(body, canonical, ids) {
  const details = body?.job_details || {};
  const payment = body?.payment || {};
  const modelName = clean(
    body?.model_name ||
    body?.model?.model_name ||
    canonical?.model?.fields?.working_name ||
    canonical?.model?.fields?.display_name_compact,
  );
  const date = clean(body?.job_date || details?.job_date);
  const start = clean(body?.start_time || details?.start_time);
  const end = clean(body?.end_time || details?.end_time);
  const location = clean(body?.location_name || details?.location_name);
  const amount = Number(body?.amount_thb || payment?.amount_thb || 0);

  const fields = {
    [JOB_FIELDS.client]: [ids.clientId],
    [JOB_FIELDS.model]: [ids.modelId],
    [JOB_FIELDS.modelName]: modelName,
    [JOB_FIELDS.clientSource]: ids.clientSource,
    [JOB_FIELDS.modelProvenance]: ids.modelProvenance,
    [JOB_FIELDS.sessionId]: ids.sessionId,
    [JOB_FIELDS.jobId]: ids.jobId,
    [JOB_FIELDS.location]: location,
    [JOB_FIELDS.dateTimeLocation]: [date, start && end ? `${start}-${end}` : start, location].filter(Boolean).join(" · "),
    [JOB_FIELDS.note]: "Created by canonical Create Session reconciliation. Client and Model linked by Airtable record ID.",
  };
  if (Number.isFinite(amount) && amount > 0) fields[JOB_FIELDS.budget] = amount;
  return compact(fields);
}

function resolveClientSource(body, client) {
  const source = clean(body?.client_lineage?.lineage_source || body?.client_lineage?.matched_on || client?.fields?.primary_channel || client?.fields?.source).toLowerCase();
  if (source.includes("line") || clean(body?.line_identity?.line_user_id || body?.client_lineage?.line_user_id)) {
    return "line_ofc_to_clients";
  }
  return "canonical_clients";
}

function resolveModelProvenance(body, model) {
  const explicit = clean(body?.model?.source).toLowerCase();
  const storage = clean(model?.fields?.storage_source_primary).toLowerCase();
  const migrated = model?.fields?.is_migrated_to_r2 === true;
  const r2Prefix = clean(model?.fields?.r2_prefix);
  if (explicit.includes("r2") || storage === "r2" || migrated || r2Prefix) return "r2_to_models_to_canonical";
  return "airtable_models";
}

async function airtableGetRecord(env, table, recordId) {
  const response = await airtableFetch(env, `/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, { method: "GET" });
  if (response.status === 404) return null;
  return parseAirtableResponse(response);
}

async function airtableFindOne(env, table, field, value) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{${field}}=${formulaString(value)}`);
  const response = await fetch(url, { headers: airtableHeaders(env) });
  const data = await parseAirtableResponse(response);
  return Array.isArray(data?.records) ? data.records[0] || null : null;
}

async function airtablePatchRecord(env, table, recordId, fields) {
  const response = await airtableFetch(env, `/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  return parseAirtableResponse(response);
}

async function airtableCreateRecord(env, table, fields) {
  const response = await airtableFetch(env, `/${encodeURIComponent(table)}`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  return parseAirtableResponse(response);
}

async function airtableFetch(env, suffix, init = {}) {
  requireAirtable(env);
  return fetch(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}${suffix}`, {
    ...init,
    headers: {
      ...airtableHeaders(env),
      ...(init.headers || {}),
    },
  });
}

function airtableHeaders(env) {
  return {
    Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
    "Content-Type": "application/json",
  };
}

async function parseAirtableResponse(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!response.ok) {
    const error = typedError(response.status, `airtable_${response.status}`);
    error.detail = data;
    throw error;
  }
  return data;
}

function tablesFor(env) {
  return {
    clients: clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || DEFAULT_TABLES.clients),
    models: clean(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || DEFAULT_TABLES.models),
    sessions: clean(env.AIRTABLE_TABLE_SESSIONS || DEFAULT_TABLES.sessions),
    jobs: clean(env.AIRTABLE_TABLE_JOBS || DEFAULT_TABLES.jobs),
  };
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw typedError(503, "airtable_not_configured");
}

function formulaString(value) {
  return `\"${clean(value).replace(/\\/g, "\\\\").replace(/\"/g, '\\"')}\"`;
}

function makeJobId(sessionId) {
  const tail = clean(sessionId).replace(/[^A-Za-z0-9]/g, "").slice(-10).toUpperCase() || "SESSION";
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `JOB-${tail}-${rand}`;
}

function normalizeName(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function isRecordId(value) {
  return /^rec[A-Za-z0-9]{14}$/.test(clean(value));
}

function compact(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function clean(value) {
  return String(value ?? "").trim();
}

function typedError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

function jsonLike(request, data, status = 200) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" });
  const origin = request.headers.get("Origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function mergeJsonResponse(response, additions) {
  const data = await response.clone().json().catch(() => ({}));
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, private");
  return new Response(JSON.stringify({ ...data, ...additions }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

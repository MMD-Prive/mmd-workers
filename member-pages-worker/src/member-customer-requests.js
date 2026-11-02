import { readMemberAppSession } from "./member-app-api-runtime.js";
import { resolveCanonicalClientForLine } from "./member-app-client-history.js";

const API = "https://api.airtable.com/v0";
const INBOX_TABLE = "MMD — Console Inbox";
const REQUEST_PATH = "/member/api/liff/customer-requests";
const EVIDENCE_PATH = "/member/api/liff/customer-request-evidence";
const ADMIN_PATH = "/__internal/admin/my-mmd/customer-requests";
const ADMIN_EVIDENCE_PATH = "/__internal/admin/my-mmd/customer-request-evidence";
const ADMIN_MUTATION_PATH = "/__internal/admin/my-mmd/customer-request-mutation";
const SERVICE_HOST = "member-pages-worker.internal";
const MAX_LIST = 50;
const MAX_EVIDENCE = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);
const BLOCKED_STATES = new Set(["blocked", "suspended", "revoked", "pending_review", "under_review"]);
const REQUEST_STATES = new Set(["received", "searching", "needs_more_info", "reviewing", "closed"]);
const MONTHLY_PERSON_LIMIT = 4;
const MONTH_TIME_ZONE = "Asia/Bangkok";
const CANONICAL_CLIENT_FIELD = "fld9gMhvFWegM345O";

export function isMemberCustomerRequestPath(input) {
  try {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname.replace(/\/+$/, "") || "/";
  return path === REQUEST_PATH || path === EVIDENCE_PATH || path === ADMIN_PATH || path === ADMIN_EVIDENCE_PATH || path === ADMIN_MUTATION_PATH;
  } catch { return false; }
}

export async function handleMemberCustomerRequest(request, env = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (path === ADMIN_MUTATION_PATH) return handleAdminMutationLease(request, env);
  if (path === ADMIN_PATH || path === ADMIN_EVIDENCE_PATH) return handleAdmin(request, env, path);
  if (!browserOriginAllowed(request)) return fail(403, "SAME_ORIGIN_REQUIRED");
  if (new URL(request.url).search) return fail(400, "BROWSER_AUTHORITY_REJECTED");
  const identity = await verifiedIdentity(request, env);
  if (!identity.ok) return fail(identity.status, identity.code);
  if (path === REQUEST_PATH) return handleRequest(request, env, identity);
  if (path === EVIDENCE_PATH) return handleEvidenceUpload(request, env, identity);
  return fail(404, "NOT_FOUND");
}

async function handleAdminMutationLease(request, env) {
  if (!internalAuthorized(request) || !env.CUSTOMER_REQUEST_MUTATION?.idFromName || !env.CUSTOMER_REQUEST_MUTATION?.get) return fail(404, "NOT_FOUND");
  const body = await request.json().catch(() => null); const recordId = safeText(body?.record_id, 40); const operationId = safeText(body?.operation_id, 100);
  if (!/^rec[A-Za-z0-9]{10,32}$/.test(recordId) || (body?.action !== "inspect" && !operationId) || !["begin", "prepare", "write_started", "resume", "item_started", "mark_item", "reconcile_item", "finish", "inspect", "reconcile"].includes(body?.action)) return fail(400, "INVALID_REQUEST");
  const id = env.CUSTOMER_REQUEST_MUTATION.idFromName(recordId);
  const response = await env.CUSTOMER_REQUEST_MUTATION.get(id).fetch("https://mutation/" + body.action, { method: "POST", body: JSON.stringify({ action: body.action, operation_id: operationId, status: body.status, mutation_fingerprint: body.mutation_fingerprint, readback_verified: body.readback_verified === true, item_key: safeText(body.item_key, 200) }) }).catch(() => null);
  if (!response) return fail(503, "REQUEST_MUTATION_UNAVAILABLE");
  return new Response(response.body, { status: response.status, headers: response.headers });
}

async function handleRequest(request, env, identity) {
  if (request.method === "GET" || request.method === "HEAD") {
    const raw = await listInbox(env, identity.lineUserId, identity.clientId); if (raw === null) return fail(503, "REQUEST_QUEUE_UNAVAILABLE");
    const owned = raw.filter(record => { const data = parsePayload(record?.fields?.payload_json); return data.line_user_id === identity.lineUserId || data.canonical_client_id === identity.clientId; });
    const response = json({ ok: true, authority: "mmd.customer_request_intake.v1", items: owned.map((record) => customerItem(parsePayload(record?.fields?.payload_json))).filter(Boolean).slice(0, MAX_LIST), quota: requestQuota(owned) });
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD, POST" });
  const body = await request.json().catch(() => null);
  if (body?.action === "append_evidence") return appendEvidenceToRequest(body, env, identity);
  const input = validateRequest(body);
  if (!input.ok) return fail(400, input.code);
  const rawPrior = await listInbox(env, identity.lineUserId, identity.clientId); if (rawPrior === null) return fail(503, "REQUEST_QUEUE_UNAVAILABLE");
  const ownedPrior = rawPrior.filter(record => { const data = parsePayload(record?.fields?.payload_json); return data.line_user_id === identity.lineUserId || data.canonical_client_id === identity.clientId; });
  const prior = rawPrior.map((record) => customerItem(parsePayload(record?.fields?.payload_json))).filter(Boolean);
  const duplicate = prior.find((item) => item.request_id === input.data.request_id);
  if (duplicate) {
    const existingPayload = parsePayload(rawPrior.find((record) => parsePayload(record?.fields?.payload_json)?.request_id === input.data.request_id)?.fields?.payload_json);
    if (requestFingerprint(existingPayload) !== requestFingerprint(input.data)) return fail(409, "REQUEST_ID_REUSE_CONFLICT");
    if (input.data.request_type === "your_request") await reconcileQuota(env, identity.clientId, monthKeyInBangkok(existingPayload.created_at), input.data.request_id, requestFingerprint(input.data), "committed");
    return json({ ok: true, item: duplicate, idempotent: true, quota: requestQuota(rawPrior) });
  }
  const quota = requestQuota(ownedPrior);
  if (input.data.request_type === "your_request" && quota.remaining <= 0) return fail(429, "YOUR_REQUEST_MONTHLY_LIMIT", { "retry-after": "3600" });
  const evidence = input.data.evidence_ids.length ? await validateEvidence(env, identity.clientId, input.data.evidence_ids) : [];
  if (evidence === null) return fail(409, "EVIDENCE_UNAVAILABLE");
  const reservation = input.data.request_type === "your_request" ? await reserveQuota(env, identity.clientId, quota.month_key, input.data.request_id, requestFingerprint(input.data), ownedPrior.map((record) => parsePayload(record?.fields?.payload_json)).filter((data) => data.request_type === "your_request" && data.archival !== true && data.quota_exempt !== true && monthKeyInBangkok(data.created_at) === quota.month_key).map((data) => data.request_id)) : { ok: true, reserved: false };
  if (!reservation.ok) return fail(reservation.status || 503, reservation.error || "REQUEST_QUEUE_UNAVAILABLE");
  if (input.data.request_type === "your_request" && !reservation.reserved) {
    if (reservation.result) return json({ ...reservation.result, idempotent: true }, 200);
    return fail(503, "REQUEST_RESULT_UNAVAILABLE");
  }
  const now = new Date().toISOString();
  const payload = {
    schema: "mmd_customer_request_v1",
    request_id: input.data.request_id,
    request_type: input.data.request_type,
    canonical_client_id: identity.clientId,
    line_user_id: identity.lineUserId,
    created_at: now,
    status: input.data.request_type === "your_request" ? "received" : "reviewing",
    customer: input.data.customer,
    model: input.data.model,
    evidence_ids: evidence.map((item) => item.evidence_id),
    visibility: "internal_only",
  };
  const created = await createInbox(env, {
    inbox_id: `customer_${input.data.request_id}`,
    source: "line",
    // Console Inbox's live intent select uses note_only; the customer-facing
    // request kind remains authoritative inside payload_json.request_type.
    intent: "note_only",
    member_name: safeText(identity.memberProfile?.display_name, 120),
    line_user_id: identity.lineUserId,
    [CANONICAL_CLIENT_FIELD]: [identity.clientId],
    line_id: input.data.request_id,
    admin_note: adminNote(payload),
    payload_json: JSON.stringify(payload),
    status: "new",
  });
  if (!created.ok) {
    if (reservation.reserved) await finalizeQuota(env, identity.clientId, quota.month_key, input.data.request_id, reservation.lease, created.uncertain ? "uncertain" : "release", requestFingerprint(input.data));
    return fail(503, created.uncertain ? "REQUEST_QUEUE_WRITE_UNCERTAIN" : "REQUEST_QUEUE_UNAVAILABLE");
  }
  const item = customerItem(payload);
  if (reservation.reserved) await finalizeQuota(env, identity.clientId, quota.month_key, input.data.request_id, reservation.lease, "commit", requestFingerprint(input.data), { ok: true, item, idempotent: false, quota: { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) } });
  return json({ ok: true, item, idempotent: false, quota: { ...quota, used: quota.used + (input.data.request_type === "your_request" ? 1 : 0), remaining: Math.max(0, quota.remaining - (input.data.request_type === "your_request" ? 1 : 0)) } }, 201);
}

async function appendEvidenceToRequest(body, env, identity) {
  const requestId = safeRequestId(body.request_id); const evidenceIds = unique(array(body.evidence_ids).map(safeEvidenceId).filter(Boolean));
  if (!requestId || !evidenceIds.length || evidenceIds.length > MAX_EVIDENCE) return fail(400, "EVIDENCE_INVALID");
  const records = await listInbox(env, identity.lineUserId, identity.clientId); if (records === null) return fail(503, "REQUEST_QUEUE_UNAVAILABLE");
  const record = records.find(row => parsePayload(row?.fields?.payload_json)?.request_id === requestId); if (!record) return fail(404, "REQUEST_NOT_FOUND");
  const mutation = await beginRequestMutation(env, record.id); if (!mutation.ok) return fail(mutation.status || 503, mutation.error || "REQUEST_MUTATION_UNAVAILABLE");
  let outcome = "aborted"; let mutationFingerprint = "";
  try {
    // Discovery above only chooses the record. This reread is authoritative and
    // happens after the durable per-record mutation lease is acquired.
    const lockedRecords = await listInbox(env, identity.lineUserId, identity.clientId); const lockedRecord = lockedRecords?.find(row => row.id === record.id); if (!lockedRecord) return fail(503, "REQUEST_QUEUE_UNAVAILABLE");
    const payload = parsePayload(lockedRecord.fields?.payload_json); if (payload.canonical_client_id !== identity.clientId) return fail(404, "REQUEST_NOT_FOUND");
    const checked = await validateEvidence(env, identity.clientId, evidenceIds); if (checked === null) return fail(409, "EVIDENCE_UNAVAILABLE");
    const before = unique(array(payload.evidence_ids).filter(safeEvidenceId));
    const next = unique([...before, ...checked.map(item => item.evidence_id)]);
    if (next.length > MAX_EVIDENCE) return fail(409, "EVIDENCE_LIMIT_REACHED");
    payload.evidence_ids = next; payload.updated_at = new Date().toISOString(); payload.last_mutation_id = mutation.operation_id;
    mutationFingerprint = await fullHash(stableStringify(payload, new Set(["last_mutation_id", "mutation_fingerprint"])));
    payload.mutation_fingerprint = mutationFingerprint;
    if (!await prepareRequestMutation(env, record.id, mutation.operation_id, mutationFingerprint)) return fail(409, "REQUEST_MUTATION_LEASE_LOST");
    if (!await markRequestMutationWriteStarted(env, record.id, mutation.operation_id, mutationFingerprint)) return fail(409, "REQUEST_MUTATION_LEASE_LOST");
    outcome = "uncertain";
    const updated = await updateInbox(env, record.id, { payload_json: JSON.stringify(payload), admin_note: adminNote(payload) });
    if (!updated) return fail(503, "REQUEST_QUEUE_WRITE_UNCERTAIN");
    outcome = "committed";
    return json({ ok: true, item: customerItem(payload), evidence_ids: next, idempotent: next.length === before.length });
  } catch (error) {
    // A thrown storage/list/R2 error may have happened after the write was sent;
    // keep the lease quarantined rather than allowing a blind retry.
    return fail(503, error?.code === "REQUEST_QUEUE_UNAVAILABLE" ? error.code : "REQUEST_QUEUE_WRITE_UNCERTAIN");
  } finally { await finishRequestMutation(env, record.id, mutation.operation_id, outcome, mutationFingerprint); }
}
async function beginRequestMutation(env, recordId) { if (!env.CUSTOMER_REQUEST_MUTATION?.idFromName || !env.CUSTOMER_REQUEST_MUTATION?.get) return { ok: false, status: 503, error: "REQUEST_MUTATION_UNAVAILABLE" }; const operation_id = crypto.randomUUID(); const id = env.CUSTOMER_REQUEST_MUTATION.idFromName(recordId); const response = await env.CUSTOMER_REQUEST_MUTATION.get(id).fetch("https://mutation/begin", { method: "POST", body: JSON.stringify({ action: "begin", operation_id }) }).catch(() => null); const body = await response?.json().catch(() => null); return response?.ok ? { ok: true, operation_id } : { ok: false, status: response?.status || 503, error: body?.error || "REQUEST_MUTATION_UNAVAILABLE" }; }
async function prepareRequestMutation(env, recordId, operation_id, mutation_fingerprint) { const id = env.CUSTOMER_REQUEST_MUTATION.idFromName(recordId); const response = await env.CUSTOMER_REQUEST_MUTATION.get(id).fetch("https://mutation/prepare", { method: "POST", body: JSON.stringify({ action: "prepare", operation_id, mutation_fingerprint }) }).catch(() => null); return response?.ok === true; }
async function markRequestMutationWriteStarted(env, recordId, operation_id, mutation_fingerprint) { const id = env.CUSTOMER_REQUEST_MUTATION.idFromName(recordId); const response = await env.CUSTOMER_REQUEST_MUTATION.get(id).fetch("https://mutation/write_started", { method: "POST", body: JSON.stringify({ action: "write_started", operation_id, mutation_fingerprint }) }).catch(() => null); return response?.ok === true; }
async function finishRequestMutation(env, recordId, operation_id, status = "committed", mutation_fingerprint = "") { const id = env.CUSTOMER_REQUEST_MUTATION.idFromName(recordId); await env.CUSTOMER_REQUEST_MUTATION.get(id).fetch("https://mutation/finish", { method: "POST", body: JSON.stringify({ action: "finish", operation_id, status, mutation_fingerprint }) }).catch(() => null); }

async function handleEvidenceUpload(request, env, identity) {
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", { allow: "POST" });
  if (!env.CUSTOMER_REQUEST_EVIDENCE?.put || !env.CUSTOMER_REQUEST_EVIDENCE?.get) return fail(503, "CUSTOMER_REQUEST_STORAGE_UNAVAILABLE");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file !== "object" || typeof file.stream !== "function" || !ALLOWED_MEDIA.has(file.type) || !file.size || file.size > MAX_FILE_BYTES) return fail(400, "EVIDENCE_FILE_INVALID");
  const evidenceId = `evidence_${crypto.randomUUID().replace(/-/g, "")}`;
  const clientHash = await hash(identity.clientId);
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `customer-requests/v1/${clientHash}/${evidenceId}.${extension}`;
  await env.CUSTOMER_REQUEST_EVIDENCE.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, contentDisposition: "inline" },
    customMetadata: { client_hash: clientHash, evidence_id: evidenceId, uploaded_at: new Date().toISOString() },
  });
  return json({ ok: true, evidence_id: evidenceId, status: "uploaded" }, 201);
}

async function handleAdmin(request, env, path) {
  if (!internalAuthorized(request)) return fail(404, "NOT_FOUND");
  const body = await request.json().catch(() => null);
  const lineUserId = lineId(body?.line_user_id);
  if (!lineUserId) return fail(400, "INVALID_REQUEST");
  if (path === ADMIN_PATH) { const items = await listRequests(env, lineUserId); return items === null ? fail(503, "REQUEST_QUEUE_UNAVAILABLE") : json({ ok: true, authority: "mmd.customer_request_intake.v1", items }); }
  const evidenceId = safeEvidenceId(body?.evidence_id);
  if (!evidenceId) return fail(400, "INVALID_REQUEST");
  const client = await resolveCanonicalClientForLine(env, lineUserId).catch(() => null);
  if (!client?.id) return fail(409, "CANONICAL_CLIENT_UNRESOLVED");
  const object = await evidenceObject(env, client.id, evidenceId);
  if (!object) return fail(404, "EVIDENCE_NOT_FOUND");
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, no-store", "x-mmd-customer-request-evidence": "v1" } });
}

async function verifiedIdentity(request, env) {
  const session = await readMemberAppSession(request, env);
  const lineUserId = lineId(session?.lineUserId);
  if (!lineUserId || session?.memberExists !== true || !session?.memberId) return { ok: false, status: 401, code: "VERIFIED_MEMBER_SESSION_REQUIRED" };
  if (BLOCKED_STATES.has(token(session.memberProfile?.membership_status))) return { ok: false, status: 403, code: "MEMBER_REVIEW_REQUIRED" };
  const client = await resolveCanonicalClientForLine(env, lineUserId).catch(() => null);
  if (!client?.id) return { ok: false, status: 409, code: "CANONICAL_CLIENT_UNRESOLVED" };
  return { ok: true, lineUserId, clientId: client.id, memberProfile: session.memberProfile || {} };
}

function validateRequest(body) {
  if (!plain(body)) return { ok: false, code: "REQUEST_BODY_INVALID" };
  const requestType = token(body.request_type);
  const requestId = safeRequestId(body.request_id);
  if (!requestId || !["your_request", "saved_model", "profile_update"].includes(requestType)) return { ok: false, code: "REQUEST_INVALID" };
  const evidenceIds = unique(array(body.evidence_ids).map(safeEvidenceId).filter(Boolean)).slice(0, MAX_EVIDENCE);
  if (array(body.evidence_ids).length !== evidenceIds.length) return { ok: false, code: "EVIDENCE_INVALID" };
  const customer = {
    email: safeEmail(body.email), phone: safePhone(body.phone), telegram_username: safeTelegram(body.telegram_username),
    preferences: safeText(body.preferences, 1200),
  };
  const model = {
    display_name: safeText(body.model_name, 120), social: safeSocial(body.model_social), reason: safeText(body.reason, 1800),
    audience: ["public", "private"].includes(token(body.audience)) ? token(body.audience) : "public", model_id: safeModelId(body.model_id), action: token(body.action),
  };
  if (requestType === "your_request" && (!model.display_name || !model.reason)) return { ok: false, code: "YOUR_REQUEST_DETAILS_REQUIRED" };
  if (requestType === "saved_model" && (!model.model_id || !["save", "remove"].includes(model.action))) return { ok: false, code: "SAVED_MODEL_INVALID" };
  if (requestType === "profile_update" && !Object.values(customer).some(Boolean)) return { ok: false, code: "PROFILE_UPDATE_EMPTY" };
  return { ok: true, data: { request_id: requestId, request_type: requestType, evidence_ids: evidenceIds, customer, model } };
}

async function listRequests(env, lineUserId) {
  const records = await listInbox(env, lineUserId);
  if (records === null) return null;
  return records.map((record) => customerItem(parsePayload(record?.fields?.payload_json))).filter(Boolean).slice(0, MAX_LIST);
}

function customerItem(data) {
  if (!plain(data) || data.schema !== "mmd_customer_request_v1" || !safeRequestId(data.request_id)) return null;
  const type = token(data.request_type);
  if (!["your_request", "saved_model", "profile_update"].includes(type)) return null;
  return {
    request_id: data.request_id, request_type: type, status: REQUEST_STATES.has(token(data.status)) ? token(data.status) : "reviewing",
    created_at: safeTimestamp(data.created_at), model_name: safeText(data.model?.display_name, 120) || null,
    audience: ["public", "private"].includes(token(data.model?.audience)) ? token(data.model.audience) : null,
    action: ["save", "remove"].includes(token(data.model?.action)) ? token(data.model.action) : null,
  };
}

function requestQuota(records) {
  const month = monthKeyInBangkok(new Date());
  const ids = new Set(records.map((record) => parsePayload(record?.fields?.payload_json)).filter((data) => data.schema === "mmd_customer_request_v1" && data.request_type === "your_request" && data.archival !== true && data.quota_exempt !== true && monthKeyInBangkok(data.created_at) === month).map((data) => data.request_id).filter(Boolean));
  return { month_key: month, limit: MONTHLY_PERSON_LIMIT, used: ids.size, remaining: Math.max(0, MONTHLY_PERSON_LIMIT - ids.size) };
}

function requestFingerprint(data) {
  // Evidence is append-only mutable state. The one-person idempotency key is
  // the request intent, never the current attachment set.
  return JSON.stringify({ request_type: data?.request_type || "", model: data?.model || {}, customer: data?.customer || {} });
}

async function reserveQuota(env, clientId, monthKey, requestId, fingerprint, observedRequestIds = []) {
  if (!env.CUSTOMER_REQUEST_QUOTA?.idFromName || !env.CUSTOMER_REQUEST_QUOTA?.get) return { ok: false, status: 503, error: "REQUEST_QUOTA_UNAVAILABLE" };
  const id = env.CUSTOMER_REQUEST_QUOTA.idFromName(`${clientId}:${monthKey}`);
  const response = await env.CUSTOMER_REQUEST_QUOTA.get(id).fetch("https://quota/reserve", { method: "POST", body: JSON.stringify({ action: "reserve", month_key: monthKey, request_id: requestId, fingerprint, observed_request_ids: observedRequestIds }) }).catch(() => null);
  if (!response) return { ok: false, status: 503, error: "REQUEST_QUOTA_UNAVAILABLE" };
  const payload = await response.json().catch(() => null);
  return response.ok ? { ok: true, reserved: payload?.idempotent !== true, lease: payload?.lease, result: payload?.result } : { ok: false, status: [409, 429, 503].includes(response.status) ? response.status : 503, error: payload?.error || "REQUEST_QUOTA_UNAVAILABLE" };
}

async function finalizeQuota(env, clientId, monthKey, requestId, lease, action, fingerprint = "", result = undefined) {
  if (!env.CUSTOMER_REQUEST_QUOTA?.idFromName || !env.CUSTOMER_REQUEST_QUOTA?.get) return;
  const id = env.CUSTOMER_REQUEST_QUOTA.idFromName(`${clientId}:${monthKey}`);
  await env.CUSTOMER_REQUEST_QUOTA.get(id).fetch(`https://quota/${action}`, { method: "POST", body: JSON.stringify({ action, month_key: monthKey, request_id: requestId, lease, fingerprint, result }) }).catch(() => null);
}
async function reconcileQuota(env, clientId, monthKey, requestId, fingerprint, status) {
  if (!env.CUSTOMER_REQUEST_QUOTA?.idFromName || !env.CUSTOMER_REQUEST_QUOTA?.get) return;
  const id = env.CUSTOMER_REQUEST_QUOTA.idFromName(`${clientId}:${monthKey}`);
  await env.CUSTOMER_REQUEST_QUOTA.get(id).fetch("https://quota/reconcile", { method: "POST", body: JSON.stringify({ action: "reconcile", month_key: monthKey, request_id: requestId, fingerprint, status }) }).catch(() => null);
}

async function validateEvidence(env, clientId, ids) {
  if (!env.CUSTOMER_REQUEST_EVIDENCE?.head) return null;
  const out = [];
  for (const evidenceId of ids) { const object = await evidenceObject(env, clientId, evidenceId); if (!object) return null; out.push({ evidence_id: evidenceId }); }
  return out;
}
async function evidenceObject(env, clientId, evidenceId) {
  if (!env.CUSTOMER_REQUEST_EVIDENCE?.get) return null;
  const prefix = `customer-requests/v1/${await hash(clientId)}/${evidenceId}.`;
  for (const ext of ["jpg", "png", "webp"]) { const object = await env.CUSTOMER_REQUEST_EVIDENCE.get(prefix + ext); if (object?.customMetadata?.evidence_id === evidenceId) return object; }
  return null;
}
async function listInbox(env, lineUserId, canonicalClientId = "") {
  const key = safeText(env.AIRTABLE_API_KEY, 2000); const base = safeText(env.AIRTABLE_BASE_ID, 100); const table = safeText(env.AIRTABLE_TABLE_CONSOLE_INBOX, 180) || INBOX_TABLE;
  if (!key || !base) return null;
  const records = []; let offset = "";
  for (let page = 0; page < 1000; page += 1) {
    const url = new URL(`${API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
    // Airtable linked fields render display values in formulas, not stable API
    // record IDs. For canonical aggregation, fetch the complete namespaced
    // result set and apply the verified payload ownership check locally.
    const namespaceFormula = `AND(OR({source}='my_mmd_liff',{source}='line'),OR({intent}='note_only',{intent}='your_request',{intent}='saved_model',{intent}='profile_update'))`;
    // Keep the current LINE in the formula so the existing connector/mock can
    // cheaply identify the owner; canonical-linked records are then included
    // by the complete namespaced read and verified payload filter below.
    url.searchParams.set("filterByFormula", canonicalClientId ? `AND(OR({line_user_id}=${formula(lineUserId)},${namespaceFormula}),${namespaceFormula})` : `AND({line_user_id}=${formula(lineUserId)},${namespaceFormula})`);
    url.searchParams.set("pageSize", "100"); if (offset) url.searchParams.set("offset", offset);
    const response = await airtableFetch(env, url, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
    const payload = await response.json().catch(() => null); if (!response.ok || !Array.isArray(payload?.records)) return null;
    records.push(...payload.records); offset = payload.offset || ""; if (!offset) break;
  }
  if (offset) return null;
  return canonicalClientId ? records.filter((record) => { const data = parsePayload(record?.fields?.payload_json); return data.line_user_id === lineUserId || data.canonical_client_id === canonicalClientId; }) : records;
}
async function createInbox(env, fields) {
  const key = safeText(env.AIRTABLE_API_KEY, 2000); const base = safeText(env.AIRTABLE_BASE_ID, 100); const table = safeText(env.AIRTABLE_TABLE_CONSOLE_INBOX, 180) || INBOX_TABLE;
  if (!key || !base) return { ok: false, uncertain: false };
  try {
    const response = await airtableFetch(env, `${API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ fields }) });
    return { ok: response.ok, uncertain: response.status >= 500 };
  } catch { return { ok: false, uncertain: true }; }
}
async function updateInbox(env, recordId, fields) {
  const key = safeText(env.AIRTABLE_API_KEY, 2000); const base = safeText(env.AIRTABLE_BASE_ID, 100); const table = safeText(env.AIRTABLE_TABLE_CONSOLE_INBOX, 180) || INBOX_TABLE;
  if (!key || !base || !/^rec[A-Za-z0-9]{10,32}$/.test(recordId || "")) return false;
  try { const response = await airtableFetch(env, `${API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, { method: "PATCH", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ fields }) }); return response.ok; } catch { return false; }
}
function internalAuthorized(request) { const url = new URL(request.url); return request.method === "POST" && url.hostname === SERVICE_HOST && token(request.headers.get("x-mmd-internal-call")) === "true" && safeText(request.headers.get("x-mmd-service-binding"), 80) === "admin-worker"; }
async function airtableFetch(env, url, init = {}) { return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(new Request(url, init)) : fetch(url, init); }
function browserOriginAllowed(request) {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || !["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)) return false;
  const origin = request.headers.get("origin");
  if (!origin && (request.method === "GET" || request.method === "HEAD")) return true;
  return origin === url.origin;
}
function json(data, status = 200, extra = {}) { return Response.json(data, { status, headers: { "cache-control": "no-store, private", "x-mmd-customer-request": "v1", ...extra } }); }
function fail(status, code, extra = {}) { return json({ ok: false, error: { code } }, status, extra); }
function adminNote(data) { return data.request_type === "your_request" ? `Your Request · ${data.model.display_name} · ${data.model.audience}` : data.request_type === "saved_model" ? `Saved Model · ${data.model.action}` : "Customer profile update request"; }
function plain(value) { return value && typeof value === "object" && !Array.isArray(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function token(value) { return safeText(value, 100).toLowerCase().replace(/[\s-]+/g, "_"); }
function safeText(value, max = 240) { return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function lineId(value) { const text = safeText(value, 80); return /^U[a-f0-9]{32}$/i.test(text) ? text : ""; }
function safeRequestId(value) { const text = safeText(value, 100); return /^req_[A-Za-z0-9_-]{12,80}$/.test(text) ? text : ""; }
function safeEvidenceId(value) { const text = safeText(value, 100); return /^evidence_[a-f0-9]{32}$/.test(text) ? text : ""; }
function safeModelId(value) { const text = safeText(value, 120); return /^(?:rec[a-zA-Z0-9]{14}|[a-z0-9][a-z0-9_-]{1,99})$/.test(text) ? text : ""; }
function safeEmail(value) { const text = safeText(value, 160).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? text : ""; }
function safePhone(value) { const text = safeText(value, 40).replace(/[\s().-]/g, ""); return /^(?:\+66|0)\d{8,9}$/.test(text) ? text : ""; }
function safeTelegram(value) { const text = safeText(value, 65).replace(/^@/, ""); return /^[A-Za-z0-9_]{3,64}$/.test(text) ? text : ""; }
function safeSocial(value) {
  const links = safeText(value, 500).split(/[\s,]+/).filter(Boolean).slice(0, 3);
  if (!links.length) return "";
  const normalized = links.map((link) => {
    try { const url = new URL(link); return url.protocol === "https:" && url.username === "" && url.password === "" ? url.toString() : ""; } catch { return ""; }
  });
  return normalized.every(Boolean) ? unique(normalized).join("\n") : "";
}
function safeTimestamp(value) { const text = safeText(value, 80); return Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null; }
function monthKeyInBangkok(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: MONTH_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}
function parsePayload(value) { try { const text = typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 120000) : ""; const data = JSON.parse(text); return plain(data) ? data : {}; } catch { return {}; } }
function formula(value) { return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function unique(values) { return [...new Set(values)]; }
async function hash(value) { const bytes = new TextEncoder().encode(String(value)); const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32); }
async function fullHash(value) { const bytes = new TextEncoder().encode(String(value)); const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function stableStringify(value, omit = new Set()) { if (Array.isArray(value)) return `[${value.map(item => stableStringify(item, omit)).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).filter(key => !omit.has(key)).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key], omit)}`).join(",")}}`; return JSON.stringify(value); }

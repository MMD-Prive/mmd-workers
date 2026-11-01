const AIRTABLE_API = "https://api.airtable.com/v0";
import { readTravelSession } from '../../shared/model-travel-store.mjs';
import { assertTravelCustomer, cancelTravelSubmission, commitTravelSubmission, meetingBinding, prepareTravelSubmission, projectTravel, readBoundedTravelBody, resolveTravelEta, saveMeetingDetails, travelJson, travelPhotoResponse, uploadTravelPhoto } from '../../shared/model-travel-store.mjs';
import { travelClock, travelEtaFromEvents } from '../../shared/model-travel-eta.mjs';
import { customerSessionLifecycle as lifecycleOf } from '../../shared/model-travel-lifecycle.mjs';
const DEFAULT_SESSIONS_TABLE = "Sessions";
const SESSION_PATH = "/api/member/app/session/";
const TERMINAL = new Set(["completed", "cancelled", "canceled"]);

export function isMemberAppSessionPath(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = normalizePath(url.pathname);
  return path === `${SESSION_PATH}current`
    || path === `${SESSION_PATH}context`
    || path === `${SESSION_PATH}travel`
    || path === `${SESSION_PATH}travel/photo`
    || path === `${SESSION_PATH}ack`;
}

export async function handleMemberAppSessionApi(request, env = {}, readSession) {
  const path = normalizePath(new URL(request.url).pathname);
  if (path === `${SESSION_PATH}travel` || path === `${SESSION_PATH}travel/photo`) {
    try {
      const method = request.method, url = new URL(request.url);
      if (!['GET', 'POST', 'PUT'].includes(method) || (path.endsWith('/photo') && method !== 'GET')) return travelJson({ ok: false, error: 'method_not_allowed' }, 405);
      let identity = await readSession(request, env);
      const authorization=request.headers.get('authorization');
      let signedId=null;
      if(authorization){
        if(!/^Bearer [^\s]{1,12000}$/.test(authorization))return travelJson({ok:false,error:'confirmation_token_invalid'},401);
        if(!env.PAYMENTS_WORKER?.fetch)return travelJson({ok:false,error:'confirmation_verifier_unavailable'},503);
        const verified=await env.PAYMENTS_WORKER.fetch(new Request(new URL('/v1/confirm/details',request.url),{method:'POST',headers:{'content-type':'application/json',origin:url.origin},body:JSON.stringify({t:authorization.slice(7),expected_role:'customer'}),signal:AbortSignal.timeout(10000)}));
        const subject=await verified.json().catch(()=>null);
        if(!verified.ok||subject?.ok!==true||subject.role!=='customer'||!subject.session_id)return travelJson({ok:false,error:'confirmation_token_invalid'},401);
        signedId=subject.session_id;
      }
      if (!signedId&&!identity?.lineUserId) return travelJson({ ok: false, error: 'member_session_required' }, 401);
      if (method !== 'GET' && identity?.readGraceOnly === true) return travelJson({ok:false,error:'member_session_refresh_required'},401);
      if (method !== 'GET' && (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site')) return travelJson({ ok: false, error: 'origin_not_allowed' }, 403);
      let body = null;
      if (method === 'POST') {
        try { body = JSON.parse(new TextDecoder().decode(await readBoundedTravelBody(request, 8192))); }
        catch (error) { return travelJson({ok:false,error:error.code || 'invalid_json'}, error.status || 400); }
      }
      const params = url.searchParams, id = body?.session_id || params.get('session_id');
      const selectors = ['client_id', 'member_id', 'line_user_id', 'model_id', 'model_record_id', 'sender_role', 'sender_id', 'role'];
      if (selectors.some(key => params.has(key) || Object.hasOwn(body || {}, key)) || params.getAll('session_id').length > 1
        || (body?.session_id && params.has('session_id') && body.session_id !== params.get('session_id'))
        || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(id || '')) return travelJson({ ok: false, error: 'invalid_session_selector' }, 400);
      if(signedId&&signedId!==id)return travelJson({ok:false,error:'confirmation_session_mismatch'},403);
      const record = signedId?await readTravelSession(env,id):await findOwnedSessionById(env, identity, id);
      if (!record) return travelJson({ ok: false, error: 'session_not_found' }, 404);
      if(signedId){
        if(identity?.lineUserId)assertTravelCustomer(record,identity);
        else identity={lineUserId:record.fields.line_user_id,memberId:Array.isArray(record.fields.member_id)?record.fields.member_id[0]:record.fields.member_id};
      }
      assertTravelCustomer(record, identity);
      if (path.endsWith('/photo')) return await travelPhotoResponse(env, record, params.get('media_id'));
      if (method === 'GET') {
        const data = await projectTravel(env, record, 'customer');
        if (identity.readGraceOnly === true) {data.can_send = false;data.can_edit_meeting=false;}
        return travelJson(data);
      }
      if (method === 'PUT') {
        if (params.getAll('index').length !== 1 || !/^[0-2]$/.test(params.get('index') || '')) return travelJson({ok:false,error:'travel_photo_invalid'},400);
        return travelJson(await uploadTravelPhoto(env, record, identity, params.get('id'), Number(params.get('index')), request, Date.now(), 'customer'));
      }
      if (body?.action === 'prepare') return travelJson(await prepareTravelSubmission(env, record, identity, body, Date.now(), 'customer'));
      if (body?.action === 'save_meeting_details') {
        if(body.context_binding!==await meetingBinding(env,record))return travelJson({ok:false,error:'travel_binding_changed'},409);
        return travelJson(await saveMeetingDetails(env,record,identity,body.details));
      }
      if (body?.action === 'commit') return travelJson(await commitTravelSubmission(env, record, identity, body.id, Date.now(), 'customer'));
      if (body?.action === 'cancel') return travelJson(await cancelTravelSubmission(env, record, identity, body.id, Date.now(), 'customer'));
      return travelJson({ok:false,error:'travel_action_invalid'},400);
    } catch (error) { return travelJson({ ok: false, error: error.code || 'travel_unavailable' }, error.status || 503); }
  }
  const allowed = path === `${SESSION_PATH}ack` ? "POST" : "GET";
  if (request.method !== allowed) return jsonError(405, "METHOD_NOT_ALLOWED", `${allowed} required.`, { allow: allowed });

  if (path === `${SESSION_PATH}context`) {
    const token = clean(new URL(request.url).searchParams.get("t"), 4096);
    if (!token) return json({ valid: false, session: null });
    const verification = await verifyCustomerToken(request, env, token);
    if (!verification.ok) return json({ valid: false, session: null, diagnostic: verification.diagnostic });
    const sessionId = contextSessionId(verification.payload);
    if (!sessionId) return json({ valid: false, session: null, diagnostic: "confirm_context_session_id_missing" });

    const identity = await readSession(request, env);
    const record = identity?.lineUserId
      ? await findOwnedSessionById(env, identity, sessionId)
      : await findSignedSessionById(env, sessionId);
    return record ? json({ valid: true, session: await projectSession(record, env) }) : json({ valid: false, session: null });
  }

  const identity = await readSession(request, env);
  if (!identity?.lineUserId) return jsonError(401, "MEMBER_SESSION_REQUIRED", "Open MY MMD through LINE and sign in again.");

  if (path === `${SESSION_PATH}current`) {
    const query = new URL(request.url).searchParams;
    const selectedId = query.get("session_id");
    if (query.has("client_id") || query.has("member_id") || query.has("line_user_id")) {
      return jsonError(400, "BROWSER_AUTHORITY_REJECTED", "Customer identity comes from the verified session.");
    }
    if (selectedId !== null && (query.getAll("session_id").length !== 1 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(selectedId))) {
      return jsonError(400, "INVALID_SESSION_ID", "Invalid session reference.");
    }
    const record = selectedId === null
      ? await findCurrentOwnedSession(env, identity)
      : await findOwnedSessionById(env, identity, selectedId);
    if (selectedId !== null && !record) return jsonError(404, "SESSION_NOT_FOUND", "Session is unavailable.");
    return record ? json(await projectSession(record, env)) : new Response(null, { status: 204, headers: noStoreHeaders() });
  }

  const body = await request.json().catch(() => null);
  const requestedId = clean(body?.session_id, 160);
  const token = clean(body?.t, 4096);
  if (!requestedId) return jsonError(400, "SESSION_ID_REQUIRED", "session_id is required.");

  if (token) {
    const verification = await verifyCustomerToken(request, env, token);
    if (!verification.ok || contextSessionId(verification.payload) !== requestedId) {
      return jsonError(403, "SESSION_TOKEN_MISMATCH", "Session credential does not match this session.");
    }
  }

  const record = await findOwnedSessionById(env, identity, requestedId);
  if (!record) return jsonError(404, "SESSION_NOT_FOUND", "Session is unavailable.");
  const projected = await projectSession(record, env);
  if (!projected.acknowledgement.customerAckAllowed) {
    return jsonError(409, "CUSTOMER_ACK_NOT_ALLOWED", "Customer acknowledgement is not available.");
  }

  await patchSession(env, record.id, { customer_ack_at: new Date().toISOString() });
  const refreshed = await findOwnedSessionById(env, identity, requestedId);
  if (!refreshed) return jsonError(502, "SESSION_REFRESH_FAILED", "Session could not be refreshed.");
  return json(await projectSession(refreshed, env));
}

async function findCurrentOwnedSession(env, identity) {
  const records = await listOwnedSessions(env, identity);
  const today = new Date().toISOString().slice(0, 10);
  const candidates = records.filter((record) => {
    const lifecycle = lifecycleOf(record.fields);
    const date = dateOnly(record.fields?.job_date || record.fields?.["Session Date"]);
    return !TERMINAL.has(lifecycle) && (!date || date >= today);
  });
  candidates.sort((a, b) => {
    const ad = dateOnly(a.fields?.job_date || a.fields?.["Session Date"]) || "9999-12-31";
    const bd = dateOnly(b.fields?.job_date || b.fields?.["Session Date"]) || "9999-12-31";
    return ad.localeCompare(bd) || String(a.createdTime || "").localeCompare(String(b.createdTime || ""));
  });
  return candidates[0] || null;
}

async function findSignedSessionById(env, sessionId) {
  const records = await airtableList(env, {
    filterByFormula: `{session_id}=${formulaString(sessionId)}`,
    maxRecords: 2,
  });
  return records.length === 1 ? records[0] : null;
}

async function findOwnedSessionById(env, identity, sessionId) {
  const record = await findSignedSessionById(env, sessionId);
  return record && clean(record.fields?.session_id, 160) === sessionId && owns(record, identity) ? record : null;
}

async function listOwnedSessions(env, identity) {
  const clauses = [`{line_user_id}=${formulaString(identity.lineUserId)}`];
  if (identity.memberId) clauses.push(`{member_id}=${formulaString(identity.memberId)}`);
  const records = await airtableList(env, {
    filterByFormula: clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`,
    maxRecords: 100,
  });
  return records.filter((record) => owns(record, identity));
}

function owns(record, identity) {
  const fields = record?.fields || {};
  const line = clean(fields.line_user_id, 160);
  const member = clean(linkValue(fields.member_id), 160);
  if (line && line !== identity.lineUserId) return false;
  if (member && identity.memberId && member !== identity.memberId) return false;
  return line === identity.lineUserId || Boolean(member && identity.memberId && member === identity.memberId);
}

async function projectSession(record, env) {
  const fields = record?.fields || {};
  const sessionId = clean(fields.session_id, 160) || null;
  const lifecycle = lifecycleOf(fields);
  const customerAckAt = isoOrNull(fields.customer_ack_at);
  const modelAckAt = isoOrNull(fields.model_ack_at);
  const modelName = clean(fields.model_name || fields["Assigned Model"], 120) || null;
  const start = clock(fields.start_time || fields["Start Time"]);
  const end = clock(fields.end_time || fields["End Time"]);
  const eta = await resolveTravelEta(env, record);
  return {
    sessionId,
    lifecycle,
    jobDate: dateOnly(fields.job_date || fields["Session Date"]) || null,
    jobTimeLabel: start && end ? `${start} – ${end}` : start || end || null,
    locationDisplay: clean(fields.location_name || fields["Location Name"], 240) || null,
    model: { displayName: modelName, displayAllowed: Boolean(modelName) },
    acknowledgement: {
      customerAckAt,
      modelAcknowledged: Boolean(modelAckAt),
      modelAckAt,
      customerAckAllowed: !customerAckAt && ["pending_confirmation", "confirmed"].includes(lifecycle),
    },
    // Jobs events are the only live ETA authority. An old Session label has
    // no verified update time and must not appear as current tracking.
    eta,
    etaLabel: eta.status === 'active' || lifecycle === 'arrived' ? travelClock(eta, lifecycle) || null : null,
    etaUpdatedAt: eta.updated_at,
    etaStale: eta.status === 'expired',
    missionReady: sessionPaymentConfirmed(fields),
    nextMessage: clean(fields.customer_next_message, 500) || null,
  };
}

function sessionPaymentConfirmed(fields = {}) {
  // Read-only compatibility with canonical paid/deposit_paid and verified
  // Session evidence. Unknown/negative fields veto, rather than concatenating
  // strings ("unpaid" contains "paid"). Never inspect booking status here.
  const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g,'_');
  const positive = new Set(['paid','deposit_paid','verified','official_verified']);
  const states = [fields.payment_status,fields['Payment Status'],fields.deposit_status,fields.verification_status,fields['Verification Status']].map(normalize).filter(Boolean);
  if(states.some(value=>!positive.has(value)))return false;
  if(fields.deposit_paid!=null&&fields.deposit_paid!==''&&fields.deposit_paid!==true&&normalize(fields.deposit_paid)!=='true'&&!positive.has(normalize(fields.deposit_paid)))return false;
  return states.length>0 || fields.deposit_paid===true || normalize(fields.deposit_paid)==='true' || positive.has(normalize(fields.deposit_paid));
}

// Kept for legacy callers; all timestamp math is owned by the shared helper.
export function customerEtaFromEvents(value, now = Date.now()) {
  const eta=travelEtaFromEvents(value,now);
  return {hasEvent:Boolean(eta.updated_at),label:eta.status==='active'?travelClock(eta,'en_route','th',now):null,updatedAt:eta.updated_at};
}

async function verifyCustomerToken(request, env, token) {
  if (!env.PAYMENTS_WORKER?.fetch) {
    return { ok: false, payload: null, diagnostic: "payments_binding_missing" };
  }

  const sourceUrl = new URL(request.url);
  const target = new URL("/v1/confirm/context", sourceUrl);
  let response;
  try {
    response = await env.PAYMENTS_WORKER.fetch(new Request(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: sourceUrl.origin,
      },
      body: JSON.stringify({ t: token, expected_role: "customer" }),
    }));
  } catch {
    return { ok: false, payload: null, diagnostic: "confirm_context_unavailable" };
  }

  if (!response.ok) {
    const boundedStatus = new Set([400, 401, 403, 404, 409, 410, 503]).has(response.status)
      ? response.status
      : "error";
    return { ok: false, payload: null, diagnostic: `confirm_context_http_${boundedStatus}` };
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return { ok: false, payload: null, diagnostic: "confirm_context_payload_invalid" };
  }
  return { ok: true, payload, diagnostic: null };
}

function contextSessionId(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const session = data.session && typeof data.session === "object" ? data.session : data;
  return clean(session.session_id || session.sessionId, 160);
}

async function airtableList(env, { filterByFormula, maxRecords, table: selectedTable = "" }) {
  requireAirtable(env);
  const table = String(selectedTable || env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("maxRecords", String(maxRecords));
  const response = await airtableFetch(env, new Request(url, { headers: airtableHeaders(env) }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function patchSession(env, recordId, fields) {
  requireAirtable(env);
  const table = String(env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE);
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const response = await airtableFetch(env, new Request(url, {
    method: "PATCH",
    headers: { ...airtableHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  }));
  if (!response.ok) throw new Error(`airtable_patch_${response.status}`);
}

function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}
function airtableHeaders(env) {
  return { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" };
}
function requireAirtable(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("airtable_not_configured");
}
function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function clean(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function linkValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || "") : "";
  return value;
}
function dateOnly(value) {
  const text = clean(value, 80);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}
function clock(value) {
  const text = clean(value, 80);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}
function isoOrNull(value) {
  const parsed = Date.parse(clean(value, 80));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function noStoreHeaders(extra = {}) {
  return { "cache-control": "no-store", "x-mmd-member-app-api": "v1", ...extra };
}
function json(value, status = 200) {
  return Response.json(value, { status, headers: noStoreHeaders() });
}
function jsonError(status, code, message, headers = {}) {
  return Response.json({ ok: false, error: { code, message } }, { status, headers: noStoreHeaders(headers) });
}

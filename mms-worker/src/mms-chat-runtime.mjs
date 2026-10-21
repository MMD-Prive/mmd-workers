import { requireMyMmsApprovedTherapist } from './my-mms-access-runtime.mjs';
import { linkedServiceZoneCodes, loadMmsServiceZoneIndex } from './service-zones-runtime.mjs';
import { MMS_CHAT_POLICY, chatSafeLabel, inspectChatMessage } from '../../shared/mms-chat-policy.mjs';

const CUSTOMER = '/internal/mms/chat/customer';
const THERAPIST = '/male-massage/therapists/api/app/chat';
const REVIEWS = '/internal/mms/admin/chat/reviews';
const THREAD = /^mmschat_[a-f0-9]{32}$/;
const HOLD = /^mmshold_[a-f0-9]{32}$/;
const ORIGINS = new Set(['https://mmdbkk.com', 'https://www.mmdbkk.com']);
const failure = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
const deliver = result => json(result.ok ? result : { ok: false, error: result.error }, result.ok ? 200 : result.status || 503);
const object = (env, name) => env.MMS_DIRECT_CHAT.getByName(`v1:${name}`);
const inbox = (env, actor) => object(env, `inbox:${actor.role}:${actor.id}`);
const room = (env, id) => object(env, `room:${id}`);

export function isMmsChatRequest(path) {
  return [CUSTOMER, THERAPIST, REVIEWS].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export async function maybeHandleMmsChat(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (!isMmsChatRequest(path)) return null;
  try {
    const internal = path.startsWith('/internal/');
    if (internal && url.hostname !== String(env.MMS_INTERNAL_HOST || 'mms.internal')) failure(404, 'NOT_FOUND');
    if (!env.MMS_DIRECT_CHAT?.getByName) failure(503, 'MMS_CHAT_STORAGE_UNAVAILABLE');
    if (request.method !== 'GET' && !ORIGINS.has(request.headers.get('origin'))) failure(403, 'ORIGIN_NOT_ALLOWED');
    if (path === REVIEWS || path.startsWith(`${REVIEWS}/`)) {
      if (request.method !== 'GET') return method('GET');
      query(url, ['after', 'thread_id']);
      if (path === REVIEWS) return deliver(await object(env, 'review-inbox').reviewQueue(cursor(url, 'after', HOLD)));
      const holdId = path.slice(REVIEWS.length + 1);
      const threadId = url.searchParams.get('thread_id') || '';
      if (!HOLD.test(holdId) || !THREAD.test(threadId)) failure(400, 'MMS_CHAT_QUERY_INVALID');
      return deliver(await room(env, threadId).reviewDetail(holdId));
    }
    let actor;
    const customer = path === CUSTOMER || path.startsWith(`${CUSTOMER}/`);
    if (customer) {
      const id = request.headers.get('x-mms-chat-member-ref') || '';
      if (!/^mmsmem_[a-f0-9]{32}$/.test(id)) failure(401, 'MMS_CHAT_IDENTITY_REQUIRED');
      actor = { role: 'customer', id };
    } else {
      const therapist = await requireMyMmsApprovedTherapist(request, env);
      actor = { role: 'therapist', id: therapist.fields['Therapist ID'] };
    }
    const suffix = path.slice((customer ? CUSTOMER : THERAPIST).length);
    const account = inbox(env, actor);
    if (suffix === '/policy') {
      query(url, []);
      if (request.method !== 'GET') return method('GET');
      return deliver(await account.consent(actor));
    }
    if (suffix === '/consent') {
      query(url, []);
      if (request.method !== 'POST') return method('POST');
      const body = await readChatJson(request, ['version']);
      if (body.version !== MMS_CHAT_POLICY.version) failure(409, 'MMS_CHAT_POLICY_REQUIRED');
      return deliver(await account.consent(actor, body.version, Date.now()));
    }
    const consent = await account.consent(actor);
    if (!consent.ok || consent.data?.consent?.version !== MMS_CHAT_POLICY.version) failure(409, 'MMS_CHAT_POLICY_REQUIRED');

    if (customer && suffix === '/therapists') {
      if (request.method !== 'GET') return method('GET');
      query(url, ['zone', 'offset']);
      const zone = url.searchParams.get('zone') || '';
      const offset = url.searchParams.get('offset') || '';
      if (zone && !/^[A-Z0-9-]{2,80}$/.test(zone) || offset.length > 200) failure(400, 'MMS_CHAT_QUERY_INVALID');
      return json({ ok: true, data: await directory(env, { zone, offset }) });
    }
    if (suffix === '/threads') {
      if (request.method === 'GET') {
        query(url, ['after']);
        return deliver(await account.threads(actor, cursor(url, 'after', THREAD)));
      }
      if (request.method !== 'POST' || !customer) return method('GET');
      query(url, []);
      const body = await readChatJson(request, ['therapist_id']);
      if (typeof body.therapist_id !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(body.therapist_id)) failure(400, 'MMS_CHAT_THERAPIST_INVALID');
      const found = await directory(env, { therapistId: body.therapist_id });
      const therapist = found.therapists[0];
      if (found.therapists.length !== 1 || !therapist?.available) failure(409, 'MMS_CHAT_THERAPIST_UNAVAILABLE');
      const threadId = `mmschat_${(await sha256(`${actor.id}\0${therapist.therapist_id}`)).slice(0, 32)}`;
      const metadata = { thread_id: threadId, customer_id: actor.id, therapist_id: therapist.therapist_id, therapist_label: therapist.display_name };
      const initialized = await room(env, threadId).initialize(metadata);
      if (!initialized.ok) return deliver(initialized);
      const peer = { role: 'therapist', id: therapist.therapist_id };
      await inbox(env, peer).consent(peer);
      // Replaying creation repairs either inbox after a transient failure.
      for (const participant of [actor, peer]) {
        const joined = await inbox(env, participant).join(participant, metadata, Date.now());
        if (!joined.ok) return deliver(joined);
      }
      return json({ ok: true, data: { thread_id: threadId } });
    }
    const matched = suffix.match(/^\/threads\/(mmschat_[a-f0-9]{32})(?:\/(messages|reviews))?$/);
    if (!matched) failure(404, 'MMS_CHAT_NOT_FOUND');
    const threadId = matched[1];
    const chat = room(env, threadId);
    if (!matched[2]) {
      if (request.method !== 'GET') return method('GET');
      query(url, ['after', 'before']);
      if (url.searchParams.has('after') && url.searchParams.has('before')) failure(400, 'MMS_CHAT_QUERY_INVALID');
      return deliver(await chat.read(actor, numberCursor(url, 'after'), numberCursor(url, 'before')));
    }
    if (request.method !== 'POST') return method('POST');
    query(url, []);
    if (matched[2] === 'messages') {
      const body = await readChatJson(request, ['text', 'request_key']);
      if (customer) {
        const membership = await chat.read(actor, Number.MAX_SAFE_INTEGER);
        if (!membership.ok) return deliver(membership);
        const current = await directory(env, { therapistId: membership.data.therapist_id });
        if (current.therapists.length !== 1) failure(409, 'MMS_CHAT_THERAPIST_UNAVAILABLE');
      }
      // Never accept attachments, sender roles, contact data or member IDs from
      // browser payloads. The authenticated actor is always server-derived.
      return deliver(await chat.send(actor, body.text, body.request_key, Date.now()));
    }
    const body = await readChatJson(request, ['hold_id']);
    if (typeof body.hold_id !== 'string' || !HOLD.test(body.hold_id)) failure(400, 'MMS_CHAT_QUERY_INVALID');
    const result = await chat.requestReview(actor, body.hold_id);
    if (!result.ok) return deliver(result);
    return deliver(await object(env, 'review-inbox').queueReview(body.hold_id, threadId, Date.now()));
  } catch (error) {
    return json({ ok: false, error: { code: error.code || 'MMS_CHAT_UNAVAILABLE' } }, Number(error.status) || 503);
  }
}

async function directory(env, { therapistId = '', zone = '', offset = '' } = {}) {
  if (!env.AIRTABLE_API_TOKEN || !/^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID) || !/^tbl[A-Za-z0-9]{14}$/.test(env.AIRTABLE_THERAPISTS_TABLE_ID) || !env.MMS_PRIVATE_UPLOADS?.get) failure(503, 'MMS_CHAT_DIRECTORY_UNAVAILABLE');
  const index = await loadMmsServiceZoneIndex(env);
  if (zone && !index.byCode.has(zone)) failure(400, 'MMS_CHAT_QUERY_INVALID');
  const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_THERAPISTS_TABLE_ID}`);
  const filters = ["{Status}='Active'", "{Therapist Auth Status}='Active'", "{MY MMS Access}='Approved'", '{Matching Enabled}=TRUE()'];
  if (therapistId) filters.push(`{Therapist ID}='${therapistId}'`);
  url.searchParams.set('filterByFormula', `AND(${filters.join(',')})`);
  url.searchParams.set('pageSize', therapistId ? '2' : '20');
  if (therapistId) url.searchParams.set('maxRecords', '2');
  if (offset) url.searchParams.set('offset', offset);
  for (const field of ['Therapist ID', 'Display Name', 'Status', 'Therapist Auth Status', 'MY MMS Access', 'Matching Enabled', 'LINE Subject Hash', 'Availability Status', 'Base Service Zone', 'Coverage Service Zones']) url.searchParams.append('fields[]', field);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}` }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) failure(503, 'MMS_CHAT_DIRECTORY_UNAVAILABLE');
  const payload = await response.json();
  if (!Array.isArray(payload.records)) failure(503, 'MMS_CHAT_DIRECTORY_UNAVAILABLE');
  if (therapistId && payload.records.length !== 1) failure(409, 'MMS_CHAT_THERAPIST_UNAVAILABLE');
  const therapists = [];
  for (const record of payload.records) {
    const f = record.fields || {};
    const id = f['Therapist ID'];
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(id) || f.Status !== 'Active' || f['Therapist Auth Status'] !== 'Active' || f['MY MMS Access'] !== 'Approved' || f['Matching Enabled'] !== true || !f['LINE Subject Hash']) continue;
    const zones = linkedServiceZoneCodes(f['Coverage Service Zones'], index);
    if (!zones.length || zone && !zones.includes(zone)) continue;
    const stored = await env.MMS_PRIVATE_UPLOADS.get(`therapist-dashboard/v1/${id}/profile.json`);
    if (!stored) continue;
    let profile;
    try { profile = JSON.parse(await stored.text()); } catch { failure(503, 'MMS_CHAT_DIRECTORY_UNAVAILABLE'); }
    if (profile.profile_visibility !== 'public') continue;
    const courses = (Array.isArray(profile.courses) ? profile.courses : []).slice(0, 8)
      .filter(c => typeof c?.name === 'string' && !inspectChatMessage(c.name).code && Number.isInteger(c.duration_minutes) && c.duration_minutes >= 30 && Number.isFinite(c.price_thb) && c.price_thb >= 0)
      .map(c => ({ name: c.name.slice(0, 80), duration_minutes: c.duration_minutes, price_thb: c.price_thb }));
    therapists.push({ therapist_id: id, display_name: chatSafeLabel(f['Display Name']), intro: typeof profile.intro === 'string' && !inspectChatMessage(profile.intro).code ? profile.intro.slice(0, 600) : '', available: f['Availability Status'] === 'Available', zones, courses });
  }
  return { therapists, next: typeof payload.offset === 'string' ? payload.offset : null,
    zones: [...index.byCode].map(([code, item]) => ({ code, label: chatSafeLabel(item.label_th || item.label || code, code) })) };
}

export async function readChatJson(request, allowed) {
  if ((request.headers.get('content-type') || '').toLowerCase().split(';')[0].trim() !== 'application/json') failure(415, 'MMS_CHAT_TEXT_ONLY');
  const reader = request.body?.getReader();
  if (!reader) failure(400, 'MMS_CHAT_MESSAGE_INVALID');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); failure(413, 'MMS_CHAT_MESSAGE_INVALID'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let pos = 0;
  for (const chunk of chunks) { bytes.set(chunk, pos); pos += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { failure(400, 'MMS_CHAT_MESSAGE_INVALID'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) failure(400, 'MMS_CHAT_MESSAGE_INVALID');
  if (Object.keys(body).some(key => !allowed.includes(key))) failure(400, 'MMS_CHAT_TEXT_ONLY');
  return body;
}
function query(url, keys) { for (const key of url.searchParams.keys()) if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1) failure(400, 'MMS_CHAT_QUERY_INVALID'); }
function cursor(url, name, pattern) { const value = url.searchParams.get(name) || ''; if (value && !pattern.test(value)) failure(400, 'MMS_CHAT_QUERY_INVALID'); return value; }
function numberCursor(url, key) { if (!url.searchParams.has(key)) return null; const value = url.searchParams.get(key); if (!/^\d{1,12}$/.test(value)) failure(400, 'MMS_CHAT_QUERY_INVALID'); return Number(value); }
function method(allow) { return new Response(null, { status: 405, headers: { allow, 'cache-control': 'private, no-store' } }); }
async function sha256(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

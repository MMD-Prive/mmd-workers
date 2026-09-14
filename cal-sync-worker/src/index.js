const encoder = new TextEncoder();
const AIRTABLE_API = 'https://api.airtable.com/v0';
const DEFAULT_BASE_ID = 'appsV1ILPRfIjkaYg';
const DEFAULT_CAL_LINKS_TABLE = 'tbl6saWYEQrEdnMIK';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
function clean(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function objectOrNull(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function normalizeSignature(value) { const supplied = clean(value).toLowerCase(); return supplied.startsWith('sha256=') ? supplied.slice(7) : supplied; }
function timingSafeEqualHex(a, b) {
  const left = clean(a).toLowerCase(), right = clean(b).toLowerCase();
  if (!/^[0-9a-f]+$/.test(left) || !/^[0-9a-f]+$/.test(right) || left.length !== right.length) return false;
  let mismatch = 0; for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
export async function verifyWebhookSignature(rawBody, secret, signature) {
  const keyText = clean(secret), supplied = normalizeSignature(signature); if (!keyText || !supplied) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(expected, supplied);
}
function normalizePerson(value) {
  const person = objectOrNull(value); if (!person) return null;
  return { id: person.id ?? person.userId ?? null, email: clean(person.email) || null, name: clean(person.name) || null };
}
function normalizeLocation(value) {
  if (value == null) return null;
  if (typeof value === 'string') return { type: 'text', value: clean(value) || null };
  const location = objectOrNull(value); if (!location) return null;
  return { type: clean(location.type || location.locationType) || null, value: clean(location.address || location.location || location.link || location.value) || null };
}
function normalizePayment(payload) {
  const payment = objectOrNull(payload.payment) || objectOrNull(payload.paymentInfo) || objectOrNull(payload.paymentData);
  const source = payment || payload;
  const amount = source.amount ?? source.amountPaid ?? source.paymentAmount ?? null;
  const status = clean(source.status || source.paymentStatus) || null;
  const currency = clean(source.currency) || null;
  const id = source.id ?? source.paymentId ?? null;
  if (amount == null && status == null && currency == null && id == null) return null;
  return { id, status, amount, currency };
}
function normalizeNoShow(payload) {
  const noShow = objectOrNull(payload.noShow) || objectOrNull(payload.noShowUpdated) || objectOrNull(payload.noShowData);
  if (noShow) return { host: noShow.host ?? null, attendee_count: Array.isArray(noShow.attendees) ? noShow.attendees.length : null, status: clean(noShow.status) || null };
  if (payload.noShowHost == null && payload.noShowAttendees == null) return null;
  return { host: payload.noShowHost ?? null, attendee_count: Array.isArray(payload.noShowAttendees) ? payload.noShowAttendees.length : null, status: null };
}
function makeIdempotencyKey(triggerEvent, payload, createdAt) {
  const uid = clean(payload.uid || payload.bookingUid || payload.rescheduleUid) || String(payload.bookingId ?? payload.id ?? 'unknown');
  const timestamp = clean(createdAt) || clean(payload.updatedAt) || clean(payload.startTime) || 'unknown-time';
  return `cal:${clean(triggerEvent) || 'UNKNOWN'}:${uid}:${timestamp}`;
}
function canonicalMetadata(payload) {
  const metadata = objectOrNull(payload.metadata) || {};
  return {
    session_id: clean(metadata.session_id || metadata.sessionId || metadata.mmd_session_id || metadata.mmdSessionId, 180) || null,
    job_id: clean(metadata.job_id || metadata.jobId || metadata.mmd_job_id || metadata.mmdJobId, 180) || null,
  };
}
export function normalizeCalEvent(input) {
  const triggerEvent = clean(input?.triggerEvent);
  const payload = input && typeof input.payload === 'object' && input.payload !== null ? input.payload : input || {};
  const attendee = Array.isArray(payload.attendees) ? payload.attendees[0] || null : null;
  const organizer = objectOrNull(payload.organizer);
  const previousHost = objectOrNull(payload.previousHost) || objectOrNull(payload.oldHost) || objectOrNull(payload.reassignedFrom);
  const newHost = objectOrNull(payload.newHost) || objectOrNull(payload.reassignedTo) || objectOrNull(payload.host);
  const previousLocation = payload.previousLocation ?? payload.oldLocation ?? null;
  const currentLocation = payload.location ?? payload.newLocation ?? payload.updatedLocation ?? null;
  const createdAt = clean(input?.createdAt) || null;
  return {
    source: 'cal.com', trigger_event: triggerEvent || null, created_at: createdAt, webhook_version: null,
    idempotency_key: makeIdempotencyKey(triggerEvent, payload, createdAt),
    booking_uid: clean(payload.uid || payload.bookingUid) || null, booking_id: payload.bookingId ?? payload.id ?? null,
    event_type_id: payload.eventTypeId ?? null, event_type_slug: clean(payload.type) || null,
    start_time: clean(payload.startTime) || null, end_time: clean(payload.endTime) || null,
    reschedule_uid: clean(payload.rescheduleUid) || null,
    reschedule_reason: clean(payload.reschedulingReason || payload.rescheduleReason) || null,
    cancellation_reason: clean(payload.cancellationReason) || null,
    organizer: normalizePerson(organizer), attendee: normalizePerson(attendee),
    location_change: previousLocation != null || currentLocation != null ? { previous: normalizeLocation(previousLocation), current: normalizeLocation(currentLocation) } : null,
    reassignment: previousHost || newHost ? { previous_host: normalizePerson(previousHost), new_host: normalizePerson(newHost) } : null,
    payment_signal: normalizePayment(payload), no_show: normalizeNoShow(payload),
    metadata: objectOrNull(payload.metadata) || {}, canonical: canonicalMetadata(payload), payload_keys: Object.keys(payload).sort(),
  };
}
function safeLogEvent(event, shadowMode, mappingState = 'not_attempted') {
  console.log(JSON.stringify({ type:'cal_webhook', mode:shadowMode?'shadow':'active', trigger_event:event.trigger_event, idempotency_key:event.idempotency_key,
    booking_uid:event.booking_uid, booking_id:event.booking_id, event_type_id:event.event_type_id, start_time:event.start_time, end_time:event.end_time,
    session_id_present:Boolean(event.canonical?.session_id), job_id_present:Boolean(event.canonical?.job_id), mapping_ledger:mappingState,
    reschedule_uid:event.reschedule_uid, reschedule_reason_present:Boolean(event.reschedule_reason), cancellation_reason_present:Boolean(event.cancellation_reason),
    location_change:event.location_change?{previous_type:event.location_change.previous?.type||null,current_type:event.location_change.current?.type||null,previous_value_present:Boolean(event.location_change.previous?.value),current_value_present:Boolean(event.location_change.current?.value)}:null,
    reassignment:event.reassignment?{previous_host_id:event.reassignment.previous_host?.id??null,new_host_id:event.reassignment.new_host?.id??null}:null,
    payment_signal:event.payment_signal, no_show:event.no_show, payload_keys:event.payload_keys }));
}
function airtableConfig(env = {}) {
  return { token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500), base: clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID, table: clean(env.CAL_BOOKING_LINKS_TABLE_ID, 80) || DEFAULT_CAL_LINKS_TABLE };
}
function airtableHeaders(token) { return { authorization:`Bearer ${token}`, 'content-type':'application/json', accept:'application/json' }; }
function formulaQuote(v) { return `'${clean(v,180).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`; }
export async function persistCalBookingLink(event, env = {}) {
  const { token, base, table } = airtableConfig(env);
  if (!token) return { configured:false, written:false, reason:'airtable_token_missing' };
  if (!event.booking_uid) return { configured:true, written:false, reason:'booking_uid_missing' };
  const linkId = `cal:${event.booking_uid}`;
  const lookup = new URL(`${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
  lookup.searchParams.set('maxRecords','1'); lookup.searchParams.set('returnFieldsByFieldId','true'); lookup.searchParams.set('filterByFormula',`{Link ID}=${formulaQuote(linkId)}`);
  const existingResponse = await fetch(lookup, { headers:airtableHeaders(token) });
  const existingBody = await existingResponse.json().catch(()=>({}));
  if (!existingResponse.ok) throw new Error(`cal_mapping_lookup_${existingResponse.status}`);
  const existing = existingBody.records?.[0] || null;
  const now = new Date().toISOString();
  const fields = {
    'Link ID':linkId, 'Cal Booking UID':event.booking_uid, 'Cal Booking ID':event.booking_id == null ? undefined : String(event.booking_id),
    'Cal Event Type ID':event.event_type_id == null ? undefined : String(event.event_type_id),
    'Session ID':event.canonical?.session_id || undefined, 'Job ID':event.canonical?.job_id || undefined,
    'Mapping Status':event.canonical?.session_id || event.canonical?.job_id ? 'linked' : 'observed',
    'Last Trigger Event':event.trigger_event || undefined, 'Last Event At':event.created_at || now,
    'Start At':event.start_time || undefined, 'End At':event.end_time || undefined,
    'Idempotency Key':event.idempotency_key || undefined, 'Source':'cal_webhook', 'Updated At':now,
  };
  if (!existing) fields['Created At'] = now;
  for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
  const endpoint = `${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}${existing ? `/${existing.id}` : ''}`;
  const response = await fetch(endpoint, { method:existing?'PATCH':'POST', headers:airtableHeaders(token), body:JSON.stringify({ fields, typecast:true }) });
  if (!response.ok) throw new Error(`cal_mapping_write_${response.status}`);
  const body = await response.json().catch(()=>({}));
  return { configured:true, written:true, action:existing?'updated':'created', record_id:body.id || existing?.id || null, mapping_status:fields['Mapping Status'] };
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    const cfg = airtableConfig(env);
    return json({ ok:true, service:'cal-sync-worker', mode:clean(env.CAL_SHADOW_MODE).toLowerCase()==='false'?'active':'shadow', webhook_secret_configured:Boolean(clean(env.CAL_WEBHOOK_SECRET)), api_key_configured:Boolean(clean(env.CAL_API_KEY)), mapping_ledger_configured:Boolean(cfg.token), mapping_table:cfg.table, timezone:clean(env.MMD_TIMEZONE)||'Asia/Bangkok' });
  }
  if (request.method === 'POST' && url.pathname === '/webhooks/cal') {
    const secret = clean(env.CAL_WEBHOOK_SECRET); if (!secret) return json({ok:false,error:'webhook_secret_not_configured'},503);
    const rawBody = await request.text();
    const valid = await verifyWebhookSignature(rawBody, secret, request.headers.get('x-cal-signature-256'));
    if (!valid) return json({ok:false,error:'invalid_signature'},401);
    let input; try { input=JSON.parse(rawBody); } catch { return json({ok:false,error:'invalid_json'},400); }
    const event=normalizeCalEvent(input); event.webhook_version=clean(request.headers.get('x-cal-webhook-version'))||null;
    const shadowMode=clean(env.CAL_SHADOW_MODE).toLowerCase()!=='false';
    let mapping={configured:false,written:false,reason:'not_attempted'};
    try { mapping=await persistCalBookingLink(event,env); }
    catch(error){ safeLogEvent(event,shadowMode,'failed'); return json({ok:false,error:'mapping_ledger_write_failed'},503); }
    safeLogEvent(event,shadowMode,mapping.written?mapping.action:(mapping.reason||'skipped'));
    // Shadow mode may persist external booking identity only. It never mutates
    // MMD Session, Payment, Membership, Client, pricing, or cancellation truth.
    return new Response(null,{status:204});
  }
  return json({ok:false,error:'not_found'},404);
}
export default { fetch(request,env){ return handleRequest(request,env); } };

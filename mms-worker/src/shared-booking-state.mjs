// Read-only MMS job authority. No financial decisions, record writes or new schema.
const JOB = /^mmsjob_[a-f0-9]{24}$/;
const PREBOOKING = /^mmspre_[a-f0-9]{24}$/;
const STATES = new Set(['MATCHING', 'OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED']);
const recordStatus = state => ({ MATCHING: 'Matching', OFFERED: 'Offered', ACCEPTED: 'Accepted', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXPIRED: 'Expired' })[state] || 'Checking';
const select = value => typeof value === 'object' ? String(value?.name || '') : String(value || '');
export const jobState = value => {
  const state = select(value).trim().toUpperCase().replace(/[ -]+/g, '_');
  return STATES.has(state) ? state : 'CHECKING';
};

export function sharedBookingState(state, { available = true } = {}) {
  const current = available ? jobState(state) : 'CHECKING';
  const status = ({ ACCEPTED: 'pending', MATCHING: 'pending', OFFERED: 'pending', IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELLED: 'cancelled' })[current] || 'checking';
  const label = ({ ACCEPTED: 'รับงานแล้ว · รอตรวจยืนยันนัด', MATCHING: 'กำลังหาผู้รับงาน', OFFERED: 'รอตอบรับงาน', IN_PROGRESS: 'กำลังให้บริการ', COMPLETED: 'จบงานแล้ว', CANCELLED: 'ยกเลิกแล้ว', EXPIRED: 'ข้อเสนอหมดอายุ · รอประสาน' })[current] || 'ยังตรวจสถานะงานไม่ได้';
  return {
    schema: 'mms_booking_state_v1', status, label,
    assignment: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(current) ? 'accepted' : current.toLowerCase(),
    service: current === 'IN_PROGRESS' ? 'in_progress' : current === 'COMPLETED' ? 'completed' : current === 'CANCELLED' ? 'cancelled' : current === 'CHECKING' ? 'checking' : 'not_started',
    // Phase 2 must bind verified payment/agreement authority. Acceptance and
    // display labels (including a legacy "Confirmed") cannot grant this state.
    confirmation: 'checking', payment: 'checking', source: available && current !== 'CHECKING' ? 'dispatch_coordinator' : 'checking',
  };
}

export function requestBookingState(status, available = true) {
  const key = select(status).trim().toLowerCase();
  const state = { ...sharedBookingState(key === 'cancelled' || key === 'canceled' ? 'CANCELLED' : 'CHECKING', { available }), source: 'checking' };
  if (available && ['cancelled', 'canceled'].includes(key)) return { ...state, source: 'prebooking' };
  if (available && ['submitted', 'received', 'matching', 'matched', 'options ready', 'pending coordination', 'pending', 'reviewing', 'under review'].includes(key)) {
    return { ...state, status: 'pending', label: 'รอประสานและยืนยันนัด', source: 'prebooking', assignment: 'pending' };
  }
  return state;
}

export function publicBookingState(value) {
  const fallback = sharedBookingState('CHECKING', { available: false });
  if (!value || value.schema !== fallback.schema || value.confirmation !== 'checking' || value.payment !== 'checking'
    || !['pending', 'in_progress', 'completed', 'cancelled', 'checking'].includes(value.status)
    || !['accepted', 'matching', 'offered', 'pending', 'cancelled', 'expired', 'checking'].includes(value.assignment)
    || !['not_started', 'in_progress', 'completed', 'cancelled', 'checking'].includes(value.service)
    || !['dispatch_coordinator', 'prebooking', 'checking'].includes(value.source)
    || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160) return fallback;
  const { status, source, assignment, service } = value;
  const coherent = status === 'in_progress' || status === 'completed'
    ? source === 'dispatch_coordinator' && assignment === 'accepted' && service === status
    : status === 'cancelled' ? ['dispatch_coordinator', 'prebooking'].includes(source) && assignment === 'cancelled' && service === 'cancelled'
    : status === 'pending' ? source === 'dispatch_coordinator' && ['matching', 'offered', 'accepted'].includes(assignment) && service === 'not_started'
      || source === 'prebooking' && assignment === 'pending' && service === 'checking'
    : source === 'checking' && assignment === 'checking' && service === 'checking'
      || source === 'dispatch_coordinator' && assignment === 'expired' && service === 'not_started';
  if (!coherent) return fallback;
  return Object.fromEntries(Object.keys(fallback).map(key => [key, value[key]]));
}

export async function mmsReadRecords(env, kind, formula, signal) {
  const table = String(env[`AIRTABLE_${kind}_TABLE_ID`] || '');
  if (!env.AIRTABLE_API_TOKEN || !/^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID || '') || !/^tbl[A-Za-z0-9]{14}$/.test(table)) throw new Error('MMS_SOURCE_UNAVAILABLE');
  const query = new URLSearchParams({ pageSize: '100', filterByFormula: formula });
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}?${query}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`, Accept: 'application/json' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error('MMS_SOURCE_UNAVAILABLE');
  const body = await response.json();
  if (!Array.isArray(body?.records) || body.offset) throw new Error('MMS_SOURCE_INCOMPLETE');
  return body.records;
}

export async function mapMmsReads(items, read) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await read(items[index], index); }
  }));
  return result;
}

// The coordinator supplies current ownership/state; Airtable is a projection.
// Missing, conflicting, failed or timed-out authority never unlocks disclosure.
export async function readSharedMmsJob(env, record, { prebooking, signal } = {}) {
  const f = record?.fields || {};
  const id = f['Job ID'];
  const payloadProjection = fields => {
    let p = {}; try { p = JSON.parse(fields['Internal Payload JSON'] || '{}'); } catch { /* untrusted projection */ }
    const q = p?.pricing;
    return JSON.stringify({ is_test: p?.is_test === true, ...(q && typeof q.course_amount_thb === 'number' && typeof q.travel_amount_thb === 'number'
      ? { pricing: { course_amount_thb: q.course_amount_thb, travel_amount_thb: q.travel_amount_thb } } : {}) });
  };
  const redact = fields => {
    return { ...fields, 'Exact Address Private': '', 'Map URL Private': '', 'Customer Display Private': '', 'Customer Contact Private': '', 'Internal Payload JSON': payloadProjection(fields) };
  };
  const locked = { record: { ...record, fields: redact({ ...f, 'Job Status': 'Checking', 'Travel Label': '', 'ETA Label': '' }) }, state: 'CHECKING', owner: null, bookingState: sharedBookingState('CHECKING', { available: false }), disclosureAllowed: false };
  if (!JOB.test(id || '') || signal?.aborted) return locked;
  let timer, abort;
  try {
    const ns = env.MMS_DISPATCH_COORDINATOR;
    if (!ns?.get || !ns?.idFromName) return locked;
    const snapshot = await Promise.race([
      ns.get(ns.idFromName(id)).snapshot(id),
      ...(signal ? [new Promise((_, reject) => { abort = () => reject(new Error('MMS_AUTHORITY_ABORTED')); signal.addEventListener('abort', abort, { once: true }); })] : []),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MMS_AUTHORITY_TIMEOUT')), 2000); }),
    ]);
    if (signal?.aborted) return locked;
    const job = snapshot?.job;
    const state = jobState(job?.state);
    if (!job || job.job_id !== id || state === 'CHECKING') return locked;
    const owner = typeof job.winner_therapist_id === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(job.winner_therapist_id) ? job.winner_therapist_id : null;
    if (['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(state) && !owner) return locked;
    if (['MATCHING', 'OFFERED', 'EXPIRED'].includes(state) && job.winner_therapist_id) return locked;
    const storedOwner = String(f['Accepted Therapist ID'] || '');
    if (owner && storedOwner !== owner) return locked;
    const prebookingId = String(f['Prebooking ID'] || '');
    if (PREBOOKING.test(prebookingId)) {
      if (prebooking === undefined) {
        const rows = await mmsReadRecords(env, 'PREBOOKINGS', `{Prebooking ID}='${prebookingId}'`, signal);
        if (rows.length !== 1) return locked;
        prebooking = rows[0];
      }
      if (prebooking?.fields?.['Prebooking ID'] !== prebookingId) return locked;
      const requestState = select(prebooking.fields.Status).trim().toLowerCase();
      if (['cancelled', 'canceled'].includes(requestState)) return { ...locked, record: { ...locked.record, fields: { ...locked.record.fields, 'Job Status': 'Cancelled' } }, state: 'CANCELLED', owner, bookingState: { ...sharedBookingState('CANCELLED'), source: 'prebooking' } };
      if (['completed', 'complete'].includes(requestState) && state !== 'COMPLETED') return locked;
    } else {
      // Owner test jobs carry no customer record and must never disclose PII.
      let payload; try { payload = JSON.parse(f['Internal Payload JSON'] || '{}'); } catch { return locked; }
      if (payload?.is_test !== true) return locked;
    }
    let fields = { ...f, 'Job Status': recordStatus(state), 'Accepted Therapist ID': owner || '' };
    if (!['ACCEPTED'].includes(state)) { fields['Travel Label'] = ''; fields['ETA Label'] = ''; }
    const disclosureAllowed = PREBOOKING.test(prebookingId) && ['ACCEPTED', 'IN_PROGRESS'].includes(state);
    if (!disclosureAllowed) fields = redact(fields);
    else { fields['Customer Display Private'] = ''; fields['Customer Contact Private'] = ''; fields['Internal Payload JSON'] = payloadProjection(fields); }
    return { record: { ...record, fields }, state, owner, bookingState: sharedBookingState(state), disclosureAllowed };
  } catch { return locked; }
  finally { clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); }
}

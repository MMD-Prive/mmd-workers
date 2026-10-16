import { normalizeSessionState } from './modelSessionContractV1.js';

export const CANONICAL_MODEL_FIELD = 'Canonical Model';
const RUNNING = new Set(['en_route', 'nearby', 'arrived', 'met_customer', 'final_payment_pending', 'final_payment_confirmed', 'work_started']);
const WAITING = new Set(['offered', 'confirmed']);
const FINISHED = new Set(['offer_declined', 'offer_expired', 'work_finished', 'separated', 'under_review', 'payout_pending', 'closed']);
const text = value => typeof value === 'string' ? value.trim() : '';
const review = () => ({ ok: false, status: 409, error: 'current_session_review_required' });
const dayInBangkok = now => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function canonicalModelIds(record) {
  const links = record?.fields?.[CANONICAL_MODEL_FIELD];
  // Airtable REST linked-record cells contain IDs, never display names.
  return Array.isArray(links) ? links.filter(value => typeof value === 'string' && /^rec[A-Za-z0-9]+$/.test(value)) : [];
}

function schedule(fields, env) {
  const start = text(fields[env.AT_SESSIONS__START_TIME || 'start_time']);
  const date = text(fields[env.AT_SESSIONS__JOB_DATE || 'job_date']);
  if (start) {
    // Reject timestamps without a timezone instead of using host-local time.
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(start) || !Number.isFinite(Date.parse(start))) return null;
    const at = Date.parse(start), day = dayInBangkok(at);
    if (date && date !== day) return null;
    return { day, at };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00+07:00')) || dayInBangkok(Date.parse(date + 'T00:00:00+07:00')) !== date) return null;
  return { day: date, at: null };
}

export function selectCanonicalCurrentSession(records, modelId, env = {}, now = Date.now()) {
  const today = dayInBangkok(now), running = [], waiting = [];
  let uncertain = false;
  for (const record of records) {
    const ids = canonicalModelIds(record);
    if (!ids.includes(modelId)) continue;
    if (ids.length !== 1 || record.fields[CANONICAL_MODEL_FIELD].length !== ids.length) return review();
    const fields = record.fields || {};
    const state = normalizeSessionState(fields[env.AT_SESSIONS__CANONICAL_STATE || 'model_session_state']);
    if (FINISHED.has(state)) continue;
    if (!text(fields[env.AT_SESSIONS__SESSION_ID || 'session_id'])) return review();
    if (RUNNING.has(state)) { running.push(record); continue; }
    const when = schedule(fields, env);
    if (when && when.day < today) continue;
    if (!when || !WAITING.has(state)) { uncertain = true; continue; }
    waiting.push({ record, ...when });
  }
  if (running.length > 1) return review();
  if (running.length === 1) return { ok: true, status: 200, record: running[0] };
  if (uncertain) return review();
  waiting.sort((a, b) => a.day.localeCompare(b.day) || (a.at ?? 0) - (b.at ?? 0));
  const first = waiting[0], second = waiting[1];
  if (!first) return { ok: false, status: 404, error: 'session_not_found' };
  // A date-only job cannot be ordered against another job on the same date.
  if (second && first.day === second.day && (first.at === null || second.at === null || first.at === second.at)) return review();
  return { ok: true, status: 200, record: first.record };
}

export async function readCanonicalCurrentSession(env, modelId, { now = Date.now(), fetcher = fetch } = {}) {
  if (!/^rec[A-Za-z0-9]+$/.test(text(modelId))) return { ok: false, status: 403, error: 'forbidden' };
  const key = text(env.AIRTABLE_API_KEY), base = text(env.AIRTABLE_BASE_ID);
  if (!key || !base) return { ok: false, status: 503, error: 'session_lookup_unavailable' };
  const table = text(env.AIRTABLE_TABLE_SESSIONS) || 'tblC98mKWbzmPuNzX';
  const records = [], offsets = new Set();
  let offset = '';
  try {
    do {
      const params = new URLSearchParams({ pageSize: '100', filterByFormula: `FIND("${modelId}",ARRAYJOIN({${CANONICAL_MODEL_FIELD}}))` });
      if (offset) params.set('offset', offset);
      const response = await fetcher(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}?${params}`, {
        headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('lookup_failed');
      const body = await response.json();
      if (!Array.isArray(body.records)) throw new Error('invalid_records');
      records.push(...body.records);
      offset = text(body.offset);
      if (offset && (offsets.has(offset) || records.length >= 1000)) throw new Error('incomplete_candidates');
      if (offset) offsets.add(offset);
    } while (offset);
    return selectCanonicalCurrentSession(records, modelId, env, now);
  } catch {
    return { ok: false, status: 503, error: 'session_lookup_unavailable' };
  }
}

// Publication review is separate from the seven-day rotation preference.
// No Telegram history is inferred from the automated delivery journal.
import { readCompcardJson, writeCompcardJson } from './compcard-journal.js';
import { automaticModelAllowed } from './compcard-policy.js';

export const REVIEW_SCHEMA = 'hype_compcard_history_review_v1';
export const REVIEW_ROOT = 'publication-review/';
// No unobserved manual-post interval is silently accepted. Until a synchronous
// trusted reconciler supplies current proof, publication remains held.
export const REVIEW_MAX_AGE_MS = 0;
const ROOM_NAMES = ['premium', 'standard', 'preview'];
const ICT = 7 * 3600000;
const finiteTime = value => Number.isSafeInteger(value) && value >= 0;
const reference = value => typeof value === 'string' && value.length > 0 && value.length <= 1000 && !/[\x00-\x1f]/.test(value);

export function threeMonthReviewWindow(now) {
  if (!finiteTime(now)) throw new Error('compcard_review_clock_invalid');
  const local = new Date(now + ICT);
  const year = local.getUTCFullYear(), month = local.getUTCMonth() - 3;
  const day = Math.min(local.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const start = Date.UTC(year, month, day, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()) - ICT;
  return { timezone: 'Asia/Bangkok', from: start, through: now,
    from_date: new Date(start + ICT).toISOString().slice(0, 10), date: local.toISOString().slice(0, 10) };
}

export async function reviewModelPublication(bucket, modelId, destinations, now) {
  const window = threeMonthReviewWindow(now);
  const rooms = Object.keys(destinations || {}).sort();
  const result = { allowed: false, model_id: modelId, window, scope: 'all_configured_rooms_cross_room',
    coverage: [], recent: [], reasons: [], warning_delivery: 'not_required' };
  if (!automaticModelAllowed(modelId)) result.reasons.push('compcard_automatic_selection_excluded');
  if (!/^rec[A-Za-z0-9]+$/.test(modelId || '')) result.reasons.push('compcard_review_identity_invalid');
  if (rooms.length !== ROOM_NAMES.length || ROOM_NAMES.some(room => !rooms.includes(room))
      || new Set(Object.values(destinations || {})).size !== rooms.length
      || rooms.some(room => !/^-[1-9]\d{0,15}$/.test(destinations[room] || ''))) {
    result.reasons.push('compcard_review_room_scope_unverified');
  }
  let proof;
  try { proof = (await readCompcardJson(bucket, `${REVIEW_ROOT}models/${modelId}.json`))?.record; }
  catch { result.reasons.push('compcard_review_evidence_unreadable'); }
  const envelopeValid = proof?.schema === REVIEW_SCHEMA && proof.model_id === modelId
    && proof.timezone === 'Asia/Bangkok' && reference(proof.revision) && reference(proof.reviewed_by)
    && finiteTime(proof.reviewed_at) && proof.reviewed_at <= now
    && Array.isArray(proof.rooms) && proof.rooms.length === rooms.length;
  for (const room of rooms) {
    const matches = envelopeValid ? proof.rooms.filter(item => item?.destination === room) : [];
    const row = matches.length === 1 ? matches[0] : null;
    const coverageValid = row?.chat_id === destinations[room] && row.status === 'verified_complete'
      && row.manual_posts_included === true && row.includes_all_authors === true
      && row.reconciliation_method === 'direct_room_history_review' && row.identity_reconciliation_complete === true
      && row.unresolved_count === 0 && finiteTime(row.from) && row.from <= window.from
      && finiteTime(row.through) && row.through <= now && row.through >= now - REVIEW_MAX_AGE_MS
      && row.through >= window.from && proof.reviewed_at >= row.through
      && Array.isArray(row.evidence_refs) && row.evidence_refs.length > 0 && row.evidence_refs.every(reference)
      && Array.isArray(row.observations);
    let observationsValid = !!row && Array.isArray(row.observations);
    for (const observation of Array.isArray(row?.observations) ? row.observations : []) {
      const valid = observation?.model_id === modelId && observation.identity_verified === true
        && reference(observation.identity_evidence_ref) && reference(observation.source_ref)
        && Number.isSafeInteger(observation.message_id) && observation.message_id > 0
        && finiteTime(observation.posted_at) && observation.posted_at <= now
        && observation.chat_id === destinations[room];
      if (!valid) { observationsValid = false; continue; }
      if (observation.posted_at >= window.from) result.recent.push({ destination: room,
        chat_id: observation.chat_id, message_id: observation.message_id, posted_at: observation.posted_at,
        source_ref: observation.source_ref, source: 'verified_room_history' });
    }
    result.coverage.push({ destination: room, chat_id: destinations[room],
      status: coverageValid && observationsValid ? 'verified_snapshot' : 'incomplete_or_unverifiable',
      through: finiteTime(row?.through) ? row.through : null });
  }
  if (result.coverage.some(row => row.status !== 'verified_snapshot') || !result.coverage.length)
    result.reasons.push('compcard_review_history_incomplete');
  // The journal is positive evidence only. Its absence never establishes coverage.
  try {
    const history = (await readCompcardJson(bucket, `history/${modelId}.json`))?.record;
    const exposed = history?.status === 'not_sent' ? history.previous_exposure : history;
    if (exposed) {
      if (exposed.model_id !== modelId || !/^\d{4}-\d{2}-\d{2}$/.test(exposed.date || '')
          || !Number.isFinite(Date.parse(exposed.date + 'T00:00:00Z'))
          || new Date(Date.parse(exposed.date + 'T00:00:00Z')).toISOString().slice(0, 10) !== exposed.date
          || exposed.date > window.date
          || !['sent', 'sending', 'delivery_uncertain'].includes(exposed.status)) {
        result.reasons.push('compcard_review_journal_unverifiable');
      } else if (exposed.date >= window.from_date) result.recent.push({ source: 'automated_journal',
        date: exposed.date, status: exposed.status, destination: 'not_recorded' });
    }
  } catch { result.reasons.push('compcard_review_journal_unverifiable'); }
  if (result.recent.length) result.reasons.push('compcard_review_recent_exposure');
  result.reasons = [...new Set(result.reasons)];
  result.allowed = result.reasons.length === 0;
  return result;
}

export async function holdPublicationWithWarning(bucket, review, slot, now) {
  const payload = { schema: 'hype_compcard_owner_warning_v1', date: review.window.date,
    model_id: review.model_id, slot, reasons: review.reasons, window: review.window,
    scope: review.scope, coverage: review.coverage, recent: review.recent,
    status: 'undelivered', delivery_error: 'owner_route_not_configured', created_at: now };
  // Stable per model/day/slot/reason set: cron retries cannot spam new warnings.
  const reasonKey = [...review.reasons].sort().join('+');
  const key = `${REVIEW_ROOT}owner-outbox/${review.window.date}/${review.model_id}/${slot}/${reasonKey}.json`;
  try {
    const old = await readCompcardJson(bucket, key);
    if (!old) await writeCompcardJson(bucket, key, payload, null);
    review.warning_delivery = 'undelivered';
    review.warning_error = 'owner_route_not_configured';
    review.warning_key = key;
  } catch {
    review.warning_delivery = 'undelivered';
    review.warning_error = 'owner_warning_storage_failed';
  }
  return review;
}

export async function checkPublicationHistory(bucket, card, destinations, slot, now, plannedDestinations = []) {
  const review = await reviewModelPublication(bucket, card.model_id, destinations, now);
  if (plannedDestinations.length > 1) {
    review.allowed = false;
    review.reasons.push("compcard_review_multi_room_scope_required");
  }
  if (!review.allowed) await holdPublicationWithWarning(bucket, review, slot, now);
  await writeCompcardJson(bucket, `${REVIEW_ROOT}latest/${card.model_id}/${slot}.json`, review);
  return review;
}

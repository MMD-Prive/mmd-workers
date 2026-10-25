import { constantTimeEqual } from './lib/payment-primitives.js';
import { mirrorMatches, mirrorPendingPreference, resolveMemberRecordId } from './blackcard-companion-preference.js';

export const BLACKCARD_RETENTION_ADMIN_PATH = '/v1/internal/blackcard/preference-retention';
const T = 'mmd_blackcard_companion_preferences', O = 'mmd_blackcard_companion_audit_outbox';
const E = 'mmd_blackcard_companion_lifecycle_events', H = 'mmd_blackcard_companion_retention_holds';
const MIRROR = 'tblmU2D3u0fjlBpeo';
const F = Object.freeze({ status:'fldmUukFu7vlCNVRS', actor:'fldeAN9g8J3muhpv5', reviewNote:'fld6l4KrJwTUutsPK', reviewedAt:'fldllPl768hXme4O4', sync:'fld7qYcsjjsnI4E1r', error:'fldKoxvJQNyuJ7Rtv', metadata:'fldg3oBALJFB6Lmxd', note:'fldEZrXcf97ON2mqI', reason:'fldn9wU28zjv37lye', experience:'fldxw53oA5eTu8MKy', expiry:'fldgwMccAhzfeDK6c' });
const NEXT = {
  pending_review: ['in_review','needs_follow_up','recorded','declined','cancelled'],
  in_review: ['needs_follow_up','recorded','declined','cancelled'],
  needs_follow_up: ['in_review','recorded','declined','cancelled'],
  recorded: [], declined: [], cancelled: [],
};
const ERRORS = new Set(['mirror_configuration_missing','mirror_request_failed','mirror_identity_conflict','mirror_payload_conflict','mirror_ack_invalid','canonical_member_unresolved','canonical_member_lookup_failed','review_status_invalid','review_metadata_invalid','review_retention_mismatch','review_payload_changed','review_revision_stale','review_transition_invalid','review_concurrent_conflict','review_mirror_missing','initial_mirror_pending']);
const iso = date => new Date(date).toISOString();
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2,'0')).join('');
const fail = code => { throw new Error(code); };
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
const expired = (row, now) => !Number.isFinite(Date.parse(row.retention_expires_at)) || Date.parse(row.retention_expires_at) <= Date.parse(now);
const endpoint = env => `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${MIRROR}`;

async function airtable(env, url, init = {}) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) fail('mirror_configuration_missing');
  const request = new Request(url, { ...init, signal: AbortSignal.timeout(5000), headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, 'content-type':'application/json', accept:'application/json' } });
  const response = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request));
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.details) fail('mirror_request_failed');
  return data;
}
async function loadMirror(env, row, memberRecordId) {
  const url = new URL(endpoint(env));
  url.searchParams.set('filterByFormula', `{fldPYEff5pSnpjk0p}='${row.idempotency_key}'`);
  url.searchParams.set('maxRecords','2'); url.searchParams.set('returnFieldsByFieldId','true');
  const data = await airtable(env, url);
  if (!Array.isArray(data.records) || data.offset || data.records.length > 1) fail('mirror_identity_conflict');
  const record = data.records[0] || null;
  if (record && !mirrorMatches(record, row, row.member_id, memberRecordId)) fail('mirror_payload_conflict');
  return record;
}
async function patch(env, record, fields) {
  const data = await airtable(env, endpoint(env) + '/' + record.id, { method:'PATCH', body:JSON.stringify({ fields }) });
  if (data.id !== record.id) fail('mirror_ack_invalid');
}
async function lock(env, row, now) {
  const token = crypto.randomUUID();
  const result = await env.BLACKCARD_DB.prepare(`UPDATE ${O} SET sync_lock_token = ?, sync_lock_until = ? WHERE request_id = ? AND (sync_lock_until IS NULL OR sync_lock_until < ?)`).bind(token, iso(Date.parse(now) + 60000), row.request_id, now).run();
  return result.meta?.changes === 1 ? token : null;
}
async function unlock(env, row, token) {
  await env.BLACKCARD_DB.prepare(`UPDATE ${O} SET sync_lock_token = NULL, sync_lock_until = NULL WHERE request_id = ? AND sync_lock_token = ?`).bind(row.request_id, token).run();
}
async function held(env, id, now) {
  return Boolean(await env.BLACKCARD_DB.prepare(`SELECT request_id FROM ${H} WHERE request_id = ? AND released_at IS NULL AND hold_until > ?`).bind(id, now).first());
}
async function eventStatement(env, row, type, revision, actorHash, from, to, now) {
  const id = 'bcl_' + await digest(`${row.request_id}:${type}:${revision}`);
  return env.BLACKCARD_DB.prepare(`INSERT OR IGNORE INTO ${E} (event_id, request_id, event_type, revision_hash, actor_hash, from_status, to_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, row.request_id, type, revision, actorHash, from, to, now);
}
function metadata(row, extra = {}) {
  return JSON.stringify({ source:'payments-worker', session_id_hash:row.source_session_id_hash, ...(row.review_revision_hash ? { review_revision_hash:row.review_revision_hash } : {}), ...extra });
}

async function redact(env, row, now) {
  if (await held(env, row.request_id, now)) return 'held';
  const revision = await digest(row.request_id + ':retention:' + row.retention_expires_at);
  const at = row.retention_redacted_at || now;
  await env.BLACKCARD_DB.batch([
    env.BLACKCARD_DB.prepare(`UPDATE ${T} SET note = '', change_reason = '', review_note = NULL, reviewed_by = NULL, retention_redacted_at = COALESCE(retention_redacted_at, ?), maintenance_error = NULL WHERE request_id = ?`).bind(at, row.request_id),
    await eventStatement(env, row, 'retention_redacted', revision, null, row.status, row.status, at),
  ]);
  const memberRecordId = row.member_record_id || await resolveMemberRecordId(env, row.member_id);
  if (!memberRecordId) fail("canonical_member_unresolved");
  const record = await loadMirror(env, row, memberRecordId);
  if (record) {
    const f = record.fields || {};
    let meta = {}; try { meta = JSON.parse(f[F.metadata] || '{}'); } catch {}
    if ([F.note,F.reason,F.reviewNote,F.actor].some(key => f[key]) || meta.retention_redacted_at !== at || Date.parse(f[F.expiry]) !== Date.parse(row.retention_expires_at)) {
      await patch(env, record, { [F.note]:'', [F.reason]:'', [F.reviewNote]:'', [F.actor]:'', [F.expiry]:row.retention_expires_at, [F.sync]:'synced', [F.error]:'', [F.metadata]:metadata(row, { retention_redacted_at:at }) });
    }
  }
  // An absent mirror is confirmed by a successful bounded lookup. Never recreate
  // an expired mirror or retain free text waiting for a remote recovery.
  await env.BLACKCARD_DB.batch([
    env.BLACKCARD_DB.prepare(`UPDATE ${T} SET retention_mirrored_at = COALESCE(retention_mirrored_at, ?), maintenance_error = NULL WHERE request_id = ?`).bind(now, row.request_id),
    await eventStatement(env, row, 'retention_mirrored', revision, null, row.status, row.status, now),
  ]);
  return 'redacted';
}

async function reconcile(env, row, record, now) {
  const f = record.fields || {}, status = f[F.status];
  if (!Object.hasOwn(NEXT, status)) fail('review_status_invalid');
  const actor = text(f[F.actor], 160), note = f[F.reviewNote] || '';
  if (status === row.status && !actor && !note && !f[F.reviewedAt] && !row.review_revision_hash) return 'unchanged';
  const reviewed = Date.parse(f[F.reviewedAt]);
  if (!actor || typeof note !== 'string' || note.length > 500 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(note) || !Number.isFinite(reviewed) || reviewed < Date.parse(row.created_at) || reviewed > Date.parse(now) + 60000) fail('review_metadata_invalid');
  if (Date.parse(f[F.expiry]) !== Date.parse(row.retention_expires_at)) fail('review_retention_mismatch');
  const experience = f[F.experience] || [];
  if (!Array.isArray(experience) || experience.some(v => typeof v !== 'string')) fail('review_payload_changed');
  const hash = await digest(JSON.stringify({ companion_preference:row.companion_preference, experience_preferences:[...experience].sort(), note:f[F.note] || '', change_reason:f[F.reason] || '' }));
  if (hash !== row.payload_hash) fail('review_payload_changed');
  const reviewAt = iso(reviewed), revision = await digest(JSON.stringify({ status, actor, note, reviewed_at:reviewAt }));
  if (revision !== row.review_revision_hash) {
    if (row.reviewed_at && reviewed <= Date.parse(row.reviewed_at)) fail('review_revision_stale');
    if (status !== row.status && !NEXT[row.status]?.includes(status)) fail('review_transition_invalid');
    const result = await env.BLACKCARD_DB.batch([
      env.BLACKCARD_DB.prepare(`UPDATE ${T} SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = ?, review_revision_hash = ?, updated_at = ?, maintenance_error = NULL WHERE request_id = ? AND COALESCE(review_revision_hash, '') = ? AND retention_redacted_at IS NULL AND retention_expires_at > ?`).bind(status, actor, note, reviewAt, revision, now, row.request_id, row.review_revision_hash || '', now),
      // The per-request lease serializes review and retention; batch rollback
      // keeps the decision and its non-sensitive audit event atomic.
      env.BLACKCARD_DB.prepare(`INSERT OR IGNORE INTO ${E} (event_id, request_id, event_type, revision_hash, actor_hash, from_status, to_status, created_at) SELECT ?, request_id, 'review_reconciled', ?, ?, ?, ?, ? FROM ${T} WHERE request_id = ? AND review_revision_hash = ?`).bind('bcl_' + await digest(`${row.request_id}:review_reconciled:${revision}`), revision, await digest(actor), row.status, status, now, row.request_id, revision),
    ]);
    if (result[0].meta?.changes !== 1) fail('review_concurrent_conflict');
    row = { ...row, status, review_revision_hash:revision };
  }
  if (row.review_mirrored_revision_hash !== revision) {
    await patch(env, record, { [F.sync]:'synced', [F.error]:'', [F.metadata]:metadata(row) });
    await env.BLACKCARD_DB.prepare(`UPDATE ${T} SET review_mirrored_revision_hash = ? WHERE request_id = ? AND review_revision_hash = ?`).bind(revision, row.request_id, revision).run();
  }
  return 'reconciled';
}

// Called only by the existing payments-worker cron. No browser-triggered sweep.
export async function runBlackCardPreferenceMaintenance(env, { now, limit = 10 } = {}) {
  const clock = () => now === undefined ? new Date().toISOString() : now;
  const stats = { ok:true, checked:0, reconciled:0, redacted:0, held:0, busy:0, failed:0 };
  if (!env.BLACKCARD_DB?.prepare) return { ...stats, disabled:true };
  try {
    if (!Number.isFinite(Date.parse(clock())) || !Number.isInteger(limit) || limit < 1 || limit > 20) fail('maintenance_options_invalid');
    const rows = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${T} ORDER BY COALESCE(last_maintenance_at, ''), rowid LIMIT ?`).bind(limit).all();
    if (rows.success === false || !Array.isArray(rows.results)) fail('maintenance_query_invalid');
    for (let row of rows.results || []) {
      stats.checked++;
      let token = null, record = null;
      try {
        if (!expired(row, clock())) {
          const outbox = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${O} WHERE request_id = ?`).bind(row.request_id).first();
          if (outbox?.delivery_status !== 'delivered') {
            const member = row.member_record_id || await resolveMemberRecordId(env, row.member_id);
            if (!member || !await mirrorPendingPreference(env, row, row.member_id, member)) fail('initial_mirror_pending');
          }
        }
        token = await lock(env, row, clock());
        if (!token) { stats.busy++; continue; }
        row = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${T} WHERE request_id = ?`).bind(row.request_id).first();
        // Scrub canonical free text before remote lookup, even during outages.
        let result;
        if (expired(row, clock())) result = await redact(env, row, clock());
        else {
          const member = row.member_record_id || await resolveMemberRecordId(env, row.member_id);
          if (!member) fail('canonical_member_unresolved');
          record = await loadMirror(env, row, member);
          if (!record) fail('review_mirror_missing');
          result = expired(row, clock()) ? await redact(env, row, clock()) : await reconcile(env, row, record, clock());
        }
        if (Object.hasOwn(stats, result)) stats[result]++;
        await env.BLACKCARD_DB.prepare(`UPDATE ${T} SET maintenance_error = NULL WHERE request_id = ?`).bind(row.request_id).run();
      } catch (error) {
        stats.failed++;
        const code = ERRORS.has(error?.message) ? error.message : 'maintenance_operation_failed';
        await env.BLACKCARD_DB.prepare(`UPDATE ${T} SET maintenance_error = ? WHERE request_id = ?`).bind(code, row.request_id).run();
        if (record && code.startsWith('review_')) await patch(env, record, { [F.sync]:'failed', [F.error]:code, [F.metadata]:metadata(row) }).catch(() => null);
      } finally {
        if (token) await unlock(env, row, token);
        await env.BLACKCARD_DB.prepare(`UPDATE ${T} SET last_maintenance_at = ? WHERE request_id = ?`).bind(clock(), row.request_id).run();
      }
    }
    stats.ok = stats.failed === 0;
    return stats;
  } catch { return { ...stats, ok:false, error:'blackcard_lifecycle_unavailable' }; }
}

// Existing admin-to-payments service credential is the authority for approved
// holds. An Airtable note/status or a customer confirmation token cannot hold data.
export async function handleBlackCardRetentionAdmin(request, env) {
  const json = (data, status = 200) => Response.json(data, { status, headers:{ 'cache-control':'no-store' } });
  if (!env.AUTH_SERVICE_ADMIN_TO_PAYMENTS || !await constantTimeEqual(request.headers.get('x-internal-token') || '', env.AUTH_SERVICE_ADMIN_TO_PAYMENTS)) return json({ ok:false, error:'service_auth_required' }, 401);
  if (new URL(request.url).pathname !== BLACKCARD_RETENTION_ADMIN_PATH) return json({ ok:false, error:'not_found' },404);
  if (request.method !== 'POST') return json({ ok:false, error:'method_not_allowed' }, 405);
  const body = await request.json().catch(() => null), now = new Date().toISOString();
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !['action','request_id','actor','reason','hold_until','operation_id','hold_id'].includes(k)) || !['place_hold','release_hold'].includes(body.action) || !/^bcp_[a-f0-9]{32}$/.test(body.request_id || '') || !text(body.actor,160) || !text(body.reason,500) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operation_id || '')) return json({ ok:false, error:'retention_request_invalid' }, 400);
  if (!env.BLACKCARD_DB?.prepare) return json({ ok:false, error:'preference_storage_unavailable' }, 503);
  let row, token;
  try {
    row = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${T} WHERE request_id = ?`).bind(body.request_id).first();
    if (!row) return json({ ok:false, error:'preference_not_found' }, 404);
    token = await lock(env,row,now);
    if (!token) return json({ ok:false, error:'retention_busy' }, 409);
    row = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${T} WHERE request_id = ?`).bind(body.request_id).first();
    const previous = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${H} WHERE request_id = ?`).bind(row.request_id).first();
    const actor = await digest(body.actor.trim()), reason = await digest(body.reason.trim());
    const revision = await digest(JSON.stringify({ action:body.action, operation_id:body.operation_id, actor, reason, until:body.hold_until || null, hold_id:body.hold_id || null }));
    const holdId = 'bch_' + await digest(row.request_id + ':' + body.operation_id);
    if (body.action === 'place_hold') {
      const until = Date.parse(body.hold_until);
      if (typeof body.hold_until !== 'string' || !Number.isFinite(until) || until <= Date.parse(now) || !/^\d{4}-/.test(iso(until))) return json({ ok:false, error:'hold_expiry_required' },400);
      if (row.retention_redacted_at) return json({ ok:false, error:'preference_already_redacted' },409);
      if (previous?.hold_id === holdId) {
        if (previous.actor_hash !== actor || previous.reason_hash !== reason || previous.hold_until !== iso(until)) return json({ ok:false,error:'hold_idempotency_conflict' },409);
        return json({ ok:true, hold_id:holdId, hold_until:previous.hold_until, active:!previous.released_at && Date.parse(previous.hold_until) > Date.parse(now), idempotent:true });
      }
      if (previous && !previous.released_at && Date.parse(previous.hold_until) > Date.parse(now)) return json({ ok:false,error:'active_hold_conflict' },409);
      await env.BLACKCARD_DB.batch([
        env.BLACKCARD_DB.prepare(`INSERT INTO ${H} (request_id, hold_id, hold_until, actor_hash, reason_hash, created_at, released_at) VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(request_id) DO UPDATE SET hold_id = excluded.hold_id, hold_until = excluded.hold_until, actor_hash = excluded.actor_hash, reason_hash = excluded.reason_hash, created_at = excluded.created_at, released_at = NULL`).bind(row.request_id, holdId, iso(until), actor, reason, now),
        await eventStatement(env,row,'hold_placed',revision,actor,row.status,row.status,now),
      ]);
      return json({ ok:true, hold_id:holdId, hold_until:iso(until), active:true, idempotent:false });
    }
    if (!previous || previous.hold_id !== body.hold_id) return json({ ok:false,error:'hold_subject_mismatch' },409);
    if (previous.released_at) return json({ ok:true, hold_id:body.hold_id, released:true, idempotent:true });
    await env.BLACKCARD_DB.batch([
      env.BLACKCARD_DB.prepare(`UPDATE ${H} SET released_at = COALESCE(released_at, ?) WHERE request_id = ? AND hold_id = ?`).bind(now,row.request_id,body.hold_id),
      await eventStatement(env,row,'hold_released',revision,actor,row.status,row.status,now),
    ]);
    return json({ ok:true, hold_id:body.hold_id, released:true, idempotent:Boolean(previous.released_at) });
  } catch { return json({ ok:false,error:'retention_operation_unavailable' },503); }
  finally { if (row && token) await unlock(env,row,token).catch(() => null); }
}

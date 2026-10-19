import { travelEtaFromEvents } from './model-travel-eta.mjs';
import { customerSessionLifecycle } from './model-travel-lifecycle.mjs';
import { notificationDigest } from './payment-notification-outbox.mjs';

export const TRAVEL_LIMIT = 3;
export const TRAVEL_TEXT_MAX = 500;
export const TRAVEL_IMAGE_MAX = 5 * 1024 * 1024;
const TTL = 10 * 60000;
const ACTIVE = new Set(['en_route', 'nearby']);
const ref = value => typeof value === 'string' ? value.trim() : '';
export const travelError = (code, status = 409) => Object.assign(new Error(code), { code, status });
export const travelJson = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
const validSession = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const bucketOf = env => {
  const bucket = env.PRIVATE_MODEL_MEDIA;
  if (!bucket?.get || !bucket?.put || !bucket?.head || !bucket?.delete) throw travelError('travel_storage_unavailable', 503);
  return bucket;
};

export async function travelRecords(env, table, sessionId) {
  if (!validSession(sessionId)) throw travelError('session_id_invalid', 400);
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw travelError('travel_authority_unavailable', 503);
  const params = new URLSearchParams({ filterByFormula: `{session_id}="${sessionId}"`, maxRecords: '2' });
  const response = await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP) || fetch)(new Request(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(10000),
  }));
  if (!response.ok) throw travelError('travel_authority_unavailable', 503);
  const data = await response.json();
  if (!Array.isArray(data.records) || data.offset) throw travelError('travel_authority_unavailable', 503);
  return data.records;
}

export async function readTravelSession(env, sessionId) {
  const records = await travelRecords(env, env.AIRTABLE_TABLE_SESSIONS || 'tblC98mKWbzmPuNzX', sessionId);
  if (records.length !== 1 || records[0].fields?.session_id !== sessionId) throw travelError('travel_session_unavailable', 404);
  return records[0];
}

export function travelState(record) {
  return customerSessionLifecycle(record?.fields);
}

// Legacy Session Status is read compatibility, not lifecycle write authority.
// Keep canonical alias/conflict handling without falling back to that field.
function canWriteTravel(record) {
  const fields = record?.fields || {};
  return ACTIVE.has(customerSessionLifecycle({
    model_session_state: fields.model_session_state,
    session_state: fields.session_state,
  }));
}

// Shared by the legacy current/context projection and the private travel API.
// Requires an already-authorized Session; performs no writes or ledger access.
export async function resolveTravelEta(env, record, now = Date.now()) {
  const inactive = {status:'inactive',server_now:new Date(now).toISOString(),arrival_at:null,updated_at:null};
  if (!ACTIVE.has(travelState(record))) return inactive;
  try {
    const sessionId=record.fields.session_id;
    const jobs=await travelRecords(env,env.AIRTABLE_TABLE_JOBS||'Jobs',sessionId);
    if(jobs.length!==1||jobs[0].fields?.session_id!==sessionId)throw travelError('travel_job_unavailable');
    return travelEtaFromEvents(jobs[0].fields.events_json,now);
  } catch { return {...inactive,status:'unavailable'}; }
}

export async function travelBinding(record) {
  const f = record?.fields || {}, models = f['Canonical Model'];
  const member = Array.isArray(f.member_id) ? f.member_id : f.member_id ? [f.member_id] : [];
  if (!Array.isArray(models) || models.length !== 1 || !/^rec[A-Za-z0-9]+$/.test(models[0]) || member.length > 1) throw travelError('travel_binding_review_required');
  const line = ref(f.line_user_id);
  if (!/^U[0-9a-f]{32}$/i.test(line) && !member.length) throw travelError('travel_customer_unlinked');
  return notificationDigest(JSON.stringify([record.id, f.session_id, models[0], line, member, f.job_id || '', f.confirmation_revision || '']));
}

export function assertTravelModel(record, modelId, write = false) {
  const models = record?.fields?.['Canonical Model'];
  if (!Array.isArray(models) || models.length !== 1 || models[0] !== modelId) throw travelError('travel_forbidden', 403);
  if (write && !canWriteTravel(record)) throw travelError('travel_not_allowed');
}

const rootOf = async sessionId => `job-travel/v1/${await notificationDigest(sessionId)}/`;
const objectKey = (root, id, index) => `${root}uploads/${id}/${index}.jpg`;
async function ledger(env, sessionId) {
  const root = await rootOf(sessionId), bucket = bucketOf(env), object = await bucket.get(root + 'ledger.json');
  if (!object) return { bucket, root, etag: null, value: { version: 1, revision: 0, entries: {} } };
  if (object.size > 256000) throw travelError('travel_ledger_invalid', 503);
  let value;
  try { value = await object.json(); } catch { throw travelError('travel_ledger_invalid', 503); }
  if (value?.version !== 1 || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries) || !Number.isSafeInteger(value.revision)) throw travelError('travel_ledger_invalid', 503);
  return { bucket, root, etag: object.etag, value };
}

// R2 evaluates conditional writes atomically. No Airtable read-then-write quota.
async function mutate(env, sessionId, change) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const data = await ledger(env, sessionId);
    const result = change(data.value);
    data.value.revision++;
    const saved = await data.bucket.put(data.root + 'ledger.json', JSON.stringify(data.value), {
      onlyIf: data.etag ? { etagMatches: data.etag } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    });
    if (saved) return { ...data, result };
  }
  throw travelError('travel_busy_retry_same_key', 503);
}

function counts(entries, now) {
  const retained = Object.values(entries).filter(e => e.state === 'saved' || (e.state === 'reserved' && e.expires_at > now));
  const saved = retained.filter(e => e.state === 'saved');
  const messages = retained.filter(e => Boolean(e.text)).length, photos = retained.reduce((n, e) => n + e.photos.length, 0);
  return { messages_used: saved.filter(e => Boolean(e.text)).length, photos_used: saved.reduce((n, e) => n + e.photos.length, 0), messages_remaining: Math.max(0, TRAVEL_LIMIT - messages), photos_remaining: Math.max(0, TRAVEL_LIMIT - photos) };
}

export async function prepareTravelSubmission(env, record, modelId, input, now = Date.now()) {
  assertTravelModel(record, modelId, true);
  if (typeof input?.key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.key)) throw travelError('travel_key_invalid', 400);
  if (typeof input.text !== 'string' || input.text.length > TRAVEL_TEXT_MAX) throw travelError('travel_text_invalid', 400);
  const text = input.text.trim();
  if (!Array.isArray(input.photos) || input.photos.length > TRAVEL_LIMIT) throw travelError('travel_photos_invalid', 400);
  const photos = input.photos.map(photo => {
    if (photo?.type !== 'image/jpeg' || !Number.isInteger(photo.size) || photo.size < 20 || photo.size > TRAVEL_IMAGE_MAX || !validId(photo.sha256)) throw travelError('travel_photo_invalid', 400);
    return { type: 'image/jpeg', size: photo.size, sha256: photo.sha256 };
  });
  if (!text && !photos.length) throw travelError('travel_submission_empty', 400);
  const binding = await travelBinding(record), sessionId = record.fields.session_id;
  const id = await notificationDigest(`${modelId}:${sessionId}:${input.key}`), digest = await notificationDigest(JSON.stringify({ text, photos }));
  await cleanupTravelReservations(env, sessionId, now);
  const data = await mutate(env, sessionId, value => {
    const existing = value.entries[id];
    if (existing) {
      if (existing.digest !== digest || existing.binding !== binding || existing.model_id !== modelId) throw travelError('travel_key_conflict');
      return existing;
    }
    if (Object.keys(value.entries).length >= 64) throw travelError('travel_attempt_limit', 429);
    const used = counts(value.entries, now);
    if ((text && !used.messages_remaining) || photos.length > used.photos_remaining) throw travelError('travel_quota_reached');
    return value.entries[id] = { id, key: input.key, digest, model_id: modelId, binding, text, photos, state: 'reserved', expires_at: now + TTL, created_at: new Date(now).toISOString() };
  });
  return { id, state: data.result.state, expires_at: data.result.expires_at, ...counts(data.value.entries, now) };
}

async function entryFor(env, record, modelId, id, now, write = true) {
  assertTravelModel(record, modelId, write);
  if (!validId(id)) throw travelError('travel_submission_invalid', 400);
  const data = await ledger(env, record.fields.session_id), entry = data.value.entries[id];
  if (!entry || entry.model_id !== modelId || entry.binding !== await travelBinding(record)) throw travelError('travel_submission_unavailable', 404);
  if (write && entry.state !== 'saved' && (entry.state !== 'reserved' || entry.expires_at <= now)) throw travelError('travel_reservation_expired');
  return { ...data, entry };
}

export async function readBoundedTravelBody(request, max) {
  if (Number(request.headers.get('content-length')) > max) throw travelError('travel_body_too_large', 413);
  if (!request.body) throw travelError('travel_body_missing', 400);
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw travelError('travel_body_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

// Client re-encodes oriented images to JPEG. Reject EXIF/XMP/ICC/comments and
// trailers on the server too; accepting a declared MIME alone is insufficient.
export function validateTravelJpeg(bytes) {
  const bad = () => { throw travelError('travel_image_invalid_or_metadata', 400); };
  if (bytes.length < 20 || bytes[0] !== 255 || bytes[1] !== 216) bad();
  let offset = 2, dimensions = false, scan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) bad();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) { if (!dimensions || !scan || offset !== bytes.length) bad(); return true; }
    if (marker === 0 || marker === 216 || marker === 254 || (marker >= 225 && marker <= 239)) bad();
    if (offset + 2 > bytes.length) bad();
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) bad();
    if ([192, 193, 194].includes(marker)) {
      if (length < 8) bad();
      const height = bytes[offset + 3] * 256 + bytes[offset + 4], width = bytes[offset + 5] * 256 + bytes[offset + 6];
      if (!height || !width || width > 4096 || height > 4096) bad();
      dimensions = true;
    }
    offset += length;
    if (marker === 218) {
      scan = true;
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || (next >= 208 && next <= 215)) { offset += 2; continue; }
        if (next === 255) { offset++; continue; }
        break;
      }
    }
  }
  bad();
}

export async function uploadTravelPhoto(env, record, modelId, id, index, request, now = Date.now()) {
  const data = await entryFor(env, record, modelId, id, now), spec = data.entry.photos[index];
  if (!Number.isInteger(index) || !spec || request.headers.get('content-type') !== 'image/jpeg') throw travelError('travel_photo_invalid', 400);
  if (data.entry.state === 'saved') return { id, state: 'saved' };
  const bytes = await readBoundedTravelBody(request, Math.min(TRAVEL_IMAGE_MAX, spec.size));
  if (bytes.length !== spec.size) throw travelError('travel_photo_size_mismatch', 400);
  validateTravelJpeg(bytes);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== spec.sha256) throw travelError('travel_photo_digest_mismatch', 400);
  const key = objectKey(data.root, id, index);
  await data.bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' }, customMetadata: { sha256: hash, binding: data.entry.binding },
  });
  // A cancellation/expiry never resurrects an upload. Deterministic object
  // references remain in the ledger, so cleanup can recover after a crash.
  try { await entryFor(env, record, modelId, id, Date.now()); }
  catch (error) { await data.bucket.delete(key); throw error; }
  return { id, index, state: 'uploaded' };
}

export async function commitTravelSubmission(env, record, modelId, id, now = Date.now()) {
  const data = await entryFor(env, record, modelId, id, now);
  if (data.entry.state === 'saved') return { id, state: 'saved', duplicate: true };
  for (const [index, spec] of data.entry.photos.entries()) {
    const object = await data.bucket.head(objectKey(data.root, id, index));
    if (!object || object.size !== spec.size || object.httpMetadata?.contentType !== 'image/jpeg' || object.customMetadata?.sha256 !== spec.sha256 || object.customMetadata?.binding !== data.entry.binding) throw travelError('travel_upload_incomplete');
  }
  // Ownership and lifecycle are read afresh immediately before the commit.
  const fresh = await readTravelSession(env, record.fields.session_id);
  assertTravelModel(fresh, modelId, true);
  if (await travelBinding(fresh) !== data.entry.binding) throw travelError('travel_binding_changed');
  await mutate(env, record.fields.session_id, value => {
    const entry = value.entries[id];
    if (!entry || entry.binding !== data.entry.binding) throw travelError('travel_binding_changed');
    if (entry.state === 'saved') return;
    if (entry.state !== 'reserved' || entry.expires_at <= now) throw travelError('travel_reservation_expired');
    entry.state = 'saved'; entry.saved_at = new Date(now).toISOString();
  });
  return { id, state: 'saved', duplicate: false };
}

export async function cancelTravelSubmission(env, record, modelId, id, now = Date.now()) {
  await entryFor(env, record, modelId, id, now, false);
  await mutate(env, record.fields.session_id, value => {
    const entry = value.entries[id];
    if (entry.state === 'saved') throw travelError('travel_already_saved');
    entry.state = 'cancelled';
  });
  await cleanupTravelReservations(env, record.fields.session_id, now);
  return { id, state: 'cancelled' };
}

export async function cleanupTravelReservations(env, sessionId, now = Date.now()) {
  let data = await ledger(env, sessionId);
  if (Object.values(data.value.entries).some(e => e.state === 'reserved' && e.expires_at <= now)) {
    data = await mutate(env, sessionId, value => {
      for (const e of Object.values(value.entries)) if (e.state === 'reserved' && e.expires_at <= now) e.state = 'expired';
    });
  }
  for (const e of Object.values(data.value.entries)) if (['cancelled', 'expired'].includes(e.state)) {
    for (const index of e.photos.keys()) await data.bucket.delete(objectKey(data.root, e.id, index));
  }
}

export async function projectTravel(env, record, role = 'customer', now = Date.now()) {
  const sessionId = record.fields.session_id, binding = await travelBinding(record), state = travelState(record);
  await cleanupTravelReservations(env, sessionId, now);
  const data = await ledger(env, sessionId);
  const eta = await resolveTravelEta(env, record, now);
  const entries = Object.values(data.value.entries).filter(e => e.binding === binding && (e.state === 'saved' || role === 'model'));
  return {
    ok: true, session_id: sessionId, state, revision: data.value.revision, binding, server_now: new Date(now).toISOString(),
    eta, can_send: role === 'model' && canWriteTravel(record), text_max: TRAVEL_TEXT_MAX, image_max_bytes: TRAVEL_IMAGE_MAX,
    ...(role === 'model' ? counts(data.value.entries, now) : {}),
    submissions: entries.map(e => ({ id: e.id, state: e.state, text: e.text, saved_at: e.saved_at || null,
      ...(role === 'model' ? { request_key: e.key } : {}),
      photos: e.photos.map((_, index) => ({ id: `${e.id}_${index}` })),
    })),
  };
}

export async function travelPhotoResponse(env, record, mediaId) {
  const match = /^([a-f0-9]{64})_([0-2])$/.exec(mediaId || '');
  if (!match) throw travelError('travel_photo_unavailable', 404);
  const data = await ledger(env, record.fields.session_id), entry = data.value.entries[match[1]], index = Number(match[2]);
  if (!entry || entry.state !== 'saved' || !entry.photos[index] || entry.binding !== await travelBinding(record)) throw travelError('travel_photo_unavailable', 404);
  const object = await data.bucket.get(objectKey(data.root, entry.id, index));
  if (!object || object.size !== entry.photos[index].size || object.httpMetadata?.contentType !== 'image/jpeg' || object.customMetadata?.binding !== entry.binding || object.customMetadata?.sha256 !== entry.photos[index].sha256) throw travelError('travel_photo_unavailable', 404);
  return new Response(object.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin', 'content-security-policy': "default-src 'none'" } });
}

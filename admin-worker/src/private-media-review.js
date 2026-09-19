import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { mediaRequest, mediaTable, mediaKind, privateKey, readMediaByRecord, assertPrivateObject } from '../../shared/private-media.mjs';
import coreWorker from './index.js';
import { renderPrivateMediaReview } from './private-media-review-page.js';

export const REVIEW_PAGE = '/internal/admin/mmd-review';
export const REVIEW_API = '/v1/admin/private-media';
const ORIGINS = new Set(['https://mmdbkk.com', 'https://www.mmdbkk.com']);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' };
const json = (body, status = 200) => Response.json(body, { status, headers });

export function isPrivateMediaReviewRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  return path.startsWith(REVIEW_PAGE) || path.startsWith(REVIEW_API);
}

export async function handlePrivateMediaReview(request, env, ctx) {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
  if (!ORIGINS.has(url.origin)) return json({ ok: false, error: 'forbidden_origin' }, 403);
  // This browser surface never accepts service credentials or Model authority.
  if (request.headers.has('authorization') || request.headers.has('x-confirm-key')) return json({ ok: false, error: 'browser_admin_session_required' }, 403);
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) {
    if (path === REVIEW_PAGE && request.method === 'GET') return new Response(null, { status: 303, headers: { ...headers, location: `/internal/admin/login?next=${encodeURIComponent(REVIEW_PAGE)}` } });
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!['admin', 'owner'].includes(actor.role)) return json({ ok: false, error: 'admin_required' }, 403);
  if (path === REVIEW_PAGE && ['GET', 'HEAD'].includes(request.method)) {
    const nonce = crypto.randomUUID();
    return new Response(request.method === 'HEAD' ? null : renderPrivateMediaReview(nonce), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'x-mmd-admin-surface': 'private-media-review', 'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src blob:; media-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
  }
  try {
    if (path === REVIEW_API && request.method === 'GET') {
      if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ ok: false, error: 'forbidden_origin' }, 403);
      return json(await listPrivateMediaReview(env, url.searchParams));
    }
    if ([REVIEW_API + '/file', REVIEW_API + '/decision'].includes(path) && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'forbidden_origin' }, 403);
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'json_required' }, 415);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
      const decision = path.endsWith('/decision');
      if (decision) {
        if (!['approve', 'reject', 'revoke'].includes(input.decision)) return json({ ok: false, error: 'invalid_decision' }, 400);
        if (typeof input.note !== 'string' || input.note.length > 1000 || (input.decision !== 'approve' && !input.note.trim())) return json({ ok: false, error: 'review_note_required' }, 400);
        const media = await readMediaByRecord(env, input.media_asset_id);
        const expected = input.decision === 'revoke' ? 'approved' : 'pending_review';
        if (input.expected_status !== expected || media.fields?.review_status !== expected) return json({ ok: false, error: 'media_review_state_conflict' }, 409);
        const asset = await assertPrivateObject(env, media);
        if (input.media_sha256 !== asset.sha256) return json({ ok: false, error: 'review_again_required' }, 409);
      }
      // Reuse the existing canonical audit and media decision writer. Forward
      // only allowlisted fields; the signed session remains the actor source.
      const body = { model_id: input.model_id, media_asset_id: input.media_asset_id };
      if (decision) Object.assign(body, { decision: input.decision, note: input.note.trim() });
      const target = new URL(decision ? '/v1/model/media/review-decision' : '/v1/model/media/review-file', url.origin);
      const response = await coreWorker.fetch(new Request(target, { method: 'POST', headers: { cookie: request.headers.get('cookie') || '', origin: url.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, ctx);
      if (!response.ok) return json({ ok: false, error: 'review_action_failed' }, response.status);
      if (!decision) {
        const resultHeaders = new Headers(response.headers);
        const media = await readMediaByRecord(env, input.media_asset_id);
        const asset = await assertPrivateObject(env, media);
        resultHeaders.set('x-mmd-media-sha256', asset.sha256);
        for (const [key, value] of Object.entries(headers)) resultHeaders.set(key, value);
        return new Response(response.body, { headers: resultHeaders });
      }
      // Do not announce success until the canonical media flags read back.
      const media = await readMediaByRecord(env, input.media_asset_id);
      const approved = input.decision === 'approve', f = media.fields || {};
      if (f.review_status !== (approved ? 'approved' : 'rejected') || Boolean(f.private_safe) !== approved || Boolean(f.flash_safe) !== approved || f.public_safe === true) return json({ ok: false, error: 'decision_readback_failed' }, 503);
      return json({ ok: true, status: f.review_status, decision: input.decision });
    }
    return json({ ok: false, error: 'not_found' }, 404);
  } catch (error) {
    return json({ ok: false, error: error?.code || 'private_media_review_unavailable' }, error?.status || 503);
  }
}

export async function listPrivateMediaReview(env, params) {
  const status = params.get('status') || 'pending_review';
  if (!['pending_review', 'approved', 'rejected'].includes(status)) throw Object.assign(new Error(), { code: 'invalid_status', status: 400 });
  const cursor = params.get('cursor') || '';
  if (cursor.length > 1000) throw Object.assign(new Error(), { code: 'invalid_cursor', status: 400 });
  const query = new URLSearchParams({ pageSize: '25', filterByFormula: `AND(OR({media_type}='flash_preview',{media_type}='private_gallery'),{review_status}='${status}')`, 'sort[0][field]': 'uploaded_at', 'sort[0][direction]': 'desc' });
  if (cursor) query.set('offset', cursor);
  for (const field of ['media_id', 'Model', 'media_type', 'review_status', 'file_name', 'file_type', 'file_size_bytes', 'uploaded_at', 'r2_bucket', 'private_original_key']) query.append('fields[]', field);
  const result = await mediaRequest(env, mediaTable(env), `?${query}`);
  if (!Array.isArray(result.records)) throw new Error('invalid_registry_response');
  const items = result.records.map(record => {
    const f = record.fields || {};
    let reviewable = false;
    try { privateKey(f); reviewable = f.Model?.length === 1 && !!mediaKind(f.file_type); } catch { /* legacy originals remain locked */ }
    return { id: record.id, model_id: f.Model?.length === 1 ? f.Model[0] : '', media_id: f.media_id || '', name: String(f.file_name || 'Private media').slice(0, 160), kind: mediaKind(f.file_type), status: f.review_status, size: f.file_size_bytes || 0, uploaded_at: f.uploaded_at || '', reviewable };
  });
  const ids = [...new Set(items.map(item => item.model_id).filter(id => /^rec[a-zA-Z0-9]+$/.test(id)))];
  if (ids.length) {
    const lookup = new URLSearchParams({ filterByFormula: 'OR(' + ids.map(id => `RECORD_ID()='${id}'`).join(',') + ')', maxRecords: '25' });
    const models = await mediaRequest(env, env.AIRTABLE_TABLE_MODELS || 'models', `?${lookup}`);
    const names = new Map((models.records || []).map(record => {
      const f = record.fields || {};
      return [record.id, String(f.working_name || f.display_name || f['Display Name'] || f.nickname || f.Nickname || f.name || f.Name || record.id).slice(0, 100)];
    }));
    for (const item of items) item.model_name = names.get(item.model_id) || item.model_id;
  }
  return { ok: true, items, next_cursor: result.offset || null };
}

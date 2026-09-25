import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { mediaRequest, mediaTable, mediaKind, privateKey, readMedia, readMediaByRecord, assertPrivateObject, planPrivateUpload, uploadPrivateMedia } from '../../shared/private-media.mjs';
import coreWorker from './index.js';
import { renderPrivateMediaReview } from './private-media-review-page.js';
import { readOwnerApprovedDriveMedia } from './google-drive-owner-media.js';
import { handlePrivateMediaIngestOnce, handlePrivateMediaStagedIngest, isPrivateMediaIngestOnceRequest, PRIVATE_MEDIA_INGEST_STAGED_PATH } from './private-media-ingest-once.js';

export const REVIEW_PAGE = '/internal/admin/mmd-review';
export const REVIEW_API = '/v1/admin/private-media';
export const OWNER_UPLOAD_PAGE = `${REVIEW_PAGE}/upload`;
export const OWNER_UPLOAD_PLAN_API = `${REVIEW_API}/upload-plan`;
export const OWNER_UPLOAD_API = `${REVIEW_API}/upload`;
export const OWNER_DRIVE_IMPORT_API = `${REVIEW_API}/import-approved-drive`;
const ORIGINS = new Set(['https://mmdbkk.com', 'https://www.mmdbkk.com']);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' };
const json = (body, status = 200) => Response.json(body, { status, headers });
const PUBLIC_MEDIA_TYPES = new Set(['profile_photo', 'public_gallery', 'intro_video']);

async function assertPublicMediaObject(env, record) {
  const fields = record?.fields || {};
  if (!PUBLIC_MEDIA_TYPES.has(String(fields.media_type || '').trim().toLowerCase())) throw Object.assign(new Error(), { code: 'public_media_policy_invalid', status: 409 });
  if (fields.r2_bucket !== 'mmd-models' || !env.MMD_MODEL_ASSETS?.head || !env.MMD_MODEL_ASSETS?.get) throw Object.assign(new Error(), { code: 'public_media_storage_unavailable', status: 503 });
  const modelId = Array.isArray(fields.Model) && fields.Model.length === 1 ? fields.Model[0] : '';
  const key = String(fields.private_original_key || '');
  if (!/^rec[a-zA-Z0-9]+$/.test(modelId) || !key.startsWith(`models/${modelId}/`) || key.includes('..')) throw Object.assign(new Error(), { code: 'public_media_storage_mismatch', status: 409 });
  const object = await env.MMD_MODEL_ASSETS.head(key);
  const sha256 = object?.customMetadata?.sha256 || '';
  if (!object || object.size !== fields.file_size_bytes || object.httpMetadata?.contentType !== fields.file_type || object.customMetadata?.media_id !== fields.media_id || object.customMetadata?.model_record_id !== modelId || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw Object.assign(new Error(), { code: 'public_media_object_unverified', status: 503 });
  }
  return { key, contentType: fields.file_type, size: object.size, sha256 };
}

export function isPrivateMediaReviewRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  return path.startsWith(REVIEW_PAGE) || path.startsWith(REVIEW_API);
}

export async function handlePrivateMediaReview(request, env, ctx) {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
  if (!ORIGINS.has(url.origin)) return json({ ok: false, error: 'forbidden_origin' }, 403);
  // One-time ingest is server-to-server capability auth, intentionally handled before browser admin-session enforcement.
  if (isPrivateMediaIngestOnceRequest(request)) return handlePrivateMediaIngestOnce(request, env);
  // This browser surface never accepts service credentials or Model authority.
  if (request.headers.has('authorization') || request.headers.has('x-confirm-key')) return json({ ok: false, error: 'browser_admin_session_required' }, 403);
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) {
    if ([REVIEW_PAGE, OWNER_UPLOAD_PAGE].includes(path) && request.method === 'GET') return new Response(null, { status: 303, headers: { ...headers, location: `/internal/admin/login?next=${encodeURIComponent(path)}` } });
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!['admin', 'owner'].includes(actor.role)) return json({ ok: false, error: 'admin_required' }, 403);
  if (path === REVIEW_PAGE && ['GET', 'HEAD'].includes(request.method)) {
    const nonce = crypto.randomUUID();
    return new Response(request.method === 'HEAD' ? null : renderPrivateMediaReview(nonce), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'x-mmd-admin-surface': 'private-media-review', 'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src blob:; media-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
  }
  if (path === OWNER_UPLOAD_PAGE && ['GET', 'HEAD'].includes(request.method)) {
    const nonce = crypto.randomUUID();
    return new Response(request.method === 'HEAD' ? null : renderOwnerPrivateMediaUpload(nonce), {
      headers: {
        ...headers,
        'content-type': 'text/html; charset=utf-8',
        'x-mmd-admin-surface': 'private-media-owner-upload',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      },
    });
  }
  try {
    if (path === PRIVATE_MEDIA_INGEST_STAGED_PATH && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'forbidden_origin' }, 403);
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'json_required' }, 415);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
      return handlePrivateMediaStagedIngest(input, env, { actorId: actor.id });
    }
    if (path === OWNER_UPLOAD_PLAN_API && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'forbidden_origin' }, 403);
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'json_required' }, 415);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
      const modelId = String(input.model_id || '').trim();
      if (!/^rec[a-zA-Z0-9]+$/.test(modelId)) return json({ ok: false, error: 'model_id_required' }, 400);
      const plan = await planPrivateUpload(env, modelId, {
        file_name: input.file_name,
        content_type: input.content_type,
        file_size_bytes: input.file_size_bytes,
      });
      return json({ ok: true, asset_id: plan.asset_id, status: plan.status, upload_url: `${OWNER_UPLOAD_API}?asset_id=${encodeURIComponent(plan.asset_id)}&model_id=${encodeURIComponent(modelId)}` });
    }
    if (path === OWNER_UPLOAD_API && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'forbidden_origin' }, 403);
      const modelId = url.searchParams.get('model_id') || '';
      const assetId = url.searchParams.get('asset_id') || '';
      if (!/^rec[a-zA-Z0-9]+$/.test(modelId) || !/^media_[a-zA-Z0-9-]+$/.test(assetId)) return json({ ok: false, error: 'upload_identity_invalid' }, 400);
      const result = await uploadPrivateMedia(request, env, modelId, assetId, { requestedBy: `owner:${actor.id}` });
      return json({ ok: result.ok === true, asset_id: result.asset_id, status: result.status });
    }
    if (path === OWNER_DRIVE_IMPORT_API && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'forbidden_origin' }, 403);
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'json_required' }, 415);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
      const modelId = String(input.model_id || '').trim();
      const fileName = String(input.file_name || '').trim().slice(0, 240);
      if (!/^rec[a-zA-Z0-9]+$/.test(modelId)) return json({ ok: false, error: 'model_id_required' }, 400);
      if (!fileName || /[\x00-\x1f/\\]/.test(fileName)) return json({ ok: false, error: 'drive_file_name_invalid' }, 400);

      const model = await mediaRequest(env, env.AIRTABLE_TABLE_MODELS || 'models', `/${encodeURIComponent(modelId)}`);
      const mf = model?.fields || {};
      const folderId = String(mf.drive_folder_id || '').trim();
      const notes = String(mf.notes || '');
      const approvedFolder = String(mf.folder_approval_status || '').trim();
      if (!/^[A-Za-z0-9_-]{10,180}$/.test(folderId)) return json({ ok: false, error: 'approved_drive_folder_missing' }, 409);
      if (approvedFolder && approvedFolder !== 'Approved Folder Inventory') return json({ ok: false, error: 'drive_folder_not_approved' }, 409);
      if (!notes.includes(fileName) || !/private\s+teaser/i.test(notes) || !/verified\s*line|line[-\s]*verified/i.test(notes)) {
        return json({ ok: false, error: 'private_teaser_source_not_owner_approved' }, 409);
      }
      const source = await readOwnerApprovedDriveMedia(env, { folderId, fileName });
      const contentType = source.contentType;
      const bytes = source.bytes;

      const plan = await planPrivateUpload(env, modelId, {
        file_name: fileName,
        content_type: contentType,
        file_size_bytes: bytes.length,
      });
      const uploadRequest = new Request('https://private-media-import.internal/upload', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: bytes,
      });
      const result = await uploadPrivateMedia(uploadRequest, env, modelId, plan.asset_id, {
        requestedBy: `owner:${actor.id}:approved_drive_import`,
      });
      const record = await readMedia(env, plan.asset_id);
      return json({
        ok: result.ok === true,
        asset_id: result.asset_id,
        media_asset_id: record.id,
        status: result.status,
        review_required: true,
        source: 'approved_model_drive',
      });
    }
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
      const media = await readMediaByRecord(env, input.media_asset_id);
      const publicCandidate = PUBLIC_MEDIA_TYPES.has(String(media.fields?.media_type || '').trim().toLowerCase());
      if (decision) {
        if (!['approve', 'reject', 'revoke'].includes(input.decision)) return json({ ok: false, error: 'invalid_decision' }, 400);
        if (typeof input.note !== 'string' || input.note.length > 1000 || (input.decision !== 'approve' && !input.note.trim())) return json({ ok: false, error: 'review_note_required' }, 400);
        const expected = input.decision === 'revoke' ? 'approved' : 'pending_review';
        if (input.expected_status !== expected || media.fields?.review_status !== expected) return json({ ok: false, error: 'media_review_state_conflict' }, 409);
        const asset = publicCandidate ? await assertPublicMediaObject(env, media) : await assertPrivateObject(env, media);
        if (input.media_sha256 !== asset.sha256) return json({ ok: false, error: 'review_again_required' }, 409);
      }
      if (publicCandidate) {
        const modelId = Array.isArray(media.fields?.Model) && media.fields.Model.length === 1 ? media.fields.Model[0] : '';
        if (input.model_id !== modelId) return json({ ok: false, error: 'media_owner_mismatch' }, 403);
        const asset = await assertPublicMediaObject(env, media);
        if (!decision) {
          const object = await env.MMD_MODEL_ASSETS.get(asset.key);
          if (!object?.body || object.customMetadata?.sha256 !== asset.sha256) return json({ ok: false, error: 'media_unavailable' }, 503);
          return new Response(object.body, { headers: { ...headers, 'content-type': asset.contentType, 'x-mmd-media-sha256': asset.sha256 } });
        }
        const approved = input.decision === 'approve';
        const status = approved ? 'approved' : 'rejected';
        await mediaRequest(env, env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || 'MMD — Model Review Requests', '', {
          method: 'POST',
          body: JSON.stringify({ fields: {
            request_id: `public_media_review_${media.fields.media_id}_${Date.now()}`,
            Model: [modelId], request_type: 'media', request_status: status,
            requested_by: `admin:${actor.id}`, requested_at: new Date().toISOString(), linked_media_assets: [media.id],
            decision_note: input.note.trim(),
            payload_json: JSON.stringify({ decision: input.decision, media_sha256: asset.sha256, source: 'public_media_review_v1' }),
          }, typecast: false }),
        });
        await mediaRequest(env, mediaTable(env), `/${media.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { review_status: status, public_safe: approved, private_safe: false, flash_safe: false, teaser_safe: false }, typecast: false }),
        });
        const readback = await readMediaByRecord(env, media.id);
        if (readback.fields?.review_status !== status || Boolean(readback.fields?.public_safe) !== approved || readback.fields?.private_safe === true || readback.fields?.teaser_safe === true) {
          return json({ ok: false, error: 'decision_readback_failed' }, 503);
        }
        return json({ ok: true, status, decision: input.decision, audience: 'public' });
      }
      // Reuse the existing canonical audit and media decision writer. Forward
      // only allowlisted fields; the signed session remains the actor source.
      const body = { model_id: input.model_id, media_asset_id: input.media_asset_id };
      const requestedTeaser = decision && input.decision === 'approve' && input.teaser_safe === true;
      if (decision) Object.assign(body, { decision: input.decision, note: input.note.trim(), teaser_safe: requestedTeaser });
      const target = new URL(decision ? '/v1/model/media/review-decision' : '/v1/model/media/review-file', url.origin);
      const response = await coreWorker.fetch(new Request(target, { method: 'POST', headers: { cookie: request.headers.get('cookie') || '', origin: url.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, ctx);
      if (!response.ok) return json({ ok: false, error: 'review_action_failed' }, response.status);
      if (!decision) {
        const resultHeaders = new Headers(response.headers);
        const currentMedia = await readMediaByRecord(env, input.media_asset_id);
        const asset = await assertPrivateObject(env, currentMedia);
        resultHeaders.set('x-mmd-media-sha256', asset.sha256);
        for (const [key, value] of Object.entries(headers)) resultHeaders.set(key, value);
        return new Response(response.body, { headers: resultHeaders });
      }
      // Do not announce success until the canonical media flags read back.
      const currentMedia = await readMediaByRecord(env, input.media_asset_id);
      const approved = input.decision === 'approve', f = currentMedia.fields || {};
      const expectedTeaserSafe = approved && requestedTeaser;
      if (
        f.review_status !== (approved ? 'approved' : 'rejected') ||
        Boolean(f.private_safe) !== approved ||
        Boolean(f.flash_safe) !== approved ||
        Boolean(f.teaser_safe) !== expectedTeaserSafe ||
        f.public_safe === true
      ) return json({ ok: false, error: 'decision_readback_failed' }, 503);
      return json({ ok: true, status: f.review_status, decision: input.decision, teaser_safe: Boolean(f.teaser_safe) });
    }
    return json({ ok: false, error: 'not_found' }, 404);
  } catch (error) {
    return json({ ok: false, error: error?.code || 'private_media_review_unavailable' }, error?.status || 503);
  }
}

function renderOwnerPrivateMediaUpload(nonce) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private Teaser Upload · MMD</title><style nonce="${nonce}">:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#fff0dc;background:#0d0a08}body{margin:0;background:#0d0a08}main{max-width:620px;margin:auto;padding:32px 20px 48px}h1{font-size:24px;margin:0 0 8px}p{line-height:1.55;color:#cfbda7}.card{border:1px solid #554334;border-radius:14px;padding:18px;margin-top:20px;background:#15100d}label{display:block;margin-top:16px;font-weight:650}input{box-sizing:border-box;width:100%;margin-top:7px;padding:12px;border-radius:9px;border:1px solid #67523d;background:#0d0a08;color:#fff0dc;font:inherit}button{margin-top:20px;border:0;border-radius:9px;padding:12px 16px;background:#c79a56;color:#1a1006;font:inherit;font-weight:750;cursor:pointer}button:disabled{opacity:.55;cursor:wait}#state{white-space:pre-wrap;margin-top:18px;line-height:1.5;color:#f1d9ae}.back{color:#f1d9ae}small{display:block;color:#bda890;margin-top:8px;line-height:1.45}</style></head><body><main><a class="back" href="${REVIEW_PAGE}">← กลับไปตรวจ Private Media</a><h1>อัปโหลด Private Teaser</h1><p>ไฟล์จะเข้าพื้นที่ private เท่านั้น และจะอยู่สถานะรอตรวจจนกดอนุมัติแยกในหน้า Review</p><section class="card"><label>Model record ID<input id="model" autocomplete="off" placeholder="rec…"></label><label>รูปหรือคลิป<input id="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4"></label><small>รูป JPG/PNG/WebP สูงสุด 25 MB · คลิป MP4 สูงสุด 25 MB</small><button id="submit" type="button">อัปโหลดเพื่อรอตรวจ</button><output id="state" aria-live="polite"></output></section></main><script nonce="${nonce}">(()=>{const q=new URLSearchParams(location.search),model=document.querySelector('#model'),file=document.querySelector('#file'),button=document.querySelector('#submit'),state=document.querySelector('#state');model.value=q.get('model_id')||'';const say=t=>state.textContent=t;button.addEventListener('click',async()=>{const selected=file.files&&file.files[0],modelId=model.value.trim();if(!/^rec[a-zA-Z0-9]+$/.test(modelId))return say('กรุณาใส่ Model record ID ที่ถูกต้อง');if(!selected)return say('กรุณาเลือกไฟล์');button.disabled=true;say('กำลังสร้างรายการ private media…');try{const planResponse=await fetch('${OWNER_UPLOAD_PLAN_API}',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({model_id:modelId,file_name:selected.name,content_type:selected.type,file_size_bytes:selected.size})});const plan=await planResponse.json();if(!planResponse.ok||!plan.ok)throw new Error(plan.error||'upload_plan_failed');say('กำลังอัปโหลดเข้า private media…');const uploadResponse=await fetch(plan.upload_url,{method:'POST',credentials:'same-origin',headers:{'content-type':selected.type},body:selected});const upload=await uploadResponse.json();if(!uploadResponse.ok||!upload.ok)throw new Error(upload.error||'upload_failed');say('อัปโหลดแล้ว · รอตรวจและอนุมัติ Private Teaser ในหน้า Review');location.assign('${REVIEW_PAGE}?status=pending_review')}catch(error){say('ยังอัปโหลดไม่ได้: '+(error&&error.message||'unknown_error'));button.disabled=false}})})();</script></body></html>`;
}

export async function listPrivateMediaReview(env, params) {
  const status = params.get('status') || 'pending_review';
  if (!['pending_review', 'approved', 'rejected'].includes(status)) throw Object.assign(new Error(), { code: 'invalid_status', status: 400 });
  const cursor = params.get('cursor') || '';
  if (cursor.length > 1000) throw Object.assign(new Error(), { code: 'invalid_cursor', status: 400 });
  const query = new URLSearchParams({ pageSize: '25', filterByFormula: `AND(OR({media_type}='flash_preview',{media_type}='private_gallery',{media_type}='profile_photo',{media_type}='public_gallery',{media_type}='intro_video'),{review_status}='${status}')`, 'sort[0][field]': 'uploaded_at', 'sort[0][direction]': 'desc' });
  if (cursor) query.set('offset', cursor);
  for (const field of ['media_id', 'Model', 'media_type', 'review_status', 'teaser_safe', 'file_name', 'file_type', 'file_size_bytes', 'uploaded_at', 'r2_bucket', 'private_original_key']) query.append('fields[]', field);
  const result = await mediaRequest(env, mediaTable(env), `?${query}`);
  if (!Array.isArray(result.records)) throw new Error('invalid_registry_response');
  const items = result.records.map(record => {
    const f = record.fields || {};
    const publicCandidate = PUBLIC_MEDIA_TYPES.has(String(f.media_type || '').trim().toLowerCase());
    let reviewable = false;
    try {
      if (publicCandidate) reviewable = f.Model?.length === 1 && f.r2_bucket === 'mmd-models' && String(f.private_original_key || '').startsWith(`models/${f.Model[0]}/`);
      else { privateKey(f); reviewable = f.Model?.length === 1 && !!mediaKind(f.file_type); }
    } catch { /* legacy or mismatched originals remain locked */ }
    const kind = publicCandidate ? (f.media_type === 'intro_video' ? 'public_clip' : 'public_pic') : mediaKind(f.file_type);
    return { id: record.id, model_id: f.Model?.length === 1 ? f.Model[0] : '', media_id: f.media_id || '', name: String(f.file_name || (publicCandidate ? 'Public candidate' : 'Private media')).slice(0, 160), audience: publicCandidate ? 'public' : 'private', kind, status: f.review_status, teaser_safe: f.teaser_safe === true, size: f.file_size_bytes || 0, uploaded_at: f.uploaded_at || '', reviewable };
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

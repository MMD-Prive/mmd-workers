const API = 'https://api.airtable.com/v0';
const PAGE = '/internal/admin/my-mmd/your-request';
const API_PATH = '/v1/admin/my-mmd/your-request';
const EVIDENCE_PATH = '/v1/admin/my-mmd/your-request/evidence';
const SOURCE = 'my_mmd_liff';
const INTENT = 'your_request';
const TABLE_DEFAULT = 'MMD — Console Inbox';
const STATES = new Set(['received', 'searching', 'needs_more_info', 'reviewing', 'closed']);
const IDENTITY_STATES = new Set(['confirmed', 'unverified', 'unknown']);

export function isByYourRequestAdminPage(path, method = 'GET') { return path === PAGE && ['GET', 'HEAD'].includes(String(method).toUpperCase()); }
export function isByYourRequestAdminApi(path, method = 'GET') { const m = String(method).toUpperCase(); return path === API_PATH && ['GET', 'POST'].includes(m) || path === EVIDENCE_PATH && m === 'POST'; }

export async function handleByYourRequestAdmin(request, env, actor) {
  if (!actor?.id) return new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path === PAGE) return renderPage(request);
  if (path === EVIDENCE_PATH) return proxyEvidence(request, env);
  if (request.method === 'GET') return listRequests(request, env);
  return mutateRequest(request, env, actor);
}

async function listRequests(request, env) {
  const url = new URL(request.url); const q = clean(url.searchParams.get('q'), 160).toLowerCase(); const status = clean(url.searchParams.get('status'), 40);
  try {
  const records = await listInbox(env);
    const items = records.map(recordToItem).filter(Boolean).filter(item => !status || item.status === status).filter(item => !q || JSON.stringify(item).toLowerCase().includes(q)).slice(0, 100);
    return json({ ok: true, authority: 'mmd.admin.by_your_request.v1', items });
  } catch (error) { return json({ ok: false, error: error.code || 'REQUEST_QUEUE_UNAVAILABLE' }, error.status || 503); }
}

async function mutateRequest(request, env, actor) {
  const body = await request.json().catch(() => null); if (!body || !clean(body.record_id, 40)) return json({ ok: false, error: 'INVALID_REQUEST' }, 400);
  try {
    const record = await airtableGet(env, body.record_id); const item = recordToItem(record); if (!item) return json({ ok: false, error: 'REQUEST_NOT_FOUND' }, 404);
    const payload = parse(record.fields?.payload_json); const patch = {};
    if (body.status !== undefined) { const status = clean(body.status, 40); if (!STATES.has(status)) return json({ ok: false, error: 'INVALID_STATUS' }, 400); payload.status = status; patch.status = status; }
    if (body.identity_note !== undefined) {
      const note = validateIdentityNote(body.identity_note); if (!note.ok) return json({ ok: false, error: note.error }, 400);
      const next = Array.isArray(payload.identity_evidence) ? payload.identity_evidence.slice(-19) : [];
      next.push({ ...note.value, noted_at: new Date().toISOString(), noted_by: clean(actor.id, 120) }); payload.identity_evidence = next;
    }
    if (!Object.keys(patch).length && body.identity_note === undefined) return json({ ok: false, error: 'NO_MUTATION' }, 400);
    patch.payload_json = JSON.stringify(payload); patch.admin_note = adminNote(payload);
    const updated = await airtablePatch(env, record.id, patch);
    return json({ ok: true, item: recordToItem(updated), identity_evidence: payload.identity_evidence || [] });
  } catch (error) { return json({ ok: false, error: error.code || 'REQUEST_QUEUE_UNAVAILABLE' }, error.status || 503); }
}

async function proxyEvidence(request, env) {
  const body = await request.json().catch(() => null); const recordId = clean(body?.record_id, 40); const evidenceId = clean(body?.evidence_id, 100);
  if (!recordId || !/^evidence_[a-f0-9]{32}$/.test(evidenceId)) return json({ ok: false, error: 'INVALID_REQUEST' }, 400);
  const record = await airtableGet(env, recordId).catch(() => null); const item = recordToItem(record); if (!item || !item.evidence_ids.includes(evidenceId)) return json({ ok: false, error: 'EVIDENCE_NOT_FOUND' }, 404);
  const binding = env.MEMBER_PAGES_REQUESTS; if (!binding?.fetch) return json({ ok: false, error: 'REQUEST_MEDIA_UNAVAILABLE' }, 503);
  const response = await binding.fetch(new Request('https://member-pages-worker.internal/__internal/admin/my-mmd/customer-request-evidence', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mmd-internal-call': 'true', 'x-mmd-service-binding': 'admin-worker' }, body: JSON.stringify({ line_user_id: item.line_user_id, evidence_id: evidenceId }) }));
  return new Response(response.body, { status: response.status, headers: response.headers });
}

function validateIdentityNote(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'IDENTITY_NOTE_INVALID' };
  const name = clean(input.name, 160); const source = clean(input.source, 500); const date = clean(input.conversation_date, 80); const state = clean(input.verification_state, 20);
  if (!source || !date || !IDENTITY_STATES.has(state) || Number.isNaN(Date.parse(date))) return { ok: false, error: 'IDENTITY_NOTE_PROVENANCE_REQUIRED' };
  return { ok: true, value: { name: name || null, source, conversation_date: new Date(date).toISOString(), verification_state: state, quote: clean(input.quote, 1000) || null } };
}

function recordToItem(record) { const payload = parse(record?.fields?.payload_json); if (!record?.id || payload.schema !== 'mmd_customer_request_v1' || payload.source === 'mms' || payload.request_type !== INTENT) return null; return { record_id: record.id, request_id: clean(payload.request_id, 100), line_user_id: clean(payload.line_user_id, 80), canonical_client_id: clean(payload.canonical_client_id, 80) || null, created_at: clean(payload.created_at, 80) || null, status: STATES.has(payload.status) ? payload.status : 'reviewing', model_name: clean(payload.model?.display_name, 160) || null, model_social: clean(payload.model?.social, 600) || null, reason: clean(payload.model?.reason, 1800) || null, audience: clean(payload.model?.audience, 20) || null, evidence_ids: Array.isArray(payload.evidence_ids) ? payload.evidence_ids.filter(x => /^evidence_[a-f0-9]{32}$/.test(x)).slice(0, 3) : [], identity_evidence: Array.isArray(payload.identity_evidence) ? payload.identity_evidence.slice(-20) : [], source: SOURCE, missing_original: payload.missing_original === true }; }
async function listInbox(env) { const out = []; let offset = ''; for (let page = 0; page < 100; page++) { const params = new URLSearchParams({ pageSize: '100', maxRecords: '100', filterByFormula: `AND({source}='${SOURCE}',{intent}='${INTENT}')` }); if (offset) params.set('offset', offset); const data = await airtable(env, '', `?${params}`); out.push(...(data.records || [])); offset = data.offset || ''; if (!offset) break; } return out; }
async function airtableGet(env, id) { return airtable(env, `/${encodeURIComponent(id)}`); }
async function airtablePatch(env, id, fields) { return airtable(env, `/${encodeURIComponent(id)}`, '?', { method: 'PATCH', body: JSON.stringify({ fields, typecast: false }) }); }
async function airtable(env, suffix = '', query = '', init = {}) { const key = clean(env.AIRTABLE_API_KEY, 2000); const base = clean(env.AIRTABLE_BASE_ID, 100); const table = clean(env.AIRTABLE_TABLE_CONSOLE_INBOX, 180) || TABLE_DEFAULT; if (!key || !base) throw Object.assign(new Error('airtable_not_configured'), { code: 'REQUEST_QUEUE_UNAVAILABLE', status: 503 }); const fetcher = env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch.bind(env.AIRTABLE_HTTP) : fetch; const response = await fetcher(`${API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}${suffix}${query}`, { ...init, headers: { authorization: `Bearer ${key}`, accept: 'application/json', ...(init.headers || {}) } }).catch(() => null); if (!response) throw Object.assign(new Error('airtable_unreachable'), { code: 'REQUEST_QUEUE_UNAVAILABLE', status: 503 }); const data = await response.json().catch(() => null); if (!response.ok) throw Object.assign(new Error('airtable_failed'), { code: response.status >= 500 ? 'REQUEST_QUEUE_UNAVAILABLE' : 'REQUEST_FAILED', status: response.status >= 500 ? 503 : response.status }); return data || {}; }
function renderPage(request) {
  const html = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>By Your Request · Admin</title><style>body{font:15px/1.5 system-ui;margin:0;background:#111;color:#eee}main{max-width:1100px;margin:auto;padding:24px}input,select,textarea,button{font:inherit;padding:9px;border-radius:8px;border:1px solid #555;background:#222;color:#eee}input,textarea{width:100%;box-sizing:border-box}button{cursor:pointer}.filters,.note{display:grid;grid-template-columns:2fr 1fr auto;gap:8px;margin:16px 0}.card{border:1px solid #444;border-radius:12px;padding:14px;margin:12px 0}.muted{color:#aaa}.note{grid-template-columns:1fr 2fr 1fr}.note textarea{min-height:38px}@media(max-width:700px){.filters,.note{grid-template-columns:1fr}}</style><main><p class="muted">MY MMD · Internal only</p><h1>By Your Request</h1><p>คำขอรูป / IG / TikTok · ตรวจหลักฐานและบันทึก identity evidence โดยไม่ยืนยันตัวตนอัตโนมัติ</p><div class="filters"><input id="q" placeholder="ค้นชื่อโมเดล, request id, canonical client"><select id="status"><option value="">ทุกสถานะ</option>${[...STATES].map(s=>`<option>${s}</option>`).join('')}</select><button id="load">ค้นหา</button></div><div id="list">กำลังโหลด…</div><script>(async()=>{const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function load(){const u=new URL('/v1/admin/my-mmd/your-request',location.origin);if($('q').value)u.searchParams.set('q',$('q').value);if($('status').value)u.searchParams.set('status',$('status').value);const d=await (await fetch(u,{credentials:'include'})).json();$('list').innerHTML=(d.items||[]).map(x=>'<article class="card"><b>'+esc(x.model_name||'未ระบุ')+'</b><div class="muted">'+esc(x.created_at||'')+' · '+esc(x.status)+' · '+esc(x.canonical_client_id||'identity unknown')+'</div><p>'+esc(x.reason||'')+'</p><p>Source: '+esc(x.source)+' · '+(x.missing_original?'missing_original':'media available')+'</p><label>สถานะ <select data-status="'+esc(x.record_id)+'">'+${JSON.stringify([...STATES])}.map(s=>'<option '+(s===x.status?'selected':'')+'>'+s+'</option>').join('')+'</select></label><div class="note"><input data-name="'+esc(x.record_id)+'" placeholder="ชื่อที่ยืนยันจากบทสนทนา"><input data-source="'+esc(x.record_id)+'" placeholder="แหล่งอ้างอิงแบบตรง เช่น LINE row/message"><input data-date="'+esc(x.record_id)+'" type="datetime-local"><select data-state="'+esc(x.record_id)+'"><option value="unknown">unknown</option><option value="unverified">unverified</option><option value="confirmed">confirmed</option></select><textarea data-quote="'+esc(x.record_id)+'" placeholder="ข้อความอ้างอิง"></textarea></div><button data-save="'+esc(x.record_id)+'">บันทึก</button></article>').join('')||'<p>ไม่พบรายการ</p>';document.querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{const id=b.dataset.save;const source=document.querySelector('[data-source="'+id+'"]').value;const date=document.querySelector('[data-date="'+id+'"]').value;const note=source&&date?{name:document.querySelector('[data-name="'+id+'"]').value,source,conversation_date:new Date(date).toISOString(),verification_state:document.querySelector('[data-state="'+id+'"]').value,quote:document.querySelector('[data-quote="'+id+'"]').value}:undefined;const r=await fetch('/v1/admin/my-mmd/your-request',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({record_id:id,status:document.querySelector('[data-status="'+id+'"]').value,identity_note:note})});if(!r.ok)alert('บันทึกไม่สำเร็จ');else load()})} $('load').onclick=load;load()})()</script></main></html>`;
  return new Response(request.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, private', 'x-mmd-admin-surface': 'by-your-request' } });
}
function adminNote(payload) { return `Your Request · ${clean(payload.model?.display_name, 160) || 'unknown'} · ${clean(payload.status, 40) || 'reviewing'}`; }
function parse(value) { try { const x = JSON.parse(String(value || '')); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } }
function clean(value, max = 240) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function json(data, status = 200) { return Response.json(data, { status, headers: { 'cache-control': 'no-store, private' } }); }

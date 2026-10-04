const PREFIX = '/internal/mms/admin';
const ID = /^mmst_[a-f0-9]{24}$/;
const JOB = /^mmsjob_[a-f0-9]{24}$/;
const text = (v, n = 160) => String(v ?? '').trim().slice(0, n);
const select = (v) => typeof v === 'object' ? text(v?.name) : text(v);
const object = (v) => { try { const x = JSON.parse(v || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
const reply = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };

export function therapistWorkspaceReadiness(record) {
  const f = record.fields || {};
  const operational = select(f.Status) === 'Active';
  const linked = select(f['Therapist Auth Status']) === 'Active' && Boolean(text(f['LINE Subject Hash'], 200));
  const approved = select(f['MY MMS Access']) === 'Approved';
  const available = select(f['Availability Status']) === 'Available';
  const blockers = [];
  if (!operational) blockers.push('THERAPIST_NOT_ACTIVE');
  if (!linked) blockers.push('LINE_NOT_LINKED');
  if (!approved) blockers.push('APP_NOT_APPROVED');
  const auth = select(f['Therapist Auth Status']);
  return {
    therapist_id: text(f['Therapist ID'], 80), display_name: text(f['Display Name']),
    status: select(f.Status), auth_status: auth || 'Unlinked', line_linked: linked,
    app_access: approved ? 'approved' : 'locked', can_open: operational && linked && approved,
    can_issue_invite: operational && !text(f['LINE Subject Hash'], 200) && !['Active', 'Suspended', 'Revoked'].includes(auth),
    availability_status: select(f['Availability Status']), matching_enabled: f['Matching Enabled'] === true,
    can_test: operational && linked && approved && available,
    blockers, invite_expires_at: text(f['Therapist Access Invite Expires At'], 80) || null,
  };
}

function jobProjection(record) {
  const f = record.fields || {}, p = object(f['Internal Payload JSON']);
  return {
    job_id: text(f['Job ID'], 80), service: text(f.Service), status: select(f['Job Status']),
    duration_minutes: Number(f['Duration Minutes']) || 0, area_label: text(f['Safe Area Label']),
    therapist_id: text(f['Accepted Therapist ID'] || p.target_therapist_id, 80) || null,
    is_test: p.is_test === true, coordinator_initialized: p.coordinator_initialized === true,
    payout_thb: typeof f['Therapist Payout THB'] === 'number' ? f['Therapist Payout THB'] : null,
    payment_state_label: text(f['Payment State Label']), updated_at: text(f['Updated At'], 80),
  };
}

export async function maybeHandleWorkspaceAdmin(request, env = {}) {
  const u = new URL(request.url);
  if (![`${PREFIX}/workspace`, `${PREFIX}/test-jobs`].includes(u.pathname)) return null;
  if (u.hostname !== text(env.MMS_INTERNAL_HOST || 'mms.internal')) return reply({ ok: false, error: { code: 'NOT_FOUND' } }, 404);
  try {
    if (u.pathname.endsWith('/workspace') && request.method === 'GET') {
      const [therapists, jobs, offers] = await Promise.all(['THERAPISTS', 'JOBS', 'OFFERS'].map(k => list(env, k)));
      return reply({ ok: true, complete: therapists.complete && jobs.complete && offers.complete,
        therapists: therapists.records.map(therapistWorkspaceReadiness),
        jobs: jobs.records.map(jobProjection).sort((a,b) => b.updated_at.localeCompare(a.updated_at)),
        offers: offers.records.map(r => ({ job_id: text(r.fields?.['Job ID'],80), therapist_id: text(r.fields?.['Therapist ID'],80), status: select(r.fields?.['Offer Status']), expires_at: text(r.fields?.['Expires At'],80) })),
      });
    }
    if (u.pathname.endsWith('/test-jobs') && request.method === 'POST') return reply({ ok: true, data: await testJob(request, env) });
    return reply({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  } catch (e) { return reply({ ok: false, error: { code: e.code || 'WORKSPACE_ADMIN_UNAVAILABLE' } }, e.status || 503); }
}

async function testJob(request, env) {
  if (!String(request.headers.get('content-type') || '').startsWith('application/json')) fail(415,'JSON_REQUIRED');
  const raw = await request.text();
  if (raw.length > 4096) fail(413,'BODY_TOO_LARGE');
  let body; try { body = JSON.parse(raw); } catch { fail(400,'INVALID_JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400,'INVALID_JSON');
  if (Object.keys(body).some(k => !['therapist_id','request_key','prepared_job_id'].includes(k))) fail(400,'UNKNOWN_FIELD');
  if (!ID.test(body.therapist_id || '') || !/^[A-Za-z0-9._:-]{8,160}$/.test(body.request_key || '')) fail(400,'TEST_REQUEST_INVALID');
  if (body.prepared_job_id && !JOB.test(body.prepared_job_id)) fail(400,'TEST_JOB_ID_INVALID');
  const therapist = await unique(env,'THERAPISTS','Therapist ID',body.therapist_id);
  if (!therapist) fail(404,'THERAPIST_NOT_FOUND');
  if (!therapistWorkspaceReadiness(therapist).can_test) fail(409,'TEST_THERAPIST_NOT_READY');
  if (!env.MMS_DISPATCH_COORDINATOR?.get || !env.MMS_DISPATCH_COORDINATOR?.idFromName) fail(503,'DISPATCH_COORDINATOR_NOT_CONFIGURED');
  const jobId = body.prepared_job_id || await digestId('mmsjob', `owner-test:${body.therapist_id}:${body.request_key}`);
  const offerId = await digestId('mmsoffer', `${jobId}:${body.therapist_id}`);
  let job = await unique(env,'JOBS','Job ID',jobId);
  if (job) {
    const p = object(job.fields?.['Internal Payload JSON']);
    if (p.is_test !== true || p.target_therapist_id !== body.therapist_id) fail(409,'TEST_JOB_SCOPE_CONFLICT');
  } else if (body.prepared_job_id) fail(404,'TEST_JOB_NOT_FOUND');
  const now = Date.now(), at = new Date(now).toISOString();
  const payload = { is_test:true, target_therapist_id:body.therapist_id, request_key:body.request_key,
    customer_is_real:false, payment_verified:false, payout_verified:false, coordinator_initialized:false,
    exclude_from_real_business_reporting:true,
    safe_note_label:'TEST ONLY · ทดสอบแอปกับพี่เปอร์ · ไม่ต้องเดินทาง · ไม่มีลูกค้าหรือยอดจ่ายจริง' };
  if (!job) job = await create(env,'JOBS',{ 'Job ID':jobId, Service:'[TEST ONLY] ทดสอบรับ–เริ่ม–จบงาน',
    'Duration Minutes':60, 'Safe Area Label':'ทดสอบในแอปเท่านั้น', 'Travel Label':'ไม่มีการเดินทางจริง',
    'Therapist Payout THB':0, 'Payout Note':'TEST ONLY · ไม่มียอดจ่ายจริง',
    'Payment State Label':'งานทดสอบ · ไม่มีการเรียกเก็บหรือชำระเงินจริง', 'Job Status':'Matching',
    'Internal Payload JSON':JSON.stringify(payload), Version:1, 'Created At':at, 'Updated At':at });
  let offer = await unique(env,'OFFERS','Offer ID',offerId);
  const coordinator = env.MMS_DISPATCH_COORDINATOR.get(env.MMS_DISPATCH_COORDINATOR.idFromName(jobId));
  if (offer) {
    const snapshot = await coordinator.snapshot(jobId);
    if (snapshot.job && snapshot.job.state !== 'OFFERED') return { job_id:jobId, state:snapshot.job.state, duplicate:true, is_test:true };
    if (!Number.isFinite(Date.parse(offer.fields?.['Expires At'])) || Date.parse(offer.fields?.['Expires At']) <= now) fail(409,'TEST_OFFER_EXPIRED');
  } else if (select(job.fields?.['Job Status']) !== 'Matching') fail(409,'TEST_JOB_STATE_CONFLICT');
  const expiresAt = offer ? Date.parse(offer.fields['Expires At']) : now + 1800_000;
  if (!offer) offer = await create(env,'OFFERS',{ 'Offer ID':offerId, 'Job ID':jobId, 'Therapist ID':body.therapist_id,
    'Offer Status':'Offered', 'Offered At':at, 'Expires At':new Date(expiresAt).toISOString(), 'Match Rank':1,
    'Payout THB':0, 'Safe Area Label':'ทดสอบในแอปเท่านั้น', 'Travel Label':'ไม่มีการเดินทางจริง',
    'Safe Payload JSON':JSON.stringify({ job_id:jobId, service_label:'[TEST ONLY] ทดสอบรับ–เริ่ม–จบงาน', duration_minutes:60,
      area_label:'ทดสอบในแอปเท่านั้น', payout_thb:0, payout_note:'TEST ONLY · ไม่มียอดจ่ายจริง',
      note_label:payload.safe_note_label, expires_at:new Date(expiresAt).toISOString() }), Version:1, 'Created At':at,'Updated At':at });
  const snapshot = await coordinator.initialize(jobId,[{therapist_id:body.therapist_id,offer_id:offerId,expires_at:expiresAt}],now);
  if (!snapshot.job || snapshot.job.state !== 'OFFERED') fail(409,'TEST_COORDINATOR_STATE_CONFLICT');
  await patch(env,'JOBS',job.id,{ 'Job Status':'Offered', 'Therapist Payout THB':0,
    'Payout Note':'TEST ONLY · ไม่มียอดจ่ายจริง', 'Payment State Label':'งานทดสอบ · ไม่มีการเรียกเก็บหรือชำระเงินจริง',
    'Customer Display Private':'', 'Customer Contact Private':'', 'Exact Address Private':'', 'Map URL Private':'',
    'Internal Payload JSON':JSON.stringify({...payload,coordinator_initialized:true}), 'Updated At':at });
  return { job_id:jobId, state:'OFFERED', is_test:true, therapist_id:body.therapist_id, expires_at:new Date(expiresAt).toISOString() };
}

async function digestId(prefix, value) { const h = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)); return prefix+'_'+[...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,24); }
function table(env,k) { const id = text(env[`AIRTABLE_${k}_TABLE_ID`]); if (!/^tbl[A-Za-z0-9]{14}$/.test(id)) fail(503,'WORKSPACE_TABLE_NOT_CONFIGURED'); return id; }
async function airtable(env,k,suffix='',init={}) {
  if (!/^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID || '') || !env.AIRTABLE_API_TOKEN) fail(503,'AIRTABLE_NOT_CONFIGURED');
  const r = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table(env,k)}${suffix}`,{...init,headers:{Authorization:`Bearer ${env.AIRTABLE_API_TOKEN}`,'Content-Type':'application/json'}});
  if (!r.ok) fail(503,'WORKSPACE_STORAGE_UNAVAILABLE'); return r.json();
}
async function list(env,k) { let offset='',records=[]; for(let i=0;i<10;i++){const q=new URLSearchParams({pageSize:'100'});if(offset)q.set('offset',offset);const r=await airtable(env,k,'?'+q);records.push(...(r.records || []));offset=r.offset || '';if(!offset)break;}return {records,complete:!offset}; }
async function unique(env,k,field,value) { const q=new URLSearchParams({maxRecords:'2',filterByFormula:`{${field}}='${String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`});const r=await airtable(env,k,'?'+q);if(r.records?.length>1)fail(409,'WORKSPACE_IDENTITY_CONFLICT');return r.records?.[0] || null; }
async function create(env,k,fields){return airtable(env,k,'',{method:'POST',body:JSON.stringify({fields,typecast:false})});}
async function patch(env,k,id,fields){if(!/^rec[A-Za-z0-9]{14}$/.test(id))fail(503,'RECORD_ID_INVALID');return airtable(env,k,'/'+id,{method:'PATCH',body:JSON.stringify({fields,typecast:false})});}

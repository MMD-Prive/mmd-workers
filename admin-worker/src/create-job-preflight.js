import { enforcePrivateCreateAccess } from './index.js';
import { guardPrivateJobCreateWork } from './private-model-work-policy.js';
import { isOwnerActor } from './owner-my-mmd-recovery-diagnostic.js';

export const JOB_PREFLIGHT_PATH = '/internal/admin/jobs/create-job/preflight';
const recordId = value => /^rec[A-Za-z0-9]{14,30}$/.test(String(value || ''));
const linked = (value, id) => Array.isArray(value) ? value.includes(id) : value === id;
const clock = value => /^\d{2}:\d{2}$/.test(value || '') && Number(value.slice(0,2)) < 24 && Number(value.slice(3)) < 60;
const minutes = value => Number(value.slice(0,2))*60 + Number(value.slice(3));
const json = (body, status=200) => Response.json(body, {status, headers:{'cache-control':'no-store, private'}});

export function jobCheckInput(body) {
  const client = body.client_id || body.client_lineage?.client_id;
  const model = body.model?.model_id || body.model_id;
  const date = body.job_date || body.job_details?.job_date;
  const start = body.start_time || body.job_details?.start_time;
  const end = body.end_time || body.job_details?.end_time;
  if (!recordId(client) || !recordId(model) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !clock(start) || !clock(end)) throw Error('job_check_input_required');
  return {client, model, date, start, end};
}

// Match canonical links, never a customer's or model's display name.
// Unknown times on the same day require review rather than allowing another job.
export function matchExistingJobs(records, input) {
  return records.flatMap(record => {
    const f = record.fields || {};
    const state = String(f.session_state || f.status || f['Session Status'] || '').toLowerCase();
    if (/^(void|voided|cancelled|canceled)$/.test(state)) return [];
    const sameClient = linked(f.Client, input.client) || linked(f.client_id, input.client);
    const missingModelLink = !f.model_id && (!Array.isArray(f['Canonical Model']) || !f['Canonical Model'].length);
    const modelMatch = linked(f['Canonical Model'], input.model) || linked(f.model_id, input.model) || (sameClient && missingModelLink);
    if (!modelMatch) return [];
    const start = f.start_time;
    const end = f.end_time;
    const unknown = !clock(start) || !clock(end) || minutes(end) <= minutes(start) || minutes(input.end) <= minutes(input.start);
    if (!unknown && !(minutes(input.start)<minutes(end) && minutes(start)<minutes(input.end))) return [];
    const sid = String(f.session_id || '');
    return [{kind: sameClient ? 'existing_job' : 'model_schedule_conflict', session_id:sid,
      href: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(sid) ? '/internal/admin/jobs/all?session_id='+encodeURIComponent(sid) : '/internal/admin/jobs/all?date='+input.date,
      time_state:unknown?'needs_review':'overlap'}];
  });
}

export async function readJobConflicts(env, body) {
  const input = jobCheckInput(body);
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw Error('job_check_unavailable');
  const table = env.AIRTABLE_TABLE_SESSIONS || 'tblC98mKWbzmPuNzX';
  const records = [], offsets = new Set();
  let offset = '';
  do {
    const params = new URLSearchParams({pageSize:'100', filterByFormula:`IS_SAME({job_date}, '${input.date}', 'day')`});
    if (offset) params.set('offset',offset);
    const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params}`,{headers:{Authorization:`Bearer ${env.AIRTABLE_API_KEY}`}});
    if (!response.ok) throw Error('job_check_unavailable');
    const data = await response.json();
    if (!Array.isArray(data.records)) throw Error('job_check_unavailable');
    records.push(...data.records);
    offset = data.offset || '';
    if (offset && offsets.has(offset)) throw Error('job_check_incomplete');
    offsets.add(offset);
    if (offset && offsets.size >= 30) throw Error('job_check_incomplete');
  } while(offset);
  return matchExistingJobs(records,input);
}

export async function checkJobReadiness(env, body, deps={}) {
  let conflicts;
  try { conflicts = await (deps.readConflicts || readJobConflicts)(env,body); }
  catch { return {ok:true,can_create:false,state:'unknown',message:'ตรวจงานเดิมไม่ได้ กรุณาตรวจใหม่ก่อนสร้างงาน'}; }
  if (conflicts.length) return {ok:true,can_create:false,state:'existing',message:'พบงานเดิมหรือคิวโมเดลทับช่วงเวลานี้ กรุณาเปิดงานเดิมก่อน',jobs:conflicts};
  const privateJob = [body.job_visibility,body.work?.job_visibility,body.visibility,body.booking_visibility,body.job_details?.world].some(v=>String(v).toLowerCase()==='private');
  if (!privateJob) return {ok:true,can_create:true,state:'checked',message:'ไม่พบงานซ้ำในข้อมูลที่ตรวจ งาน Public ไม่ใช้สิทธิ์ Private'};
  try {
    const gate = await (deps.checkAccess || enforcePrivateCreateAccess)(env,body);
    const policyRequest = new Request('https://mmdbkk.com/v1/admin/job/create',{method:'POST',body:JSON.stringify(body)});
    const blocked = await (deps.checkWork || guardPrivateJobCreateWork)(policyRequest,env);
    if (blocked) return {ok:true,can_create:false,state:'blocked',message:'ชนิดงานของโมเดลยังไม่ผ่าน กรุณาตรวจข้อมูลโมเดล'};
    return {ok:true,can_create:true,state:'checked',membership:gate.ownerJobGrant?'one_job_grant':'eligible',
      availability:gate.profile.availableNow?'available':'unknown',
      message:(gate.ownerJobGrant?'สิทธิ์เฉพาะงานตรงกับรายละเอียดนี้':'สิทธิ์ลูกค้าผ่าน')+' · ไม่พบคิวทับในระบบ · '+(gate.profile.availableNow?'โมเดลระบุว่าพร้อม':'โมเดลยังไม่แจ้งความพร้อม ต้องยืนยันวันเวลากับโมเดลก่อน')};
  } catch(error) {
    const code = typeof error.code === 'string' ? error.code : 'readiness_unavailable';
    const messages = {AUTHORITATIVE_MEMBER_NOT_FOUND:'ยังไม่พบสิทธิ์สมาชิกหรือสิทธิ์เฉพาะงานที่ใช้ได้',private_eligibility_blocked:'สิทธิ์สมาชิกยังไม่พร้อมสำหรับงาน Private',private_folder_not_allowed:'สิทธิ์ลูกค้าไม่ครอบคลุมกลุ่มโมเดลนี้',private_model_unavailable:'โมเดลระบุว่าไม่พร้อมรับงาน',private_model_inactive:'โมเดลยังไม่เปิดรับงาน'};
    return {ok:true,can_create:false,state:'blocked',code,message:messages[code] || 'ตรวจสิทธิ์หรือโมเดลไม่ผ่าน กรุณาตรวจข้อมูลก่อนสร้างงาน'};
  }
}

export async function handleJobPreflight(request,env,actor) {
  if (!isOwnerActor(actor)) return json({ok:false,error:'owner_required'},403);
  const body = await request.json().catch(()=>null);
  if (!body) return json({ok:false,error:'invalid_body'},400);
  try {jobCheckInput(body);} catch {return json({ok:false,error:'job_check_input_required'},400);}
  return json(await checkJobReadiness(env,body));
}

export async function guardDuplicateJob(request,env,actor) {
  if (!isOwnerActor(actor)) return json({ok:false,error:'owner_required'},403);
  const body = await request.clone().json().catch(()=>({}));
  // Legacy identity-hold workflows remain with their existing authority.
  if (!recordId(body.client_id || body.client_lineage?.client_id) || !recordId(body.model?.model_id || body.model_id)) return null;
  try {
    const jobs = await readJobConflicts(env,body);
    if (jobs.length) return json({ok:false,error:{code:'existing_job',message:'พบงานเดิมหรือคิวทับ กรุณาเปิดงานเดิมแทนการสร้างซ้ำ'},jobs},409);
    return null;
  } catch {return json({ok:false,error:{code:'job_check_unavailable',message:'ยังตรวจงานเดิมไม่ได้ จึงยังไม่สร้างงาน กรุณาตรวจใหม่'}},503);}
}

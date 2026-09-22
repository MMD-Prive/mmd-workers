import { notificationDigest } from "../../shared/payment-notification-outbox.mjs";
import { buildReconfirmSchedule } from "./model-reconfirm-runtime.js";

export const CHANGE_FIELDS = Object.freeze({
  id:"fldWMwebmHhyVQLzW", session:"fldbL2Ya44l6xEYe1", sessionId:"fldMD3Fhu0ibDmjk0",
  type:"fldxg0WIVCmxtdRCF", status:"fldcBkBS70bWBgI8A", before:"fld9W8UEOXpsfJT5P",
  requested:"fld8DqBrOmY6lQzGA", remark:"fldjwQWRjxXqrFiAU", at:"fldU2e6BO3fVdGyFF",
  reviewer:"fld8O7RW6UmzbfBKU", reviewedAt:"fldnnAWYmA0U1q8nX", resolution:"fldhGzNzKcpuEr3fb",
});
const C = CHANGE_FIELDS;
export const CHANGE_SESSION_FIELDS = Object.freeze({
  job_date:"fldpnqoIsUMfN7y3c", start_time:"fldBeG0FkWwa8kgnp", end_time:"fldiDSz0wW9Ct9I3P",
  location_name:"fldIiRpaxoafjTkFt", google_map_url:"fldoUDQ8sH93idPx0", session_status:"fldmwuvOaiCFdzzRa",
  model:"fldrXQAyOMPCvbOaY", client:"fld6P6if0vDZCeV0C", state:"fld57fhdWqIcOy4Jp",
  customer_ack:"fldJSS5GNN7quJwa8", model_ack:"fldFgkHXivIAThfDz",
  partner_id:"fld0jkscGAtyX7i2J", partner_confirmation_status:"fldrAQxUX4pRqz6qr",
  partner_confirmed_at:"fldLonXanVTSybnpv", partner_confirmation_note:"fldjAwRLqxhJ7GjJL",
  partner_notification_status:"fldv1X9HIfgUjwpJw", partner_notification_error:"fldGLKYcQVPZelwue",
});
const S = CHANGE_SESSION_FIELDS;
const KEYS = ["job_date","start_time","end_time","location_name","google_map_url"];
const types = new Set(["time_change","date_change","location_change","reschedule","cancellation","remark"]);
const prework = new Set(["", "offered", "confirmed"]);
const clean = v => typeof v === "string" ? v.trim() : "";
const quote = v => clean(v).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
const fail = (status, code) => { throw Object.assign(new Error(code), {status}); };
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const table = env => env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS || "tblhQGfJc4GgiteZr";
const snapshot = s => Object.fromEntries(Object.entries(S).map(([k,id])=>[k,s.fields?.[id] ?? null]));
function object(raw) { try {const v=JSON.parse(raw); if(v && typeof v==="object" && !Array.isArray(v))return v;}catch{} fail(409,"invalid_change_snapshot"); }
function https(value) { try {const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password ? u.href : null;}catch{return null;} }
function date(value) {return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;}
function bangkokTime(value) {const d=new Date(value);if(!Number.isFinite(d.getTime()))return null;return new Date(d.getTime()+7*3600000).toISOString().slice(11,19);}
function timestamp(day,time) {if(!date(day)||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))fail(409,"invalid_requested_time");return new Date(`${day}T${time.length===5?time+":00":time}+07:00`).toISOString();}

async function context(env,input,{list,sessionsTable}) {
  if(!/^[a-zA-Z0-9_-]{1,180}$/.test(input.session_id||"")||!/^[a-zA-Z0-9_-]{1,120}$/.test(input.request_id||""))fail(400,"change_context_required");
  const sessions=await list(sessionsTable,{filterByFormula:`{session_id}='${quote(input.session_id)}'`,maxRecords:2,returnFieldsByFieldId:true});
  if(sessions.length!==1)fail(409,"canonical_session_missing_or_ambiguous");
  const requests=await list(table(env),{filterByFormula:`{request_id}='${quote(input.request_id)}'`,maxRecords:2,returnFieldsByFieldId:true});
  if(requests.length!==1)fail(409,"change_request_missing_or_ambiguous");
  const session=sessions[0], request=requests[0], f=request.fields||{};
  if(f[C.sessionId]!==input.session_id||!same(f[C.session],[session.id]))fail(409,"change_session_mismatch");
  return {session,request};
}

function plan(session,request) {
  const f=request.fields||{}, current=snapshot(session), type=clean(f[C.type]);
  if(!types.has(type))fail(409,"invalid_request_type");
  const before=object(f[C.before]), requested=object(f[C.requested]);
  if(Object.keys(requested).some(k=>!KEYS.includes(k))||Object.values(requested).some(v=>typeof v!=="string"))fail(409,"invalid_requested_fields");
  let block=null, patch={};
  if(!["Pending","Confirmed"].includes(current.session_status)||!prework.has(clean(current.state)))block="job_already_in_progress";
  if(Object.entries(before).some(([k,v])=>[...KEYS,"session_status"].includes(k)&&!same(v||null,current[k]||null)))block="request_snapshot_stale";
  if(type==="cancellation")block="cancellation_requires_job_and_finance_review";
  if(type==="reschedule"&&!Object.keys(requested).length)block="reschedule_details_required";
  if(type==="remark"&&Object.keys(requested).length)fail(409,"invalid_requested_fields");
  const allowed=type==="time_change"?["start_time","end_time"]:type==="date_change"?["job_date"]:type==="location_change"?["location_name","google_map_url"]:KEYS;
  if(Object.keys(requested).some(k=>!allowed.includes(k)))fail(409,"request_type_fields_mismatch");
  if(requested.job_date&&!date(requested.job_date))fail(409,"invalid_requested_date");
  if(requested.location_name&&(!clean(requested.location_name)||requested.location_name.length>360))fail(409,"invalid_requested_location");
  if(requested.google_map_url&&!https(requested.google_map_url))fail(409,"invalid_requested_map");
  const after={...current,...requested};
  if(["time_change","date_change","reschedule"].includes(type)&&Object.keys(requested).some(k=>["job_date","start_time","end_time"].includes(k))) {
    const oldStart=Date.parse(current.start_time),oldEnd=Date.parse(current.end_time),duration=oldEnd-oldStart;
    if(!Number.isFinite(duration)||duration<=0||duration>24*3600000)fail(409,"canonical_time_range_required");
    const start=requested.start_time ? (/^\d{2}:\d{2}$/.test(requested.start_time)?requested.start_time:bangkokTime(requested.start_time)) : bangkokTime(current.start_time);
    after.start_time=timestamp(after.job_date,start||"");
    after.end_time=new Date(Date.parse(after.start_time)+duration).toISOString();
    if(requested.end_time){
      const end=/^\d{2}:\d{2}$/.test(requested.end_time)?requested.end_time:bangkokTime(requested.end_time);
      let proposed=Date.parse(timestamp(after.job_date,end||""));
      if(proposed<=Date.parse(after.start_time))proposed+=86400000;
      if(proposed-Date.parse(after.start_time)!==duration)fail(409,"duration_change_requires_requote");
    }
  }
  // A location name without a new map must not retain the previous hotel's map.
  if(requested.location_name&&!requested.google_map_url&&requested.location_name!==current.location_name)after.google_map_url=null;
  for(const key of KEYS)if(!same(current[key],after[key]))patch[S[key]]=after[key];
  if(type!=="remark"&&!Object.keys(patch).length&&!block)block="no_job_change";
  if(Object.keys(patch).length&&!block) {
    patch[S.customer_ack]=null;patch[S.model_ack]=null;
    if(clean(current.partner_id)) {
      patch[S.partner_confirmation_status]="pending";
      patch[S.partner_confirmed_at]=null;
      patch[S.partner_confirmation_note]="รายละเอียดงานมีการเปลี่ยนแปลง · กรุณาตรวจและยืนยันข้อมูลล่าสุด";
      patch[S.partner_notification_status]="pending_change";
      patch[S.partner_notification_error]=null;
    }
    const schedule=buildReconfirmSchedule(after.job_date);
    if(!schedule)fail(409,"canonical_job_date_required");
    Object.assign(patch,{
      fldIvBZDv6541YZR8:schedule.status,fldu1v7jHIllouI7g:new Date(schedule.required_at).toISOString(),
      fldPvRothitseULiN:new Date(schedule.reminder_at).toISOString(),fldVElAODigVt7AcR:new Date(schedule.overdue_at).toISOString(),
      fldMtFsIZicREiCzG:null,fldpKEJeqlocCkEqB:null,fldXh5Nfz8ccc5bA3:null,
      fldY1KdKxwLgBLOUV:null,fldT59CDe9AMy3ciT:"none",
    });
  }
  return {type,before,requested,current,after,patch:block?{}:patch,block};
}

async function version(session,request) {return notificationDigest(JSON.stringify({session: snapshot(session),request:request.fields}));}
const requestSnapshot=request=>Object.fromEntries([C.id,C.session,C.sessionId,C.type,C.before,C.requested,C.remark,C.at].map(id=>[id,request.fields?.[id]??null]));
export async function previewCustomerChange(env,input,deps) {
  if(!["owner","admin"].includes(deps.actor?.role))fail(403,"change_review_requires_owner_admin");
  const {session,request}=await context(env,input,deps), p=plan(session,request);
  const publicDetails=s=>Object.fromEntries(KEYS.map(k=>[k,s[k]||null]));
  const journal=env.LINE_SLIP_EVIDENCE?.get ? (await readJournal(env.LINE_SLIP_EVIDENCE,await journalKey(input.session_id)))?.record : null;
  const resume=journal&&journal.phase!=="done"&&journal.request_id===input.request_id
    ? {decision:journal.decision,resolution_note:journal.note,expected_version:journal.expected_version} : null;
  return {ok:true,request_id:input.request_id,session_id:input.session_id,expected_version:await version(session,request),
    status:request.fields[C.status],request_type:p.type,current:publicDetails(p.current),requested:publicDetails(p.requested),
    after:publicDetails(p.after),remark:clean(request.fields[C.remark]).slice(0,2000),
    can_apply:!p.block,apply_block:p.block,can_review:["pending_review","approved"].includes(request.fields[C.status]),resume,
    approval_effect:p.block?"approved_pending_action":p.type==="remark"?"remark_recorded":"session_updated_reconfirm_required"};
}

const journalKey=async sessionId=>`customer-change-resolution/v1/sessions/${await notificationDigest(sessionId)}.json`;
async function readJournal(bucket,key) {const o=await bucket.get(key);return o?{record:JSON.parse(await o.text()),etag:o.etag}:null;}
async function writeJournal(bucket,key,record,etag) {const o=await bucket.put(key,JSON.stringify(record),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});if(!o)fail(409,"change_review_in_progress");return {record,etag:o.etag};}
const matches=(record,fields)=>Object.entries(fields).every(([id,value])=>same(record.fields?.[id]??null,value));

export async function resolveCustomerChange(env,input,deps) {
  const {actor,list,patch,sessionsTable}=deps;
  if(!["owner","admin"].includes(actor?.role)||!actor.id)fail(403,"change_review_requires_owner_admin");
  const decision=clean(input.decision), note=clean(input.resolution_note);
  if(!["approve","reject"].includes(decision)||note.length<5||note.length>1000||input.review_confirmed!==true||!/^[a-f0-9]{64}$/.test(input.expected_version||""))fail(400,"change_review_details_required");
  const bucket=env.LINE_SLIP_EVIDENCE;
  if(!bucket?.get||!bucket?.put)fail(503,"change_audit_storage_unavailable");
  const {session,request}=await context(env,input,deps), key=await journalKey(input.session_id);
  const operation=await notificationDigest(JSON.stringify([input.request_id,decision,note,input.expected_version]));
  const receiptKey=`customer-change-resolution/v1/receipts/${await notificationDigest(operation)}.json`;
  const receipt=await readJournal(bucket,receiptKey);
  if(receipt?.record?.operation===operation)return {...receipt.record.result,idempotent:true};
  let saved=await readJournal(bucket,key), j=saved?.record;
  if(j?.operation===operation&&j.phase==="done")return {...j.result,idempotent:true};
  if(j&&j.phase!=="done") {
    if(j.operation!==operation)fail(409,"previous_change_requires_reconciliation");
    if(Date.now()-j.updated_at<60000)fail(409,"change_review_in_progress");
    // Recovery never replays an uncertain Session PATCH. Only a matching
    // canonical postimage can complete the original operation.
    if(j.phase==="session_writing"&&!matches(session,j.session_patch))fail(409,"change_write_requires_reconciliation");
    saved=await writeJournal(bucket,key,{...j,updated_at:Date.now()},saved.etag);j=saved.record;
  } else {
    if(await version(session,request)!==input.expected_version)fail(409,"change_preview_stale");
    if(!["pending_review","approved"].includes(request.fields[C.status]))fail(409,"change_already_resolved");
    const p=plan(session,request);
    // Stale/in-progress requests may be rejected; never silently accepted.
    if(decision==="approve"&&["request_snapshot_stale","job_already_in_progress","no_job_change"].includes(p.block))fail(409,p.block);
    const status=decision==="reject"?"rejected":p.block?"approved":"applied";
    const sessionPatch=decision==="approve"?p.patch:{};
    j={schema:"customer_change_resolution_v1",operation,request_id:input.request_id,session_id:input.session_id,
      session_record:session.id,request_record:request.id,actor:{id:actor.id,role:actor.role},decision,note,
      expected_version:input.expected_version,
      phase:"prepared",updated_at:Date.now(),before:snapshot(session),request_before:requestSnapshot(request),session_patch:sessionPatch,
      request_patch:{[C.status]:status,[C.reviewer]:actor.id,[C.reviewedAt]:new Date().toISOString(),[C.resolution]:note},
      result:{ok:true,session_id:input.session_id,request_id:input.request_id,status,money_truth_changed:false,
        session_changed:Object.keys(sessionPatch).length>0,reconfirmation_required:Object.keys(sessionPatch).length>0,
        followup:status==="approved"?p.block:Object.keys(sessionPatch).length?"notify_parties_and_check_calendar":null}};
    saved=await writeJournal(bucket,key,j,saved?.etag);
  }
  if(!same(requestSnapshot(request),j.request_before))fail(409,"change_request_modified_requires_reconciliation");
  async function checkpoint(phase){saved=await writeJournal(bucket,key,{...saved.record,phase,updated_at:Date.now()},saved.etag);j=saved.record;}
  if(j.phase==="prepared") {
    // Persist the approved intermediate state before changing details, so
    // customer acknowledgement can fail closed while application is pending.
    if(Object.keys(j.session_patch).length)await patch(table(env),request.id,{[C.status]:"approved",[C.reviewer]:j.actor.id,[C.reviewedAt]:j.request_patch[C.reviewedAt],[C.resolution]:j.note});
    await checkpoint("session_writing");
    if(Object.keys(j.session_patch).length) {
      const fresh=await context(env,input,deps);
      if(!same(requestSnapshot(fresh.request),j.request_before))fail(409,"change_request_modified_requires_reconciliation");
      if(!same(snapshot(fresh.session),j.before))fail(409,"change_preview_stale");
      await patch(sessionsTable,j.session_record,j.session_patch);
      const verified=await context(env,input,deps);
      if(!matches(verified.session,j.session_patch))fail(409,"change_write_requires_reconciliation");
    }
    await checkpoint("session_applied");
  }else if(j.phase==="session_writing")await checkpoint("session_applied");
  if(j.phase==="session_applied") {
    const current=await context(env,input,deps);
    if(!same(requestSnapshot(current.request),j.request_before))fail(409,"change_request_modified_requires_reconciliation");
    await patch(table(env),j.request_record,j.request_patch);
    const verified=await context(env,input,deps);
    if(!matches(verified.request,j.request_patch))fail(409,"change_resolution_requires_reconciliation");
    // Immutable per-request audit precedes releasing the per-session writer.
    await bucket.put(receiptKey,JSON.stringify(j),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});
    await checkpoint("done");
  }
  return j.result;
}

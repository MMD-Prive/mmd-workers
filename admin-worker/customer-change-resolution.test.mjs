import test from 'node:test';
import assert from 'node:assert/strict';
import {previewCustomerChange,resolveCustomerChange,CHANGE_FIELDS as C,CHANGE_SESSION_FIELDS as S} from './src/customer-change-resolution.js';
const clone=x=>structuredClone(x);
function fixture(type='location_change',requested={location_name:'New Hotel'}){
 const data={session:{id:'recSession',fields:{[S.job_date]:'2026-10-04',[S.start_time]:'2026-10-04T09:00:00.000Z',[S.end_time]:'2026-10-04T10:30:00.000Z',[S.location_name]:'Old Hotel',[S.google_map_url]:'https://maps.google.com/old',[S.session_status]:'Confirmed',[S.state]:'confirmed',[S.customer_ack]:'2026-09-21T01:00:00.000Z',[S.model_ack]:'2026-09-21T02:00:00.000Z'}},request:{id:'recRequest',fields:{[C.id]:'ccr_1',[C.session]:['recSession'],[C.sessionId]:'sess_1',[C.type]:type,[C.status]:'pending_review',[C.before]:JSON.stringify(type==='location_change'?{location_name:'Old Hotel',google_map_url:'https://maps.google.com/old'}:type==='date_change'?{job_date:'2026-10-04'}:type==='time_change'?{start_time:'2026-10-04T09:00:00.000Z',end_time:'2026-10-04T10:30:00.000Z'}:{}),[C.requested]:JSON.stringify(requested),[C.remark]:'Customer request'}}};
 const objects=new Map();let seq=0;const writes=[];
 const bucket={get:async key=>{const value=objects.get(key);return value?{etag:value.etag,text:async()=>JSON.stringify(clone(value.value))}:null},put:async(key,value,opts={})=>{const prior=objects.get(key);if(opts.onlyIf?.etagMatches&&prior?.etag!==opts.onlyIf.etagMatches||opts.onlyIf?.etagDoesNotMatch==='*'&&prior)return null;const etag=String(++seq);objects.set(key,{value:JSON.parse(value),etag});return{etag}}};
 const env={LINE_SLIP_EVIDENCE:bucket};const deps={actor:{id:'owner-1',role:'owner'},sessionsTable:'sessions',list:async table=>[clone(table==='sessions'?data.session:data.request)],patch:async(table,id,fields)=>{writes.push({table,id,fields:clone(fields)});Object.assign(table==='sessions'?data.session.fields:data.request.fields,clone(fields));}};
 const input={session_id:'sess_1',request_id:'ccr_1'};
 const body=async(decision='approve')=>({...input,decision,resolution_note:'Confirmed with the customer and model',review_confirmed:true,expected_version:(await previewCustomerChange(env,input,deps)).expected_version});
 return{env,deps,data,writes,objects,input,body};
}
test('approved location writes only canonical details and reconfirmation; exact retry never repeats writes',async()=>{
 const f=fixture(),b=await f.body();const r=await resolveCustomerChange(f.env,b,f.deps);assert.equal(r.status,'applied');assert.equal(r.money_truth_changed,false);assert.equal(f.data.session.fields[S.location_name],'New Hotel');assert.equal(f.data.session.fields[S.google_map_url],null);assert.equal(f.data.session.fields[S.customer_ack],null);assert.equal(f.data.session.fields[S.model_ack],null);assert.equal(f.data.request.fields[C.reviewer],'owner-1');assert.equal(f.data.session.fields.fldu1v7jHIllouI7g,'2026-10-03T09:00:00.000Z');const before=f.writes.length;assert.equal((await resolveCustomerChange(f.env,b,f.deps)).idempotent,true);assert.equal(f.writes.length,before);assert.equal(f.writes.filter(w=>w.table==='sessions').length,1);
});
test('reject keeps Session and all financial truth untouched and records reviewer/reason',async()=>{
 const f=fixture(),before=clone(f.data.session);const r=await resolveCustomerChange(f.env,await f.body('reject'),f.deps);assert.equal(r.status,'rejected');assert.deepEqual(f.data.session,before);assert.equal(f.writes.some(w=>w.table==='sessions'),false);assert.match(f.data.request.fields[C.resolution],/Confirmed/);
});
test('date and time changes use Bangkok time, preserve duration and shift reconfirm schedule',async()=>{
 for(const [type,request,start,end] of [['date_change',{job_date:'2026-10-05'},'2026-10-05T09:00:00.000Z','2026-10-05T10:30:00.000Z'],['time_change',{start_time:'23:30',end_time:'01:00'},'2026-10-04T16:30:00.000Z','2026-10-04T18:00:00.000Z']]){const f=fixture(type,request);await resolveCustomerChange(f.env,await f.body(),f.deps);assert.equal(f.data.session.fields[S.start_time],start);assert.equal(f.data.session.fields[S.end_time],end)}
});
test('duration, invalid date, hidden fields and unsafe map cannot be silently applied',async()=>{
 for(const [type,request,error] of [['time_change',{end_time:'19:00'},'duration_change_requires_requote'],['date_change',{job_date:'2026-02-30'},'invalid_requested_date'],['location_change',{model_payout:1},'invalid_requested_fields'],['location_change',{google_map_url:'javascript:alert(1)'},'invalid_requested_map']]){const f=fixture(type,request);await assert.rejects(()=>f.body(),new RegExp(error));assert.equal(f.writes.length,0)}
});
test('cancellation and undated postponement stay approved awaiting job/finance handling; remark is completed without a Session write',async()=>{
 for(const type of ['cancellation','reschedule','remark']){const f=fixture(type,{});const r=await resolveCustomerChange(f.env,await f.body(),f.deps);assert.equal(r.status,type==='remark'?'applied':'approved');assert.equal(r.session_changed,false);assert.equal(f.writes.some(w=>w.table==='sessions'),false)}
});
test('stale preview, cross-session/ambiguous records, staff roles and missing audit storage fail closed',async()=>{
 const f=fixture(),b=await f.body();f.data.session.fields[S.location_name]='Someone changed it';await assert.rejects(()=>resolveCustomerChange(f.env,b,f.deps),/change_preview_stale/);assert.equal(f.writes.length,0);
 for(const update of [f=>f.data.request.fields[C.session]=['wrong'],f=>f.deps.list=async()=>[],f=>f.deps.actor.role='staff']){const k=fixture();update(k);await assert.rejects(()=>k.body());assert.equal(k.writes.length,0)}
 const k=fixture(),kb=await k.body();await assert.rejects(()=>resolveCustomerChange({},kb,k.deps),/change_audit_storage_unavailable/);
});
test('prior snapshot and jobs already en route cannot be approved but can be rejected',async()=>{
 for(const mutate of [s=>s.fields[S.location_name]='Another hotel',s=>s.fields[S.state]='en_route']){const f=fixture();mutate(f.data.session);await assert.rejects(()=>f.body().then(b=>resolveCustomerChange(f.env,b,f.deps)),/request_snapshot_stale|job_already_in_progress/);await resolveCustomerChange(f.env,await f.body('reject'),f.deps);assert.equal(f.writes.some(w=>w.table==='sessions'),false)}
});
test('double submit loses the conditional write and cannot issue a second Session mutation',async()=>{
 const f=fixture(),body=await f.body();const results=await Promise.allSettled([resolveCustomerChange(f.env,body,f.deps),resolveCustomerChange(f.env,body,f.deps)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.writes.filter(w=>w.table==='sessions').length,1);
});
test('response loss after Session write recovers by reading postimage without repeating the write',async()=>{
 const f=fixture(),body=await f.body(),original=f.deps.patch;f.deps.patch=async(...args)=>{await original(...args);if(args[0]==='sessions')throw Error('response_lost')};await assert.rejects(()=>resolveCustomerChange(f.env,body,f.deps),/response_lost/);for(const v of f.objects.values())v.value.updated_at=0;
 const preview=await previewCustomerChange(f.env,f.input,f.deps);assert.equal(preview.resume.expected_version,body.expected_version);f.deps.patch=original;const r=await resolveCustomerChange(f.env,body,f.deps);assert.equal(r.status,'applied');assert.equal(f.writes.filter(w=>w.table==='sessions').length,1);
});
test('unknown write with no postimage blocks recovery and new decisions instead of replaying money/job changes',async()=>{
 const f=fixture(),body=await f.body(),original=f.deps.patch;f.deps.patch=async(...args)=>{if(args[0]==='sessions')throw Error('unknown');return original(...args)};await assert.rejects(()=>resolveCustomerChange(f.env,body,f.deps));for(const v of f.objects.values())v.value.updated_at=0;await assert.rejects(()=>resolveCustomerChange(f.env,body,f.deps),/requires_reconciliation/);await assert.rejects(()=>resolveCustomerChange(f.env,{...body,decision:'reject'},f.deps),/previous_change_requires_reconciliation/);assert.equal(f.writes.filter(w=>w.table==='sessions').length,0);
});
test('a changed request payload after approval cannot change the Session',async()=>{
 const f=fixture(),b=await f.body(),original=f.deps.patch;
 f.deps.patch=async(...args)=>{await original(...args);if(args[0]!=='sessions')f.data.request.fields[C.requested]=JSON.stringify({location_name:'Unexpected hotel'})};
 await assert.rejects(()=>resolveCustomerChange(f.env,b,f.deps),/change_request_modified_requires_reconciliation/);
 assert.equal(f.writes.filter(w=>w.table==='sessions').length,0);
});
test('an immutable receipt recognizes an old retry after the session journal has moved on',async()=>{
 const f=fixture(),b=await f.body();await resolveCustomerChange(f.env,b,f.deps);
 for(const [key,v] of f.objects)if(key.includes('/sessions/'))v.value.operation='another_completed_operation';
 const n=f.writes.length;assert.equal((await resolveCustomerChange(f.env,b,f.deps)).idempotent,true);assert.equal(f.writes.length,n);
});

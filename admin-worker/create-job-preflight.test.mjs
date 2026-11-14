import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { handleCreateJobWorkerPage } from './src/create-job-worker-page.js';
import { matchExistingJobs, checkJobReadiness, handleJobPreflight, readJobConflicts, guardDuplicateJob } from './src/create-job-preflight.js';
const input={client:'recTAeo9bMPWYQXap',model:'rec0YkHtTAEd3lB84',date:'2026-10-24',start:'19:00',end:'21:00'};
const body={client_id:input.client,model:{model_id:input.model},job_date:input.date,start_time:input.start,end_time:input.end,job_visibility:'private'};
const job=(extra={})=>({id:'recExisting1234567',fields:{Client:[input.client],'Canonical Model':[input.model],session_id:'sess_existing',status:'Confirmed',start_time:'19:00',end_time:'21:00',...extra}});
test('existing canonical job returns exact destination; amounts and labels do not matter',()=>{
 const result=matchExistingJobs([job({model_name:'another display label'})],input);
 assert.equal(result[0].href,'/internal/admin/jobs/all?session_id=sess_existing');assert.equal(result[0].kind,'existing_job');
});
test('same model with another client is a schedule conflict; same name with different ID is not',()=>{
 assert.equal(matchExistingJobs([job({Client:['recOtherClient1234']})],input)[0].kind,'model_schedule_conflict');
 assert.deepEqual(matchExistingJobs([job({'Canonical Model':['recOtherModel12345'],model_name:'Ice T'})],input),[]);
});
test('cancelled jobs and adjacent times do not block; partial overlap does',()=>{
 assert.deepEqual(matchExistingJobs([job({status:'Cancelled'}),job({start_time:'17:00',end_time:'19:00'})],input),[]);
 assert.equal(matchExistingJobs([job({start_time:'20:00',end_time:'22:00'})],input).length,1);
});
test('missing time or missing canonical model on same client needs review',()=>{
 assert.equal(matchExistingJobs([job({end_time:''})],input)[0].time_state,'needs_review');
 assert.equal(matchExistingJobs([job({'Canonical Model':[]})],input).length,1);
});
test('existing job short circuits access check and never reserves a grant',async()=>{
 const result=await checkJobReadiness({},body,{readConflicts:async()=>matchExistingJobs([job()],input),checkAccess:()=>assert.fail('must not evaluate grant for an existing job')});
 assert.equal(result.can_create,false);assert.equal(result.state,'existing');
});
test('failed store or denied membership fails closed',async()=>{
 assert.equal((await checkJobReadiness({},body,{readConflicts:async()=>{throw Error('network')}})).can_create,false);
 const result=await checkJobReadiness({},body,{readConflicts:async()=>[],checkAccess:async()=>{throw Object.assign(Error(),{code:'AUTHORITATIVE_MEMBER_NOT_FOUND'})}});
 assert.equal(result.code,'AUTHORITATIVE_MEMBER_NOT_FOUND');assert.equal(result.can_create,false);
});
test('matching one-job grant is distinguished and unknown availability stays unknown',async()=>{
 const result=await checkJobReadiness({},body,{readConflicts:async()=>[],checkAccess:async()=>({ownerJobGrant:{id:'grant'},profile:{availableNow:false}}),checkWork:async()=>null});
 assert.equal(result.membership,'one_job_grant');assert.equal(result.availability,'unknown');
});
test('preflight reports the exact canonical model blocker without enabling creation',async()=>{
  const err=Object.assign(new Error('not allowed'),{code:'private_model_lane_mismatch'});
  const result=await checkJobReadiness({},body,{readConflicts:async()=>[],checkAccess:async()=>{throw err}});
  assert.equal(result.can_create,false);
  assert.equal(result.stage,'model');
  assert.equal(result.code,'private_model_lane_mismatch');
  assert.match(result.message,/Straight\/Gay/);
  assert.doesNotMatch(result.message,/ตรวจสิทธิ์หรือโมเดลไม่ผ่าน/);
});
test('pending owner grant mismatch is diagnosed but never opens the create gate',async()=>{
  let diagnostics=0;
  const result=await checkJobReadiness({},body,{
    readConflicts:async()=>[],
    checkAccess:async()=>{throw Object.assign(new Error('missing'),{code:'AUTHORITATIVE_MEMBER_NOT_FOUND'})},
    diagnoseGrant:async(_,snapshot)=>{diagnostics++;assert.equal(snapshot.client_id,body.client_id);return {code:'OWNER_JOB_GRANT_MISMATCH',mismatched_fields:['amount_thb']};}
  });
  assert.equal(diagnostics,1);
  assert.equal(result.can_create,false);
  assert.equal(result.code,'OWNER_JOB_GRANT_MISMATCH');
  assert.deepEqual(result.mismatched_fields,['amount_thb']);
  assert.match(result.message,/amount_thb/);
});
test('exact pending grant inconsistent with member gate is a backend blocker, not approval',async()=>{
  const result=await checkJobReadiness({},body,{
    readConflicts:async()=>[],
    checkAccess:async()=>{throw Object.assign(new Error('membership'),{code:'private_eligibility_blocked'})},
    diagnoseGrant:async()=>({code:'OWNER_JOB_GRANT_LOOKUP_INCONSISTENT',mismatched_fields:[]})
  });
  assert.equal(result.can_create,false);
  assert.equal(result.code,'OWNER_JOB_GRANT_LOOKUP_INCONSISTENT');
  assert.match(result.message,/ไม่อนุมัติซ้ำ/);
});
test('diagnostic failure retains canonical membership denial',async()=>{
  const result=await checkJobReadiness({},body,{
    readConflicts:async()=>[],
    checkAccess:async()=>{throw Object.assign(new Error('membership'),{code:'AUTHORITATIVE_MEMBER_NOT_FOUND'})},
    diagnoseGrant:()=>{throw new Error('offline')}
  });
  assert.equal(result.can_create,false);
  assert.equal(result.code,'AUTHORITATIVE_MEMBER_NOT_FOUND');
});
test('private PN/VIP work policy failures identify the model policy blocker',async()=>{
  const result=await checkJobReadiness({},body,{
    readConflicts:async()=>[],
    checkAccess:async()=>({profile:{availableNow:true}}),
    checkWork:async()=>Response.json({ok:false,error:{code:'private_model_service_level_unclassified'}},{status:409})
  });
  assert.equal(result.can_create,false);
  assert.equal(result.stage,'model_work');
  assert.equal(result.code,'private_model_service_level_unclassified');
  assert.match(result.message,/PN\/VIP/);
});
test('preflight without an owner does not access storage',async()=>{
 const response=await handleJobPreflight(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}),{},null);
 assert.equal(response.status,403);
});
test('duplicate guard performs only GET reads and rejects before create',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push(init.method||'GET');return Response.json({records:[job()]})};
 try {
   const env={AIRTABLE_API_KEY:'test',AIRTABLE_BASE_ID:'test'};
   assert.equal((await readJobConflicts(env,body)).length,1);
   const response=await guardDuplicateJob(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}),env,{role:'owner'});
   assert.equal(response.status,409);assert.deepEqual(calls,['GET','GET']);
 } finally {globalThis.fetch=original;}
});

async function readinessUi(api) {
 const html=await handleCreateJobWorkerPage(new Request('https://example.test/internal/admin/jobs/create-job')).text();
 const script=html.slice(html.indexOf('let readinessSequence='),html.indexOf('function visibility()'));
 const elements=new Map();
 const node=()=>({disabled:false,checked:false,children:[],classList:{toggle(){}},setAttribute(){},append(...children){this.children.push(...children);for(const child of children)if(child.id)elements.set(child.id,child)},after(child){elements.set(child.id,child)}});
 for(const id of ['create','review','grantBox','recheck'])elements.set(id,node());
 const context=vm.createContext({api,readPayload:()=>body,$:id=>elements.get(id),document:{createElement:node,createTextNode:text=>({text}),getElementById:id=>elements.get(id),addEventListener(){}}});
 vm.runInContext(script,context);
 return {context,elements,check:()=>vm.runInContext('checkReadiness()',context)};
}
test('approved one-job grant automatically rechecks without creating a job',async()=>{
  const html=await handleCreateJobWorkerPage(new Request('https://example.test/internal/admin/jobs/create-job')).text();
  const start=html.indexOf("$('grantConfirm').onchange=");
  const end=html.indexOf(';setStep(0);loadRequestedClient()',start);
  assert.ok(start>0&&end>start,'grant handler is available');
  const nodes=new Map([
    ['grantConfirm',{checked:true}],
    ['grant',{disabled:false}],
    ['grantBox',{classList:{add(){}}}],
    ['grantResult',{textContent:''}],
    ['create',{disabled:true}]
  ]);
  let checks=0;const calls=[];const snapshot={client_id:body.client_id,model:body.model,job_date:body.job_date};
  const ctx=vm.createContext({
    $:id=>nodes.get(id),readPayload:()=>({...snapshot}),JSON,
    initialModelId:'',readinessSequence:0,readinessKey:'old',readinessResult:{can_create:false},
    approvedOwnerGrantKey:'',show:()=>{},checkReadiness:async()=>{checks++;return false},
    api:async(path,opts)=>{calls.push({path,payload:JSON.parse(opts.body)});return {grant_status:'pending'}}
  });
  vm.runInContext(html.slice(start,end),ctx);
  await nodes.get('grant').onclick();
  assert.equal(checks,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/v1/admin/job/owner-grant');
  assert.equal(calls[0].payload.owner_grant_reason_code,'AUTHORITATIVE_MEMBER_NOT_FOUND');
  assert.equal(ctx.readinessKey,'');
  assert.equal(ctx.readinessResult,null);
  assert.equal(ctx.approvedOwnerGrantKey,JSON.stringify(snapshot));
  assert.equal(nodes.get('create').disabled,true,'grant approval must never auto-create or bypass preflight');
});
test('browser keeps create disabled and offers existing job instead',async()=>{
 const ui=await readinessUi(async()=>({can_create:false,message:'พบงานเดิม',jobs:[{kind:'existing_job',href:'/internal/admin/jobs/all?session_id=sess_existing'}]}));
 assert.equal(await ui.check(),false);assert.equal(ui.elements.get('create').disabled,true);
 assert.ok(ui.elements.get('readiness').children.some(n=>n.href==='/internal/admin/jobs/all?session_id=sess_existing'));
});
test('browser requires explicit schedule acknowledgement for unknown availability',async()=>{
 const ui=await readinessUi(async()=>({can_create:true,availability:'unknown',message:'ยังไม่แจ้งความพร้อม'}));
 assert.equal(await ui.check(),false);assert.equal(ui.elements.get('create').disabled,true);
 const ack=ui.elements.get('availabilityAck');ack.checked=true;ack.onchange();
 assert.equal(ui.elements.get('create').disabled,false);
 assert.equal(await ui.check(),true);
});
test('browser cannot enable create on failed preflight or stale response',async()=>{
 const failed=await readinessUi(async()=>{throw Error('offline')});
 assert.equal(await failed.check(),false);assert.equal(failed.elements.get('create').disabled,true);
 let resolve;const stale=await readinessUi(()=>new Promise(r=>{resolve=r}));
 const pending=stale.check();vm.runInContext('readinessSequence++',stale.context);
 resolve({can_create:true,availability:'available'});
 assert.equal(await pending,false);assert.equal(stale.elements.get('create').disabled,true);
});

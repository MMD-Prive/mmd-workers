import test from 'node:test';
import assert from 'node:assert/strict';
import {OWNER_OPS_FIELDS as F, applyOwnerJobAction, projectOwnerAction} from './src/job-orchestrator-owner-ops-runtime.js';
import {handleModelPayoutAdjustments} from './src/model-payout-adjustments.js';
const SID='fixture-evidence-session', S='tblC98mKWbzmPuNzX', P='tblMvsl7qYozD05e5', L='tbl2624vwyWkOeP0y', M='tblWGGJJOx5eBvBZJ', C='tbltWzMBhWev4JR13';
const actor={id:'fixture-owner',role:'owner'};
async function fixture(t,{status=null,amount=9000}={}){
 const state={writes:[],rows:{[S]:[{id:'recSyntheticSes01',fields:{session_id:SID,pay_model_thb:9000,'Canonical Model':['recSyntheticMod01'],[F.session.sessionId]:SID,[F.session.modelPayout]:9000,[F.session.state]:status==='payout_paid'?'closed':status==='payout_pending'?'payout_pending':'under_review',[F.session.completion]:'clear'}}],[P]:status?[{id:'recSyntheticEvidence',fields:{[F.payout.sessionId]:SID,[F.payout.type]:'session_payout',[F.payout.amount]:amount,[F.payout.status]:status}}]:[],[L]:[],[M]:[{id:'recSyntheticPayment',fields:{[F.payment.sessionId]:SID,[F.payment.verification]:'verified'}}],[C]:[]},objects:new Map()};
 let serial=0;
 const bucket={async get(k){const x=state.objects.get(k);return x?{etag:x.etag,text:async()=>x.body}:null;},async put(k,body,opts={}){const p=state.objects.get(k),c=opts.onlyIf||{};if(c.etagDoesNotMatch==='*'&&p||c.etagMatches&&c.etagMatches!==p?.etag)return null;const etag='e'+(++serial);state.objects.set(k,{etag,body});return {etag};}};
 let storage=bucket;
 if(process.env.PAYOUT_NATIVE_R2==='1'){
  const {pathToFileURL}=await import('node:url');const {resolve}=await import('node:path');
  const {Miniflare}=await import(pathToFileURL(resolve(process.env.PAYOUT_TOOLS_DIR,'node_modules/miniflare/dist/src/index.js')).href);
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("fixture")}}',r2Buckets:['JOURNAL'],compatibilityDate:'2026-01-01'});t.after(()=>mf.dispose());storage=await mf.getR2Bucket('JOURNAL');
 }
 const env={AIRTABLE_API_KEY:'fixture-only',AIRTABLE_BASE_ID:'fixture-base',LINE_SLIP_EVIDENCE:storage};
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
  const req=new Request(input,init),u=new URL(req.url),[, , ,table,id]=u.pathname.split('/');
  assert.equal(u.hostname,'api.airtable.com','real delivery/network forbidden');assert.ok(state.rows[table],'unexpected table');
  if(req.method==='GET'){
   if(table===P&&state.unavailable)return Response.json({error:'fixture unavailable'},{status:503});
   let records=structuredClone(state.rows[table]);const formula=u.searchParams.get('filterByFormula')||'';
   if(table===L&&formula.includes('idempotency_key'))records=records.filter(r=>formula.includes('"'+r.fields.idempotency_key+'"'));
   return Response.json(id?records.find(r=>r.id===id):{records,...(table===P&&state.partial?{offset:'more'}:{})});
  }
  const body=await req.json();state.writes.push({table,method:req.method,fields:body.fields});
  if(state.pauseTable===table&&!state.paused){state.paused=true;state.started();await state.pause;}
  let row;
  if(req.method==='POST'){row={id:'recFixture'+(++serial),fields:body.fields};state.rows[table].push(row);}
  else {row=state.rows[table].find(r=>r.id===id);assert.ok(row);Object.assign(row.fields,body.fields);}
  if(table===S){if('pay_model_thb' in body.fields)row.fields[F.session.modelPayout]=body.fields.pay_model_thb;if(F.session.modelPayout in body.fields)row.fields.pay_model_thb=body.fields[F.session.modelPayout];}
  if(state.timeoutTable===table)return Response.json({error:'lost commit acknowledgement'},{status:503});
  return Response.json(structuredClone(row));
 });
 const adjust=async()=>handleModelPayoutAdjustments(new Request('https://mmdbkk.com/v1/admin/model-payout/adjustments',{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body:JSON.stringify({session_id:SID,direction:'add',adjustment_type:'travel',amount_thb:1000,idempotency_key:'fixture-adjust'})}),env,actor);
 const action=(action,body={})=>applyOwnerJobAction(env,{session_id:SID,action,transfer_ref:'fixture-transfer-reference',...body},actor);
 const reload=()=>handleModelPayoutAdjustments(new Request('https://mmdbkk.com/v1/admin/model-payout/adjustments?session_id='+SID),env,actor);
 return {state,env,adjust,action,reload};
}
for(const status of ['payout_pending','payout_paid'])test('adjustment cannot diverge '+status+' evidence',async t=>{
 const f=await fixture(t,{status});const before=structuredClone(f.state.rows);assert.equal((await f.adjust()).status,409);assert.deepEqual(f.state.rows,before);assert.equal(f.state.writes.length,0);assert.equal((await (await f.reload()).json()).session.current_payout_thb,9000);
});
test('paid action rejects evidence/Session amount mismatch and projection hides action',async t=>{
 const f=await fixture(t,{status:'payout_pending',amount:8000});assert.equal((await f.action('mark_payout_paid')).status,409);assert.equal(f.state.writes.length,0);
 const p=projectOwnerAction(f.state.rows[S][0],{payment:f.state.rows[M][0],payout:f.state.rows[P][0]});assert.equal(p.actions.can_mark_payout_paid,false);
});
for(const failure of ['unavailable','partial'])test('evidence '+failure+' is unavailable, never empty authority',async t=>{
 const f=await fixture(t);f.state[failure]=true;assert.equal((await f.adjust()).status,503);assert.equal(f.state.writes.length,0);
});
test('ready writer and adjustment share one per-session claim',async t=>{
 const f=await fixture(t);let release;f.state.pauseTable=P;f.state.pause=new Promise(r=>release=r);const started=new Promise(r=>f.state.started=r);
 const ready=f.action('mark_payout_ready');await started;let adjustment;try{adjustment=await f.adjust();}finally{release();}assert.equal((await ready).status,200);assert.equal(adjustment.status,409);
 assert.equal(f.state.rows[S][0].fields.pay_model_thb,9000);assert.equal(f.state.rows[P][0].fields[F.payout.amount],9000);assert.equal((await f.adjust()).status,409);assert.equal(f.state.rows[L].length,0);
});
test('paid evidence commit timeout quarantines retry and new adjustment',async t=>{
 const f=await fixture(t,{status:'payout_pending'});f.state.timeoutTable=P;
 assert.equal((await f.action('mark_payout_paid')).status,503);const n=f.state.writes.length;delete f.state.timeoutTable;
 assert.equal((await f.action('mark_payout_paid')).status,409);assert.equal((await f.adjust()).status,409);assert.equal(f.state.writes.length,n);assert.equal(f.state.rows[P][0].fields[F.payout.status],'payout_paid');assert.equal((await (await f.reload()).json()).operation.review_required,true);
});
test('paid success persists, reloads and repeated command never writes again',async t=>{
 const f=await fixture(t,{status:'payout_pending'});assert.equal((await f.action('mark_payout_paid')).status,200);const n=f.state.writes.length;
 assert.equal(f.state.rows[S][0].fields[F.session.state],'closed');assert.equal(f.state.rows[P][0].fields[F.payout.status],'payout_paid');assert.equal((await (await f.reload()).json()).session.current_payout_thb,9000);assert.equal((await f.action('mark_payout_paid')).status,409);assert.equal(f.state.writes.length,n);
});
for(const gate of ['hold','unverified','care'])test('paid writer rechecks '+gate+' before any write',async t=>{
 const f=await fixture(t,{status:'payout_pending'});
 if(gate==='hold')f.state.rows[S][0].fields[F.session.completion]='hold';
 if(gate==='unverified')f.state.rows[M][0].fields[F.payment.verification]='pending';
 if(gate==='care')f.state.rows[C].push({id:'recSyntheticCare',fields:{[F.care.sessionId]:SID,[F.care.status]:'open'}});
 assert.equal((await f.action('mark_payout_paid')).status,409);assert.equal(f.state.writes.length,0);
});
test('adjustment in flight excludes ready writer; retry uses the persisted new total',async t=>{
 const f=await fixture(t);let release;f.state.pauseTable=L;f.state.pause=new Promise(r=>release=r);const started=new Promise(r=>f.state.started=r);
 const adjust=f.adjust();await started;let ready;try{ready=await f.action('mark_payout_ready');}finally{release();}
 assert.equal((await adjust).status,201);assert.equal(ready.status,409);assert.equal((await f.action('mark_payout_ready')).status,200);
 assert.equal(f.state.rows[P][0].fields[F.payout.amount],10000);assert.equal((await (await f.reload()).json()).session.current_payout_thb,10000);
});
test('ready create timeout preserves one evidence row and quarantines another attempt',async t=>{
 const f=await fixture(t);f.state.timeoutTable=P;assert.equal((await f.action('mark_payout_ready')).status,503);const n=f.state.writes.length;delete f.state.timeoutTable;
 assert.equal((await f.action('mark_payout_ready')).status,409);assert.equal((await f.adjust()).status,409);assert.equal(f.state.rows[P].length,1);assert.equal(f.state.writes.length,n);
});
for(const mode of ['duplicate','malformed'])test('ambiguous '+mode+' evidence never authorizes money writes',async t=>{
 const f=await fixture(t,{status:'payout_pending'});
 if(mode==='duplicate')f.state.rows[P].push({...structuredClone(f.state.rows[P][0]),id:'recSyntheticEvidence2'});
 else delete f.state.rows[P][0].fields;
 assert.ok([409,503].includes((await f.adjust()).status));assert.ok([409,503].includes((await f.action('mark_payout_paid')).status));assert.equal(f.state.writes.length,0);
});
test('denied actor and unavailable shared journal cannot write or notify',async t=>{
 const f=await fixture(t);assert.equal((await applyOwnerJobAction(f.env,{session_id:SID,action:'mark_payout_ready'},{role:'model'})).status,403);
 assert.equal((await applyOwnerJobAction({...f.env,LINE_SLIP_EVIDENCE:null},{session_id:SID,action:'mark_payout_ready'},actor)).status,503);assert.equal(f.state.writes.length,0);
});

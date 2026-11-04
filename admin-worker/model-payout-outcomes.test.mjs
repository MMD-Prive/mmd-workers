import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PATH='/v1/admin/model-payout/adjustments', MODEL='recSyntheticMod01', SESSION='recSyntheticSes01';
const envBase={AIRTABLE_API_KEY:'fixture-only',AIRTABLE_BASE_ID:'fixture-base',AIRTABLE_TABLE_SESSIONS:'sessions',AIRTABLE_TABLE_MODEL_PAYOUT_ADJUSTMENTS:'adjustments'};
const actor={id:'fixture-owner',role:'owner'};
async function fixture(t){
 const state={session:{id:SESSION,fields:{session_id:'fixture-session',model_name:'Synthetic', 'Canonical Model':[MODEL],pay_model_thb:9000,amount_thb:15000,payment_status:'verified'}},rows:[],writes:[],objects:new Map(),fail:{}};
 let serial=0;
 const bucket={async get(key){const x=state.objects.get(key);return x?{etag:x.etag,text:async()=>x.body}:null;},async put(key,body,options={}){const prior=state.objects.get(key),c=options.onlyIf||{};if(c.etagDoesNotMatch==='*'&&prior||c.etagMatches&&c.etagMatches!==prior?.etag)return null;const etag='e'+(++serial);state.objects.set(key,{etag,body});return {etag};}};
 let storage=bucket;
 if(process.env.PAYOUT_NATIVE_R2==='1'){
  const toolsModule=process.env.PAYOUT_TOOLS_DIR
    ? pathToFileURL(resolve(process.env.PAYOUT_TOOLS_DIR,'node_modules/miniflare/dist/src/index.js')).href
    : new URL('../../runtime-tools/node_modules/miniflare/dist/src/index.js',import.meta.url).href;
  const {Miniflare}=await import(toolsModule);
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("fixture")}}',r2Buckets:['JOURNAL'],compatibilityDate:'2026-01-01'});
  t.after(()=>mf.dispose());const native=await mf.getR2Bucket('JOURNAL');storage={get:(...args)=>native.get(...args),put:(...args)=>native.put(...args)};
 }
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
  const req=input instanceof Request?input:new Request(String(input),init),url=new URL(req.url),method=req.method,table=url.pathname.split('/')[3];
  assert.equal(url.hostname,'api.airtable.com','outbound must be intercepted; no real notifications');
  if(method==='GET'){
   if(table==='tblMvsl7qYozD05e5')return Response.json({records:[]});
   if(state.fail.read)throw Error('synthetic read unavailable');
   if(table==='sessions'){if(state.fail.sessionMalformed)return Response.json({});return Response.json({records:state.fail.duplicateSession?[structuredClone(state.session),{...structuredClone(state.session),id:'recSyntheticSes02'}]:[structuredClone(state.session)]});}
   const formula=url.searchParams.get('filterByFormula')||'';
   const rows=formula.includes('idempotency_key')?state.rows.filter(r=>formula.includes('"'+r.fields.idempotency_key+'"')):state.rows;
   if(state.fail.ledgerMalformed)return Response.json({});
   return Response.json({records:structuredClone(rows),...(state.fail.partial?{offset:'synthetic-next-page'}:{})});
  }
  const body=['POST','PATCH'].includes(method)?await req.json():{};state.writes.push({method,table,fields:body.fields});
  if(table==='adjustments'&&method==='POST'){
   if(state.pauseCreate&&!state.createPaused){state.createPaused=true;state.createStarted();await state.pauseCreate;}
   if(state.fail.create==='before')throw Error('synthetic unknown create');
   const row={id:'recFixtureAdj'+String(state.rows.length+1).padStart(4,'0'),fields:{...body.fields,signed_amount_thb:body.fields.direction==='deduct'?-body.fields.amount_thb:body.fields.amount_thb}};state.rows.push(row);
   if(state.fail.create==='after')throw Error('synthetic lost acknowledgement');
   if(state.fail.create==='malformed')return Response.json({});
   if(state.fail.omitEmpty){const output=structuredClone(row);delete output.fields.note;return Response.json(output,{status:201});}
   return Response.json(row,{status:201});
  }
  if(table==='sessions'&&method==='PATCH'){
   Object.assign(state.session.fields,body.fields);
   if(state.fail.patch==='after')return Response.json({error:'synthetic lost acknowledgement'},{status:503});
   if(state.fail.patch==='throw')throw Error('synthetic lost acknowledgement');
   if(state.fail.patch==='malformed')return Response.json({});
   return Response.json(structuredClone(state.session));
  }
  if(table==='adjustments'&&method==='DELETE'){state.rows=state.rows.filter(r=>!url.pathname.endsWith('/'+r.id));return Response.json({deleted:true});}
  throw Error('unexpected synthetic request');
 });
 const env={...envBase,LINE_SLIP_EVIDENCE:storage};
 const load=()=>import((process.env.PAYOUT_MODULE_URL || './src/model-payout-adjustments.js')+'?reload='+crypto.randomUUID());
 const post=async(data={},options={})=>{const m=await load();return m.handleModelPayoutAdjustments(new Request('https://mmdbkk.com'+PATH,{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body:JSON.stringify({session_id:'fixture-session',direction:'add',adjustment_type:'travel',amount_thb:1000,idempotency_key:'fixture-command-1',...data})}),options.env||env,options.actor===undefined?actor:options.actor);};
 const get=async()=>{const m=await load();return m.handleModelPayoutAdjustments(new Request('https://mmdbkk.com'+PATH+'?session_id=fixture-session'),env,actor);};
 return {state,env,post,get,storage};
}

test('changed payload with the same key is denied with zero additional writes',async t=>{
 const f=await fixture(t);assert.equal((await f.post()).status,201);const n=f.state.writes.length;
 const r=await f.post({direction:'deduct',amount_thb:500,adjustment_type:'correction'});assert.equal(r.status,409);assert.equal(f.state.writes.length,n);
});
test('timeout after Session commit keeps ledger evidence and blocks retry across reload',async t=>{
 const f=await fixture(t);f.state.fail.patch='after';assert.equal((await f.post()).status,503);
 assert.equal(f.state.session.fields.pay_model_thb,10000);assert.equal(f.state.rows.length,1,'must not delete ledger after ambiguous patch');
 const n=f.state.writes.length;delete f.state.fail.patch;const retry=await f.post();assert.notEqual(retry.status,200);assert.equal(f.state.writes.length,n);
 const read=await (await f.get()).json();assert.equal(read.operation.review_required,true);assert.equal(read.integrity.needs_reconciliation,true);
});
test('concurrent distinct commands cannot overwrite the same starting total',async t=>{
 const f=await fixture(t);let release,started;
 f.state.pauseCreate=new Promise(r=>release=r);const reached=new Promise(r=>started=r);f.state.createStarted=started;
 const first=f.post();await reached;
 const second=await f.post({amount_thb:500,idempotency_key:'fixture-command-2'});
 release();assert.equal((await first).status,201);delete f.state.pauseCreate;assert.equal(second.status,409);
 assert.equal((await f.post({amount_thb:500,idempotency_key:'fixture-command-2'})).status,201);assert.equal(f.state.session.fields.pay_model_thb,10500);
 const read=await (await f.get()).json();assert.equal(read.integrity.ok,true);assert.equal(read.adjustments.length,2);
});

test('add, deduct correction, reload and identical replay preserve the append-only ledger',async t=>{
 const f=await fixture(t);assert.equal((await f.post()).status,201);
 assert.equal((await f.post({direction:'deduct',adjustment_type:'correction',amount_thb:250,note:'synthetic correction',idempotency_key:'fixture-correction'})).status,201);
 const n=f.state.writes.length;const replay=await f.post();assert.equal(replay.status,200);assert.equal((await replay.json()).session.current_payout_thb,9750);assert.equal(f.state.writes.length,n);
 const read=await (await f.get()).json();assert.equal(read.session.current_payout_thb,9750);assert.equal(read.integrity.ok,true);assert.equal(read.integrity.adjustment_net_thb,750);assert.equal(read.adjustments.length,2);
 assert.equal(f.state.session.fields.amount_thb,15000);assert.equal(f.state.session.fields.payment_status,'verified');assert.equal(f.state.writes.some(w=>w.method==='DELETE'),false);
});
for(const failure of ['before','after','malformed'])test('unconfirmed ledger create '+failure+' is quarantined across reload',async t=>{
 const f=await fixture(t);f.state.fail.create=failure;assert.equal((await f.post()).status,503);assert.equal(f.state.session.fields.pay_model_thb,9000);
 const n=f.state.writes.length;delete f.state.fail.create;assert.equal((await f.post()).status,409);assert.equal((await f.post({idempotency_key:'different-key'})).status,409);assert.equal(f.state.writes.length,n);
 assert.equal((await (await f.get()).json()).operation.review_required,true);
});
for(const failure of ['throw','malformed'])test('unconfirmed Session patch '+failure+' retains ledger and never auto-replays',async t=>{
 const f=await fixture(t);f.state.fail.patch=failure;assert.equal((await f.post()).status,503);assert.equal(f.state.rows.length,1);const n=f.state.writes.length;
 delete f.state.fail.patch;assert.equal((await f.post()).status,409);assert.equal(f.state.writes.length,n);assert.equal((await (await f.get()).json()).operation.review_required,true);
});
test('concurrent identical commands create one adjustment and later replay without writes',async t=>{
 const f=await fixture(t);let release,started;f.state.pauseCreate=new Promise(r=>release=r);const reached=new Promise(r=>started=r);f.state.createStarted=started;
 const first=f.post();await reached;assert.equal((await f.post()).status,409);release();assert.equal((await first).status,201);delete f.state.pauseCreate;
 const n=f.state.writes.length;assert.equal((await f.post()).status,200);assert.equal(f.state.rows.length,1);assert.equal(f.state.writes.length,n);
});
test('invalid, denied and missing key paths do not write storage or Airtable',async t=>{
 const f=await fixture(t);
 for(const data of [{amount_thb:-1},{amount_thb:true},{amount_thb:0.1},{amount_thb:'bad'},{idempotency_key:''},{idempotency_key:'x'.repeat(181)},{idempotency_key:7},{direction:'invalid'}])assert.equal((await f.post(data)).status,400);
 assert.equal((await f.post({}, {actor:null})).status,401);assert.equal((await f.post({}, {actor:{role:'model'}})).status,403);
 assert.equal(f.state.writes.length,0);assert.equal(f.state.objects.size,0);
});
test('journal unavailable fails before business writes',async t=>{
 const f=await fixture(t);assert.equal((await f.post({}, {env:{...f.env,LINE_SLIP_EVIDENCE:null}})).status,503);assert.equal(f.state.writes.length,0);
});
test('null payout is unavailable in audit rather than zero',async t=>{
 const f=await fixture(t);f.state.session.fields.pay_model_thb=null;const read=await (await f.get()).json();assert.equal(read.session.current_payout_thb,null);assert.equal(read.integrity.actual_current_payout_thb,null);assert.equal(read.integrity.ok,false);
});
test('observed external edit after ledger create blocks Session overwrite',async t=>{
 const f=await fixture(t);let release,started;f.state.pauseCreate=new Promise(r=>release=r);const reached=new Promise(r=>started=r);f.state.createStarted=started;
 const pending=f.post();await reached;f.state.session.fields.pay_model_thb=9500;release();assert.equal((await pending).status,503);assert.equal(f.state.session.fields.pay_model_thb,9500);assert.equal(f.state.rows.length,1);assert.equal(f.state.writes.some(w=>w.method==='PATCH'),false);
});
test('missing formula output derives signed amount from direction rather than treating null as zero',async t=>{
 const f=await fixture(t);assert.equal((await f.post()).status,201);f.state.rows[0].fields.signed_amount_thb=null;
 const read=await (await f.get()).json();assert.equal(read.adjustments[0].signed_amount_thb,1000);assert.equal(read.integrity.ok,true);
});
test('completed command cannot hide later canonical total drift',async t=>{
 const f=await fixture(t);assert.equal((await f.post()).status,201);const n=f.state.writes.length;f.state.session.fields.pay_model_thb=10001;
 assert.equal((await f.post()).status,409);assert.equal(f.state.writes.length,n);
});
test('lost journal completion acknowledgement never permits replay of saved money changes',async t=>{
 const f=await fixture(t);let calls=0;const orig=f.storage.put.bind(f.storage);
 f.storage.put=async(key,body,options)=>{const parsed=JSON.parse(body);if(key.includes('/sessions/')&&parsed.state==='ready'){calls++;throw Error('synthetic lost completion');}return orig(key,body,options);};
 assert.equal((await f.post()).status,503);assert.equal(calls,1);assert.equal(f.state.session.fields.pay_model_thb,10000);const n=f.state.writes.length;assert.equal((await f.post()).status,409);assert.equal(f.state.writes.length,n);
});
test('unknown claim acknowledgement blocks without any business write',async t=>{
 const f=await fixture(t);const orig=f.storage.put.bind(f.storage);
 f.storage.put=async(key,body,options)=>{const result=await orig(key,body,options);if(key.includes('/sessions/'))throw Error('synthetic lost claim');return result;};
 assert.equal((await f.post()).status,503);assert.equal(f.state.writes.length,0);assert.equal((await f.post()).status,409);assert.equal(f.state.writes.length,0);
});
for (const mode of ['sessionMalformed','ledgerMalformed','partial','duplicateSession'])test('unavailable or ambiguous authority '+mode+' never becomes an empty/zero authority',async t=>{
 const f=await fixture(t);f.state.fail[mode]=true;const r=await f.post();assert.ok([409,503].includes(r.status));assert.equal(f.state.writes.length,0);
 const read=await f.get();assert.ok([409,503].includes(read.status));
});
test('Airtable may omit empty text in write acknowledgement',async t=>{
 const f=await fixture(t);f.state.fail.omitEmpty=true;assert.equal((await f.post()).status,201);assert.equal(f.state.session.fields.pay_model_thb,10000);
});
test('corrupt session journal cannot authorize another write',async t=>{
 const f=await fixture(t);assert.equal((await f.post()).status,201);
 const {payoutOperationHash}=await import('./src/model-payout-operation.js');
 await f.storage.put('owner-model-payout-operations/v1/sessions/'+await payoutOperationHash('fixture-session')+'.json','{broken');
 const n=f.state.writes.length;assert.equal((await f.post({idempotency_key:'next-command'})).status,503);assert.equal(f.state.writes.length,n);
 const read=await (await f.get()).json();assert.equal(read.operation.state,'unavailable');assert.equal(read.integrity.needs_reconciliation,true);
});
test('idempotency reservation prevents a key being reused for a different session',async t=>{
 const f=await fixture(t);assert.equal((await f.post()).status,201);const n=f.state.writes.length;
 assert.equal((await f.post({session_id:'other-fixture-session'})).status,409);assert.equal(f.state.writes.length,n);
});
test('failed read before any upstream write can retry without uncertain-money quarantine',async t=>{
 const f=await fixture(t);f.state.fail.read=true;const failed=await f.post();assert.equal(failed.status,503);const body=await failed.json();assert.equal(body.payout_write_state,'not_attempted');assert.equal(body.retryable,true);assert.equal(f.state.writes.length,0);
 delete f.state.fail.read;assert.equal((await f.post()).status,201);assert.equal(f.state.rows.length,1);
});
test('a capped 100-row history is unavailable rather than falsely complete',async t=>{
 const f=await fixture(t);f.state.rows=Array.from({length:100},(_,i)=>({id:'recCapped'+i,fields:{idempotency_key:'capped-'+i,session_id:'fixture-session'}}));
 assert.equal((await f.post()).status,503);assert.equal(f.state.writes.length,0);assert.equal((await f.get()).status,503);
});

import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(resolve(process.env.PAYOUT_TOOLS_DIR || '../runtime-tools','package.json'));
const {Miniflare}=require('miniflare');
const folder=resolve(process.env.PAYOUT_BUNDLE_DIR || 'payout-compatible');
const fixtureFolder=resolve(process.env.PAYOUT_FIXTURE_DIR || 'payout-artifact-fixture');
mkdirSync(fixtureFolder,{recursive:true});
const output=resolve(fixtureFolder,'payout-preserved-fixture.js');
const production=readFileSync(resolve(folder,'worker.js'),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(hash(production),'78788eb6898dca9856341b2db276c3f51c957044c5ee0152402d876fe008ec9a');
assert.equal(hash(readFileSync(resolve(folder,'admin-login-hero-worker.js.map'))),'8f8ef8b9566e5fdbb45c581996dda02aa1fc8219dc8cbfc0649da1020a773586');
const map=JSON.parse(readFileSync(resolve(folder,'admin-login-hero-worker.js.map'),'utf8'));
assert.equal(map.file,'worker.js');assert.equal(map.sourceRoot,'');
assert.ok(map.sources.includes('admin-worker/src/model-payout-operation.js'));
assert.ok(map.sources.every(s=>!s.startsWith('/')&&!s.split('/').includes('..')));
const exportAt=production.lastIndexOf('\nexport {');assert.ok(exportAt>0);
// Test-only adapter retains the full compiled closure; the production exports remain untouched.
const adapter=production.slice(0,exportAt)+`\nexport default {fetch(request,env){return handleModelPayoutAdjustments(request,env,new URL(request.url).searchParams.has('deny')?null:{role:'owner',id:'fixture-owner'});}}`;
writeFileSync(output,adapter);
const persist=mkdtempSync(resolve(tmpdir(),'mmd-payout-fixture-'));
const state={session:{id:'recSyntheticSes01',fields:{session_id:'runtime-fixture',model_name:'Synthetic','Canonical Model':['recSyntheticMod01'],pay_model_thb:9000,amount_thb:15000,payment_status:'verified'}},rows:[],writes:0,patchUnknown:false};
const mfOptions={modules:true,modulesRoot:fixtureFolder,scriptPath:output,compatibilityDate:'2026-01-01',r2Buckets:['LINE_SLIP_EVIDENCE'],r2Persist:persist,bindings:{AIRTABLE_API_KEY:'fixture-only',AIRTABLE_BASE_ID:'fixture',AIRTABLE_TABLE_SESSIONS:'sessions',AIRTABLE_TABLE_MODEL_PAYOUT_ADJUSTMENTS:'adjustments'},outboundService:async request=>{
 const u=new URL(request.url);assert.equal(u.hostname,'api.airtable.com','block all real outbound');const table=u.pathname.split('/')[3];
 if(request.method==='GET'){const formula=u.searchParams.get('filterByFormula')||'';return Response.json({records:structuredClone(table==='sessions'?[state.session]:formula.includes('idempotency_key')?state.rows.filter(r=>formula.includes('"'+r.fields.idempotency_key+'"')):state.rows)});}
 state.writes++;const {fields}=await request.json();
 if(request.method==='POST'&&table==='adjustments'){if(state.pauseCreate&&!state.paused){state.paused=true;state.createStarted();await state.pauseCreate;}const row={id:'recRuntimeAdj'+String(state.rows.length+1).padStart(4,'0'),fields:{...fields,signed_amount_thb:fields.direction==='deduct'?-fields.amount_thb:fields.amount_thb}};state.rows.push(row);return Response.json(row,{status:201});}
 assert.equal(request.method,'PATCH');assert.equal(table,'sessions');Object.assign(state.session.fields,fields);if(state.patchUnknown)return Response.json({error:'synthetic timeout after commit'},{status:503});return Response.json(structuredClone(state.session));
}};
let mf=new Miniflare(mfOptions);
const request=(payload={},query='')=>mf.dispatchFetch('https://mmdbkk.com/v1/admin/model-payout/adjustments'+query,{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body:JSON.stringify({session_id:'runtime-fixture',direction:'add',adjustment_type:'travel',amount_thb:1000,idempotency_key:'runtime-add',...payload})});
const results=[];
try{
 assert.equal((await mf.dispatchFetch('https://mmdbkk.com/v1/admin/model-payout/adjustments?deny')).status,401);assert.equal(state.writes,0);results.push('deny has zero outbound writes');
 assert.equal((await request()).status,201);
 assert.equal((await request({direction:'deduct',adjustment_type:'correction',amount_thb:250,idempotency_key:'runtime-correction'})).status,201);
 await mf.dispose();mf=new Miniflare(mfOptions);
 const n=state.writes;assert.equal((await request()).status,200);assert.equal(state.writes,n);
 const read=await (await mf.dispatchFetch('https://mmdbkk.com/v1/admin/model-payout/adjustments?session_id=runtime-fixture')).json();assert.equal(read.session.current_payout_thb,9750);assert.equal(read.integrity.ok,true);assert.equal(read.adjustments.length,2);results.push('add/deduct correction persist and replay after worker/storage restart');
 const beforeConflict=state.writes;assert.equal((await request({direction:'deduct',amount_thb:500})).status,409);assert.equal(state.writes,beforeConflict);results.push('changed command with same key denied without upstream writes');
 let release,started;state.pauseCreate=new Promise(r=>release=r);const reached=new Promise(r=>started=r);state.createStarted=started;
 const concurrent=request({idempotency_key:'runtime-concurrent-a',amount_thb:100});await reached;
 const loser=await request({idempotency_key:'runtime-concurrent-b',amount_thb:50});release();assert.equal((await concurrent).status,201);assert.equal(loser.status,409);delete state.pauseCreate;
 assert.equal((await request({idempotency_key:'runtime-concurrent-b',amount_thb:50})).status,201);assert.equal(state.session.fields.pay_model_thb,9900);results.push('compiled candidate serializes concurrent distinct commands with native R2');
 state.patchUnknown=true;assert.equal((await request({idempotency_key:'runtime-unknown'})).status,503);assert.equal(state.rows.length,5);assert.equal(state.session.fields.pay_model_thb,10900);
 await mf.dispose();mf=new Miniflare(mfOptions);const m=state.writes;assert.equal((await request({idempotency_key:'runtime-unknown'})).status,409);assert.equal(state.writes,m);
 const unknown=await (await mf.dispatchFetch('https://mmdbkk.com/v1/admin/model-payout/adjustments?session_id=runtime-fixture')).json();assert.equal(unknown.operation.review_required,true);assert.equal(unknown.integrity.needs_reconciliation,true);results.push('timeout after commit quarantined across worker/storage restart');
 assert.equal(state.session.fields.amount_thb,15000);assert.equal(state.session.fields.payment_status,'verified');results.push('customer and payment authority fields preserved');
}finally{await mf.dispose();}
const receipt={environment:'full preserved candidate compiled closure with synthetic owner/default-export adapter; local workerd/native persisted R2; not production auth acceptance',production_artifact_sha256:createHash('sha256').update(production).digest('hex'),bundle_sha256:createHash('sha256').update(readFileSync(output)).digest('hex'),production_exports_unchanged:true,test_adapter_not_for_deployment:true,results};
writeFileSync(resolve(fixtureFolder,'result.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));

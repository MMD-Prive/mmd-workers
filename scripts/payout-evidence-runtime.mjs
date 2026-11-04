import {createRequire} from 'node:module';
const {Miniflare}=createRequire((process.env.PAYOUT_TOOLS_DIR||process.cwd()+'/../payout-p0/build-tools')+'/package.json')('miniflare');
const {parse}=createRequire((process.env.PAYOUT_TOOLS_DIR||process.cwd()+'/../payout-p0/build-tools')+'/package.json')('acorn');
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {OWNER_OPS_FIELDS as F} from '../admin-worker/src/job-orchestrator-owner-ops-runtime.js';
const candidate=resolve(process.env.PAYOUT_BUNDLE_DIR||'payout-evidence-candidate'),baseline=resolve(process.env.PAYOUT_BASELINE_DIR||'payout-evidence-baseline'),fixtures=resolve(process.env.PAYOUT_FIXTURE_DIR||'payout-evidence-fixtures');mkdirSync(fixtures,{recursive:true});
const sid='runtime-evidence-session',S='tblC98mKWbzmPuNzX',P='tblMvsl7qYozD05e5',L='tbl2624vwyWkOeP0y',M='tblWGGJJOx5eBvBZJ',C='tbltWzMBhWev4JR13';
const rows={[S]:[{id:'recRuntimeSession',fields:{session_id:sid,pay_model_thb:9000,'Canonical Model':['recRuntimeModel'],[F.session.sessionId]:sid,[F.session.modelPayout]:9000,[F.session.state]:'under_review',[F.session.completion]:'clear'}}],[P]:[],[L]:[],[M]:[{id:'recRuntimePayment',fields:{[F.payment.sessionId]:sid,[F.payment.verification]:'verified'}}],[C]:[]};
let writes=0,timeout=false;
const outfile=resolve(fixtures,'admin-fixture.js');
const compiled=readFileSync(candidate+'/admin-worker/worker.js','utf8');const exportAt=compiled.lastIndexOf('\nexport {');assert.ok(exportAt>0);writeFileSync(outfile,compiled.slice(0,exportAt)+`\nexport default {async fetch(r,e){const actor={role:'owner',id:'fixture-owner'};return new URL(r.url).pathname==='/owner'?ownerActionHttpResponse(await applyOwnerJobAction(e,await r.json(),actor)):handleModelPayoutAdjustments(r,e,actor);}};`);

const options={modules:true,modulesRoot:fixtures,scriptPath:outfile,compatibilityDate:'2026-01-01',r2Buckets:['LINE_SLIP_EVIDENCE'],r2Persist:mkdtempSync(resolve(tmpdir(),'mmd-payout-evidence-')),bindings:{AIRTABLE_API_KEY:'fixture-only',AIRTABLE_BASE_ID:'fixture'},outboundService:async req=>{
 const u=new URL(req.url);assert.equal(u.hostname,'api.airtable.com','external delivery blocked');const [,,,table,id]=u.pathname.split('/');assert.ok(rows[table]);
 if(req.method==='GET')return Response.json(id?structuredClone(rows[table].find(x=>x.id===id)):{records:structuredClone(rows[table])});
 writes++;const {fields}=await req.json();let row;
 if(req.method==='POST'){row={id:'recRuntimeEvidence',fields};rows[table].push(row);}else {row=rows[table].find(x=>x.id===id);Object.assign(row.fields,fields);}
 if(timeout&&table===P)return Response.json({error:'lost acknowledgement'},{status:503});return Response.json(structuredClone(row));
}};
let mf=new Miniflare(options);const call=(action)=>mf.dispatchFetch('https://mmdbkk.com/owner',{method:'POST',body:JSON.stringify({session_id:sid,action,transfer_ref:'fixture-transfer'})});
const adjust=()=>mf.dispatchFetch('https://mmdbkk.com/v1/admin/model-payout/adjustments',{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body:JSON.stringify({session_id:sid,direction:'add',adjustment_type:'travel',amount_thb:1000,idempotency_key:'runtime-adjust'})});
try{
 assert.equal((await call('mark_payout_ready')).status,200);assert.equal(rows[P][0].fields[F.payout.amount],9000);
 await mf.dispose();mf=new Miniflare(options);const n=writes;assert.equal((await adjust()).status,409);assert.equal(writes,n);
 timeout=true;assert.equal((await call('mark_payout_paid')).status,503);assert.equal(rows[P][0].fields[F.payout.status],'payout_paid');
 await mf.dispose();mf=new Miniflare(options);timeout=false;const after=writes;assert.equal((await call('mark_payout_paid')).status,409);assert.equal((await adjust()).status,409);assert.equal(writes,after);
 const audit=await (await mf.dispatchFetch('https://mmdbkk.com/v1/admin/model-payout/adjustments?session_id='+sid)).json();assert.equal(audit.operation.review_required,true);assert.equal(audit.session.current_payout_thb,9000);
 writeFileSync(fixtures+'/admin-result.json',JSON.stringify({proof:'PASS_RUNTIME_FIXTURE; full local preserved candidate closure + test-only adapter; synthetic authority; persisted local R2; new isolate after each phase',checks:['ready snapshot survives restart; adjustment denied with zero writes','paid timeout persists evidence; unknown claim survives restart','retry and adjustment denied; audit requires review'],business_writes:0,external_messages:0},null,2));
 console.log('PASS_RUNTIME_FIXTURE: ready/restart/paid-timeout/restart/retry/audit');
}finally{await mf.dispose();}

// Full live/candidate payments route, with original service authentication intact.
for(const [label,file] of [['baseline',baseline+'/payments-worker/worker.js'],['candidate',candidate+'/payments-worker/worker.js']]){
 const code=readFileSync(file,'utf8'),ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
 const functions=ast.body.filter(n=>n.type==='FunctionDeclaration'&&['handleConfirmLink','handleCanonicalConfirmLink','createSessionIfMissing'].includes(n.id.name));assert.equal(functions.length,3);
 let adapted=code;for(const n of functions.sort((a,b)=>b.start-a.start))adapted=adapted.slice(0,n.body.start+1)+`\n__fixtureTrace.push(${JSON.stringify(n.id.name)});`+adapted.slice(n.body.start+1);
 const exports=ast.body.filter(n=>n.type==='ExportNamedDeclaration').flatMap(n=>n.specifiers.map(x=>({out:x.exported.name,local:x.local.name}))),def=exports.find(x=>x.out==='default');assert.ok(def);
 const at=adapted.lastIndexOf('export {');adapted=adapted.slice(0,at)+adapted.slice(at).replace(def.local+' as default',def.local+' as fixtureOriginal');
 adapted='const __fixtureTrace=[];\n'+adapted+`\nexport default {async fetch(r,e,c){__fixtureTrace.length=0;const response=await ${def.local}.fetch(r,e,c);return Response.json({actual_status:response.status,trace:__fixtureTrace.join(','),actual_body:await response.text()});}};`;
 const filePath=resolve(fixtures,'payments-'+label+'.js');writeFileSync(filePath,adapted);let outbound=0;
 const runtime=new Miniflare({modules:true,modulesRoot:fixtures,scriptPath:filePath,compatibilityDate:'2026-01-20',bindings:{AUTH_SERVICE_ADMIN_TO_PAYMENTS:'synthetic-auth-only'},outboundService:async()=>{outbound++;throw Error('real outbound forbidden');}});
 const cases=[];
 try{for(const authenticated of [false,true]){
  const r=await runtime.dispatchFetch('https://mmdbkk.com/v1/confirm/link',{method:'POST',headers:{'content-type':'application/json',...(authenticated?{'x-internal-token':'synthetic-auth-only'}:{})},body:'{}'});const result=await r.json();
  assert.equal(result.actual_status,authenticated?503:401);assert.equal(result.trace,'handleCanonicalConfirmLink');assert.equal(outbound,0);cases.push({authenticated,status:result.actual_status,trace:result.trace});
 }}finally{await runtime.dispose();}
 writeFileSync(resolve(fixtures,'payments-'+label+'-result.json'),JSON.stringify({cases,exports,outbound,original_auth_unchanged:true,legacy_writer_invoked:false},null,2));
}
console.log('PASS_RUNTIME_FIXTURE: payments original auth + canonical route; legacy not invoked for either binary');

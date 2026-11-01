import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./src/index.js', import.meta.url), 'utf8');
function extract(name) {
 const start = source.search(new RegExp('^(?:async )?function '+name+'\\(', 'm'));
 assert.ok(start >= 0);
 const rest = source.slice(start);
 const end = rest.slice(1).search(/\n(?:async )?function /);
 return end < 0 ? rest : rest.slice(0, end + 1);
}
const context = (id='recJobA', session_id='sess_a') => ({ok:true, payload:{},tables:{},session:{id,fields:{session_id}}});
const targetCode = extract('modelSessionActionTargetsContext');
const responseSession = (_tables, record) => record.fields;
test('action target requires the exact displayed session, including missing and invalid inputs', () => {
 const check=vm.runInNewContext(targetCode+';modelSessionActionTargetsContext', {modelSessionResponseSession:responseSession});
 assert.equal(check({session_id:'sess_a'}, context()),true);
 for(const body of [{},{session_id:null},{session_id:1},{session_id:''},{session_id:'sess_b'},{session_id:' sess_a'}])assert.equal(check(body,context()),false);
});
test('canonical ownership rejects absent, ambiguous, duplicate and mismatched links despite matching legacy names', () => {
 const owns=vm.runInNewContext(extract('modelSessionOwnsRecord')+';modelSessionOwnsRecord',{
  str:x=>String(x||''),modelSessionTables:()=>({sessions:{fields:{sessionId:'session_id',paymentRef:'payment_ref'}}}),
  modelSessionAssignmentKeys:()=>['sess_a'],modelSessionFieldValues:(f,keys)=>keys.flatMap(k=>f[k]?[f[k]]:[]),
  canonicalModelIds:r=>Array.isArray(r.fields['Canonical Model'])?r.fields['Canonical Model'].filter(x=>typeof x==='string'&&x.startsWith('rec')):[],
 });
 const payload={model_record_id:'recOwner',model_name:'same name'};
 for(const link of [undefined,[],['recOther'],['recOwner','recOther'],['recOwner','recOwner'],'recOwner']){
  const fields={session_id:'sess_a',Model:'recOwner','Model Name':'same name'};
  if(link!==undefined)fields['Canonical Model']=link;
  assert.equal(owns({},payload,{fields}),false);
 }
 assert.equal(owns({},payload,{fields:{session_id:'sess_a','Canonical Model':['recOwner']}}),true);
 assert.equal(owns({},payload,{fields:{session_id:'sess_other','Canonical Model':['recOwner']}}),false);
});
test('real action handler rejects changed or missing targets before extension, payment, writes or notifications', async()=>{
 for(const scenario of ['missing','wrong','reread-session','reread-record']){
  let reads=0;
  const body={action:'start_travel',...(scenario==='missing'?{}:{session_id:scenario==='wrong'?'sess_b':'sess_a'})};
  const scope={safeJson:async()=>body,resolveModelSessionContext:async()=>{
   reads++;return reads===1?context():scenario==='reread-session'?context('recJobB','sess_b'):context('recJobB','sess_a');
  },modelSessionResponseSession:responseSession,modelSessionJson:(body,status)=>({body,status}),str:x=>String(x||''),
  PUBLIC_EXTENSION_MODEL_ACTIONS:new Set(),MODEL_SESSION_MODEL_ALLOWED_ACTIONS:new Set(['start_travel']),
  MODEL_SESSION_MODEL_BLOCKED_ACTIONS:new Set(),normalizeModelSessionAction:x=>x,
  modelSessionStateFromRecord:()=>{throw Error('must reject before state transition');},
  airtablePatchById:()=>{throw Error('must not write');},notifyTravelEvent:()=>{throw Error('must not notify');}};
  const handle=vm.runInNewContext(targetCode+'\n'+extract('handleModelSessionAction')+';handleModelSessionAction',scope);
  const result=await handle({},{});assert.equal(result.status,409,scenario);assert.equal(result.body.error,'session_context_changed');
  assert.equal(reads,['missing','wrong'].includes(scenario)?1:2);
 }
});

test('Admin safety CI executes and syntax-checks action-target regressions', () => {
 const workflow=fs.readFileSync(new URL('../.github/workflows/admin-workflow-safety-ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/node --check admin-worker\/model-session-action-target\.test\.mjs/);
 assert.match(workflow,/node --experimental-global-webcrypto --test [^\n]*admin-worker\/model-session-action-target\.test\.mjs/);
 assert.equal(workflow.split("'admin-worker/**'").length-1,2,'source and tests trigger PR and main CI');
 assert.match(workflow,/contents: read/);
 assert.doesNotMatch(workflow,/wrangler.*deploy|workflow_dispatch|secrets\./);
});

test('extension actions reach the existing handler only with the displayed session target', async () => {
 for (const action of ['approve_extension','decline_extension']) {
  for (const session_id of ['sess_a','sess_b',undefined]) {
   let decisions=0;
   const scope={safeJson:async()=>({action,session_id,extension_request_id:'fixture_extension'}),
    resolveModelSessionContext:async()=>context(),modelSessionResponseSession:responseSession,
    modelSessionJson:(body,status)=>({body,status}),str:x=>String(x||''),
    PUBLIC_EXTENSION_MODEL_ACTIONS:new Set(['approve_extension','decline_extension']),
    handlePublicExtensionModelAction:async(_env,body,ctx)=>{decisions++;assert.equal(body.session_id,ctx.session.fields.session_id);return {status:200};}};
   const handle=vm.runInNewContext(targetCode+'\n'+extract('handleModelSessionAction')+';handleModelSessionAction',scope);
   const result=await handle({},{});
   assert.equal(result.status,session_id==='sess_a'?200:409);
   assert.equal(decisions,session_id==='sess_a'?1:0);
  }
 }
});

// All mutations below are synthetic fixtures with an injected contract, never the production contract.
// No live artifacts, secrets or network are used.
import test from 'node:test';import assert from 'node:assert/strict';
import {contract as live,hash,configurationHash,metadataFor,runFloorRelease,requireSealedContract,allowedWrite,sealedRefHash} from './floor-release.mjs';
const clone=structuredClone;
const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function fixture(){
 const base=Buffer.from('baseline'),cand=Buffer.from('candidate');
 const t={name:'sigil-booking-worker',module:'runtime-index.js',sha256:hash(base),version:uuid(901),deployment:uuid(902),configuration_sha256:null};
 const state={version:{id:t.version,number:2,metadata:{source:'api',has_preview:false},annotations:{'workers/message':'preserve this'},resources:{script:{main_module:t.module,handlers:['fetch'],named_handlers:[]},script_runtime:{compatibility_date:'2026-01-01'},bindings:[{name:'SECRET',type:'secret_text'},{name:'DO',type:'durable_object_namespace',namespace_id:'original',class_name:'Existing'},{name:'SERVICE',type:'service',service:'original'}]}},deployment:{id:t.deployment,versions:[{version_id:t.version,percentage:100}]},latest_version:t.version,modules:[{name:t.module,content_type:'application/javascript+module',bytes:base}],settings:{compatibility_flags:[],annotations:{'workers/message':'preserve this'},logpush:false},scriptSettings:{logpush:false,tags:[],tail_consumers:[],observability:null},boundary:{routes:[],domains:[],schedules:[],subdomain:{enabled:true}}};
 t.configuration_sha256=configurationHash(state);
 const c={...clone(live),target:t,candidate_sha256:hash(cand),proof_sha256:'f'.repeat(64),approval_ref_sha256:sealedRefHash('fixture-approval')};
 const plan={release_sha:'a'.repeat(40),approval_ref:'fixture-approval',bytes:cand,sha256:hash(cand),exports_unchanged:true,migrations:[],settings_changes:[]};
 const states={[t.name]:state},uploads={},calls=[],journals=[];let n=1;
 const io={
  verifySource:async()=>{calls.push('source');},
  approve:async()=>{calls.push('gate');},
  save:async j=>journals.push(clone(j)),
  snapshot:async name=>clone(states[name]),
  uploaded:async(name,id)=>clone(uploads[id]),
  write:async(path,{body})=>{
   calls.push(path);assert.ok(journals.at(-1).phase.endsWith('outcome-unknown'));
   const id=uuid(n++);
   if(path.includes('/versions?')){assert.ok(!body.metadata.migrations&&!body.metadata.exports);const s=clone(states[t.name]);s.version.id=id;s.modules=body.modules;uploads[id]=s;states[t.name].latest_version=id;}
   else{const v=body.versions[0].version_id;states[t.name]={...clone(uploads[v]),deployment:{id,versions:body.versions},latest_version:v};}
   return{id};
  }
 };
 return{c,t,plan,states,uploads,calls,journals,io,state};
}
const writes=f=>f.calls.filter(x=>x.startsWith('/'));
const run=f=>runFloorRelease(f.io,f.plan,f.c);

test('the committed contract is unsealed, so a real run fails closed before any write',async()=>{
 assert.throws(()=>requireSealedContract(live),/unsealed/);
 const f=fixture();await assert.rejects(runFloorRelease(f.io,f.plan));assert.equal(writes(f).length,0);
});
test('the committed contract pins the reviewed baseline and candidate',()=>{
 assert.equal(live.target.sha256,'4ce2dd1c1573fa1d5babced3764b1c5c7c77e024c24303b7ba9534fd3f5b19b0');
 assert.equal(live.candidate_sha256,'cc092790b18521a8ee78c08ddd29134b8a9050a07a0026ed85bf67f69ac64b68');
 assert.equal(live.target.name,'sigil-booking-worker');
 assert.equal(live.scope,'sigil-public-floor-5000-code-only');
});
test('metadata inherits every binding, keeps annotations and carries no migration or exports',()=>{
 const f=fixture(),m=metadataFor(f.state,f.t);
 assert.ok(m.bindings.every(x=>x.type==='inherit'));assert.equal(m.annotations['workers/message'],'preserve this');assert.ok(!m.migrations&&!m.exports);
});
test('happy path: exactly one version upload then one 100% deployment, journalled before each write',async()=>{
 const f=fixture();const j=await run(f);
 assert.equal(j.phase,'complete');assert.equal(writes(f).length,2);
 assert.ok(writes(f)[0].endsWith('/sigil-booking-worker/versions?bindings_inherit=strict'));
 assert.ok(writes(f)[1].endsWith('/sigil-booking-worker/deployments'));
 // source check, owner gate, then every write is immediately preceded by its own fresh owner gate.
 assert.deepEqual(f.calls.map(x=>x.startsWith('/')?'write':x),['source','gate','gate','write','gate','write']);
 assert.equal(hash(f.states[f.t.name].modules[0].bytes),f.c.candidate_sha256);
});
test('write allowlist is POST on this worker only',()=>{
 const f=fixture(),base=`/accounts/${f.c.account}/workers/scripts/${f.t.name}`;
 assert.ok(allowedWrite(base+'/versions?bindings_inherit=strict','POST',f.c));assert.ok(allowedWrite(base+'/deployments','POST',f.c));
 for(const [p,m] of [[base+'/versions?bindings_inherit=strict','PUT'],[base+'/deployments','PATCH'],[base,'PUT'],[base+'/settings','POST'],[base+'/versions','POST'],[`/accounts/${f.c.account}/workers/scripts/member-pages-worker/deployments`,'POST']])assert.equal(allowedWrite(p,m,f.c),false,m+' '+p);
});
test('wrong owner reference, wrong candidate or non-empty migrations/settings changes block all writes',async()=>{
 for(const mutate of [f=>{f.plan.approval_ref='other';},f=>{f.plan.sha256='0'.repeat(64);},f=>{f.plan.bytes=Buffer.from('tampered');},f=>{f.plan.bytes=Buffer.from('other candidate');f.plan.sha256=hash(f.plan.bytes);},f=>{f.plan.migrations=[{tag:'x'}];},f=>{f.plan.settings_changes=['x'];},f=>{f.plan.exports_unchanged=false;},f=>{f.plan.release_sha='abc';}]){
  const f=fixture();mutate(f);await assert.rejects(run(f));assert.equal(writes(f).length,0);
 }
});
test('baseline module, version, deployment, latest and configuration drift block writes',async()=>{
 for(const mutate of [s=>{s.modules[0].bytes=Buffer.from('changed');},s=>{s.version.id=uuid(7);},s=>{s.deployment.id=uuid(7);},s=>{s.latest_version=uuid(7);},s=>{s.settings.logpush=true;},s=>{s.boundary.routes=[{id:'r',pattern:'x',script:'sigil-booking-worker'}];},s=>{s.deployment.versions=[{version_id:s.version.id,percentage:50},{version_id:uuid(8),percentage:50}];}]){
  const f=fixture();mutate(f.state);await assert.rejects(run(f));assert.equal(writes(f).length,0);
 }
});
test('unknown version or settings fields fail closed',async()=>{
 const f=fixture();f.state.version.new_unknown=true;await assert.rejects(run(f));assert.equal(writes(f).length,0);
 const g=fixture();g.state.settings.future_flag=true;await assert.rejects(run(g));assert.equal(writes(g).length,0);
});
test('uploaded bytes or resources that differ stop before promotion',async()=>{
 for(const mutate of [s=>{s.modules[0].bytes=Buffer.from('wrong');},s=>{s.version.annotations['workers/message']='changed';},s=>{s.version.resources.script.logpush=true;},s=>{s.version.resources.script.tags=['changed'];},s=>{s.version.resources.script.tail_consumers=['changed'];},s=>{s.version.resources.bindings[1].namespace_id='changed';},s=>{s.modules[0].content_type='text/plain';}]){
  const f=fixture(),read=f.io.uploaded;f.io.uploaded=async(...a)=>{const s=await read(...a);mutate(s);return s;};
  await assert.rejects(run(f));assert.equal(writes(f).length,1);assert.equal(f.journals.at(-1).phase,'stopped-no-retry-no-rollback');
 }
});
test('ambiguous upload or promotion is never retried',async()=>{
 for(const fail of [1,2]){
  const f=fixture(),write=f.io.write;let count=0;f.io.write=async(...a)=>{if(++count===fail)throw Error('uncertain');return write(...a);};
  await assert.rejects(run(f));assert.equal(count,fail);assert.equal(f.journals.at(-1).phase,'stopped-no-retry-no-rollback');
 }
});
test('a foreign version published between upload and promotion blocks promotion',async()=>{
 const f=fixture(),snap=f.io.snapshot;let after=0;
 f.io.snapshot=async name=>{const s=await snap(name);if(++after===3)s.latest_version=uuid(99);return s;};
 await assert.rejects(run(f));assert.equal(writes(f).length,1);
});
test('post-promotion verification failure is reported, never rolled back or retried',async()=>{
 const f=fixture(),write=f.io.write;
 f.io.write=async(...a)=>{const r=await write(...a);if(a[0].endsWith('/deployments'))f.states[f.t.name].modules[0].bytes=Buffer.from('drifted');return r;};
 await assert.rejects(run(f));assert.equal(writes(f).length,2);assert.equal(f.journals.at(-1).phase,'stopped-no-retry-no-rollback');
});
test('journal failure and missing approval prevent writes',async()=>{
 for(const k of ['save','approve','verifySource']){const f=fixture();f.io[k]=async()=>{throw Error('blocked');};await assert.rejects(run(f));assert.equal(writes(f).length,0);}
});
test('the journal never records candidate bytes, bindings or secrets',async()=>{
 const f=fixture();await run(f);const text=JSON.stringify(f.journals);
 for(const bad of ['SECRET','namespace_id','candidate','bytes','CLOUDFLARE'])assert.equal(text.includes(bad),false,bad);
});

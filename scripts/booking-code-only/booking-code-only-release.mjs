// Review-only orchestration: no CLI, token lookup, network transport or auto invocation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const scope='public-booking-code-only-no-migration';
export const candidateHashes=Object.freeze({member:'d4712fc5621fa9cb1d0248bf1a04b0ac24ed9e26826608acd4c14cbfb0a0612d',sigil:'f8fdd9ec081d5cb30ab1293addf9209f19f3d868940b65a1b356687d0a0f5d29'});
export const account='b176eda1172b741fd2e58904cc9d77c5';
export const targets=Object.freeze({
 member:{name:'member-pages-worker',module:'worker.js',version:'43f372c1-e804-46b8-9f63-9655a22708ab',deployment:'6815df60-8d70-4152-8be2-5c6551097e9e',sha256:'1f0946a8af1891def0e4030568b5b0070790b5eb2471f413c496bb190871e310',migration:'v5-customer-request-mutation'},
 sigil:{name:'sigil-booking-worker',module:'runtime-index.js',version:'6a582ff8-9381-403a-81ab-41caf9d722f0',deployment:'c7453c6d-adf7-4f0c-b376-ea068f98dbdd',sha256:'19b6d5329bb4a41e9728f3903becad25e73bfb480cd058fe999155d80a134b96'}
});
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const known=(v,keys,label)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v),`${label} missing`);for(const k of Object.keys(v))assert.ok(keys.includes(k),`${label}: unsupported field ${k}`);};
const eq=(a,b,label)=>assert.deepEqual(a,b,label);
const uuid=v=>assert.match(v||'',/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
function bindings(rows){assert.ok(Array.isArray(rows),'bindings missing');const names=new Set();return rows.map(b=>{assert.ok(b.name&&b.type&&!names.has(b.name),'invalid/duplicate binding');names.add(b.name);return ['secret_text','secret_key'].includes(b.type)?{name:b.name,type:b.type}:structuredClone(b);}).sort((a,b)=>a.name.localeCompare(b.name));}
export function normalizedSettings(s){
 known(s,['bindings','compatibility_date','compatibility_flags','usage_model','limits','placement','observability','logpush','tail_consumers','tags','migration_tag','cache_options','annotations'],'settings');
 const out=structuredClone(s);delete out.annotations;out.compatibility_flags??=[];assert.ok(Array.isArray(out.compatibility_flags));out.compatibility_flags.sort();if(out.bindings)out.bindings=bindings(out.bindings);return out;
}
export function normalizedVersion(v){
 const r=v?.resources;known(r,['bindings','script','script_runtime'],'version resources');
 known(r.script,['main_module','etag','handlers','named_handlers','placement','placement_mode','last_deployed_from','logpush','tail_consumers','tags'],'script');
 known(r.script_runtime,['compatibility_date','compatibility_flags','usage_model','migration_tag','limits'],'runtime');
 assert.match(r.script_runtime.compatibility_date||'',/^\d{4}-\d{2}-\d{2}$/);
 return {bindings:bindings(r.bindings),runtime:{...r.script_runtime,compatibility_flags:[...(r.script_runtime.compatibility_flags||[])].sort()},main_module:r.script.main_module,handlers:r.script.handlers??[],named_handlers:r.script.named_handlers??[],script_setting_copies:Object.fromEntries(['logpush','tail_consumers','tags'].filter(k=>Object.hasOwn(r.script,k)).map(k=>[k,structuredClone(r.script[k])])),placement:r.script.placement??r.script.placement_mode??null,cache_options:v.cache_options??null};
}
export function metadataFor(snapshot,target){
 const v=normalizedVersion(snapshot.version);normalizedSettings(snapshot.settings);if(snapshot.scriptSettings!==undefined)known(snapshot.scriptSettings,['logpush','tags','tail_consumers','observability'],'script settings');assert.equal(v.main_module,target.module);
 // Current version-upload schema does not describe limits/placement. Fail closed
 // rather than drop a live setting or use a full PUT with immediate side effects.
 assert.ok(v.runtime.limits==null||Object.keys(v.runtime.limits).length===0,'runtime limits need documented preservation');
 assert.ok(v.placement==null||v.placement==='off','placement needs documented preservation');
 const m={main_module:target.module,bindings:v.bindings.map(b=>({name:b.name,type:'inherit'})),compatibility_date:v.runtime.compatibility_date,compatibility_flags:v.runtime.compatibility_flags};
 if(v.runtime.usage_model!==undefined)m.usage_model=v.runtime.usage_model;
 if(v.cache_options!==null)m.cache_options=v.cache_options;
 return m;
}
export function assertSnapshot(s,t,{latest=t.version,version=t.version,deployment=t.deployment,sha256=t.sha256}={}){
 assert.equal(s.version.id,version,'active version drift');assert.equal(s.deployment.id,deployment,'deployment drift');
 eq(s.deployment.versions,[{version_id:version,percentage:100}],'traffic drift');assert.equal(s.latest_version,latest,'latest version drift');
 assert.equal(s.modules?.length,1,'unexpected module inventory');assert.equal(s.modules[0].name,t.module);assert.equal(hash(s.modules[0].bytes),sha256,'module hash drift');
 if(t.migration)assert.equal(s.version.resources.script_runtime.migration_tag,t.migration,'migration tag drift');
 assert.ok(s.boundary&&Array.isArray(s.boundary.routes)&&Array.isArray(s.boundary.schedules)&&s.boundary.subdomain,'boundary inventory missing');metadataFor(s,t);
}
function preserved(a,b){eq(normalizedVersion(a.version),normalizedVersion(b.version),'bindings/runtime/DO identity drift');eq(normalizedSettings(a.settings),normalizedSettings(b.settings),'settings drift');eq(a.boundary,b.boundary,'routes/schedules/subdomain drift');eq(a.scriptSettings,b.scriptSettings,'script-level settings drift');}
export function allowedWrite(path,method){return Object.values(targets).some(t=>method==='POST'&&[...['/versions?bindings_inherit=strict','/deployments'].map(s=>`/accounts/${account}/workers/scripts/${t.name}${s}`)].includes(path));}
export async function runCodeOnlyRelease(io,plan){
 // All transport and approval evidence supplied explicitly by a reviewed caller.
 // No default fetch, environment fallback, fake receipts, retry or rollback.
 for(const k of ['approve','snapshot','uploaded','write','save','verifySource'])assert.equal(typeof io[k],'function',`required io.${k}`);
 const journal={scope,phase:'preflight',attempts:[],completed:[]};
 const save=()=>io.save(structuredClone(journal));
 const gate=()=>io.approve({scope,sha:plan.release_sha,source_sha:plan.source_sha,ref:plan.approval_ref});
 const write=async(key,operation,body)=>{const path=`/accounts/${account}/workers/scripts/${targets[key].name}/${operation==='upload'?'versions?bindings_inherit=strict':'deployments'}`;assert.ok(allowedWrite(path,'POST'));journal.phase=`${key}-${operation}-outcome-unknown`;journal.attempts.push({worker:key,operation,state:'attempted'});await save();const result=await io.write(path,{method:'POST',body});uuid(result?.id);journal.attempts.at(-1).state='returned';journal.attempts.at(-1).id=result.id;await save();return result;};
 try{
  assert.match(plan.release_sha||'',/^[a-f0-9]{40}$/);assert.equal(plan.source_sha,'82561437067dc06b751956376ba265fa7322cd34');assert.equal(plan.source_tree,'83a93fc60ef2494ada52c0b40509d28edfdfe776');assert.ok(plan.approval_ref?.trim());await io.verifySource(plan.source_sha,plan.source_tree);await gate();
  const baselines={};for(const key of ['member','sigil']){const t=targets[key];const p=plan[key];assert.equal(p.sha256,candidateHashes[key],'unreviewed candidate');assert.equal(hash(p.bytes),p.sha256,'candidate hash drift');assert.equal(p.exports_unchanged,true);eq(p.migrations,[]);eq(p.settings_changes,[]);baselines[key]=await io.snapshot(t.name);assertSnapshot(baselines[key],t);}
  await save();
  for(const key of ['member','sigil']){
   const t=targets[key],p=plan[key],base=baselines[key];await gate();const fresh=await io.snapshot(t.name);assertSnapshot(fresh,t);preserved(base,fresh);
   const metadata=metadataFor(fresh,t);const upload=await write(key,'upload',{metadata,modules:[{name:t.module,bytes:p.bytes}]});
   const readback=await io.uploaded(t.name,upload.id);assert.equal(readback.version.id,upload.id);assert.equal(readback.modules?.length,1);assert.equal(readback.modules[0].name,t.module);assert.equal(hash(readback.modules[0].bytes),p.sha256,'uploaded bytes mismatch');eq(normalizedVersion(readback.version),normalizedVersion(base.version),'uploaded resources mismatch');
   await gate();const staged=await io.snapshot(t.name);assertSnapshot(staged,t,{latest:upload.id});preserved(base,staged);
   const deployed=await write(key,'promote',{strategy:'percentage',versions:[{version_id:upload.id,percentage:100}]});
   const after=await io.snapshot(t.name);assertSnapshot(after,t,{latest:upload.id,version:upload.id,deployment:deployed.id,sha256:p.sha256});preserved(base,after);
   journal.completed.push({worker:key,version:upload.id,deployment:deployed.id});journal.phase=`${key}-verified`;await save();
  }
  // Catch first-worker drift while the second worker was being released.
  for(const done of journal.completed){const t=targets[done.worker],p=plan[done.worker],s=await io.snapshot(t.name);assertSnapshot(s,t,{latest:done.version,version:done.version,deployment:done.deployment,sha256:p.sha256});preserved(baselines[done.worker],s);}
  journal.phase='complete';await save();return journal;
 }catch{journal.failure_phase=journal.phase;journal.phase='stopped-no-retry-no-rollback';try{await save();}catch{}throw Object.assign(new Error('Code-only release stopped; inspect durable journal and read-only provider state.'),{journal});}
}

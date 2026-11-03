// Review-only orchestration: no CLI, token lookup, network transport or auto invocation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const contract=JSON.parse(readFileSync(new URL('./release-contract.json',import.meta.url),'utf8'));
export const {scope,account,targets,candidateHashes}=contract;
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const known=(v,keys,label)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v),`${label} missing`);for(const k of Object.keys(v))assert.ok(keys.includes(k),`${label}: unsupported field ${k}`);};
const eq=(a,b,label)=>assert.deepEqual(a,b,label);
const uuid=v=>assert.match(v||'',/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
function bindings(rows){assert.ok(Array.isArray(rows),'bindings missing');const names=new Set();return rows.map(b=>{assert.ok(b.name&&b.type&&!names.has(b.name),'invalid/duplicate binding');names.add(b.name);if(['secret_text','secret_key'].includes(b.type))known(b,['name','type'],'secret binding metadata');return ['secret_text','secret_key'].includes(b.type)?{name:b.name,type:b.type}:structuredClone(b);}).sort((a,b)=>a.name.localeCompare(b.name));}
export function normalizedSettings(s){
 known(s,['bindings','compatibility_date','compatibility_flags','usage_model','limits','placement','observability','logpush','tail_consumers','tags','migration_tag','cache_options','annotations'],'settings');
 const out=structuredClone(s);if(out.annotations)delete out.annotations['workers/triggered_by'];out.compatibility_flags??=[];assert.ok(Array.isArray(out.compatibility_flags));out.compatibility_flags.sort();if(out.bindings)out.bindings=bindings(out.bindings);return out;
}
// Enumerate provider-generated fields explicitly. Preserve all other recognized
// configuration, including annotation values and presence of optional properties.
export function normalizedVersion(v){
 known(v,['id','number','metadata','annotations','resources','cache_options','package_dependencies'],'version');
 const r=v.resources;known(r,['bindings','script','script_runtime'],'resources');
 known(r.script,['main_module','etag','handlers','named_handlers','placement','placement_mode','last_deployed_from','logpush','tail_consumers','tags'],'script');
 known(r.script_runtime,['compatibility_date','compatibility_flags','usage_model','migration_tag','limits'],'runtime');
 known(v.metadata??{},['created_on','source','author_id','author_email','has_preview'],'version metadata');
 assert.match(r.script_runtime.compatibility_date||'',/^\d{4}-\d{2}-\d{2}$/);
 const script=structuredClone(r.script);delete script.etag;delete script.last_deployed_from;
 const annotations=structuredClone(v.annotations??{});delete annotations['workers/triggered_by'];
 return {bindings:bindings(r.bindings),runtime:{...r.script_runtime,compatibility_flags:[...(r.script_runtime.compatibility_flags||[])].sort()},main_module:r.script.main_module,script,annotations,cache_options:v.cache_options??null,package_dependencies:v.package_dependencies??null};
}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function configuration(s){return{version:normalizedVersion(s.version),settings:normalizedSettings(s.settings),scriptSettings:s.scriptSettings,boundary:s.boundary};}
export const configurationHash=s=>hash(JSON.stringify(canonical(configuration(s))));
export function requireSealedContract(){for(const key of ['member','sigil'])for(const value of [targets[key].sha256,targets[key].configuration_sha256,candidateHashes[key],contract.proof_files?.[key]?.sha256])assert.match(value||'',/^[a-f0-9]{64}$/,'unsealed release contract');}
export function metadataFor(snapshot,target){
 const v=normalizedVersion(snapshot.version);normalizedSettings(snapshot.settings);known(snapshot.scriptSettings,['logpush','tags','tail_consumers','observability'],'script settings');assert.equal(v.main_module,target.module);
 // Current version-upload schema does not describe limits/placement. Fail closed
 // rather than drop a live setting or use a full PUT with immediate side effects.
 assert.ok(v.runtime.limits==null||Object.keys(v.runtime.limits).length===0,'runtime limits need documented preservation');
 assert.ok(v.script.placement==null&&[undefined,'off'].includes(v.script.placement_mode),'placement needs documented preservation');
 const m={main_module:target.module,bindings:v.bindings.map(b=>({name:b.name,type:'inherit'})),compatibility_date:v.runtime.compatibility_date,compatibility_flags:v.runtime.compatibility_flags};
 if(v.runtime.usage_model!==undefined)m.usage_model=v.runtime.usage_model;
 if(v.cache_options!==null)m.cache_options=v.cache_options;
 if(v.package_dependencies!==null)m.package_dependencies=v.package_dependencies;
 if(Object.keys(v.annotations).length)m.annotations=v.annotations;
 return m;
}
export function assertSnapshot(s,t,{latest=t.version,version=t.version,deployment=t.deployment,sha256=t.sha256}={}){
 assert.equal(s.version.id,version,'active version drift');assert.equal(s.deployment.id,deployment,'deployment drift');
 eq(s.deployment.versions,[{version_id:version,percentage:100}],'traffic drift');assert.equal(s.latest_version,latest,'latest version drift');
 assert.equal(s.modules?.length,1,'unexpected module inventory');assert.equal(s.modules[0].name,t.module);assert.equal(s.modules[0].content_type,'application/javascript+module','module MIME drift');assert.equal(hash(s.modules[0].bytes),sha256,'module hash drift');
 if(t.migration)assert.equal(s.version.resources.script_runtime.migration_tag,t.migration,'migration tag drift');
 assert.ok(s.boundary&&Array.isArray(s.boundary.routes)&&Array.isArray(s.boundary.schedules)&&Array.isArray(s.boundary.domains)&&s.boundary.subdomain,'boundary inventory missing');metadataFor(s,t);
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
  assert.match(plan.release_sha||'',/^[a-f0-9]{40}$/);requireSealedContract();assert.equal(plan.source_sha,contract.source_sha);assert.equal(plan.source_tree,contract.source_tree);assert.ok(plan.approval_ref?.trim());await io.verifySource(plan.source_sha,plan.source_tree);await gate();
  const baselines={};for(const key of ['member','sigil']){const t=targets[key];const p=plan[key];assert.equal(p.sha256,candidateHashes[key],'unreviewed candidate');assert.equal(hash(p.bytes),p.sha256,'candidate hash drift');assert.equal(p.exports_unchanged,true);eq(p.migrations,[]);eq(p.settings_changes,[]);baselines[key]=await io.snapshot(t.name);assertSnapshot(baselines[key],t);assert.equal(configurationHash(baselines[key]),t.configuration_sha256,'reviewed configuration drift');}
  await save();
  for(const key of ['member','sigil']){
   const t=targets[key],p=plan[key],base=baselines[key];if(key==='sigil'){const done=journal.completed.find(x=>x.worker==='member');assert.ok(done,'member not verified');const memberNow=await io.snapshot(targets.member.name);assertSnapshot(memberNow,targets.member,{latest:done.version,version:done.version,deployment:done.deployment,sha256:plan.member.sha256});preserved(baselines.member,memberNow);}await gate();const fresh=await io.snapshot(t.name);assertSnapshot(fresh,t);preserved(base,fresh);
   const metadata=metadataFor(fresh,t);const upload=await write(key,'upload',{metadata,modules:[{name:t.module,content_type:'application/javascript+module',bytes:p.bytes}]});
   const readback=await io.uploaded(t.name,upload.id);assert.equal(readback.version.id,upload.id);assert.equal(readback.modules?.length,1);assert.equal(readback.modules[0].name,t.module);assert.equal(readback.modules[0].content_type,'application/javascript+module','uploaded MIME mismatch');assert.equal(hash(readback.modules[0].bytes),p.sha256,'uploaded bytes mismatch');eq(normalizedVersion(readback.version),normalizedVersion(base.version),'uploaded resources mismatch');
   await gate();const staged=await io.snapshot(t.name);assertSnapshot(staged,t,{latest:upload.id});preserved(base,staged);
   if(key==='sigil'){const done=journal.completed.find(x=>x.worker==='member');const m=await io.snapshot(targets.member.name);assertSnapshot(m,targets.member,{latest:done.version,version:done.version,deployment:done.deployment,sha256:plan.member.sha256});preserved(baselines.member,m);}
   const deployed=await write(key,'promote',{strategy:'percentage',versions:[{version_id:upload.id,percentage:100}]});
   const after=await io.snapshot(t.name);assertSnapshot(after,t,{latest:upload.id,version:upload.id,deployment:deployed.id,sha256:p.sha256});preserved(base,after);
   journal.completed.push({worker:key,version:upload.id,deployment:deployed.id});journal.phase=`${key}-verified`;await save();
  }
  // Catch first-worker drift while the second worker was being released.
  for(const done of journal.completed){const t=targets[done.worker],p=plan[done.worker],s=await io.snapshot(t.name);assertSnapshot(s,t,{latest:done.version,version:done.version,deployment:done.deployment,sha256:p.sha256});preserved(baselines[done.worker],s);}
  journal.phase='complete';await save();return journal;
 }catch{journal.failure_phase=journal.phase;journal.phase='stopped-no-retry-no-rollback';try{await save();}catch{}throw Object.assign(new Error('Code-only release stopped; inspect durable journal and read-only provider state.'),{journal});}
}

// Explicit Booking release state machine. Importing this module performs no network/write.
// Member class migration is an atomic deploy, NEVER a versions-upload/promote operation.
import assert from 'node:assert/strict';
import {contract,digest} from './member-booking-build.mjs';
import {buildMemberBookingArtifact} from './member-booking-artifact.mjs';
export {contract};
const copy=x=>structuredClone(x);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const same=(a,b,label)=>assert.equal(JSON.stringify(stable(a)),JSON.stringify(stable(b)),label);
const bindingNames=(bindings)=>{assert.ok(Array.isArray(bindings));const names=bindings.map(b=>b.name);assert.equal(new Set(names).size,names.length,'duplicate binding');return names;};
export function configuration(version){
 const r=version?.resources;assert.ok(r&&Object.keys(r).every(k=>['bindings','script','script_runtime','assets'].includes(k)),'unknown Worker resource');assert.ok(r?.script&&r?.script_runtime&&Array.isArray(r.bindings),'incomplete configuration');assert.ok(!r.assets&&!r.script.assets&&!r.script.containers,'asset/container release forbidden');
 const {etag,last_deployed_from,...script}=r.script;
 return {runtime:r.script_runtime,script,bindings:r.bindings.map(b=>['secret_text','secret_key'].includes(b.type)?{name:b.name,type:b.type}:b).sort((a,b)=>a.name.localeCompare(b.name)),cache_options:version.cache_options??null};
}
export function validateModules(modules,expected){assert.ok(Array.isArray(modules));same(modules.map(m=>m.name).sort(),Object.keys(expected).sort(),'module inventory drift');for(const m of modules){assert.ok(Buffer.isBuffer(m.bytes));assert.equal(digest(m.bytes),expected[m.name],'artifact bytes drift: '+m.name);}return modules;}
export function validateSnapshot(s,target){
 assert.equal(s.deployment?.id,target.deployment,'deployment drift');assert.equal(s.deployment.strategy,'percentage');same(s.deployment.versions,[{version_id:target.version,percentage:100}],'traffic/version drift');assert.equal(s.latestVersion,target.version,'unreviewed newer version');assert.equal(s.version.id,target.version);configuration(s.version);bindingNames(s.version.resources.bindings);
 if(target.name===contract.member.name){assert.equal(s.version.resources.script_runtime.migration_tag,contract.member.old_migration_tag,'migration drift');assert.ok(!s.version.resources.bindings.some(b=>b.name===contract.member.binding),'binding already present');assert.ok(!s.version.resources.script.named_handlers?.some(h=>h.name===contract.member.class_name),'class already present');}
 return true;
}
export function metadataFor(snapshot,target,{member=false}={}){
 configuration(snapshot.version);
 const r=snapshot.version.resources,rt=r.script_runtime;assert.ok(Object.keys(rt).every(k=>['compatibility_date','compatibility_flags','usage_model','limits','migration_tag'].includes(k)),'unknown runtime setting');
 assert.ok(Object.keys(r.script).every(k=>['etag','handlers','named_handlers','last_deployed_from','placement','placement_mode'].includes(k)),'unknown script setting');
 const settings=snapshot.settings;assert.ok(settings&&typeof settings==='object');
 assert.ok(Object.keys(settings).every(k=>['bindings','compatibility_date','compatibility_flags','usage_model','limits','migration_tag','placement','logpush','observability','tail_consumers','tags','cache_options'].includes(k)),'unknown settings need explicit preservation');
 const metadata={main_module:target.main_module,bindings:r.bindings.map(b=>({name:b.name,type:'inherit'})),compatibility_date:rt.compatibility_date,compatibility_flags:rt.compatibility_flags||[]};
 for(const key of ['usage_model','limits'])if(rt[key]!==undefined)metadata[key]=copy(rt[key]);
 for(const key of ['logpush','observability','tail_consumers','tags','cache_options'])if(settings[key]!==undefined)metadata[key]=copy(settings[key]);
 if(r.script.placement)metadata.placement=copy(r.script.placement);else if(r.script.placement_mode==='smart')metadata.placement={mode:'smart'};else if(settings.placement)metadata.placement=copy(settings.placement);
 if(snapshot.version.cache_options!=null)metadata.cache_options=copy(snapshot.version.cache_options);
 if(member){metadata.bindings.push({name:contract.member.binding,type:'durable_object_namespace',class_name:contract.member.class_name});metadata.migrations={old_tag:contract.member.old_migration_tag,new_tag:contract.member.new_migration_tag,new_sqlite_classes:[contract.member.class_name]};}
 return metadata;
}
export function verifyMemberTransition(before,after){
 const a=configuration(before),b=configuration(after);assert.equal(b.runtime.migration_tag,contract.member.new_migration_tag);const added=b.bindings.filter(x=>x.name===contract.member.binding);assert.equal(added.length,1);const binding=added[0];assert.equal(binding.type,'durable_object_namespace');assert.equal(binding.class_name,contract.member.class_name);assert.match(binding.namespace_id||'',/^[a-f0-9]{32}$/);assert.ok(!binding.script_name||binding.script_name===contract.member.name);assert.ok(!binding.environment);assert.ok(Object.keys(binding).every(k=>['name','type','class_name','namespace_id','script_name','environment'].includes(k)));
 b.bindings=b.bindings.filter(x=>x.name!==contract.member.binding);b.runtime={...b.runtime,migration_tag:a.runtime.migration_tag};
 const handlers=b.script.named_handlers||[];const addedHandlers=handlers.filter(h=>h.name===contract.member.class_name);assert.equal(addedHandlers.length,1);same(addedHandlers[0].handlers,['class'],'coordinator export invalid');b.script.named_handlers=handlers.filter(h=>h.name!==contract.member.class_name);same(a,b,'configuration delta exceeds one binding/class/migration');return true;
}
export async function prepareBookingRelease(io){
 assert.match(io.sha||'',/^[a-f0-9]{40}$/);await io.inspectCheckout(io.sha);await io.verifySources();
 const snapshots={},modules={};for(const target of [contract.member,contract.sigil]){const s=await io.snapshot(target.name);validateSnapshot(s,target);snapshots[target.name]=s;modules[target.name]=validateModules(await io.modules(target.name,target.version),target.baseline_modules);}
 const member=buildMemberBookingArtifact(modules[contract.member.name][0].bytes);const sigil=validateModules(await io.buildSigil(),contract.sigil.candidate_modules);
 return {sha:io.sha,snapshots,member:[{name:'worker.js',bytes:member.bytes}],sigil,memberMetadata:metadataFor(snapshots[contract.member.name],contract.member,{member:true}),sigilMetadata:metadataFor(snapshots[contract.sigil.name],contract.sigil),summary:{scope:'booking-artifact-with-migration',memberBaseline:contract.member.version,memberCandidate:member.sha256,migration:{old_tag:contract.member.old_migration_tag,new_tag:contract.member.new_migration_tag,new_sqlite_classes:[contract.member.class_name]},sigilBaseline:contract.sigil.version}};
}
const assertTraffic=(s,id,deployment)=>{assert.equal(s.version.id,id);assert.equal(s.latestVersion,id);assert.equal(s.deployment.strategy,'percentage');same(s.deployment.versions,[{version_id:id,percentage:100}],'active deployment mismatch');if(deployment)assert.equal(s.deployment.id,deployment);};
export async function executeBookingRelease(io,prepared){
 const journal={phase:'preflight',scope:'booking-artifact-with-migration',sha:io.sha,retry_allowed:false};
 const save=async phase=>{journal.phase=phase;await io.save(copy(journal));};
 try{
  assert.equal(prepared.sha,io.sha);await io.inspectCheckout(io.sha);await io.verifySources();
  const expected=await prepareBookingRelease(io);same(prepared.summary,expected.summary,'prepared contract drift');validateModules(prepared.member,{'worker.js':contract.member.candidate_sha256});validateModules(prepared.sigil,contract.sigil.candidate_modules);same(prepared.memberMetadata,expected.memberMetadata,'member metadata tampered');same(prepared.sigilMetadata,expected.sigilMetadata,'sigil metadata tampered');
  const approved=async stage=>{const proof=await io.approve(stage);assert.equal(proof.environment,'member-pages-code-only-owner');assert.equal(proof.approved_sha,io.sha);await io.inspectCheckout(io.sha);await io.verifySources();};
  const unchanged=async(name)=>{const s=await io.snapshot(name);same(s,expected.snapshots[name],'baseline/config/boundary drift');return s;};
  await approved('sigil-upload');await unchanged(contract.member.name);await unchanged(contract.sigil.name);
  await save('sigil-upload-outcome-unknown');const uploaded=await io.uploadSigil(prepared.sigilMetadata,prepared.sigil);assert.match(uploaded.id||'',/^[a-f0-9-]{36}$/);assert.notEqual(uploaded.id,contract.sigil.version);journal.sigilVersion=uploaded.id;await save('sigil-uploaded-not-promoted');
  validateModules(await io.modules(contract.sigil.name,uploaded.id),contract.sigil.candidate_modules);const uploadedVersion=await io.version(contract.sigil.name,uploaded.id);same(configuration(uploadedVersion),configuration(expected.snapshots[contract.sigil.name].version),'sigil uploaded config drift');
  await approved('sigil-promote');await unchanged(contract.member.name);const beforePromote=await io.snapshot(contract.sigil.name);const sigilBase=copy(expected.snapshots[contract.sigil.name]);sigilBase.latestVersion=uploaded.id;same(beforePromote,sigilBase,'sigil pre-promotion drift');
  await save('sigil-promotion-outcome-unknown');const promoted=await io.promoteSigil(uploaded.id);assert.match(promoted.id||'',/^[a-f0-9-]{36}$/);journal.sigilDeployment=promoted.id;await save('sigil-promoted');
  const sigilActive=await io.snapshot(contract.sigil.name);assertTraffic(sigilActive,uploaded.id,promoted.id);same(configuration(sigilActive.version),configuration(expected.snapshots[contract.sigil.name].version),'sigil active config drift');same(sigilActive.settings,expected.snapshots[contract.sigil.name].settings,'sigil settings drift');same(sigilActive.boundary,expected.snapshots[contract.sigil.name].boundary,'sigil boundary drift');validateModules(await io.modules(contract.sigil.name,uploaded.id),contract.sigil.candidate_modules);
  await approved('member-atomic-deploy');await unchanged(contract.member.name);same(await io.snapshot(contract.sigil.name),sigilActive,'supporting handler drift');
  // PUT script applies the one additive SQLite migration and code at 100% immediately.
  // There is deliberately no Member versions-upload/promote path and no auto rollback.
  await save('member-atomic-deploy-outcome-unknown');await io.deployMemberAtomic(prepared.memberMetadata,prepared.member);
  await save('member-deployed-verification-pending');const member=await io.snapshot(contract.member.name);assert.notEqual(member.version.id,contract.member.version);assertTraffic(member,member.version.id);verifyMemberTransition(expected.snapshots[contract.member.name].version,member.version);
  validateModules(await io.modules(contract.member.name,member.version.id),{'worker.js':contract.member.candidate_sha256});same(member.boundary,expected.snapshots[contract.member.name].boundary,'member routing/trigger drift');
  // settings include generated binding IDs and migration tag; version transition covers these.
  const beforeSettings=copy(expected.snapshots[contract.member.name].settings),afterSettings=copy(member.settings);delete beforeSettings.bindings;delete afterSettings.bindings;delete beforeSettings.migration_tag;delete afterSettings.migration_tag;same(afterSettings,beforeSettings,'member settings drift');
  same(await io.snapshot(contract.sigil.name),sigilActive,'post-deploy sigil drift');same(await io.snapshot(contract.member.name),member,'post-readback member drift');
  journal.memberVersion=member.version.id;journal.memberDeployment=member.deployment.id;journal.memberCandidate=contract.member.candidate_sha256;await save('complete');return copy(journal);
 }catch{io.invalidate?.();journal.stopped_after=journal.phase;await save('stopped-no-retry');throw Object.assign(new Error('Booking release stopped; inspect safe receipt; do not retry'),{receipt:copy(journal)});}
}

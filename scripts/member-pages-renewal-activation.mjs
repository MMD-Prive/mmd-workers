import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ACCOUNT,ROOT,VERSION_ROOT,ZONE,activeVersion,versionConfiguration,uploadMetadata,createTransport} from './member-pages-code-only-release.mjs';
import {verifyModuleInventory} from './member-pages-artifact-delta.mjs';
import {verifyOwnerApproval} from './member-pages-owner-approval.mjs';
const raw=readFileSync(new URL('./member-pages-renewal-activation-baseline.json',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(hash(raw),'63c4cfa6bf2326de58651f57d65b7d517635ed1180f49de10b351accadec3f05','activation baseline manifest drift');
export const ACTIVATION=Object.freeze(JSON.parse(raw));
const FLAG='LIFF_RENEWAL_CARD_ENABLED',PROMO='LIFF_PROMOTION_PURCHASE_ENABLED';
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const same=(a,b,message)=>assert.equal(canonical(a),canonical(b),message);
const digest=x=>hash(canonical(x));
export function activationConfiguration(config) {
 const next=structuredClone(config);
 const renewal=next.bindings.filter(b=>b.name===FLAG),promo=next.bindings.filter(b=>b.name===PROMO);
 assert.equal(renewal.length,1);assert.equal(promo.length,1);
 assert.equal(renewal[0].type,'plain_text');assert.equal(promo[0].type,'plain_text');
 assert.equal(renewal[0].text,'false','Renewal already changed');assert.equal(promo[0].text,'false','Promotion flag drift');
 renewal[0].text='true';return next;
}
export function inspectActivationCheckout(sha,directory=process.cwd()) {
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 assert.match(sha||'',/^[a-f0-9]{40}$/);
 assert.equal(resolve(git('rev-parse','--show-toplevel')),resolve(directory));
 assert.equal(git('rev-parse','HEAD'),sha);
 assert.equal(git('status','--porcelain','--untracked-files=all','--ignored'),'','dirty activation checkout');
}
// Only this function mutates Cloudflare. Importing or testing helpers never calls it.
// Production CLI always uses the fixed reviewed manifest; contract injection is for fixtures.
export async function activateRenewalFlag(io,contract=ACTIVATION) {
 const state={phase:'preflight',worker:'member-pages-worker',release_sha:io.sha};
 const save=phase=>{state.phase=phase;io.save({...state});};
 try {
  await io.approve();
  assert.match(io.sha||'',/^[a-f0-9]{40}$/);
  assert.equal(io.expectedVersion,contract.version);assert.equal(io.expectedDeployment,contract.deployment);
  const call=(suffix,init)=>io.call(ROOT+suffix,init);
  const deployment=(await call('/deployments')).deployments[0];
  assert.equal(activeVersion(deployment),contract.version);assert.equal(deployment.id,contract.deployment);
  const baseline=await call('/versions/'+contract.version);assert.equal(baseline.id,contract.version);
  const before=versionConfiguration(baseline),target=activationConfiguration(before);
  const artifact=await io.call(VERSION_ROOT+'/'+contract.version+'?include=modules');
  const modules=verifyModuleInventory(artifact,contract.version,contract.mainModule,contract.moduleHashes);
  const metadata=uploadMetadata(baseline,io.sha);metadata.main_module=contract.mainModule;
  delete metadata.annotations['workers/commit_sha'];
  metadata.annotations['workers/message']='Owner-approved Renewal flag only; identical code; base='+contract.version;
  metadata.bindings=baseline.resources.bindings.map(b=>b.name===FLAG?{name:FLAG,type:'plain_text',text:'true'}:{name:b.name,type:'inherit'});
  const settings=await call('/script-settings');
  const boundary=async()=>({routes:await io.call(`/zones/${ZONE}/workers/routes`),schedules:await call('/schedules'),subdomain:await call('/subdomain')});
  const bounds=await boundary();
  state.baseline_version=contract.version;state.baseline_deployment=contract.deployment;
  state.before_configuration_digest=digest(before);state.target_configuration_digest=digest(target);
  const unchanged=async latest=>{
   same((await call('/deployments')).deployments[0],deployment,'active deployment drift');
   assert.equal((await call('/versions')).items[0].id,latest,'latest version drift');
   same(await call('/script-settings'),settings,'settings drift');same(await boundary(),bounds,'route/schedule/subdomain drift');
  };
  await unchanged(contract.version);await io.approve();await unchanged(contract.version);
  const form=new FormData();form.set('metadata',JSON.stringify(metadata));
  for(const m of modules)form.set(m.name,new Blob([m.bytes],{type:'application/javascript+module'}),m.name);
  save('upload-attempted-outcome-unknown');
  const uploaded=await call('/versions?bindings_inherit=strict',{method:'POST',body:form});
  assert.match(uploaded?.id||'',/^[a-f0-9-]{36}$/i);assert.notEqual(uploaded.id,contract.version);
  state.uploaded_version=uploaded.id;save('uploaded-not-promoted');
  const uploadedConfig=await call('/versions/'+uploaded.id);assert.equal(uploadedConfig.id,uploaded.id);
  same(versionConfiguration(uploadedConfig),target,'change exceeds single Renewal flag');
  verifyModuleInventory(await io.call(VERSION_ROOT+'/'+uploaded.id+'?include=modules'),uploaded.id,contract.mainModule,contract.moduleHashes);
  await io.approve();await unchanged(uploaded.id);
  save('promotion-attempted-outcome-unknown');
  const promoted=await call('/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}]})});
  assert.match(promoted?.id||'',/^[a-f0-9-]{36}$/i);assert.notEqual(promoted.id,deployment.id);
  state.deployment=promoted.id;
  const receipt=await call('/deployments/'+promoted.id);assert.equal(receipt.id,promoted.id);assert.equal(activeVersion(receipt),uploaded.id);
  same((await call('/deployments')).deployments[0],receipt,'post-promotion deployment drift');
  assert.equal((await call('/versions')).items[0].id,uploaded.id,'post-promotion latest drift');
  const activeConfig=await call('/versions/'+uploaded.id);assert.equal(activeConfig.id,uploaded.id);
  same(versionConfiguration(activeConfig),target,'post-promotion configuration drift');
  same(await boundary(),bounds,'post-promotion boundary drift');same(await call('/script-settings'),settings,'post-promotion settings drift');
  verifyModuleInventory(await io.call(VERSION_ROOT+'/'+uploaded.id+'?include=modules'),uploaded.id,contract.mainModule,contract.moduleHashes);
  state.code_unchanged=true;state.promotion_flag='false';state.renewal_flag='true';save('complete');return {...state};
 } catch(error) {state.stopped_after=state.phase;save('stopped');throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const main=async()=>{
  assert.equal(process.argv.length,3);assert.equal(process.argv[2],'--execute-approved');
  assert.equal(process.env.PRODUCTION_APPROVED,'true');assert.equal(process.env.RELEASE_MODE,'renewal-activation');
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
  const approve=async()=>{await verifyOwnerApproval(process.env);inspectActivationCheckout(process.env.GITHUB_SHA);};
  await activateRenewalFlag({sha:process.env.GITHUB_SHA,expectedVersion:process.env.EXPECTED_VERSION,expectedDeployment:process.env.EXPECTED_DEPLOYMENT,
   approve,call:createTransport(process.env.CLOUDFLARE_API_TOKEN),
   save:x=>writeFileSync(resolve(process.env.RUNNER_TEMP||'.','member-pages-code-only-receipt.json'),JSON.stringify(x,null,2),{mode:0o600})});
  console.log('Renewal activation readback complete; code preserved and Promotion remains off.');
 };
 main().catch(()=>{console.error('Renewal activation stopped. Read sanitized receipt; do not retry automatically.');process.exitCode=1;});
}

// Owner-gated, production-preserving LV15 artifact release. No automatic deployment on import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MY_MMD_LIFF_LV15_CSS as CSS} from '../member-pages-worker/src/liff-member-lv15-style.js';
import {ACCOUNT,ZONE,ROOT,VERSION_ROOT,activeVersion,versionConfiguration,uploadMetadata,createTransport} from './member-pages-code-only-release.mjs';
import {verifyOwnerApproval} from './member-pages-owner-approval.mjs';
export const LV15=Object.freeze({
 sourceSha:'eeb8a4fc1d07199529d5ad5876d4c0e404de0d41',
 baseVersion:'b8538276-1f3e-4b40-9131-7a411e6be788',
 baseDeployment:'0d921f36-019a-4a0d-a93a-73b131ad506b',
 mainModule:'worker.js',
 baselineSha256:'7a689cb8372fe6f5ce1d08b0b450af8f589ede5fb5c9ac94eb8f31ef5599adf1',
 cssSha256:'09f9f8685838f9e2efbb2b0ea2933f2d9ce3f954d3d23ca52a001db066b2ac3a',
});
const hash=x=>createHash('sha256').update(x).digest('hex');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const equal=(a,b,label)=>assert.equal(JSON.stringify(stable(a)),JSON.stringify(stable(b)),label);
const digest=x=>hash(JSON.stringify(stable(x)));
assert.equal(hash(CSS),LV15.cssSha256,'reviewed LV15 CSS drift');
const PREFIX='// MY MMD LV15 presentation-only; source eeb8a4fc; retain production runtime.\nconst MY_MMD_LIFF_LV15_CSS = '+JSON.stringify(CSS)+';\n';
const EDITS=Object.freeze([
 ['${MY_MMD_SIGIL_PRIVATE_CSS}\n</style>','${MY_MMD_SIGIL_PRIVATE_CSS}\n${MY_MMD_LIFF_LV15_CSS}\n</style>'],
 ['data-mmd-graphics="v6" data-brand-audience="unresolved">','data-mmd-graphics="v6" data-brand-audience="unresolved" data-mmd-liff-level="15">'],
]);
export function patchLv15Text(original){
 assert.equal(typeof original,'string');assert.ok(!original.includes('MY_MMD_LIFF_LV15_CSS'),'already patched');
 let result=original;
 for(const [before,after] of EDITS){assert.equal(result.split(before).length,2,'missing or ambiguous delta anchor');result=result.replace(before,()=>after);}
 result=PREFIX+result;
 let inverse=result.slice(PREFIX.length);
 for(const [before,after] of [...EDITS].reverse()){assert.equal(inverse.split(after).length,2,'ambiguous inverse');inverse=inverse.replace(after,()=>before);}
 assert.equal(inverse,original,'unrelated runtime altered');
 return result;
}
export function decodeLv15Module(artifact,id,expectedHash){
 assert.equal(artifact?.id,id);assert.equal(artifact.main_module,LV15.mainModule);
 assert.equal(artifact.modules?.length,1,'unexpected module inventory');
 const m=artifact.modules[0];assert.equal(m.name,LV15.mainModule);
 assert.ok(['application/javascript+module','application/javascript','text/javascript'].includes(m.content_type),'unexpected module type');
 assert.match(m.content_base64||'',/^[A-Za-z0-9+/]+={0,2}$/);
 const bytes=Buffer.from(m.content_base64,'base64');assert.equal(bytes.toString('base64'),m.content_base64);
 assert.equal(hash(bytes),expectedHash,'Worker module hash drift');return bytes;
}
export function buildLv15Artifact(artifact){
 const bytes=decodeLv15Module(artifact,LV15.baseVersion,LV15.baselineSha256);
 const text=bytes.toString('utf8');assert.ok(Buffer.from(text).equals(bytes),'non-UTF8 module');
 const candidate=Buffer.from(patchLv15Text(text));return {bytes:candidate,sha256:hash(candidate)};
}
export function validateLv15Syntax(bytes){
 const dir=mkdtempSync(join(tmpdir(),'my-mmd-lv15-check-'));const path=join(dir,'worker.mjs');
 try{writeFileSync(path,bytes,{mode:0o600});execFileSync(process.execPath,['--check',path],{stdio:['ignore','ignore','ignore'],timeout:15000});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
export function inspectLv15Checkout(sha,directory=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 assert.match(sha||'',/^[a-f0-9]{40}$/);assert.equal(git('rev-parse','HEAD'),sha);
 assert.equal(resolve(git('rev-parse','--show-toplevel')),resolve(directory));
 assert.equal(git('status','--porcelain','--untracked-files=all','--ignored'),'','dirty release checkout');
 git('merge-base','--is-ancestor',LV15.sourceSha,sha);
 for(const p of ['member-pages-worker/src/liff-member-lv15-style.js','member-pages-worker/src/liff-member-shell.js'])
  assert.equal(git('rev-parse',sha+':'+p),git('rev-parse',LV15.sourceSha+':'+p),'reviewed source drift');
 return {method:'reversible-live-artifact-lv15-delta',deltaSourceSha:LV15.sourceSha,cssSha256:LV15.cssSha256};
}
export async function releaseLv15(io){
 const state={phase:'preflight',worker:'member-pages-worker',releaseSha:io.sha,deltaSourceSha:LV15.sourceSha,cssSha256:LV15.cssSha256};
 const save=phase=>{state.phase=phase;io.save({...state});};
 try{
  await io.approve();assert.match(io.sha||'',/^[a-f0-9]{40}$/);
  assert.equal(io.expectedVersion,LV15.baseVersion);assert.equal(io.expectedDeployment,LV15.baseDeployment);
  const call=(suffix,init)=>io.call(ROOT+suffix,init);
  const deployment=(await call('/deployments')).deployments[0];
  assert.equal(activeVersion(deployment),LV15.baseVersion);assert.equal(deployment.id,LV15.baseDeployment);
  const baseline=await call('/versions/'+LV15.baseVersion);assert.equal(baseline.id,LV15.baseVersion);
  const config=versionConfiguration(baseline),settings=await call('/script-settings');
  const boundary=async()=>({routes:await io.call('/zones/'+ZONE+'/workers/routes'),schedules:await call('/schedules'),subdomain:await call('/subdomain')});
  const bounds=await boundary();
  const unchanged=async(d,latest)=>{
   equal((await call('/deployments')).deployments[0],d,'active deployment drift');
   assert.equal((await call('/versions')).items[0].id,latest,'latest version drift');
   equal(await call('/script-settings'),settings,'script settings drift');equal(await boundary(),bounds,'routing/cron drift');
  };
  await unchanged(deployment,LV15.baseVersion);
  const built=await io.build(await io.call(VERSION_ROOT+'/'+LV15.baseVersion+'?include=modules'));
  assert.ok(Buffer.isBuffer(built.bytes)&&built.bytes.length);assert.equal(hash(built.bytes),built.sha256);
  await io.syntax(built.bytes);
  Object.assign(state,{baselineVersion:LV15.baseVersion,baselineDeployment:LV15.baseDeployment,baselineSha256:LV15.baselineSha256,candidateSha256:built.sha256,configurationDigest:digest(config),settingsDigest:digest(settings),boundaryDigest:digest(bounds),bindingCount:config.bindings.length});
  const metadata=uploadMetadata(baseline,io.sha);metadata.main_module=LV15.mainModule;
  delete metadata.annotations['workers/commit_sha'];
  metadata.annotations['workers/message']='MY MMD LV15 artifact delta; base='+LV15.baseVersion+'; delta-source='+LV15.sourceSha+'; bundle-sha256='+built.sha256;
  await io.approve();await unchanged(deployment,LV15.baseVersion);
  const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set(LV15.mainModule,new Blob([built.bytes],{type:'application/javascript+module'}),LV15.mainModule);
  save('upload-attempted-outcome-unknown');
  const uploaded=await call('/versions?bindings_inherit=strict',{method:'POST',body:form});
  assert.match(uploaded?.id||'',/^[a-f0-9-]{36}$/);assert.notEqual(uploaded.id,LV15.baseVersion);
  state.uploadedVersion=uploaded.id;save('uploaded-not-promoted');
  const exact=await call('/versions/'+uploaded.id);assert.equal(exact.id,uploaded.id);equal(versionConfiguration(exact),config,'uploaded config drift');
  const art=await io.call(VERSION_ROOT+'/'+uploaded.id+'?include=modules');
  decodeLv15Module(art,uploaded.id,built.sha256);
  assert.equal((art.annotations||art.metadata?.annotations)?.['workers/message'],metadata.annotations['workers/message']);
  const versions=(await call('/versions')).items;assert.equal(versions[0].id,uploaded.id);assert.equal(versions[1].id,LV15.baseVersion,'predecessor drift');
  await io.approve();await unchanged(deployment,uploaded.id);
  save('promotion-attempted-outcome-unknown');
  const promoted=await call('/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}]})});
  assert.match(promoted?.id||'',/^[a-f0-9-]{36}$/);assert.notEqual(promoted.id,LV15.baseDeployment);
  state.deployment=promoted.id;
  const receipt=await call('/deployments/'+promoted.id);assert.equal(receipt.id,promoted.id);assert.equal(activeVersion(receipt),uploaded.id);
  await unchanged(receipt,uploaded.id);equal(versionConfiguration(await call('/versions/'+uploaded.id)),config,'post-release configuration drift');
  save('complete');return {...state};
 }catch(error){state.stoppedAfter=state.phase;save('stopped');throw error;}
}
async function main(){
 assert.equal(process.argv.length,3);assert.equal(process.argv[2],'--execute-approved');
 assert.equal(process.env.RELEASE_MODE,'lv15-artifact');assert.equal(process.env.PRODUCTION_APPROVED,'true');
 assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
 const sha=process.env.GITHUB_SHA;
 const dir=mkdtempSync(join(tmpdir(),'mmd-lv15-release-'));
 const journal=join(process.env.RUNNER_TEMP||dir,'member-pages-lv15-receipt.json');
 await releaseLv15({sha,expectedVersion:process.env.EXPECTED_VERSION,expectedDeployment:process.env.EXPECTED_DEPLOYMENT,
  approve:async()=>{await verifyOwnerApproval(process.env);inspectLv15Checkout(sha);},
  call:createTransport(process.env.CLOUDFLARE_API_TOKEN),build:buildLv15Artifact,syntax:validateLv15Syntax,
  save:x=>writeFileSync(journal,JSON.stringify(x,null,2),{mode:0o600})});
 console.log('LV15 artifact deployed with verified unchanged runtime and configuration; no business-write smoke.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(()=>{console.error('LV15 release stopped. Inspect sanitized receipt; never retry an ambiguous upload/promotion.');process.exitCode=1;});

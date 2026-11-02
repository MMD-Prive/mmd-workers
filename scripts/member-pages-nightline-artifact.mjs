// Owner-gated, production-preserving NIGHTLINE artifact release. No automatic deployment on import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const patchBytes=readFileSync(new URL('./member-pages-nightline-patch.json',import.meta.url));
const patch=JSON.parse(patchBytes);
import {ACCOUNT,ZONE,ROOT,VERSION_ROOT,activeVersion,versionConfiguration,uploadMetadata,createTransport} from './member-pages-code-only-release.mjs';
import {verifyOwnerApproval} from './member-pages-owner-approval.mjs';
export const NIGHTLINE=Object.freeze({
 baselineToolingSha:'3bfcba2bd917683592c9bae1e1e65333f8192fee',
 baseVersion:'85da9919-e1c8-425d-94e8-fb0a5ff7a0c4',
 baseDeployment:'2d3b7c3c-1dce-4cf5-b0fe-a5bb5e16a7e7',
 mainModule:'worker.js',
 baselineSha256:'9bbe9bf7ad95ed49de8f64cd485883507e2fd142d47df2e5ae0ac28bfb34f523',
 cssSha256:'d2203f874b27fad21fa2f7d0d09752bb06c2a68546c04d6df8f8890c0823da17',
 patchSha256:'3ad9e5e870cfb8db55829f88c698098dbb50352a9c0f544bb750ad9af4249216',
 candidateSha256:'9e1e7eb7b425af0e08789f9aca2a65b467cfd234d50fbac90927aec574122849',
});
const hash=x=>createHash('sha256').update(x).digest('hex');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const equal=(a,b,label)=>assert.equal(JSON.stringify(stable(a)),JSON.stringify(stable(b)),label);
const digest=x=>hash(JSON.stringify(stable(x)));
assert.equal(hash(patchBytes),NIGHTLINE.patchSha256,'reviewed skin patch drift');
const PREFIX=patch.prefix;
const EDITS=patch.edits.map(({from,to})=>[from,to]);
export function patchNightlineText(original){
 assert.equal(typeof original,'string');assert.ok(!original.includes('NIGHTLINE_SKIN_ONLY_CSS'),'already patched');
 let result=original;
 for(const [before,after] of EDITS){assert.equal(result.split(before).length,2,'missing or ambiguous delta anchor');result=result.replace(before,()=>after);}
 result=PREFIX+result;
 let inverse=result.slice(PREFIX.length);
 for(const [before,after] of [...EDITS].reverse()){assert.equal(inverse.split(after).length,2,'ambiguous inverse');inverse=inverse.replace(after,()=>before);}
 assert.equal(inverse,original,'unrelated runtime altered');
 return result;
}
export function decodeNightlineModule(artifact,id,expectedHash){
 assert.equal(artifact?.id,id);assert.equal(artifact.main_module,NIGHTLINE.mainModule);
 assert.equal(artifact.modules?.length,1,'unexpected module inventory');
 const m=artifact.modules[0];assert.equal(m.name,NIGHTLINE.mainModule);
 assert.ok(['application/javascript+module','application/javascript','text/javascript'].includes(m.content_type),'unexpected module type');
 assert.match(m.content_base64||'',/^[A-Za-z0-9+/]+={0,2}$/);
 const bytes=Buffer.from(m.content_base64,'base64');assert.equal(bytes.toString('base64'),m.content_base64);
 assert.equal(hash(bytes),expectedHash,'Worker module hash drift');return bytes;
}
export function buildNightlineArtifact(artifact){
 const bytes=decodeNightlineModule(artifact,NIGHTLINE.baseVersion,NIGHTLINE.baselineSha256);
 const text=bytes.toString('utf8');assert.ok(Buffer.from(text).equals(bytes),'non-UTF8 module');
 const candidate=Buffer.from(patchNightlineText(text));assert.equal(hash(candidate),NIGHTLINE.candidateSha256,'candidate hash drift');return {bytes:candidate,sha256:hash(candidate)};
}
export function validateNightlineSyntax(bytes){
 const dir=mkdtempSync(join(tmpdir(),'my-mmd-nightline-check-'));const path=join(dir,'worker.mjs');
 try{writeFileSync(path,bytes,{mode:0o600});execFileSync(process.execPath,['--check',path],{stdio:['ignore','ignore','ignore'],timeout:15000});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
export function inspectNightlineCheckout(sha,directory=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 assert.match(sha||'',/^[a-f0-9]{40}$/);assert.equal(git('rev-parse','HEAD'),sha);
 assert.equal(resolve(git('rev-parse','--show-toplevel')),resolve(directory));
 assert.equal(git('status','--porcelain','--untracked-files=all','--ignored'),'','dirty release checkout');
 git('merge-base','--is-ancestor',NIGHTLINE.baselineToolingSha,sha);
 assert.equal(hash(readFileSync(join(directory,'scripts/member-pages-nightline-patch.json'))),NIGHTLINE.patchSha256,'reviewed patch drift');
 return {method:'reversible-live-artifact-nightline-delta',baselineToolingSha:NIGHTLINE.baselineToolingSha,cssSha256:NIGHTLINE.cssSha256};
}
export async function releaseNightline(io){
 const state={phase:'preflight',worker:'member-pages-worker',releaseSha:io.sha,baselineToolingSha:NIGHTLINE.baselineToolingSha,cssSha256:NIGHTLINE.cssSha256};
 const save=phase=>{state.phase=phase;io.save({...state});};
 try{
  await io.approve();assert.match(io.sha||'',/^[a-f0-9]{40}$/);
  assert.equal(io.expectedVersion,NIGHTLINE.baseVersion);assert.equal(io.expectedDeployment,NIGHTLINE.baseDeployment);
  const call=(suffix,init)=>io.call(ROOT+suffix,init);
  const deployment=(await call('/deployments')).deployments[0];
  assert.equal(activeVersion(deployment),NIGHTLINE.baseVersion);assert.equal(deployment.id,NIGHTLINE.baseDeployment);
  const baseline=await call('/versions/'+NIGHTLINE.baseVersion);assert.equal(baseline.id,NIGHTLINE.baseVersion);
  const config=versionConfiguration(baseline),settings=await call('/script-settings');
  const boundary=async()=>({routes:await io.call('/zones/'+ZONE+'/workers/routes'),schedules:await call('/schedules'),subdomain:await call('/subdomain')});
  const bounds=await boundary();
  const unchanged=async(d,latest)=>{
   equal((await call('/deployments')).deployments[0],d,'active deployment drift');
   assert.equal((await call('/versions')).items[0].id,latest,'latest version drift');
   equal(await call('/script-settings'),settings,'script settings drift');equal(await boundary(),bounds,'routing/cron drift');
  };
  await unchanged(deployment,NIGHTLINE.baseVersion);
  const built=await io.build(await io.call(VERSION_ROOT+'/'+NIGHTLINE.baseVersion+'?include=modules'));
  assert.ok(Buffer.isBuffer(built.bytes)&&built.bytes.length);assert.equal(hash(built.bytes),built.sha256);
  await io.syntax(built.bytes);
  Object.assign(state,{baselineVersion:NIGHTLINE.baseVersion,baselineDeployment:NIGHTLINE.baseDeployment,baselineSha256:NIGHTLINE.baselineSha256,candidateSha256:built.sha256,configurationDigest:digest(config),settingsDigest:digest(settings),boundaryDigest:digest(bounds),bindingCount:config.bindings.length});
  const metadata=uploadMetadata(baseline,io.sha);metadata.main_module=NIGHTLINE.mainModule;
  delete metadata.annotations['workers/commit_sha'];
  metadata.annotations['workers/message']='MY MMD NIGHTLINE artifact delta; base='+NIGHTLINE.baseVersion+'; patch-sha256='+NIGHTLINE.patchSha256+'; bundle-sha256='+built.sha256;
  await io.approve();await unchanged(deployment,NIGHTLINE.baseVersion);
  const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set(NIGHTLINE.mainModule,new Blob([built.bytes],{type:'application/javascript+module'}),NIGHTLINE.mainModule);
  save('upload-attempted-outcome-unknown');
  const uploaded=await call('/versions?bindings_inherit=strict',{method:'POST',body:form});
  assert.match(uploaded?.id||'',/^[a-f0-9-]{36}$/);assert.notEqual(uploaded.id,NIGHTLINE.baseVersion);
  state.uploadedVersion=uploaded.id;save('uploaded-not-promoted');
  const exact=await call('/versions/'+uploaded.id);assert.equal(exact.id,uploaded.id);equal(versionConfiguration(exact),config,'uploaded config drift');
  const art=await io.call(VERSION_ROOT+'/'+uploaded.id+'?include=modules');
  decodeNightlineModule(art,uploaded.id,built.sha256);
  assert.equal((art.annotations||art.metadata?.annotations)?.['workers/message'],metadata.annotations['workers/message']);
  const versions=(await call('/versions')).items;assert.equal(versions[0].id,uploaded.id);assert.equal(versions[1].id,NIGHTLINE.baseVersion,'predecessor drift');
  await io.approve();await unchanged(deployment,uploaded.id);
  save('promotion-attempted-outcome-unknown');
  const promoted=await call('/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}]})});
  assert.match(promoted?.id||'',/^[a-f0-9-]{36}$/);assert.notEqual(promoted.id,NIGHTLINE.baseDeployment);
  state.deployment=promoted.id;
  const receipt=await call('/deployments/'+promoted.id);assert.equal(receipt.id,promoted.id);assert.equal(activeVersion(receipt),uploaded.id);
  await unchanged(receipt,uploaded.id);equal(versionConfiguration(await call('/versions/'+uploaded.id)),config,'post-release configuration drift');
  save('complete');return {...state};
 }catch(error){state.stoppedAfter=state.phase;save('stopped');throw error;}
}
async function main(){
 assert.equal(process.argv.length,3);assert.equal(process.argv[2],'--execute-approved');
 assert.equal(process.env.RELEASE_MODE,'nightline-artifact');assert.equal(process.env.PRODUCTION_APPROVED,'true');
 assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
 const sha=process.env.GITHUB_SHA;
 const dir=mkdtempSync(join(tmpdir(),'mmd-nightline-release-'));
 const journal=join(process.env.RUNNER_TEMP||dir,'member-pages-nightline-receipt.json');
 await releaseNightline({sha,expectedVersion:process.env.EXPECTED_VERSION,expectedDeployment:process.env.EXPECTED_DEPLOYMENT,
  approve:async()=>{await verifyOwnerApproval(process.env);inspectNightlineCheckout(sha);},
  call:createTransport(process.env.CLOUDFLARE_API_TOKEN),build:buildNightlineArtifact,syntax:validateNightlineSyntax,
  save:x=>writeFileSync(journal,JSON.stringify(x,null,2),{mode:0o600})});
 console.log('NIGHTLINE artifact deployed with verified unchanged runtime and configuration; no business-write smoke.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(()=>{console.error('NIGHTLINE release stopped. Inspect sanitized receipt; never retry an ambiguous upload/promotion.');process.exitCode=1;});

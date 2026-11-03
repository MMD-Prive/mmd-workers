// Manual workflow entry only. Importing this module never contacts a service.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateReleaseInputs,verifyPolicyCheckout,createPolicyTransport} from './care-back-november-policy-release.mjs';
import {releaseHomeDelta,parseHomeManifest} from './my-mmd-home-delta-adapter.mjs';
export async function homeMain(argv=process.argv.slice(2),env=process.env){
 assert.equal(argv.length,1);assert.ok(['--inspect','--execute-approved'].includes(argv[0]));
 const mode=argv[0].slice(2);
 // Reuse the existing identity/input validator without invoking a policy release.
 const input=validateReleaseInputs({...env,CARE_BACK_WORKER:'member-pages-worker'},mode);
 const manifestPath=resolve(env.PATCH_MANIFEST);
 const bytes=readFileSync(manifestPath);
 const manifest=parseHomeManifest(bytes,env.EXPECTED_MANIFEST_SHA256,'member-pages-worker');
 assert.equal(manifest.source_sha,env.APPROVED_SOURCE_SHA);
 const sourceCheck=async()=>{
  await verifyPolicyCheckout(env,manifestPath);
  // Both reviewed source and tooling must be in this approved main history.
  execFileSync('git',['merge-base','--is-ancestor',manifest.source_sha,env.APPROVED_SHA],{stdio:'ignore'});
  return {source_sha:manifest.source_sha,manifest_sha256:env.EXPECTED_MANIFEST_SHA256};
 };
 await sourceCheck();
 return releaseHomeDelta({...input,manifestBytes:bytes,expectedManifestHash:env.EXPECTED_MANIFEST_SHA256,
  expectedModuleHash:env.EXPECTED_MODULE_SHA256,expectedVersion:env.EXPECTED_VERSION,expectedDeployment:env.EXPECTED_DEPLOYMENT,
  sourceCheck,call:createPolicyTransport(env.CLOUDFLARE_API_TOKEN,'member-pages-worker',{allowWrites:mode==='execute-approved'}),
  save:value=>writeFileSync(resolve(env.RUNNER_TEMP||'/tmp','my-mmd-home-release-receipt.json'),JSON.stringify(value),{mode:0o600}),
 },env);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 homeMain().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('My MMD release stopped; inspect sanitized receipt. Do not retry automatically.');process.exitCode=1;});
}

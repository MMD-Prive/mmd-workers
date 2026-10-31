// Only the shared Owner panel embedded in live ingress changes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { releaseCurrentSession,uploadMetadata,validateSourceState,createBuildEvidence,ACCOUNT,ZONE } from './admin-current-session-code-only.mjs';
import { patchOwner } from './admin-kenji-unpause-code-only.mjs';
import { parseWranglerVersion } from './admin-held-viewer-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
export const ROOT=`/accounts/${ACCOUNT}/workers/scripts/immigrate-worker`;
export const BASE='072e33cf-55e3-45c4-88c0-e369b37d6410';
export const START='// ../admin-worker/src/kenji-owner-line-unlock.js\n';
export const END='// src/kenji-owner-line-bridge.ts\n';
export const HASH='8f37db0ff9001fe27d47c03aa25eeed9a09db660899ef9c5094f6818845e45b6';
export function ingressMetadata(version,sha) {
 const copy=structuredClone(version);
 const assets=copy.resources.script_runtime.assets;
 assert.ok(assets && version.resources.bindings.some(b=>b.name==='ASSETS'&&b.type==='assets'),'known assets required');
 delete copy.resources.script_runtime.assets;
 // keep_assets is the existing Wrangler secret-rotation code-only upload path.
 // The release engine still compares the full original assets config after upload.
 return {...uploadMetadata(copy,sha),keep_assets:true};
}
export function ingressTransport(token,fetcher=fetch) {
 assert.ok(token);
 return async (path,{method='GET',body}={})=>{
  const read=method==='GET'&&(new RegExp(`^${ROOT}/(deployments(?:/[a-f0-9-]{36})?|versions(?:/[a-f0-9-]{36})?|script-settings|schedules|subdomain)$`,'i').test(path)||path===`/zones/${ZONE}/workers/routes`);
  const write=method==='POST'&&[ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments'].includes(path);
  assert.ok(read||write,'outside ingress code-only release scope');
  const r=await fetcher('https://api.cloudflare.com/client/v4'+path,{method,body,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})}});
  const data=await r.json();assert.ok(r.ok&&data.success===true,`ingress ${method} failed ${r.status}; no retry`);return data.result;
 };
}
const require=createRequire(import.meta.url);
async function main(){
 const globalRoot=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
 const esbuild=require(join(globalRoot,'wrangler/node_modules/esbuild'));
 const source=readFileSync('admin-worker/src/kenji-owner-line-unlock.js','utf8');
 const panel=source.slice(source.indexOf('export function lineUnlockReady'),source.indexOf('export async function handleOwnerLinePage')).replace(/^export /gm,'');
 const compiled=esbuild.transformSync(panel,{loader:'js',format:'esm',target:'es2022',keepNames:true}).code;
 const a=compiled.indexOf('function lineUnlockReady');assert.ok(a>0);
 const replacement=START+compiled.slice(a)+'\n';
 const dir=mkdtempSync(join(tmpdir(),'kenji-ingress-panel-')),syntax=join(dir,'candidate.mjs');
 writeFileSync(syntax,replacement);execFileSync(process.execPath,['--check',syntax],{stdio:'ignore'});
 if(process.argv[2]==='--test-bundle')return console.log('Ingress Owner panel compiled syntax passed.');
 assert.equal(process.argv[2],'--execute-approved');assert.equal(process.env.PRODUCTION_APPROVED,'true');assert.equal(process.env.EXPECTED_VERSION,BASE);
 const sha=process.env.GITHUB_SHA,releaseId=`${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
 const approve=async()=>{await verifyProductionApproval(process.env);assert.equal((await inspectEnvironment(process.env)).ready,true);validateSourceState({expectedSha:sha,headSha:git('rev-parse','HEAD'),dirtyStatus:git('status','--porcelain=v1','--untracked-files=all')});};
 let preservation;
 await releaseCurrentSession({root:ROOT,metadataFactory:ingressMetadata,sha,approve,expectedVersion:BASE,expectedDeployment:process.env.EXPECTED_DEPLOYMENT,call:ingressTransport(process.env.CLOUDFLARE_API_TOKEN),
 sourceCheck:async v=>{assert.equal(v.id,BASE);return {commit_sha:sha,dirty_tree:false,dirty_path_count:0,method:'exact-Owner-panel-only-overlay',baseline_version:BASE};},
 bundle:async()=>{const r=await fetch('https://api.cloudflare.com/client/v4'+ROOT+'/content/v2',{headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const parts=[...(await r.formData()).entries()];assert.equal(parts.length,1);assert.equal(parts[0][0],'customer-360-live-ingress-wrapper.js');assert.ok(typeof parts[0][1]!=='string'&&parts[0][1].size<2*1024*1024);const result=patchOwner(await parts[0][1].text(),replacement,HASH,START,END);preservation=result.preservation;writeFileSync(syntax,result.code);execFileSync(process.execPath,['--check',syntax],{stdio:'ignore'});return new TextEncoder().encode(result.code);},
 buildEvidence:code=>({...createBuildEvidence({code,releaseId,nodeVersion:process.version,wranglerVersion:parseWranglerVersion(execFileSync('wrangler',['--version'],{encoding:'utf8'})),lockfile:readFileSync('package-lock.json'),wranglerConfig:new TextEncoder().encode(JSON.stringify({panel:START,baseline:BASE}))}),preservation}),
 now:()=>new Date().toISOString(),save:s=>writeFileSync(join(process.env.RUNNER_TEMP,'kenji-ingress-panel-receipt.json'),JSON.stringify(s,null,2),{mode:0o600})});
 console.log('Ingress Owner panel deployed; unrelated runtime, routes, bindings and asset configuration preserved.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(`Ingress panel release stopped: ${e.message}; no automatic retry.`);process.exitCode=1;});

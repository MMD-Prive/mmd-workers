import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homeMain} from './my-mmd-home-delta-cli.mjs';
import {parseHomeManifest} from './my-mmd-home-delta-adapter.mjs';
import {sha256,buildPolicyModules} from './care-back-november-policy-release.mjs';
const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
const job=workflow.slice(workflow.indexOf('  my-mmd-home-release:'));
const evaluate=new Function('github','inputs','return '+job.match(/^    if: (.+)$/m)[1]);
const sha='a'.repeat(40),github={event_name:'workflow_dispatch',ref:'refs/heads/main',sha};
const inputs={execution_mode:'my-mmd-home-delta',production_approved:true,approval_ref:'fixture',approved_sha:sha,expected_version:'fixture',expected_deployment:'fixture',patch_manifest:'fixture',expected_manifest_sha256:'fixture',expected_module_sha256:'fixture'};
test('reference release pins the merged #3219 source and unchanged companion to the existing Owner gate',()=>{
 const raw=readFileSync(new URL('./liff-reference-3219-delta-manifest.json',import.meta.url));
 const manifest=parseHomeManifest(raw,'6a6f7b1ff7208df61f7b15f8a22be995297f5d1c1409195000359bc25724d55f','member-pages-worker');
 assert.equal(manifest.source_sha,'b7dec7a7213bdce8c7f2a369f2a2304d6dd9466f');
 // Historical manifest remains immutable; the current release pin is tested below.
 assert.equal(manifest.baseline_version,'0e415d37-1823-4914-940a-4b3853b262a6');
 assert.equal(manifest.baseline_deployment,'455961e8-a71e-4efe-ab29-c252987f431e');
 assert.equal(manifest.modules.length,2);
 const entry=manifest.modules.find(m=>m.name===manifest.main_module);
 const branding=manifest.modules.find(m=>m.name==='app-branding-module.mjs');
 assert.equal(entry.before_sha256,'39572dcb63c525f087f23e4eeff83555ac5f37d32c42519afa350310d9270815');
 assert.equal(entry.after_sha256,'4164694e5b482ad0e1186a933da50c1041fa60941992f9c6104f3913114b4bcb');
 assert.equal(branding.before_sha256,'76c2130c17a40f459b3697262f4a2cc86de0c3ecf2cee631e22a17128533ad60');
 assert.equal(branding.after_sha256,branding.before_sha256);assert.deepEqual(branding.patches,[]);
 const after=entry.patches.map(p=>p.after).join('\n');
 assert.match(after,/withReferenceWorker\(request, env, ctx/);
 assert.match(after,/requestRef:env\[SERVER_REFERENCE\]/);
 assert.equal(after.split('const referenceFetch = (${createReferenceFetch.toString()})').length-1,2);
 assert.match(job,/environment: member-pages-code-only-owner/);
 assert.match(job,/if: always\(\)/);
});
test('401 reason release pins exact source, bytes and the unchanged Owner approval guards',()=>{
 const raw=readFileSync(new URL('./liff-401-3232-delta-manifest.json',import.meta.url));
 const manifest=parseHomeManifest(raw,'557ca0a3cf5284ae2fbf8fb60f9129600950c23d7554df08d9768814574b857a','member-pages-worker');
 assert.equal(manifest.source_sha,'5595437dd72ef77f8d46de2ce2842b5afd25468c');
 assert.equal(manifest.source_sha,job.match(/APPROVED_SOURCE_SHA: ([a-f0-9]{40})/)[1]);
 assert.equal(manifest.baseline_version,'734d8b02-e4db-4e25-a0a3-108b5f928fff');
 assert.equal(manifest.baseline_deployment,'bbb82854-f2ec-439c-a60b-8ed8640cd1ab');
 assert.equal(manifest.modules.length,2);
 const entry=manifest.modules.find(m=>m.name===manifest.main_module);
 assert.equal(entry.before_sha256,'4164694e5b482ad0e1186a933da50c1041fa60941992f9c6104f3913114b4bcb');
 assert.equal(entry.after_sha256,'4d68981d15c22fdf6f46b5c70ba7887617576f94b86a35e9328b1ed4e92bd7e7');
 assert.equal(entry.patches.length,1);
 const branding=manifest.modules.find(m=>m.name==='app-branding-module.mjs');
 assert.equal(branding.before_sha256,'76c2130c17a40f459b3697262f4a2cc86de0c3ecf2cee631e22a17128533ad60');
 assert.equal(branding.after_sha256,branding.before_sha256);assert.deepEqual(branding.patches,[]);
 assert.match(entry.patches[0].after,/LIFF_SESSION_REQUIRED/);
 assert.match(entry.patches[0].after,/LIFF_SESSION_INVALID/);
 assert.match(job,/environment: member-pages-code-only-owner/);
 assert.match(job,/needs: \[production-approval\]/);
 assert.match(job,/inputs.approved_sha == github.sha/);
 assert.match(job,/if: always\(\)/);
});
test('historical entry lane manifest preserves merged #3070 source',()=>{
 const raw=readFileSync(new URL('./my-mmd-home-delta-manifest.json',import.meta.url));
 assert.equal(sha256(raw),'33cd6afb79303e4149622f92f209586f7f06532c012fcec428bff4bae3db3b0b');
 const manifest=parseHomeManifest(raw,sha256(raw),'member-pages-worker');
 assert.equal(manifest.source_sha,'625164e20d8713aaf26db7fcb43bbb1d7befe084');
 assert.equal(manifest.baseline_version,'60b85c46-0d3b-4988-8bb0-60165085d6e1');
 assert.equal(manifest.baseline_deployment,'f6f79e0a-440a-4f7f-8b12-176c7ff4fc1a');
 assert.equal(manifest.modules.length,1);assert.equal(manifest.modules[0].patches.length,1);
 assert.equal(manifest.modules[0].before_sha256,'de6ae634a7199b2cfad2ffb20807c36a417ee456df61dfec5e3d27982f79394a');
 assert.equal(manifest.modules[0].after_sha256,'25661f7891b22743054d73072029aa686c852c3e87b85bbe2493c936a4fdc5e9');
 assert.deepEqual(manifest.modules[0].patches.map(p=>p.id),['member-api-start-editorial-lane']);
 for(const patch of manifest.modules[0].patches){
 assert.notEqual(patch.before,patch.after);
 assert.equal(sha256(patch.before),patch.before_sha256);
 assert.equal(sha256(patch.after),patch.after_sha256);
 }
 const reader=readFileSync(new URL('../shared/original-booking-evidence.mjs',import.meta.url),'utf8');
 assert.match(reader,/redirect: "manual"/);assert.match(reader,/!response.ok/);
 const shell=readFileSync(new URL('../member-pages-worker/src/liff-member-shell.js',import.meta.url),'utf8');
 assert(shell.includes('memberApiFetch("/api/member/app/updates?limit=10"'));
});
test('profile retry manifest pins #3204 and both LIFF shells on the reviewed active artifact',()=>{
 const raw=readFileSync(new URL('./liff-profile-503-delta-manifest.json',import.meta.url));
 const hash='433e7cf395eb9fdea10f98c30dfb657edf6401e1b2f89e842f047fdf434f4694';
 const manifest=parseHomeManifest(raw,hash,'member-pages-worker');
 assert.equal(manifest.source_sha,'de0e236412c4b44289fa25ac934d83b024da13d4');
 assert.equal(manifest.baseline_version,'2992448f-259a-4978-8e59-087518939e4a');
 assert.equal(manifest.baseline_deployment,'4b5f9ffd-f2a6-4051-b436-a798d894dc38');
 assert.equal(manifest.modules.length,2);
 const entry=manifest.modules.find(m=>m.name===manifest.main_module);
 const branding=manifest.modules.find(m=>m.name==='app-branding-module.mjs');
 assert.deepEqual(branding,{name:'app-branding-module.mjs',type:'esm',
  before_sha256:'76c2130c17a40f459b3697262f4a2cc86de0c3ecf2cee631e22a17128533ad60',
  after_sha256:'76c2130c17a40f459b3697262f4a2cc86de0c3ecf2cee631e22a17128533ad60',patches:[]});
 assert.equal(entry.before_sha256,'7778e6bf8083abdf9acbbb9e47d347bfd99600d447424d801c6c5d93c3c643a9');
 assert.equal(entry.after_sha256,'39572dcb63c525f087f23e4eeff83555ac5f37d32c42519afa350310d9270815');
 assert.deepEqual(entry.patches.map(p=>p.id),['profile-retry-owner-baseline-shell','profile-retry-imported-shell']);
 for(const p of entry.patches) {
  const a=p.before.indexOf('  async function readProfile(');
  assert.ok(a>=0);
  assert.equal(p.after.slice(0,a),p.before.slice(0,a));
  assert.match(p.after,/setProfileRetry\(response.status === 503\)/);
 }
});
test('two-module Home delta preserves companion bytes and rejects inventory or companion drift',()=>{
 const before='export default "before";',after='export default "after";',branding='export const branding="synthetic";';
 const module=(name,code)=>({name,content_base64:Buffer.from(code).toString('base64')});
 const manifest={baseline_version:'synthetic',main_module:'entry.mjs',modules:[
  {name:'entry.mjs',before_sha256:sha256(before),after_sha256:sha256(after),patches:[
   {before,after,before_sha256:sha256(before),after_sha256:sha256(after)}]},
  {name:'app-branding-module.mjs',before_sha256:sha256(branding),after_sha256:sha256(branding),patches:[]},
 ]};
 const artifact={id:manifest.baseline_version,main_module:manifest.main_module,
  modules:[module('app-branding-module.mjs',branding),module('entry.mjs',before)]};
 assert.throws(()=>buildPolicyModules(artifact,{...manifest,modules:manifest.modules.slice(0,1)}),/artifact module inventory drift/);
 const candidate=buildPolicyModules(artifact,manifest);
 assert.deepEqual(candidate.find(m=>m.name==='app-branding-module.mjs').bytes,Buffer.from(branding));
 assert.equal(candidate.find(m=>m.name==='entry.mjs').bytes.toString(),after);
 assert.throws(()=>buildPolicyModules({...artifact,modules:artifact.modules.slice(1)},manifest),/artifact module inventory drift/);
 assert.throws(()=>buildPolicyModules({...artifact,modules:[...artifact.modules,module('extra.mjs','extra')]},manifest),/artifact module inventory drift/);
 assert.throws(()=>buildPolicyModules({...artifact,modules:[module('app-branding-module.mjs','changed'),artifact.modules[1]]},manifest),/artifact module bytes drift/);
});
test('Home release is manual, protected and rejects incomplete input',()=>{
 assert.equal(evaluate(github,inputs),true);
 for(const key of Object.keys(inputs))assert.equal(evaluate(github,{...inputs,[key]:key==='production_approved'?false:''}),false);
 for(const event_name of ['push','pull_request','workflow_run'])assert.equal(evaluate({...github,event_name},inputs),false);
 assert.equal(evaluate({...github,ref:'refs/heads/other'},inputs),false);
 assert.equal(evaluate({...github,sha:'b'.repeat(40)},inputs),false);
 assert.match(job,/environment: member-pages-code-only-owner/);
 assert.match(job,/needs: \[production-approval\]/);
 assert.match(job,/fetch-depth: 0/);
 assert.match(job,/node scripts\/my-mmd-home-delta-cli.mjs --execute-approved/);
 assert.doesNotMatch(job,/wrangler|route-sync|secret put/);
});
test('CLI records sanitized receipts for input, manifest and checkout failures',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'my-mmd-receipt-'));
 t.after(()=>rmSync(join(dir,'my-mmd-home-release-receipt.json'),{force:true}));
 const manifest=fileURLToPath(new URL('./liff-profile-503-delta-manifest.json',import.meta.url));
 const bytes=readFileSync(manifest), data=JSON.parse(bytes);
 const env={RUNNER_TEMP:dir,CLOUDFLARE_ACCOUNT_ID:'b176eda1172b741fd2e58904cc9d77c5',
  GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'MMD-Prive/mmd-workers',
  GITHUB_REPOSITORY_ID:'1121397236',GITHUB_ACTOR:'mmdprive',GITHUB_ACTOR_ID:'216427112',
  GITHUB_TRIGGERING_ACTOR:'mmdprive',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'1',
  GITHUB_SHA:'f'.repeat(40),APPROVED_SHA:'f'.repeat(40),APPROVED_SOURCE_SHA:data.source_sha,
  EXPECTED_VERSION:data.baseline_version,EXPECTED_DEPLOYMENT:data.baseline_deployment,
  EXPECTED_MODULE_SHA256:data.modules.find(m=>m.name===data.main_module).before_sha256,EXPECTED_MANIFEST_SHA256:sha256(bytes),
  PATCH_MANIFEST:manifest,GH_TOKEN:'synthetic-do-not-log'};
 const network=t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected network');});
 for(const [args,overrides,stage] of [
  [[],{},'validate-inputs'],
  [['--promote'],{},'validate-inputs'],
  [['--execute-approved'],{GITHUB_ACTOR:''},'validate-inputs'],
  [['--inspect'],{EXPECTED_MANIFEST_SHA256:'0'.repeat(64)},'validate-manifest'],
  [['--inspect'],{},'verify-source-checkout'],
 ]){
  await assert.rejects(homeMain(args,{...env,...overrides}));
  assert.deepEqual(JSON.parse(readFileSync(join(dir,'my-mmd-home-release-receipt.json'))),
   {phase:'preflight',stage,upload:'not_started',promotion:'not_started'});
 }
 assert.equal(network.mock.callCount(),0);
});
test('checkout verifier retains tracked blob, clean checkout and main checks',()=>{
 const code=readFileSync(new URL('./care-back-november-policy-release.mjs',import.meta.url),'utf8');
 assert.match(code,/--porcelain.*--untracked-files=all.*--ignored/);
 assert.match(code,/hash-object.*--no-filters/);
 assert.match(code,/manifest is not the approved tracked blob/);
 const cli=readFileSync(new URL('./my-mmd-home-delta-cli.mjs',import.meta.url),'utf8');
 assert.match(cli,/await verifyPolicyCheckout\(env,manifestPath\)/);
 assert.match(cli,/merge-base','--is-ancestor'/);
});

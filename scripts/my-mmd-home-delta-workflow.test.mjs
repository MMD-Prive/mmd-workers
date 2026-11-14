import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homeMain} from './my-mmd-home-delta-cli.mjs';
import {parseHomeManifest} from './my-mmd-home-delta-adapter.mjs';
import {sha256} from './care-back-november-policy-release.mjs';
const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
const job=workflow.slice(workflow.indexOf('  my-mmd-home-release:'));
const evaluate=new Function('github','inputs','return '+job.match(/^    if: (.+)$/m)[1]);
const sha='a'.repeat(40),github={event_name:'workflow_dispatch',ref:'refs/heads/main',sha};
const inputs={execution_mode:'my-mmd-home-delta',production_approved:true,approval_ref:'fixture',approved_sha:sha,expected_version:'fixture',expected_deployment:'fixture',patch_manifest:'fixture',expected_manifest_sha256:'fixture',expected_module_sha256:'fixture'};
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
 const hash='59a8cc673dc3eccc4dd8b550a769921b6013dc9669dd86ae76433c6e006c8190';
 const manifest=parseHomeManifest(raw,hash,'member-pages-worker');
 assert.equal(manifest.source_sha,'de0e236412c4b44289fa25ac934d83b024da13d4');
 assert.equal(manifest.source_sha,job.match(/APPROVED_SOURCE_SHA: ([a-f0-9]{40})/)[1]);
 assert.equal(manifest.baseline_version,'2992448f-259a-4978-8e59-087518939e4a');
 assert.equal(manifest.baseline_deployment,'4b5f9ffd-f2a6-4051-b436-a798d894dc38');
 assert.equal(manifest.modules.length,1);
 assert.equal(manifest.modules[0].before_sha256,'7778e6bf8083abdf9acbbb9e47d347bfd99600d447424d801c6c5d93c3c643a9');
 assert.equal(manifest.modules[0].after_sha256,'39572dcb63c525f087f23e4eeff83555ac5f37d32c42519afa350310d9270815');
 assert.deepEqual(manifest.modules[0].patches.map(p=>p.id),['profile-retry-owner-baseline-shell','profile-retry-imported-shell']);
 for(const p of manifest.modules[0].patches) {
  const a=p.before.indexOf('  async function readProfile(');
  assert.ok(a>=0);
  assert.equal(p.after.slice(0,a),p.before.slice(0,a));
  assert.match(p.after,/setProfileRetry\(response.status === 503\)/);
 }
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
  EXPECTED_MODULE_SHA256:data.modules[0].before_sha256,EXPECTED_MANIFEST_SHA256:sha256(bytes),
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

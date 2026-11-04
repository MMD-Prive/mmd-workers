import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homeMain} from './my-mmd-home-delta-cli.mjs';
import {parseHomeManifest} from './my-mmd-home-delta-adapter.mjs';
import {sha256} from './care-back-november-policy-release.mjs';
const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
const job=workflow.slice(workflow.indexOf('  my-mmd-home-release:'));
const evaluate=new Function('github','inputs','return '+job.match(/^    if: (.+)$/m)[1]);
const sha='a'.repeat(40),github={event_name:'workflow_dispatch',ref:'refs/heads/main',sha};
const inputs={execution_mode:'my-mmd-home-delta',production_approved:true,approval_ref:'fixture',approved_sha:sha,expected_version:'fixture',expected_deployment:'fixture',patch_manifest:'fixture',expected_manifest_sha256:'fixture',expected_module_sha256:'fixture'};
test('diagnostics manifest and workflow pin agree with merged #3059 source',()=>{
 const raw=readFileSync(new URL('./my-mmd-home-delta-manifest.json',import.meta.url));
 assert.equal(sha256(raw),'0faf49fea3332befbaea01be05c8c0fc40b6c7590f918baeabbda8b78048a7cf');
 const manifest=parseHomeManifest(raw,sha256(raw),'member-pages-worker');
 assert.equal(manifest.source_sha,'3e416e70434dbd8ac7d73917d551f7f101c8c5dd');
 assert.equal(manifest.source_sha,job.match(/APPROVED_SOURCE_SHA: ([a-f0-9]{40})/)[1]);
 assert.equal(manifest.baseline_version,'13d39bce-751c-4eec-882a-a354aaacbf34');
 assert.equal(manifest.baseline_deployment,'1c168fe4-3910-4304-ad68-6599a6e8804a');
 assert.equal(manifest.modules.length,1);assert.equal(manifest.modules[0].patches.length,5);
 assert.equal(manifest.modules[0].before_sha256,'7a5969426551b6d4eaf370b31280dd5a62a446b050529898c4b9b51855d7206f');
 assert.equal(manifest.modules[0].after_sha256,'a882ddb90ceea1cb15c6ea5c49c9e65e874877f7b1dc99b5fc53ba59f1426e04');
 assert.deepEqual(manifest.modules[0].patches.map(p=>p.id),['diagnostic-helpers','loader-lifecycle','active-identity-start-phase-timing','bounded-client-receiver','browser-lifecycle-wiring']);
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
test('CLI refuses invalid mode and missing identity before any transport',async()=>{
 await assert.rejects(homeMain([],{}));
 await assert.rejects(homeMain(['--promote'],{}));
 await assert.rejects(homeMain(['--execute-approved'],{}));
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

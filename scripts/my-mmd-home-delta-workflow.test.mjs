import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homeMain} from './my-mmd-home-delta-cli.mjs';
const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
const job=workflow.slice(workflow.indexOf('  my-mmd-home-release:'));
const evaluate=new Function('github','inputs','return '+job.match(/^    if: (.+)$/m)[1]);
const sha='a'.repeat(40),github={event_name:'workflow_dispatch',ref:'refs/heads/main',sha};
const inputs={execution_mode:'my-mmd-home-delta',production_approved:true,approval_ref:'fixture',approved_sha:sha,expected_version:'fixture',expected_deployment:'fixture',patch_manifest:'fixture',expected_manifest_sha256:'fixture',expected_module_sha256:'fixture'};
test('alias manifest and workflow pin agree with reviewed alias-only source',()=>{
 const manifest=JSON.parse(readFileSync(new URL('./my-mmd-home-delta-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.source_sha,job.match(/APPROVED_SOURCE_SHA: ([a-f0-9]{40})/)[1]);
 assert.equal(manifest.modules.length,1);assert.equal(manifest.modules[0].patches.length,1);
 const patch=manifest.modules[0].patches[0];
 assert.equal(patch.before,'"/api/v1/member/updates/list?limit=10"');
 assert.equal(patch.after,'"/api/member/app/updates?limit=10"');
 const shell=readFileSync(new URL('../member-pages-worker/src/liff-member-shell.js',import.meta.url),'utf8');
 assert(shell.includes('memberApiFetch('+patch.after));assert(!shell.includes('memberApiFetch('+patch.before));
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

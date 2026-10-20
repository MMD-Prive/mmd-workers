import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRecoveryGitHubReader,readOriginalArchive,validateRecoveryInvocation} from './member-pages-recovery-adapter.mjs';
import {RECOVERY_TARGET as T} from './member-pages-uploaded-recovery.mjs';
import {ORIGINAL_ARTIFACT,RECOVERY_WORKFLOW} from './member-pages-promotion-only-recovery.mjs';
import {ACCOUNT} from './member-pages-code-only-release.mjs';
const env=()=>({CLOUDFLARE_ACCOUNT_ID:ACCOUNT,PRODUCTION_APPROVED:'true',RECOVERY_MODE:'promote-existing',
 EXPECTED_UPLOADED_VERSION:T.uploaded_version,EXPECTED_VERSION:T.baseline_version,EXPECTED_DEPLOYMENT:T.baseline_deployment,
 SOURCE_DIRECTORY:'/fixture/source',RUNNER_TEMP:'/fixture/tmp',GH_TOKEN:'fixture',CLOUDFLARE_API_TOKEN:'fixture'});
test('explicit pinned recovery invocation only',()=>{
 validateRecoveryInvocation(env(),['--execute-approved']);
 for(const key of Object.keys(env())){const e=env();delete e[key];assert.throws(()=>validateRecoveryInvocation(e,['--execute-approved']));}
 for(const args of [[],['--preflight'],['--execute-approved','extra']])assert.throws(()=>validateRecoveryInvocation(env(),args));
 for(const key of ['CLOUDFLARE_ACCOUNT_ID','RECOVERY_MODE','PRODUCTION_APPROVED','EXPECTED_UPLOADED_VERSION','EXPECTED_VERSION','EXPECTED_DEPLOYMENT']){
  assert.throws(()=>validateRecoveryInvocation({...env(),[key]:'other'},['--execute-approved']));
 }
});
test('GitHub adapter is GET only, repo/path scoped and never follows redirects',async()=>{
 const calls=[];const read=createRecoveryGitHubReader({GH_TOKEN:'fixture',GITHUB_RUN_ID:'123'},async(url,options)=>{
  calls.push({url,options});return {status:200,json:async()=>({ok:true})};});
 assert.deepEqual(await read('/actions/runs/123'),{ok:true});
 assert.equal(calls[0].options.redirect,'error');
 for(const path of ['https://other.test','/actions/runs/456','/environments/other','/actions/artifacts/999'])await assert.rejects(read(path));
 await assert.rejects(read('/actions/runs/123',{method:'POST'}));await assert.rejects(read('/actions/runs/123',{body:'x'}));
 assert.equal(calls.length,1);
 const denied=createRecoveryGitHubReader({GH_TOKEN:'fixture',GITHUB_RUN_ID:'123'},async()=>({status:302}));
 await assert.rejects(denied('/actions/runs/123'));
});
test('artifact adapter rejects wrong id/method before invoking commands and wrong bytes before unzip',()=>{
 let calls=0;const run=()=>{calls++;return Buffer.from('untrusted archive');};
 assert.throws(()=>readOriginalArchive(1,{},run));assert.throws(()=>readOriginalArchive(ORIGINAL_ARTIFACT.id,{method:'POST'},run));assert.equal(calls,0);
 assert.throws(()=>readOriginalArchive(ORIGINAL_ARTIFACT.id,{method:'GET'},run));assert.equal(calls,1);
});
const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
const jobs=new Map([...workflow.split('\njobs:\n')[1].matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map(([,id,body])=>[id,body]));
const evaluate=id=>new Function('github','inputs','return '+jobs.get(id).match(/^    if: (.+)$/m)[1]);
const github={event_name:'workflow_dispatch',ref:'refs/heads/main',sha:'a'.repeat(40)};
const inputs={production_approved:true,approval_ref:'fixture',approved_sha:github.sha,execution_mode:'promote-existing',expected_version:T.baseline_version,expected_deployment:T.baseline_deployment};
test('recovery uses same owner-protected workflow and production serialization',()=>{
 assert.equal(RECOVERY_WORKFLOW,'.github/workflows/deploy-member-pages-worker-code-only.yml');
 assert.equal(evaluate('production-approval')(github,inputs),true);assert.equal(evaluate('release')(github,inputs),true);
 assert.equal(evaluate('approval-boundary-only')(github,inputs),false);
 assert.match(jobs.get('release'),/needs: \[production-approval\]/);assert.match(jobs.get('release'),/environment: member-pages-code-only-owner/);
 assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/deploy-member-pages-worker-production/);
 assert.match(workflow,/default: approval_boundary_only/);
});
test('recovery job refuses missing authorization, automatic triggers, baseline omission and main/SHA drift',()=>{
 for(const patch of [{production_approved:false},{approval_ref:''},{approved_sha:'b'.repeat(40)},{expected_version:''},{expected_deployment:''},{execution_mode:'other'}])assert.equal(evaluate('release')(github,{...inputs,...patch}),false);
 for(const patch of [{ref:'refs/heads/other'},{event_name:'push'},{event_name:'pull_request'},{sha:'b'.repeat(40)}])assert.equal(evaluate('release')({...github,...patch},inputs),false);
});
test('upload and recovery execution steps are mutually exclusive and source remains pinned',()=>{
 const release=jobs.get('release');
 assert.match(release,/ref: fe5f9d98876b600421c5614efc049ffc890b8adb/);
 assert.match(release,/Upload and promote exact source with strict binding inheritance\n        if: inputs.execution_mode == 'release'/);
 assert.match(release,/Promote only the verified existing startup version\n        if: inputs.execution_mode == 'promote-existing'/);
 assert.match(release,/EXPECTED_UPLOADED_VERSION: eef80a0c-afb7-4abc-bd91-6b02f5440d02/);
 assert.match(release,/node scripts\/member-pages-recovery-adapter.mjs --execute-approved/);
 assert.match(release,/scripts\/member-pages-recovery-adapter.test.mjs/);
});

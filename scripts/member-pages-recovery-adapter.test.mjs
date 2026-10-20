import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,statSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRecoveryGitHubReader,readOriginalArchive,validateRecoveryInvocation,createDurableRecoveryJournal,sanitizeRecoveryJournal,runRecovery} from './member-pages-recovery-adapter.mjs';
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

const journalState=()=>({phase:'preflight',worker:'member-pages-worker',source_sha:T.source_sha,release_sha:null,uploaded_version:T.uploaded_version,overall_phase:'OPEN'});
test('journal drops private extras and rejects unverified identity or diagnostic values',()=>{
 assert.deepEqual(sanitizeRecoveryJournal({...journalState(),token:'fixture-secret',headers:{Authorization:'fixture-secret'}}),journalState());
 for(const patch of [{phase:'other'},{worker:'other'},{source_sha:'other'},{release_sha:'fixture-secret'},{release_sha:{toString:()=> 'a'.repeat(40),toJSON:()=> 'fixture-secret'}},{uploaded_version:'other'},{overall_phase:'CLOSED'},{deployment:'secret'},{stopped_after:'other'},{diagnostic:{stage:'RECOVERY_MAIN_CHECK',reason:'private-body'}}])assert.throws(()=>sanitizeRecoveryJournal({...journalState(),...patch}));
 assert.deepEqual(sanitizeRecoveryJournal({...journalState(),diagnostic:{stage:'RECOVERY_FINAL_ACTIVE_CHECK',reason:'FINAL_ACTIVE_DEPLOYMENT_DRIFT',body:'private'}}).diagnostic,{stage:'RECOVERY_FINAL_ACTIVE_CHECK',reason:'FINAL_ACTIVE_DEPLOYMENT_DRIFT'});
});
test('durable journal atomically replaces prior receipt with private permissions and no temp residue',()=>{
 const root=mkdtempSync(join(tmpdir(),'mmd-adapter-journal-'));
 try{const journal=createDurableRecoveryJournal(root,'123');writeFileSync(journal.path,'old',{mode:0o644});
 journal.save(journalState());journal.save({...journalState(),phase:'promotion-attempted-outcome-unknown'});
 assert.equal(JSON.parse(readFileSync(journal.path,'utf8')).phase,'promotion-attempted-outcome-unknown');
 assert.equal(statSync(journal.path).mode&0o777,0o600);assert.deepEqual(readdirSync(root),['member-pages-code-only-receipt.json']);
 assert.throws(()=>journal.save({...journalState(),phase:'secret'}));assert.equal(JSON.parse(readFileSync(journal.path,'utf8')).phase,'promotion-attempted-outcome-unknown');
 }finally{rmSync(root,{recursive:true});}
});
test('journal cannot silently succeed when durable storage is unavailable',()=>{
 const root=mkdtempSync(join(tmpdir(),'mmd-adapter-journal-fail-'));const journal=createDurableRecoveryJournal(root,'123');rmSync(root,{recursive:true});
 assert.throws(()=>journal.save(journalState()),/Recovery journal write failed/);
 assert.throws(()=>createDurableRecoveryJournal('relative','123'));assert.throws(()=>createDurableRecoveryJournal(tmpdir(),'../bad'));
});
test('reader captures its credential and rejects extra request options without another request',async()=>{
 const configuration={GH_TOKEN:'fixture-original',GITHUB_RUN_ID:'123'};let n=0;
 const read=createRecoveryGitHubReader(configuration,async(url,options)=>{n++;assert.equal(options.headers.Authorization,'Bearer fixture-original');return {status:200,json:async()=>({ok:true})};});
 configuration.GH_TOKEN='fixture-mutated';await read('/actions/runs/123');
 for(const options of [{headers:{Authorization:'other'}},{redirect:'follow'},{body:undefined}])await assert.rejects(read('/actions/runs/123',options));assert.equal(n,1);
 let commands=0;assert.throws(()=>readOriginalArchive(ORIGINAL_ARTIFACT.id,{method:'GET',body:'private'},()=>{commands++;}));assert.equal(commands,0);
});
test('adapter retains rebuild proof and existing workflow while binding source paths and filtering journal',()=>{
 const source=readFileSync(new URL('./member-pages-recovery-adapter.mjs',import.meta.url),'utf8');
 assert.match(source,/realpathSync\(env.SOURCE_DIRECTORY\)/);assert.match(source,/assert.notEqual\(sourceDirectory,releaseDirectory\)/);
 assert.match(source,/Object.freeze\(Object.fromEntries\(environmentKeys/);assert.match(source,/env:publicEnv/);
 assert.match(source,/checkRecoverySources\(releaseSha,sourceDirectory,releaseDirectory\)/);
 assert.match(source,/buildMemberPagesBundle\(dir,sourceDirectory\)/);assert.match(source,/hash\(bytes\),T.bundle_sha256/);
 assert.match(source,/save:record=>journal.save\(record\)/);assert.match(source,/fsyncSync\(fd\)/);assert.match(source,/fsyncSync\(dir\)/);
});

test('missing source path produces sanitized setup failure receipt before any executor request',async()=>{
 const root=mkdtempSync(join(tmpdir(),'mmd-adapter-setup-'));
 try{await assert.rejects(runRecovery({...env(),GITHUB_RUN_ID:'123',RUNNER_TEMP:root,SOURCE_DIRECTORY:join(root,'missing-source')},['--execute-approved']),/inspect sanitized receipt/);
 const receipt=JSON.parse(readFileSync(join(root,'member-pages-code-only-receipt.json'),'utf8'));
 assert.equal(receipt.phase,'stopped');assert.equal(receipt.release_sha,null);assert.deepEqual(receipt.diagnostic,{stage:'RECOVERY_ADAPTER_SETUP',reason:'ADAPTER_SETUP_FAILED'});
 assert.doesNotMatch(JSON.stringify(receipt),/fixture|missing-source/);
 }finally{rmSync(root,{recursive:true});}
});

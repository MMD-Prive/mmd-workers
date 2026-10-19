import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyOwnerApproval, environmentName} from './member-pages-owner-approval.mjs';
const sha='a'.repeat(40), user={login:'mmdprive',id:216427112};
function fixture() {
 const env={GITHUB_EVENT_NAME:'workflow_dispatch', GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'MMD-Prive/mmd-workers',GITHUB_REPOSITORY_ID:'1121397236',GITHUB_ACTOR:'mmdprive',GITHUB_ACTOR_ID:'216427112',GITHUB_TRIGGERING_ACTOR:'mmdprive',GITHUB_SHA:sha,APPROVED_SHA:sha,APPROVAL_REF:'owner approval',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GH_TOKEN:'fixture'};
 const run={repository:{id:1121397236},event:'workflow_dispatch',head_branch:'main',head_sha:sha,path:'.github/workflows/deploy-member-pages-worker-code-only.yml',actor:{...user},triggering_actor:{...user},run_attempt:1};
 const p={name:environmentName,can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{...user}}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
 const branches={total_count:1,branch_policies:[{name:'main',type:'branch'}]}, ref={object:{sha}};
 run.id=123; p.id=456;
 const history=[{state:'approved',user:{...user},environments:[{id:p.id,name:environmentName}]}];
 const requests=[];
 const request=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');requests.push(url);const body=url.endsWith('/approvals')?history:url.includes('/actions/runs/')?run:url.includes('/git/ref/')?ref:url.includes('/deployment-branch-policies')?branches:p;return {status:200,json:async()=>body};};
 return {env,run,p,branches,ref,history,requests,request};
}
test('execution requires the actual owner receipt for this first-attempt run',async()=>{const f=fixture();assert.equal((await verifyOwnerApproval(f.env,f.request)).environment,environmentName);assert.ok(f.requests.some(url=>url.endsWith('/actions/runs/123/approvals')));});
for(const [name,change] of Object.entries({
 'other actor':f=>f.env.GITHUB_ACTOR='ic111nm',
 'forged actor id':f=>f.env.GITHUB_ACTOR_ID='1',
 'other rerunner':f=>f.run.triggering_actor={login:'ic111nm',id:286945879},
 'wrong repo':f=>f.run.repository.id=1,
 'wrong workflow':f=>f.run.path='.github/workflows/other.yml',
 'wrong workflow ref':f=>f.run.path='.github/workflows/deploy-member-pages-worker-code-only.yml@dev',
 'malformed workflow suffix':f=>f.run.path='.github/workflows/deploy-member-pages-worker-code-only.yml@main@dev',
 'automatic event':f=>f.env.GITHUB_EVENT_NAME='push',
 'wrong branch':f=>f.env.GITHUB_REF='refs/heads/dev',
 'wrong approval SHA':f=>f.env.APPROVED_SHA='b'.repeat(40),
 'main drift':f=>f.ref.object.sha='b'.repeat(40),
 'stale run attempt':f=>f.run.run_attempt=2,
 'shared environment':f=>f.p.name='mmd-production-mutation',
 'admin bypass':f=>f.p.can_admins_bypass=true,
 'missing reviewers':f=>f.p.protection_rules=[],
 'additional reviewer':f=>f.p.protection_rules[0].reviewers.push({type:'User',reviewer:user}),
 'wrong reviewer':f=>f.p.protection_rules[0].reviewers[0].reviewer.id=1,
 'self approval disabled':f=>f.p.protection_rules[0].prevent_self_review=true,
 'extra branch':f=>f.branches.total_count=2,
 'tag instead of branch':f=>f.branches.branch_policies[0].type='tag',
 'empty approval ref':f=>f.env.APPROVAL_REF=' ',
})) test(`fail closed: ${name}`,async()=>{const f=fixture();change(f);await assert.rejects(verifyOwnerApproval(f.env,f.request));});
for(const status of [403,404,500]) test(`unavailable protection ${status}`,async()=>{const f=fixture();await assert.rejects(verifyOwnerApproval(f.env,async()=>({status})));});
test('network failure closes gate',async()=>{const f=fixture();await assert.rejects(verifyOwnerApproval(f.env,async()=>{throw Error('offline');}));});
test('shared gate still prohibits self review',()=>{const s=readFileSync(new URL('./admin-production-approval.mjs',import.meta.url),'utf8');assert.match(s,/prevent_self_review, true/);assert.match(s,/mmd-production-mutation/);});
test('only scoped release imports owner policy; approval repeats at write boundaries',()=>{
 const release=readFileSync(new URL('./member-pages-code-only-release.mjs',import.meta.url),'utf8');
 assert.match(release,/import \{ verifyOwnerApproval \} from '.\/member-pages-owner-approval.mjs'/);
 assert.match(release,/await verifyOwnerApproval\(process.env\);\s+inspectCodeOnlyCheckouts/);
 assert.doesNotMatch(release,/inspectEnvironment|verifyProductionApproval/);
 const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
 assert.match(workflow,/environment: member-pages-code-only-owner/);
 assert.match(workflow,/node --test scripts\/member-pages-owner-approval.test.mjs/);
 assert.match(release,/only the exact reviewed Graphics V4 source may be bundled/);
});

test('API ref-qualified main workflow is accepted',async()=>{const f=fixture();f.run.path += '@main';await verifyOwnerApproval(f.env,f.request);});

test('preflight may inspect protection before approval, but cannot authorize execution',async()=>{
 const f=fixture();f.history.length=0;
 await verifyOwnerApproval(f.env,f.request,{preflight:true});
 assert.equal(f.requests.some(url=>url.endsWith('/approvals')),false);
 await assert.rejects(verifyOwnerApproval(f.env,f.request));
});
for(const [name,change] of Object.entries({
 'no approval despite approval input':f=>f.history.length=0,
 'different run':f=>f.run.id=999,
 'other approver':f=>f.history[0].user.login='ic111nm',
 'forged approver ID':f=>f.history[0].user.id=1,
 'rejected receipt':f=>f.history[0].state='rejected',
 'pending receipt':f=>f.history[0].state='pending',
 'missing environment ID':f=>delete f.p.id,
 'wrong environment ID':f=>f.history[0].environments[0].id=999,
 'shared environment receipt':f=>f.history[0].environments[0].name='mmd-production-mutation',
 'additional receipt':f=>f.history.push(structuredClone(f.history[0])),
 'additional environment':f=>f.history[0].environments.push({id:789,name:'other'}),
 'missing environment':f=>delete f.history[0].environments,
 'missing approver':f=>delete f.history[0].user,
 'owner rerun with old approval':f=>{f.env.GITHUB_RUN_ATTEMPT='2';f.run.run_attempt=2;},
 'missing attempt':f=>delete f.env.GITHUB_RUN_ATTEMPT,
 'wildcard branch':f=>f.branches.branch_policies[0].name='*',
})) test(`receipt fail closed: ${name}`,async()=>{const f=fixture();change(f);await assert.rejects(verifyOwnerApproval(f.env,f.request));});
for(const status of [401,403,404,429,500]) test(`approval-history HTTP ${status} blocks execution`,async()=>{
 const f=fixture();await assert.rejects(verifyOwnerApproval(f.env,(url,options)=>url.endsWith('/approvals')?Promise.resolve({status}):f.request(url,options)));
});
for(const [name,result] of [['malformed',{}],['null',null]]) test(`${name} approval history blocks execution`,async()=>{
 const f=fixture();await assert.rejects(verifyOwnerApproval(f.env,(url,options)=>url.endsWith('/approvals')?Promise.resolve({status:200,json:async()=>result}):f.request(url,options)));
});
for(const name of ['network','timeout','invalid JSON']) test(`approval ${name} blocks execution`,async()=>{
 const f=fixture();await assert.rejects(verifyOwnerApproval(f.env,(url,options)=>url.endsWith('/approvals')?Promise.reject(new Error(name)):f.request(url,options)));
});
test('workflow preflight is explicitly non-executing; release retains strict default at all boundaries',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
 const release=readFileSync(new URL('./member-pages-code-only-release.mjs',import.meta.url),'utf8');
 assert.match(workflow,/node scripts\/member-pages-owner-approval.mjs --preflight/);
 assert.match(release,/await verifyOwnerApproval\(process.env\);/);
 assert.doesNotMatch(release,/preflight:\s*true/);
 assert.equal((release.match(/await io.approve\(\)/g)||[]).length,3);
});

const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
const workflowJobs=new Map([...workflow.split('\njobs:\n')[1].matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map(([,id,body])=>[id,body]));
const jobCondition=id=>new Function('github','inputs',`return ${workflowJobs.get(id).match(/^    if: (.+)$/m)[1]};`);
const dispatch={event_name:'workflow_dispatch',ref:'refs/heads/main',sha};
const authorized={production_approved:true,approval_ref:'fixture',approved_sha:sha,execution_mode:'approval_boundary_only',expected_version:'fixture-version',expected_deployment:'fixture-deployment'};

test('approval-only is the explicit safe default; missing or invalid modes never release',()=>{
 assert.match(workflow,/execution_mode:[\s\S]*?type: choice\s+required: true\s+default: approval_boundary_only/);
 assert.deepEqual([...workflowJobs.keys()],['production-approval','approval-boundary-only','release']);
 for(const execution_mode of [undefined,'','invalid',true,false]) {
   for(const id of workflowJobs.keys()) assert.equal(jobCondition(id)(dispatch,{...authorized,execution_mode}),false);
 }
});

test('approval-only and release are mutually exclusive even with all release inputs present',()=>{
 for(const execution_mode of ['approval_boundary_only','release']) {
   const inputs={...authorized,execution_mode};
   assert.equal(jobCondition('production-approval')(dispatch,inputs),true);
   assert.equal(jobCondition('approval-boundary-only')(dispatch,inputs),execution_mode==='approval_boundary_only');
   assert.equal(jobCondition('release')(dispatch,inputs),execution_mode==='release');
 }
});

test('every job rejects automatic events, wrong branch, SHA drift and missing owner authorization',()=>{
 for(const id of workflowJobs.keys()) {
   const evaluate=jobCondition(id);
   for(const event_name of ['push','pull_request','workflow_run','schedule']) assert.equal(evaluate({...dispatch,event_name},authorized),false);
   for(const ref of ['refs/heads/dev','refs/tags/main']) assert.equal(evaluate({...dispatch,ref},authorized),false);
   for(const overrides of [{production_approved:false},{approved_sha:'b'.repeat(40)},{approval_ref:''}]) assert.equal(evaluate(dispatch,{...authorized,...overrides}),false);
 }
});

test('approval-only needs no baseline; release still requires both baseline identifiers',()=>{
 const inputs={...authorized,expected_version:'',expected_deployment:''};
 assert.equal(jobCondition('approval-boundary-only')(dispatch,inputs),true);
 for(const key of ['expected_version','expected_deployment']) assert.equal(jobCondition('release')(dispatch,{...authorized,execution_mode:'release',[key]:''}),false);
});

test('approval-only waits for preflight and actual environment approval, never uses preflight authorization',()=>{
 const job=workflowJobs.get('approval-boundary-only');
 assert.match(job,/needs: \[production-approval\]/);
 assert.match(job,/environment: member-pages-code-only-owner/);
 assert.match(job,/permissions:\s+contents: read\s+actions: read/);
 assert.match(job,/ref: \$\{\{ github.sha \}\}\s+persist-credentials: false/);
 assert.match(job,/run: node scripts\/member-pages-owner-approval.mjs\s*$/);
 assert.doesNotMatch(job,/--preflight/);
});

test('approval-only execution surface has no write credential, release command, or extra action',()=>{
 const job=workflowJobs.get('approval-boundary-only');
 assert.doesNotMatch(job,/secrets\.|secrets:|: write|id-token|CLOUDFLARE|AIRTABLE|wrangler|npm |curl |--execute-approved|SOURCE_DIRECTORY|release-source|environment: mmd-production-mutation/i);
 assert.deepEqual([...job.matchAll(/uses: (.+)/g)].map(match=>match[1]),['actions/checkout@v5','actions/setup-node@v5']);
 assert.deepEqual([...job.matchAll(/^\s+run: (.+)$/gm)].map(match=>match[1]),['node scripts/member-pages-owner-approval.mjs']);
 assert.deepEqual([...job.matchAll(/^          ([A-Z_]+):/gm)].map(match=>match[1]),['GH_TOKEN','APPROVAL_REF','APPROVED_SHA']);
 const header=workflow.split('\njobs:')[0];
 assert.doesNotMatch(header,/secrets\.|^env:|: write|id-token/);
 assert.equal((workflow.match(/secrets\./g)||[]).length,1);
 assert.ok(workflowJobs.get('release').includes('secrets.CLOUDFLARE_API_TOKEN'));
});

test('test concurrency cannot block or bypass the production release queue',()=>{
 assert.match(workflow,/group: \$\{\{ inputs.execution_mode == 'approval_boundary_only' && 'member-pages-approval-boundary-test' \|\| 'deploy-member-pages-worker-production' \}\}/);
 assert.match(workflow,/cancel-in-progress: false/);
});

test('Node 18/20/22 CI runs owner and release mocks without production credentials',()=>{
 const ci=readFileSync(new URL('../.github/workflows/node.js.yml',import.meta.url),'utf8');
 assert.match(ci,/node-version: \[18.x, 20.x, 22.x\]/);
 assert.match(ci,/run: node --experimental-global-webcrypto --test scripts\/member-pages-owner-approval.test.mjs scripts\/member-pages-code-only-release.test.mjs/);
 assert.doesNotMatch(ci,/secrets\.|environment: member-pages-code-only-owner|--execute-approved/);
});

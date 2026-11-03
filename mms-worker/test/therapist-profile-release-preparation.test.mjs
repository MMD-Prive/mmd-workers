import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bootstrapConfig,bootstrapEntry} from '../../scripts/prepare-profile-bootstrap.mjs';
import {profileWritePaused,profileWritePauseResponse} from '../src/therapist-profile-write-pause.mjs';
const prefix='https://fixture.invalid/male-massage/therapists/api/auth/profile';
for(const method of ['PUT','POST','DELETE','PATCH'])for(const suffix of ['', '/photos','/photos/public','/photos/ph_fixture'])test('pause blocks '+method+suffix,()=>{
 assert.equal(profileWritePaused(new Request(prefix+suffix,{method}),{MMS_PROFILE_WRITES_PAUSED:'true'}),true);
});
test('pause retains reads/preflight and unrelated requests',()=>{
 for(const method of ['GET','HEAD','OPTIONS'])assert.equal(profileWritePaused(new Request(prefix,{method}),{MMS_PROFILE_WRITES_PAUSED:'true'}),false);
 assert.equal(profileWritePaused(new Request('https://fixture.invalid/other',{method:'POST'}),{MMS_PROFILE_WRITES_PAUSED:'true'}),false);
 assert.equal(profileWritePaused(new Request(prefix,{method:'PUT'}),{}),false);
 assert.equal(profileWritePauseResponse().status,503);
});
test('bootstrap preserves baseline and fails on namespace/tag conflicts',async()=>{
 const baseline=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 const before=JSON.stringify(baseline),next=bootstrapConfig(baseline,'v6-mms-therapist-profile');
 assert.equal(JSON.stringify(baseline),before);
 assert.equal(next.vars.MMS_PROFILE_WRITES_PAUSED,'true');
 assert.deepEqual(next.durable_objects.bindings.slice(0,-1),baseline.durable_objects.bindings);
 assert.deepEqual(next.migrations.slice(0,-1),baseline.migrations);
 for(const key of Object.keys(baseline).filter(k=>!['main','vars','durable_objects','migrations'].includes(k)))assert.deepEqual(next[key],baseline[key]);
 assert.throws(()=>bootstrapConfig(next,'v6-mms-therapist-profile'));
 assert.throws(()=>bootstrapConfig({...baseline,name:'other'},'v6-mms-therapist-profile'));
 assert.match(bootstrapEntry,/PROFILE_BOOTSTRAP_DORMANT/);
 assert.doesNotMatch(bootstrapEntry,/therapist-profile-coordinator-store/);
});
test('deployment job requires explicit release gate, with no default-open fallback',async()=>{
 const workflow=await readFile(new URL('../../.github/workflows/deploy-mms-worker.yml',import.meta.url),'utf8');
 assert.match(workflow,/validate-and-deploy:\s*\n\s*#.*\n\s*if: \$\{\{ vars\.MMS_PROFILE_RELEASE_GATE == 'approved' \}\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createMmsTherapistProfileCoordinator} from '../src/therapist-profile-coordinator-store.mjs';
const owner='mmst_fixture';
function fixture(entries=[]){const values=new Map(entries),before=structuredClone(values);let reads=0;
 const storage={async get(keys){reads++;return new Map(keys.map(k=>[k,structuredClone(values.get(k))]));},put(){throw Error('WRITE FORBIDDEN');},delete(){throw Error('DELETE FORBIDDEN');},setAlarm(){throw Error('ALARM FORBIDDEN');}};
 const C=createMmsTherapistProfileCoordinator(class{});return {c:new C({storage},{MMS_PROFILE_WRITES_PAUSED:'true'}),values,before,reads:()=>reads};}
test('missing inspector state never initializes owner or assumes drained',async()=>{const f=fixture();assert.deepEqual(await f.c.inspect(owner),{status:'NOT_OBSERVED',drain:'UNKNOWN'});assert.deepEqual(f.values,f.before);});
for(const phase of ['validating','prepared','airtable_inflight','airtable_unknown','airtable_saved','manifest_saved','rejected'])test('inspection preserves '+phase+' without exposing payload',async()=>{
 const pending={id:'11111111-2222-4333-8444-555555555555',fingerprint:'a'.repeat(64),revision:2,phase,...(phase==='validating'?{}:{plan:{owner,recordId:'recSynthetic0001',private:'DO NOT EXPOSE'}})};
 const f=fixture([['owner',owner],['revision',2],['pending',pending]]);const r=await f.c.inspect(owner);assert.equal(r.status,'PENDING');assert.equal(r.drain,'UNKNOWN');assert.equal(JSON.stringify(r).includes('DO NOT EXPOSE'),false);assert.deepEqual(f.values,f.before);
});
test('completed local state is not a global drain claim',async()=>{const f=fixture([['owner',owner],['revision',3],['pending',null],['op:fixture',{body:'private'}]]);assert.equal((await f.c.inspect(owner)).status,'NO_LOCAL_PENDING');assert.deepEqual(f.values,f.before);});
test('corruption and foreign owner remain unchanged',async()=>{for(const entries of [[['owner',owner],['revision',-1]],[['owner',owner],['pending',{phase:'unknown'}]],[['owner','mmst_other']]]){const f=fixture(entries);assert.ok(['CORRUPT','DENIED'].includes((await f.c.inspect(owner)).status));assert.deepEqual(f.values,f.before);}});
test('invalid owner reads nothing',async()=>{const f=fixture();await assert.rejects(()=>f.c.inspect('../other'));assert.equal(f.reads(),0);});
test('inspection waits for owner queue and does not overtake a mutation',async()=>{const f=fixture();let release;f.c.tail=new Promise(r=>release=r);const pending=f.c.inspect(owner);await Promise.resolve();assert.equal(f.reads(),0);release();await pending;assert.equal(f.reads(),1);});

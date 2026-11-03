import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fixture,IDS,key,PHOTO,cookie,ORIGIN} from './helpers/therapist-profile-fixture.mjs';
import {handleMmsTherapistProfileRequest,therapistProfileErrorResponse,profileDirectorySnapshot} from '../src/therapist-profile-runtime.mjs';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGOUjLJhYGBgYgADAAg7ALMQk86oAAAAAElFTkSuQmCC','base64');
const OTHER=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGMMYGBiYAAAAaIAVBelrcoAAAAASUVORK5CYII=','base64');
const UPLOAD='11111111-2222-4333-8444-555555555555';
const upload=(f,bytes=PNG,headers={})=>f.call('POST',bytes,{suffix:'/photos',rawBody:true,headers:{'Content-Type':'image/png','X-Upload-Id':UPLOAD,...headers}});
const snapshot=f=>JSON.parse(f.objects.get(key(IDS[0])));
const changes=f=>f.writes.filter(w=>w.storage==='airtable');
const rev=(n)=>({'X-Profile-Revision':String(n)});
function holdFirst(f) {
 let enter,release,held=false;const entered=new Promise(r=>enter=r),waiting=new Promise(r=>release=r);
 f.failure.journalHook=async updates=>{if(!held&&updates.pending?.phase==='validating'){held=true;enter();await waiting;}};
 return {entered,release};
}

for(const mode of ['edit','deselect','delete','upload','name/zones'])test('concurrent '+mode+' vs edit has no stale whole-manifest success',async t=>{
 const f=fixture(t),peer=f.objects.get(key(IDS[1])),barrier=holdFirst(f);
 let first;
 if(mode==='deselect')first=f.call('PUT',{photo_ids:[]},{suffix:'/photos/public',headers:rev(0)});
 else if(mode==='delete')first=f.call('DELETE',undefined,{suffix:'/photos/'+PHOTO,headers:rev(0)});
 else if(mode==='upload')first=upload(f,PNG,rev(0));
 else if(mode==='name/zones')first=f.call('PUT',{display_name:'Winner',intro:'Winning intro',base_service_zone_code:'BKK-ZONE1',coverage_service_zone_codes:['BKK-ZONE1']},{headers:rev(0)});
 else first=f.call('PUT',{intro:'Winner'},{headers:rev(0)});
 await barrier.entered;const second=f.call('PUT',{intro:'Stale loser'},{headers:rev(0)});barrier.release();
 const [a,b]=await Promise.all([first,second]);assert.ok([200,201,204].includes(a.status));assert.equal(b.status,409);assert.equal(b.error.code,'PROFILE_REVISION_CONFLICT');
 const read=await f.call();assert.equal(read.status,200);assert.notEqual(read.data.intro,'Stale loser');
 if(mode==='deselect')assert.deepEqual(read.data.public_photo_ids,[]);
 if(mode==='delete'){assert.ok(!read.data.photos.some(p=>p.id===PHOTO));assert.equal(f.objects.has(`therapist-dashboard/v1/${IDS[0]}/photos/${PHOTO}`),false);}
 if(mode==='upload')assert.equal(read.data.photos.length,2);
 if(mode==='name/zones'){assert.equal(read.data.display_name,'Winner');assert.equal(read.data.intro,'Winning intro');assert.equal(read.data.service_zones.base_service_zone_code,'BKK-ZONE1');}
 assert.equal(f.objects.get(key(IDS[1])),peer);
});

test('missing manifest concurrent creation has one winner and uses create-only',async t=>{
 const f=fixture(t);f.objects.delete(key(IDS[0]));const bucket=f.env.MMS_PRIVATE_UPLOADS,put=bucket.put;let condition;
 bucket.put=async(k,v,o)=>{if(k===key(IDS[0]))condition=o.onlyIf;return put(k,v,o);};
 const responses=await Promise.all([f.call('PUT',{intro:'A'},{headers:rev(0)}),f.call('PUT',{intro:'B'},{headers:rev(0)})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(condition.get('If-None-Match'),'*');assert.equal((await f.call()).data.intro,responses[0].status===200?'A':'B');
});

test('same upload ID same bytes concurrent retry returns same receipt with one object and one entry',async t=>{
 const f=fixture(t);const [a,b]=await Promise.all([upload(f),upload(f)]);assert.equal(a.status,201);assert.equal(b.status,201);assert.equal(a.data.id,b.data.id);
 assert.equal(f.writes.filter(w=>w.storage==='photo').length,1);assert.equal(snapshot(f).photos.length,2);
 const photo=snapshot(f).photos.at(-1);assert.equal(photo.content_sha256,createHash('sha256').update(f.objects.get(photo.key)).digest('hex'));
});

test('same upload ID different bytes concurrent request cannot overwrite committed bytes',async t=>{
 const f=fixture(t),barrier=holdFirst(f),first=upload(f,PNG,rev(0));await barrier.entered;const second=upload(f,OTHER,rev(0));barrier.release();const [a,b]=await Promise.all([first,second]);assert.equal(a.status,201);assert.equal(b.status,409);
 const photo=snapshot(f).photos.at(-1);assert.equal(photo.content_sha256,createHash('sha256').update(f.objects.get(photo.key)).digest('hex'));
 const later=await upload(f,OTHER,{'X-Profile-Operation-Id':randomUUID()});assert.equal(later.status,409);assert.equal(later.error.code,'PHOTO_UPLOAD_ID_REUSED');assert.equal(f.writes.filter(w=>w.storage==='photo').length,1);
});

test('deleted upload identity stays tombstoned across restart and never reattaches',async t=>{
 const f=fixture(t);const a=await upload(f);assert.equal(a.status,201);assert.equal((await f.call('DELETE',undefined,{suffix:'/photos/'+a.data.id})).status,204);
 f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);const retry=await upload(f,PNG,{'X-Profile-Operation-Id':randomUUID()});assert.equal(retry.status,409);assert.equal(retry.error.code,'PHOTO_UPLOAD_DELETED');
 assert.ok(!snapshot(f).photos.some(p=>p.id===a.data.id));assert.equal(f.objects.has(`therapist-dashboard/v1/${IDS[0]}/photos/${a.data.id}`),false);
});

test('delete interrupted after manifest commit blocks upload; same delete resumes cleanup',async t=>{
 const f=fixture(t);const a=await upload(f);f.failure.delete='after';const suffix='/photos/'+a.data.id;
 assert.equal((await f.call('DELETE',undefined,{suffix})).status,503);assert.equal((await upload(f,PNG,{'X-Profile-Operation-Id':randomUUID()})).error.code,'PROFILE_OPERATION_PENDING');
 assert.equal((await f.call()).status,503);delete f.failure.delete;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);assert.equal((await f.call('DELETE',undefined,{suffix})).status,204);
 assert.equal((await f.call()).data.photos.length,1);assert.equal((await upload(f,PNG,{'X-Profile-Operation-Id':randomUUID()})).error.code,'PHOTO_UPLOAD_DELETED');
});

for(const stage of ['before','after'])test('R2 acknowledgement '+stage+' commit: pending reads fail closed and same operation recovers',async t=>{
 const f=fixture(t);f.failure.put=stage;const body={intro:'Recovered once'};const initial=await f.call('PUT',body);assert.equal(initial.status,503);
 assert.equal((await f.call()).status,503);assert.equal((await f.call('PUT',{intro:'Do not overwrite'})).error.code,'PROFILE_OPERATION_PENDING');
 await assert.rejects(()=>profileDirectorySnapshot(IDS[0],f.env));
 delete f.failure.put;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);assert.equal((await f.call('PUT',body)).status,200);assert.equal((await f.call()).data.intro,'Recovered once');
});

for(const failure of ['after','malformed'])test('unknown Airtable '+failure+' is never retried/released on time, equal readback or restart',async t=>{
 const f=fixture(t);f.failure.patch=failure;const body={display_name:'Ambiguous name',...f.selection};
 const first=await f.call('PUT',body);assert.equal(first.status,503);assert.equal(first.error.code,'PROFILE_OPERATION_UNCERTAIN');assert.equal(changes(f).length,1);
 delete f.failure.patch;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);assert.equal((await f.call('PUT',body)).error.code,'PROFILE_OPERATION_UNCERTAIN');
 assert.equal((await f.call('PUT',{display_name:'Newer name'})).status,409);assert.equal((await f.call()).status,503);assert.equal(changes(f).length,1);
 assert.equal((await f.call('PUT',{intro:'Peer remains available'},{actor:1})).status,200);assert.equal((await f.call('GET',undefined,{actor:1})).data.intro,'Peer remains available');
});

test('durable inflight marker survives crash before external PATCH without guessing failure',async t=>{
 const f=fixture(t);f.failure.journalHook=async updates=>{if(updates.pending?.phase==='airtable_inflight')f.failure.journal='after';};
 const body={display_name:'Never claim completed'};assert.equal((await f.call('PUT',body)).status,503);assert.equal(changes(f).length,0);
 delete f.failure.journalHook;delete f.failure.journal;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);assert.equal((await f.call('PUT',body)).error.code,'PROFILE_OPERATION_UNCERTAIN');assert.equal(changes(f).length,0);
});

test('lost durable final receipt recovers exactly once after restart',async t=>{
 const f=fixture(t);f.failure.journalHook=async updates=>{if('revision' in updates)f.failure.journal='after';};
 const body={display_name:'Only one PATCH',intro:'Receipt persisted'};assert.equal((await f.call('PUT',body)).status,503);assert.equal(changes(f).length,1);
 delete f.failure.journalHook;delete f.failure.journal;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);const retry=await f.call('PUT',body);assert.equal(retry.status,200);assert.equal(changes(f).length,1);assert.equal(retry.data.profile_revision,1);
});

test('external R2 change makes CAS fail closed; no overwrite and no successful GET of partial profile',async t=>{
 const f=fixture(t),b=f.env.MMS_PRIVATE_UPLOADS,put=b.put;let once=true;
 b.put=async(k,v,o)=>{if(k===key(IDS[0])&&once){once=false;const m=snapshot(f);m.intro='External writer';f.objects.set(k,JSON.stringify(m));}return put(k,v,o);};
 const result=await f.call('PUT',{intro:'Must not overwrite'});assert.equal(result.status,503);assert.equal(result.error.code,'PROFILE_STORAGE_CONFLICT');assert.equal(snapshot(f).intro,'External writer');assert.equal((await f.call()).status,503);
});

test('operation identity is per owner, rejects changed body, and refuses obsolete receipt',async t=>{
 const f=fixture(t),id=randomUUID();assert.equal((await f.call('PUT',{intro:'A'},{headers:{'X-Profile-Operation-Id':id}})).status,200);
 assert.equal((await f.call('PUT',{intro:'Different'},{headers:{'X-Profile-Operation-Id':id}})).error.code,'PROFILE_OPERATION_ID_REUSED');
 assert.equal((await f.call('PUT',{intro:'B'},{actor:1,headers:{'X-Profile-Operation-Id':id}})).status,200);
 assert.equal((await f.call('PUT',{intro:'Newer'})).status,200);assert.equal((await f.call('PUT',{intro:'A'},{headers:{'X-Profile-Operation-Id':id}})).error.code,'PROFILE_OPERATION_SUPERSEDED');
});

test('unversioned or missing binding fails closed without R2/Airtable writes',async t=>{
 const f=fixture(t);assert.equal((await f.call('PUT',{intro:'No revision'},{strict:true})).status,428);assert.deepEqual(f.writes,[]);
 delete f.env.MMS_THERAPIST_PROFILES;assert.equal((await f.call('PUT',{intro:'No coordinator'},{strict:true})).error.code,'PROFILE_COORDINATOR_REQUIRED');assert.deepEqual(f.writes,[]);
});


test('old successful receipt is blocked during another uncertain operation',async t=>{
 const f=fixture(t),a={intro:'First committed'};assert.equal((await f.call('PUT',a)).status,200);
 f.failure.patch='after';assert.equal((await f.call('PUT',{display_name:'Uncertain later write'})).error.code,'PROFILE_OPERATION_UNCERTAIN');
 assert.equal((await f.call('PUT',a)).error.code,'PROFILE_OPERATION_PENDING');assert.equal((await f.call()).status,503);
});

test('trusted-origin preflight permits only the existing origins and new write protocol headers',async t=>{
 const f=fixture(t),request=new Request(ORIGIN+'/male-massage/therapists/api/auth/profile',{method:'OPTIONS',headers:{Origin:ORIGIN}});
 const response=await handleMmsTherapistProfileRequest(request,f.env);assert.equal(response.status,204);
 assert.match(response.headers.get('Access-Control-Allow-Headers'),/X-Profile-Operation-Id/);assert.match(response.headers.get('Access-Control-Allow-Headers'),/X-Profile-Revision/);
});

test('coordinator conflict response preserves allowed-origin headers and refuses untrusted origins',async t=>{
 const f=fixture(t),uri=ORIGIN+'/male-massage/therapists/api/auth/profile';
 for(const origin of [ORIGIN,'https://untrusted.invalid']){
  const req=new Request(uri,{method:'PUT',headers:{Origin:origin,Cookie:cookie(), 'Content-Type':'application/json','X-Profile-Operation-Id':randomUUID(),'X-Profile-Revision':'99'},body:'{}'});
  let response;try{response=await handleMmsTherapistProfileRequest(req,f.env);}catch(error){response=therapistProfileErrorResponse(error,req,f.env);}assert.equal(response.status,origin===ORIGIN?409:403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin===ORIGIN?ORIGIN:null);
 }
});

test('receipt retry grants only its current allowed origin and cannot bypass original write origin policy',async t=>{
 const f=fixture(t),second='https://fixture-allowed.invalid',id=crypto.randomUUID();f.env.ALLOWED_ORIGINS=ORIGIN+','+second;
 const uri=ORIGIN+'/male-massage/therapists/api/auth/profile',body=JSON.stringify({intro:'CORS receipt'});
 async function send(origin){const req=new Request(uri,{method:'PUT',headers:{Origin:origin,Cookie:cookie(),'Content-Type':'application/json','X-Profile-Operation-Id':id,'X-Profile-Revision':'0'},body});try{return await handleMmsTherapistProfileRequest(req,f.env);}catch(error){return therapistProfileErrorResponse(error,req,f.env);}}
 assert.equal((await send(ORIGIN)).status,200);const replay=await send(second);assert.equal(replay.status,200);assert.equal(replay.headers.get('Access-Control-Allow-Origin'),second);
 const rejected=await send('https://untrusted.invalid');assert.equal(rejected.status,403);assert.equal(rejected.headers.get('Access-Control-Allow-Origin'),null);
});


test('transient read failure before intent permits the exact retry after recovery, preserving identity',async t=>{
 const f=fixture(t),body={intro:'Recovered preflight'},id=crypto.randomUUID(),headers={'X-Profile-Operation-Id':id,'X-Profile-Revision':'0'};
 f.failure.get=true;assert.equal((await f.call('PUT',body,{headers})).status,503);assert.deepEqual(f.writes,[]);
 delete f.failure.get;assert.equal((await f.call()).status,200);f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 assert.equal((await f.call('PUT',{intro:'Changed body'},{headers})).error.code,'PROFILE_OPERATION_ID_REUSED');
 const retry=await f.call('PUT',body,{headers});assert.equal(retry.status,200);assert.equal((await f.call()).data.intro,'Recovered preflight');assert.equal(retry.data.profile_revision,1);
});

test('pre-intent failure receipt cannot rebase itself over another committed revision',async t=>{
 const f=fixture(t),body={intro:'Old request'},headers={'X-Profile-Operation-Id':crypto.randomUUID(),'X-Profile-Revision':'0'};
 f.failure.get=true;assert.equal((await f.call('PUT',body,{headers})).status,503);delete f.failure.get;
 assert.equal((await f.call('PUT',{intro:'New committed request'})).status,200);
 assert.equal((await f.call('PUT',body,{headers})).error.code,'PROFILE_OPERATION_SUPERSEDED');assert.equal((await f.call()).data.intro,'New committed request');
});


for(const [status,format] of [[408,'html'],[409,'json'],[429,'html'],[500,'json'],[422,'html'],[422,'json']])test('ambiguous HTTP '+status+' '+format+' after PATCH keeps the owner quarantined',async t=>{
 const f=fixture(t),delegate=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const response=await delegate(input,init);
  if(init.method!=='PATCH')return response;
  return format==='html'?new Response('<html>Synthetic intermediary failure</html>',{status,headers:{'Content-Type':'text/html'}}):Response.json({error:{type:'UNRECOGNIZED_OUTCOME'}},{status});
 };
 const body={display_name:'Synthetic changed before ambiguous response'};
 const first=await f.call('PUT',body);assert.equal(first.status,503);assert.equal(first.error.code,'PROFILE_OPERATION_UNCERTAIN');assert.equal(changes(f).length,1);
 globalThis.fetch=delegate;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);assert.equal((await f.call('PUT',body)).error.code,'PROFILE_OPERATION_UNCERTAIN');
 assert.equal((await f.call('PUT',{intro:'Must not overtake'})).error.code,'PROFILE_OPERATION_PENDING');assert.equal((await f.call()).status,503);assert.equal(changes(f).length,1);
});


test('persisted rejected marker after crash remains terminal and never writes manifest',async t=>{
 const f=fixture(t),body={display_name:'Rejected name',intro:'Must not save'};
 const before=f.objects.get(key(IDS[0]));f.failure.patch='before';
 f.failure.journalHook=async updates=>{
  if(updates.pending?.phase==='rejected')f.failure.journal='after';
  if(updates.pending===null)f.failure.journal='before';
 };
 assert.equal((await f.call('PUT',body)).status,503);
 assert.equal(f.env.MMS_THERAPIST_PROFILES.owners.get(IDS[0]).values.get('pending').phase,'rejected');
 delete f.failure.journalHook;delete f.failure.journal;delete f.failure.patch;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 const retry=await f.call('PUT',body);assert.equal(retry.status,503);assert.deepEqual(retry.save_state,{airtable:'rejected',profile:'not_attempted'});
 assert.equal(f.objects.get(key(IDS[0])),before);assert.deepEqual(f.writes,[]);assert.equal(f.records[0].fields['Display Name'],'Fixture 0');
 assert.equal((await f.call()).status,200);
 assert.equal((await f.call('PUT',body,{headers:{'X-Profile-Operation-Id':crypto.randomUUID()}})).status,200);
});

test('lost rejected-marker acknowledgement with successful cleanup retains a usable rejection receipt',async t=>{
 const f=fixture(t),body={display_name:'Definite rejection'};f.failure.patch='before';
 f.failure.journalHook=async updates=>{f.failure.journal=updates.pending?.phase==='rejected'?'after':undefined;};
 const response=await f.call('PUT',body);assert.equal(response.status,503);assert.equal(response.save_state.airtable,'rejected');assert.deepEqual(f.writes,[]);
 delete f.failure.journalHook;delete f.failure.journal;delete f.failure.patch;assert.equal((await f.call('PUT',body)).save_state.airtable,'rejected');
 assert.equal((await f.call('PUT',body,{headers:{'X-Profile-Operation-Id':crypto.randomUUID()}})).status,200);
});


for(const action of ['selection','delete'])for(const winner of ['edit','photo'])test('current-main regression: '+winner+' wins edit vs '+action+' without stale overwrite',async t=>{
 const f=fixture(t),barrier=holdFirst(f);
 const edit=()=>f.call('PUT',{intro:'Main regression edit'},{headers:rev(0)});
 const photo=()=>action==='selection'?f.call('PUT',{photo_ids:[]},{suffix:'/photos/public',headers:rev(0)}):f.call('DELETE',undefined,{suffix:'/photos/'+PHOTO,headers:rev(0)});
 const first=winner==='edit'?edit():photo();await barrier.entered;const second=winner==='edit'?photo():edit();barrier.release();
 const [a,b]=await Promise.all([first,second]);assert.equal(a.status,winner==='photo'&&action==='delete'?204:200);assert.equal(b.status,409);
 const stored=snapshot(f);assert.deepEqual(stored.public_photo_ids,winner==='photo'?[]:[PHOTO]);assert.equal(stored.photos.length,winner==='photo'&&action==='delete'?0:1);
 assert.equal((await f.call('PUT',{intro:'Fresh retry after conflict'})).status,200);assert.deepEqual(snapshot(f).photos,stored.photos);assert.deepEqual(snapshot(f).public_photo_ids,stored.public_photo_ids);
});
for(const winner of ['edit','selection','delete'])test('current-main regression: triple mutations '+winner+' is the only winner',async t=>{
 const f=fixture(t),barrier=holdFirst(f),actions={edit:()=>f.call('PUT',{intro:'Triple edit'},{headers:rev(0)}),selection:()=>f.call('PUT',{photo_ids:[]},{suffix:'/photos/public',headers:rev(0)}),delete:()=>f.call('DELETE',undefined,{suffix:'/photos/'+PHOTO,headers:rev(0)})};
 const first=actions[winner]();await barrier.entered;const rest=Object.entries(actions).filter(([key])=>key!==winner).map(([,call])=>call());barrier.release();const responses=await Promise.all([first,...rest]);assert.equal(responses.filter(x=>x.status===409).length,2);assert.equal(responses.filter(x=>[200,204].includes(x.status)).length,1);
});
test('current-main regression: unavailable R2 ETag fails before effects',async t=>{
 const f=fixture(t),get=f.env.MMS_PRIVATE_UPLOADS.get;f.env.MMS_PRIVATE_UPLOADS.get=async k=>{const object=await get(k);if(object)delete object.etag;return object;};assert.equal((await f.call('PUT',{intro:'Do not write'})).status,503);assert.deepEqual(f.writes,[]);
});

for (const phase of ['unrecognized', 'prepared', 'airtable_saved', 'manifest_saved', 'rejected']) test('journal phase '+phase+' without its durable plan stays quarantined after restart', async t => {
 const f=fixture(t),body={display_name:'Must not dispatch from corrupt journal',intro:'Must not commit'};
 f.failure.journalHook=async updates=>{if(updates.pending?.phase==='validating')f.failure.journal='after';};
 assert.equal((await f.call('PUT',body)).status,503);
 delete f.failure.journalHook;delete f.failure.journal;
 const values=f.env.MMS_THERAPIST_PROFILES.owners.get(IDS[0]).values;
 const pending=values.get('pending');pending.phase=phase;
 const before=structuredClone([...values]);f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 const retry=await f.call('PUT',body);
 assert.equal(retry.status,503);assert.equal(retry.error.code,'PROFILE_JOURNAL_INVALID');
 assert.equal((await f.call()).status,503);await assert.rejects(()=>profileDirectorySnapshot(IDS[0],f.env));
 assert.deepEqual(f.writes,[]);assert.deepEqual([...values],before);
 assert.equal((await f.call('PUT',{intro:'Other owner still available'},{actor:1})).status,200);
});

test('pending revision mismatch cannot resume effects or advance the head revision',async t=>{
 const f=fixture(t),body={intro:'Pending intent'};f.failure.put='before';assert.equal((await f.call('PUT',body)).status,503);delete f.failure.put;
 const values=f.env.MMS_THERAPIST_PROFILES.owners.get(IDS[0]).values;values.set('revision',1);
 const before=structuredClone([...values]);f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 const retry=await f.call('PUT',body);assert.equal(retry.status,503);assert.equal(retry.error.code,'PROFILE_JOURNAL_INVALID');assert.deepEqual(f.writes,[]);assert.deepEqual([...values],before);
});

for(const revision of [-1,1.5,'1',null,NaN,Number.MAX_SAFE_INTEGER])test('invalid durable revision '+String(revision)+' fails closed for reads and writes',async t=>{
 const f=fixture(t);assert.equal((await f.call()).status,200);const values=f.env.MMS_THERAPIST_PROFILES.owners.get(IDS[0]).values;values.set('revision',revision);
 const before=structuredClone([...values]);f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 assert.equal((await f.call()).error.code,'PROFILE_JOURNAL_INVALID');
 assert.equal((await f.call('PUT',{intro:'Do not reset corrupt head'},{headers:rev(0)})).error.code,'PROFILE_JOURNAL_INVALID');assert.deepEqual(f.writes,[]);assert.deepEqual([...values],before);
});

test('a validating intent interrupted before its plan can still resume the exact request',async t=>{
 const f=fixture(t),body={intro:'Safe pre-plan recovery'};
 f.failure.journalHook=async updates=>{if(updates.pending?.phase==='validating')f.failure.journal='after';};
 assert.equal((await f.call('PUT',body)).status,503);delete f.failure.journalHook;delete f.failure.journal;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 assert.equal((await f.call('PUT',body)).status,200);assert.equal((await f.call()).data.intro,body.intro);
});

test('lost owner marker with an existing intent never reinitializes the coordinator',async t=>{
 const f=fixture(t),body={intro:'Do not rebind journal'};f.failure.put='before';assert.equal((await f.call('PUT',body)).status,503);delete f.failure.put;
 const values=f.env.MMS_THERAPIST_PROFILES.owners.get(IDS[0]).values;values.delete('owner');const before=structuredClone([...values]);f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 assert.equal((await f.call('PUT',body)).error.code,'PROFILE_JOURNAL_INVALID');assert.deepEqual(f.writes,[]);assert.deepEqual([...values],before);
});

test('revision exhaustion preserves readable data but never writes an unrepresentable revision',async t=>{
 const f=fixture(t);await f.call();const values=f.env.MMS_THERAPIST_PROFILES.owners.get(IDS[0]).values;values.set('revision',999_999_999_999_999);
 assert.equal((await f.call()).status,200);assert.equal((await f.call('PUT',{intro:'Do not overflow'})).error.code,'PROFILE_REVISION_EXHAUSTED');assert.deepEqual(f.writes,[]);
});

test('receipt at the final supported revision remains replayable without another write',async t=>{
 const f=fixture(t);await f.call();const values=f.env.MMS_THERAPIST_PROFILES.owners.get(IDS[0]).values;values.set('revision',999_999_999_999_998);
 const body={intro:'Final supported operation'},headers={'X-Profile-Operation-Id':randomUUID(),'X-Profile-Revision':'999999999999998'};
 assert.equal((await f.call('PUT',body,{headers})).status,200);const before=f.writes.length;f.env.MMS_THERAPIST_PROFILES.evict(IDS[0]);
 assert.equal((await f.call('PUT',body,{headers})).status,200);assert.equal(f.writes.length,before);
});

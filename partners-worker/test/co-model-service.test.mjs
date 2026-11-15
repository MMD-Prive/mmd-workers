import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,apiModule,SESSION} from './helpers/partner-fixture.mjs';
import {handlePartnerCoModelRead} from '../../admin-worker/src/co-model-partner-read.js';
import {fetchPartnerCoModel} from '../../shared/co-model-service.mjs';
import {travelBinding} from '../../shared/model-travel-store.mjs';
const S=apiModule.SESSION_FIELDS;
async function setup(t){
 const f=await fixture();t.after(f.restore);let writes=0,scopeCalls=0,storageReads=0;
 const fail=()=>{writes++;throw Error('write forbidden');};
 const record={id:SESSION,fields:{session_id:'session_fixture','Canonical Model':['recMMMMMMMMMMMMMM'],member_id:['recFixture']}};
 const binding=await travelBinding(record),id='a'.repeat(64);
 const ledger={version:1,revision:1,entries:{[id]:{id,binding,state:'saved',sender_role:'model',sender_id:'recMMMMMMMMMMMMMM',saved_at:'2026-11-15T00:00:00Z',text:'PRIVATE',photos:[]}}};
 const admin={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_HTTP:{fetch:async r=>{assert.equal(r.method,'GET');return Response.json({records:[record]});}},PRIVATE_MODEL_MEDIA:{get:async key=>{storageReads++;return key.endsWith('ledger.json')?{size:JSON.stringify(ledger).length,text:async()=>JSON.stringify(ledger)}:null;},put:fail,delete:fail},PARTNERS_WORKER:{fetch:async r=>{scopeCalls++;return apiModule.default.fetch(r,f.env,{waitUntil(){}});}}};
 f.env.ADMIN_CO_MODEL={fetch:r=>handlePartnerCoModelRead(r,admin)};
 const req=(method='GET',session='session_fixture',token=f.token,host='admin-worker.internal')=>new Request('https://'+host+'/__internal/partner/co-model?session_record_id='+SESSION+'&session_id='+session,{method,headers:{'x-mmd-partner-token':token,'x-mmd-owner-role':'owner'}});
 return {...f,admin,req,stats:()=>({writes,scopeCalls,storageReads})};
}
test('Partner → Admin → Partner authority returns only scoped metadata without writes',async t=>{const f=await setup(t);const r=await handlePartnerCoModelRead(f.req(),f.admin);const p=await r.json();assert.equal(r.status,200);assert.equal(p.evidence.submissions,1);assert.doesNotMatch(JSON.stringify(p),/PRIVATE|recFixture|sender_id/);assert.equal(f.stats().writes,0);assert.equal(f.stats().scopeCalls,2);assert.equal(f.writes.length,0);assert.equal(f.messages.length,0);});
test('cross-job and foreign Partner denied before R2',async t=>{const f=await setup(t);assert.equal((await handlePartnerCoModelRead(f.req('GET','other'),f.admin)).status,403);f.db.Sessions[0].fields[S.partnerIdSnapshot]='other';assert.equal((await handlePartnerCoModelRead(f.req(),f.admin)).status,403);assert.equal(f.stats().storageReads,0);});
test('forged role, invalid token and public hostname never grant access',async t=>{const f=await setup(t);assert.equal((await handlePartnerCoModelRead(f.req('GET','session_fixture','invalid'),f.admin)).status,403);assert.equal((await handlePartnerCoModelRead(f.req('GET','session_fixture',f.token,'www.mmdbkk.com'),f.admin)).status,403);assert.equal(f.stats().storageReads,0);});
test('all mutation verbs rejected before authority and storage',async t=>{const f=await setup(t);for(const m of ['POST','PATCH','PUT','DELETE'])assert.equal((await handlePartnerCoModelRead(f.req(m),f.admin)).status,405);assert.deepEqual(f.stats(),{writes:0,scopeCalls:0,storageReads:0});});
test('scope revoked during storage read suppresses evidence',async t=>{const f=await setup(t),get=f.admin.PRIVATE_MODEL_MEDIA.get;f.admin.PRIVATE_MODEL_MEDIA.get=async key=>{f.db.Sessions[0].fields[S.partnerIdSnapshot]='changed';return get(key);};assert.equal((await handlePartnerCoModelRead(f.req(),f.admin)).status,403);});
test('Partner detail uses Admin service with no media bucket',async t=>{const f=await setup(t);assert.equal(f.env.PRIVATE_MODEL_MEDIA,undefined);const r=await f.call('/v1/partner/jobs/detail?session_record_id='+SESSION);const p=await r.json();assert.equal(r.status,200);assert.match(p.detail.co_model_html,/1 ครั้ง/);assert.doesNotMatch(p.detail.co_model_html,/PRIVATE/);assert.equal(f.stats().writes,0);});
test('missing binding and redirects fail closed without network fallback',async t=>{assert.equal((await fetchPartnerCoModel({},{})).status,'unavailable');const e=await fetchPartnerCoModel({ADMIN_CO_MODEL:{fetch:async r=>{assert.equal(r.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://example.com'}});}}},{token:'fixture',recordId:SESSION,sessionId:'session_fixture'});assert.equal(e.status,'unavailable');});

test('Admin RPC dispatch precedes background backfill',async()=>{
 const source=await readFile(new URL('../../admin-worker/src/admin-login-hero-worker.js',import.meta.url),'utf8');
 const start=source.indexOf('async fetch(request, env, ctx)');
 const body=source.slice(start);assert.ok(body.indexOf('return handlePartnerCoModelRead(request, runtimeEnv)')<body.indexOf('scheduleLineOfcContactBackfill(runtimeEnv, ctx)'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {coModelView,renderCoModel} from './co-model-readonly.mjs';
import {handleOwnerJobEdit,S} from '../admin-worker/src/owner-job-edit.js';
import {createCredentialBoundAdminSession} from '../admin-worker/src/credential-bound-admin-session.js';
const context={sessionId:'sess_fixture',modelName:'Synthetic Model',lifecycle:'confirmed'};
test('Partner cannot read another job or anonymous scope',()=>{
 for(const role of ['partner','admin',''])assert.throws(()=>coModelView({...context,role,partnerId:'p1',actorPartnerId:'p2'}),{status:403});
});
test('authorized Partner gets unknown communications and no confidential payload',()=>{
 const v=coModelView({...context,role:'partner',partnerId:'p1',actorPartnerId:'p1',secret:'HIDDEN'});
 assert.equal(v.channels.length,2);assert.ok(v.channels.every(c=>c.calls===null&&c.images===null&&c.messages===null));assert.equal(v.history_complete,false);assert.equal(v.read_only,true);assert.doesNotMatch(JSON.stringify(v),/HIDDEN/);
});
test('render escapes names and keeps missing evidence explicit',()=>{
 const html=renderCoModel(coModelView({...context,role:'owner',modelName:'<script>bad</script>'}));
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/ไม่ได้หมายความว่าไม่มีการติดต่อ/);assert.doesNotMatch(html,/<button|<form/);
});
async function call(role='owner',method='GET',rows,storageStatus=200){
 let reads=0;const env={ADMIN_LOGIN_CREDENTIAL:'synthetic-credential',ADMIN_SESSION_SECRET:'synthetic-session-secret',AIRTABLE_API_KEY:'synthetic-key',AIRTABLE_BASE_ID:'synthetic-base',AIRTABLE_HTTP:{async fetch(req){reads++;assert.equal(req.method,'GET');assert.match(req.url,/tblC98mKWbzmPuNzX/);return Response.json({records:rows??[{id:'recFixture',fields:{[S.id]:'sess_fixture',[S.name]:'Synthetic Model',[S.state]:'confirmed'}}]},{status:storageStatus});}}};
 const url='https://www.mmdbkk.com/v1/admin/jobs/edit?view=co-model&session_id=sess_fixture';
 const token=await createCredentialBoundAdminSession(new Request(url),{id:'fixture-owner',role},env);
 const result=await handleOwnerJobEdit(new Request(url,{method,headers:{cookie:'mmd_admin_gate_v1='+token}}),env);
 return {result,reads};
}
test('Owner reads existing session without payment dependencies',async()=>{const {result,reads}=await call();assert.equal(result.status,200);assert.equal((await result.json()).co_model.session_id,'sess_fixture');assert.equal(reads,1);});
test('admin and Partner cannot use Owner projection',async()=>{for(const role of ['admin','partner']){const {result,reads}=await call(role);assert.equal(result.status,403);assert.equal(reads,0);}});
test('read-only mode rejects writes before storage',async()=>{const {result,reads}=await call('owner','POST');assert.equal(result.status,405);assert.equal(reads,0);});
test('missing, duplicate, mismatched and failed reads fail closed',async()=>{for(const rows of [[],[{},{}],[{fields:{[S.id]:'sess_other'}}]])assert.equal((await call('owner','GET',rows)).result.status,503);assert.equal((await call('owner','GET',undefined,503)).result.status,503);});

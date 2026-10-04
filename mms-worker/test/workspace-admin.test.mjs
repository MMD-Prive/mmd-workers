import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleWorkspaceAdmin, therapistWorkspaceReadiness } from '../src/workspace-admin-runtime.mjs';

const tid='mmst_48508463eced1e2de3227bb6', jid='mmsjob_87b38040dc13fab9e2e84bcd';
const active={id:'recQZvEey9aeMaUkA',fields:{'Therapist ID':tid,'Display Name':'Tamp',Status:'Active','Therapist Auth Status':'Active','LINE Subject Hash':'private-hash','MY MMS Access':'Approved','Availability Status':'Available'}};
function fixture(t=structuredClone(active)) {
 const tables={tblTC9ZHQa4hAUwLu:[t],tbl0p7UdOH9BjzmFX:[],tblrSS5OegYNnGiEU:[]}, calls=[];
 let state=null,offers=[];
 const env={AIRTABLE_BASE_ID:'appsV1ILPRfIjkaYg',AIRTABLE_API_TOKEN:'test',AIRTABLE_THERAPISTS_TABLE_ID:'tblTC9ZHQa4hAUwLu',AIRTABLE_JOBS_TABLE_ID:'tbl0p7UdOH9BjzmFX',AIRTABLE_OFFERS_TABLE_ID:'tblrSS5OegYNnGiEU',MMS_DISPATCH_COORDINATOR:{idFromName:x=>x,get:()=>({initialize:async(id,rows)=>{state ||= {job_id:id,state:'OFFERED'};offers=rows;calls.push('initialize');return {job:state,offers}},snapshot:async()=>({job:state,offers})})}};
 const fetcher=async(url,init)=>{const u=new URL(url),parts=u.pathname.split('/'),table=parts[3],id=parts[4];calls.push(init.method||'GET');if(init.method==='POST'){const r={id:'rec'+String(tables[table].length+1).padStart(14,'0'),fields:JSON.parse(init.body).fields};tables[table].push(r);return Response.json(r)}if(init.method==='PATCH'){const r=tables[table].find(x=>x.id===id);Object.assign(r.fields,JSON.parse(init.body).fields);return Response.json(r)}const formula=u.searchParams.get('filterByFormula'),m=formula?.match(/^\{(.+)\}='(.+)'$/);return Response.json({records:m?tables[table].filter(r=>r.fields[m[1]]===m[2]):tables[table]})};
 return {env,tables,calls,fetcher,setState:s=>state.state=s};
}
const request=(body,host='mms.internal')=>new Request('https://'+host+'/internal/mms/admin/test-jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
async function withFixture(f,run){const saved=globalThis.fetch;globalThis.fetch=f.fetcher;try{return await run()}finally{globalThis.fetch=saved}}

test('approved entitlement alone cannot make an unlinked Review therapist ready',()=>{
 const r=therapistWorkspaceReadiness({fields:{...active.fields,Status:'Review','Therapist Auth Status':'Unlinked','LINE Subject Hash':''}});
 assert.equal(r.can_test,false);assert.equal(r.can_open,false);assert.deepEqual(r.blockers,['THERAPIST_NOT_ACTIVE','LINE_NOT_LINKED']);assert.ok(!JSON.stringify(r).includes('private-hash'));
});
test('external host and an unready therapist cannot create test jobs',async()=>{
 const f=fixture({...active,fields:{...active.fields,'LINE Subject Hash':''}});
 await withFixture(f,async()=>{assert.equal((await maybeHandleWorkspaceAdmin(request({therapist_id:tid,request_key:'owner-test-1'},'www.mmdbkk.com'),f.env)).status,404);assert.equal((await maybeHandleWorkspaceAdmin(request({therapist_id:tid,request_key:'owner-test-1'}),f.env)).status,409);});
 assert.ok(!f.calls.includes('POST'));assert.ok(!f.calls.includes('initialize'));
});
test('workspace reads the MMS tables and never returns private identity or customer fields',async()=>{
 const f=fixture();f.tables.tbl0p7UdOH9BjzmFX.push({id:'rec00000000000001',fields:{'Job ID':jid,Service:'[TEST ONLY] test','Internal Payload JSON':JSON.stringify({is_test:true,target_therapist_id:tid,customer_contact:'private-phone'}),'Customer Contact Private':'private-phone'}});
 await withFixture(f,async()=>{const r=await maybeHandleWorkspaceAdmin(new Request('https://mms.internal/internal/mms/admin/workspace'),f.env),d=await r.json();assert.equal(d.complete,true);assert.equal(d.jobs[0].is_test,true);assert.equal(d.therapists[0].can_test,true);assert.ok(!JSON.stringify(d).includes('private-hash'));assert.ok(!JSON.stringify(d).includes('private-phone'));assert.match(r.headers.get('cache-control'),/no-store/)});
});
test('test offer initializes the real coordinator and a retry preserves one job and offer',async()=>{
 const f=fixture();await withFixture(f,async()=>{const req={therapist_id:tid,request_key:'owner-test-1'};const r=await maybeHandleWorkspaceAdmin(request(req),f.env);assert.equal(r.status,200);const d=await r.json();assert.equal(d.data.state,'OFFERED');assert.equal((await maybeHandleWorkspaceAdmin(request(req),f.env)).status,200);f.setState('COMPLETED');const done=await (await maybeHandleWorkspaceAdmin(request(req),f.env)).json();assert.equal(done.data.state,'COMPLETED');assert.equal(done.data.duplicate,true)});
 assert.equal(f.tables.tbl0p7UdOH9BjzmFX.length,1);assert.equal(f.tables.tblrSS5OegYNnGiEU.length,1);const fields=f.tables.tbl0p7UdOH9BjzmFX[0].fields,p=JSON.parse(fields['Internal Payload JSON']);assert.equal(fields['Therapist Payout THB'],0);assert.equal(p.is_test,true);assert.equal(p.payment_verified,false);assert.equal(p.coordinator_initialized,true);assert.ok(f.calls.includes('initialize'));assert.ok(!fields['Customer Contact Private']);
});
test('prepared Tamp test is reused, but real jobs cannot become test jobs',async()=>{
 const f=fixture();f.tables.tbl0p7UdOH9BjzmFX.push({id:'rec59Dg8EMXdMSKyt',fields:{'Job ID':jid,'Job Status':'Matching','Internal Payload JSON':JSON.stringify({is_test:true,target_therapist_id:tid})}});
 await withFixture(f,async()=>{assert.equal((await maybeHandleWorkspaceAdmin(request({therapist_id:tid,request_key:'owner-test-2',prepared_job_id:jid}),f.env)).status,200);assert.equal(f.tables.tbl0p7UdOH9BjzmFX.length,1);f.tables.tbl0p7UdOH9BjzmFX[0].fields['Internal Payload JSON']='{}';assert.equal((await maybeHandleWorkspaceAdmin(request({therapist_id:tid,request_key:'owner-test-2',prepared_job_id:jid}),f.env)).status,409)});
});
test('test route rejects money and identity overrides',async()=>{const f=fixture();await withFixture(f,async()=>{assert.equal((await maybeHandleWorkspaceAdmin(request({therapist_id:tid,request_key:'owner-test-3',payout:500}),f.env)).status,400)});assert.equal(f.calls.length,0)});
test('coordinator failure never claims offered success, and retry recovers the same stored rows',async()=>{
 const f=fixture(),get=f.env.MMS_DISPATCH_COORDINATOR.get;
 f.env.MMS_DISPATCH_COORDINATOR.get=()=>({...get(),initialize:async()=>{throw Error('unavailable')}});
 await withFixture(f,async()=>{const body={therapist_id:tid,request_key:'owner-test-failure'};assert.equal((await maybeHandleWorkspaceAdmin(request(body),f.env)).status,503);assert.equal(f.tables.tbl0p7UdOH9BjzmFX[0].fields['Job Status'],'Matching');f.env.MMS_DISPATCH_COORDINATOR.get=get;assert.equal((await maybeHandleWorkspaceAdmin(request(body),f.env)).status,200)});
 assert.equal(f.tables.tbl0p7UdOH9BjzmFX.length,1);assert.equal(f.tables.tblrSS5OegYNnGiEU.length,1);
});
test('expired test offers are not extended by retries',async()=>{
 const f=fixture();await withFixture(f,async()=>{const body={therapist_id:tid,request_key:'owner-test-expired'};assert.equal((await maybeHandleWorkspaceAdmin(request(body),f.env)).status,200);f.tables.tblrSS5OegYNnGiEU[0].fields['Expires At']='2020-01-01T00:00:00Z';const result=await maybeHandleWorkspaceAdmin(request(body),f.env);assert.equal(result.status,409);assert.equal((await result.json()).error.code,'TEST_OFFER_EXPIRED');assert.equal(f.tables.tblrSS5OegYNnGiEU[0].fields['Expires At'],'2020-01-01T00:00:00Z')});
});

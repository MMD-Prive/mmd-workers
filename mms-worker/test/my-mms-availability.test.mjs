import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { maybeHandleMyMmsAccess } from '../src/my-mms-access-runtime.mjs';

const origin = 'https://www.mmdbkk.com';
const env = { MMS_THERAPIST_SESSION_SECRET: 'test-session-secret-only-1234567890123456', AIRTABLE_API_TOKEN: 'test', AIRTABLE_BASE_ID: 'appsV1ILPRfIjkaYg', AIRTABLE_THERAPISTS_TABLE_ID: 'tblTC9ZHQa4hAUwLu', ALLOWED_ORIGINS: origin };
function cookie() {
  const now = Math.floor(Date.now()/1000);
  const encoded = Buffer.from(JSON.stringify({v:1,role:'mms_therapist',therapist_id:'mmst_test0001',iat:now,exp:now+3600})).toString('base64url');
  return '__Secure-mms_therapist_session=v1.'+encoded+'.'+createHmac('sha256',env.MMS_THERAPIST_SESSION_SECRET).update('mms-therapist-session-v1.'+encoded).digest('hex');
}
function record(extra={}) {return {id:'recTest12345',fields:{'Therapist ID':'mmst_test0001','Display Name':'Boss',Status:'Active','Therapist Auth Status':'Active','LINE Subject Hash':'private-test-hash','MY MMS Access':'Approved','Availability Status':'Unavailable','Matching Enabled':true,'Verified Skills':['Sport Massage'],...extra}};}
function req(body, headers={}) {return new Request(origin+'/male-massage/therapists/api/app/availability',{method:'PUT',headers:{Origin:origin,Cookie:cookie(),'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
async function withRecords(extra, fn) {
  const saved=globalThis.fetch;const patches=[];
  globalThis.fetch=async (url,init={})=>{
    assert.ok(String(url).startsWith('https://api.airtable.com/'));
    if(init.method==='PATCH'){const body=JSON.parse(init.body);patches.push(body);return Response.json(record({...extra,...body.fields}));}
    return Response.json({records:[record(extra)]});
  };
  try {await fn(patches);} finally {globalThis.fetch=saved;}
}
test('Therapist changes only their own availability and keeps permission fields untouched',async()=>withRecords({},async patches=>{
  const res=await maybeHandleMyMmsAccess(req({availability_status:'Available'}),env);
  assert.equal(res.status,200);const data=(await res.json()).data;
  assert.equal(data.availability_status,'Available');assert.equal(data.can_open,true);assert.equal(data.matching_enabled,true);
  assert.deepEqual(patches,[{fields:{'Availability Status':'Available'},typecast:false}]);
  assert.equal(JSON.stringify(data).includes('private-test-hash'),false);
}));
test('forged owner fields, unexpected values and missing origin never write',async()=>withRecords({},async patches=>{
  for(const request of [req({availability_status:'Available',therapist_id:'mmst_other0001'}),req({availability_status:'Active'}),req({availability_status:'Available'},{Origin:''})]){
    const res=await maybeHandleMyMmsAccess(request,env);assert.ok([400,403].includes(res.status));
  }
  assert.equal(patches.length,0);
}));
test('locked entitlement cannot self-enable availability or access',async()=>withRecords({'MY MMS Access':'Locked'},async patches=>{
  const res=await maybeHandleMyMmsAccess(req({availability_status:'Available'}),env);assert.equal(res.status,403);assert.equal(patches.length,0);
}));
test('unlinked or review Therapist cannot use work API',async()=>{
  for(const extra of [{'Therapist Auth Status':'Unlinked'},{Status:'Review'}])await withRecords(extra,async patches=>{
    assert.equal((await maybeHandleMyMmsAccess(req({availability_status:'Available'}),env)).status,403);assert.equal(patches.length,0);
  });
});
test('missing session and invalid cookie cannot mutate availability',async()=>withRecords({},async patches=>{
  for(const value of ['', '__Secure-mms_therapist_session=forged'])assert.equal((await maybeHandleMyMmsAccess(req({availability_status:'Available'},{Cookie:value}),env)).status,401);
  assert.equal(patches.length,0);
}));
test('availability preflight advertises PUT for trusted origin',async()=>{
  const res=await maybeHandleMyMmsAccess(new Request(origin+'/male-massage/therapists/api/app/availability',{method:'OPTIONS',headers:{Origin:origin}}),env);
  assert.equal(res.status,204);assert.match(res.headers.get('access-control-allow-methods'),/PUT/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';
import { handleUnifiedPaymentIntent } from './unified-payment-proof.js';
const session='liffrenew_standard_'+'a'.repeat(24);
const input={session_id:session,payment_stage:'membership',package_code:'standard',amount:1000,payment_ref:'FIXTURE-REF'};
const request=body=>new Request('https://payments.local/v1/pay/verify',{method:'POST',body:JSON.stringify(body)});
test('concurrent Renewal purchases upsert one pending canonical payment and reject conflicting retries',async()=>{
  const rows=[]; const calls=[]; const original=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{
    assert.equal(new URL(url).hostname,'api.airtable.com');
    if(init.method==='GET') {
      const formula=new URL(url).searchParams.get('filterByFormula');
      return Response.json({records:formula.startsWith('{payment_ref}')?rows:[]});
    }
    const body=JSON.parse(init.body);calls.push({method:init.method,body});
    assert.equal(init.method,'PATCH');assert.deepEqual(body.performUpsert.fieldsToMergeOn,['Payment Reference']);
    const fields=body.records[0].fields;
    let row=rows.find(r=>r.fields['Payment Reference']===fields['Payment Reference']);
    if(!row){row={id:'recFixturePayment',fields};rows.push(row);}else Object.assign(row.fields,fields);
    return Response.json({records:[row]});
  };
  const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture'};
  try {
    const responses=await Promise.all(Array.from({length:6},()=>worker.fetch(request(input),env)));
    assert.ok(responses.every(r=>r.status===200));assert.equal(rows.length,1);
    assert.equal(rows[0].fields['Payment Status'],undefined);assert.equal(rows[0].fields['Verification Status'],undefined);
    assert.ok(calls.every(call=>!Object.hasOwn(call.body.records[0].fields,'Payment Date')));
    assert.ok(calls.length>0);const writes=calls.length;
    assert.equal((await worker.fetch(request({...input,amount:1}),env)).status,400);
    assert.equal(calls.length,writes);
    assert.equal((await worker.fetch(request(input),env)).status,200);assert.equal(rows.length,1);
    Object.assign(rows[0].fields,{'Payment Status':'Paid','Verification Status':'verified','Payment Date':'2026-10-26'});
    const before=structuredClone(rows[0]);
    assert.equal((await worker.fetch(request(input),env)).status,200);assert.deepEqual(rows[0],before);
  }finally{globalThis.fetch=original;}
});

test('LIFF Renewal signed handoff uses the checkout surface even with legacy Private routing',async()=>{
  const env={CONFIRM_KEY:'fixture-signing-key',PAY_SESSIONS_KV:{async put(){}}};
  const response=await handleUnifiedPaymentIntent(request(input),env,async()=>Response.json({ok:true,session_id:session,payment_ref:'FIXTURE-REF'}));
  const payload=await response.json();assert.equal(payload.ok,true);
  const url=new URL(payload.customer_payment_url);assert.equal(url.pathname,'/pay/checkout');
  assert.deepEqual([...url.searchParams.keys()],['t']);assert.equal(payload.payment_surface,'public');
});

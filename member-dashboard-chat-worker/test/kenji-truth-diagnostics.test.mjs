import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveKenjiLineLiveTruth} from '../src/kenji-line-live-truth.mjs';
test('failure diagnostics retain fixed codes only and preserve fail-closed results',async()=>{
  const id='U'+'a'.repeat(32), secret='PRIVATE_FIXTURE_DO_NOT_LOG';
  const event={source:{type:'user',userId:id}};
  const logs=[],original=console.log;
  console.log=x=>logs.push(JSON.parse(x));
  try {
    const cases=[
      [{},'binding_missing','unavailable'],
      [{MEMBER_PAGES_WORKER:{fetch:async()=>{throw Error(secret)}}},'transport_error','unavailable'],
      [{MEMBER_PAGES_WORKER:{fetch:async()=>Response.json({private:secret})}},'contract_invalid','unavailable'],
      [{MEMBER_PAGES_WORKER:{fetch:async()=>new Response(secret,{status:503})}},'upstream_http_error','upstream_error'],
      [{MEMBER_PAGES_WORKER:{fetch:async()=>Response.json({ok:false,authority:'my_mmd_entitlement_resolver_v1',failure_class:'identity_unresolved'})}},'identity_unresolved','identity_unresolved'],
    ];
    for(const [env,reason,status] of cases){
      const result=await resolveKenjiLineLiveTruth({env,event,intent:'points_status'});
      assert.equal(result.ok,false);assert.equal(result.status,status);
      assert.equal(logs.at(-1).reason,reason);
      assert.deepEqual(Object.keys(logs.at(-1)),['kenji_member_truth','intent','reason','http_status']);
    }
    assert.ok(!JSON.stringify(logs).includes(id));
    assert.ok(!JSON.stringify(logs).includes(secret));
  } finally {console.log=original;}
});

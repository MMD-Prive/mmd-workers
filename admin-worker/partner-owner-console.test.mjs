import test from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialBoundAdminSession} from './src/credential-bound-admin-session.js';
import {handlePartnerOwnerConsole} from './src/partner-owner-console.js';

const origin='https://www.mmdbkk.com';
async function fixture(role='owner'){
  const calls=[];const env={ADMIN_LOGIN_CREDENTIAL:'fixture-credential',ADMIN_SESSION_SECRET:'fixture-secret',PARTNERS_WORKER:{async fetch(r){calls.push(r);return Response.json({ok:true});}}};
  const token=await createCredentialBoundAdminSession(new Request(origin),{id:'owner-fixture',role},env);
  const request=(path,options={})=>new Request(origin+path,{...options,headers:{cookie:'mmd_admin_gate_v1='+token,...options.headers}});
  return {env,calls,request};
}
test('owner console uses existing credential-bound session; anonymous and staff cannot proxy',async()=>{
  const f=await fixture();
  assert.equal((await handlePartnerOwnerConsole(new Request(origin+'/v1/admin/partners/ledger'),f.env,{})).status,401);
  assert.equal((await handlePartnerOwnerConsole(new Request(origin+'/internal/admin/partners'),f.env,{})).status,302);
  const staff=await fixture('staff');assert.equal((await handlePartnerOwnerConsole(staff.request('/v1/admin/partners/ledger'),staff.env,{})).status,403);
  assert.equal(f.calls.length+staff.calls.length,0);
});
test('owner writes require exact origin and fixed route; browser spoofed actor is ignored',async()=>{
  const f=await fixture();const opts={method:'POST',headers:{'content-type':'application/json',origin:'https://evil.invalid'},body:'{}'};
  assert.equal((await handlePartnerOwnerConsole(f.request('/v1/admin/partners/decision',opts),f.env,{})).status,403);
  opts.headers.origin=origin;
  assert.equal((await handlePartnerOwnerConsole(f.request('/v1/admin/partners/../../anything',opts),f.env,{})).status,404);
  opts.headers['x-mmd-owner-id']='forged';
  assert.equal((await handlePartnerOwnerConsole(f.request('/v1/admin/partners/decision',opts),f.env,{})).status,200);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://partners-worker.internal/v1/partner/admin/model-changes/decision');
  assert.equal(f.calls[0].headers.get('x-mmd-owner-id'),'owner-fixture');
  assert.equal(f.calls[0].headers.get('cookie'),null);
});

test('owner preview forwards only the validated request ID and all new financial routes stay fixed',async()=>{
 const f=await fixture();await handlePartnerOwnerConsole(f.request('/v1/admin/partners/asset-preview?request_id=recAAAAAAAAAAAAAA&url=https://evil.invalid'),f.env,{});
 assert.equal(f.calls[0].url,'https://partners-worker.internal/v1/partner/admin/model-changes/asset?request_id=recAAAAAAAAAAAAAA');
 const page=await handlePartnerOwnerConsole(f.request('/internal/admin/partners'),f.env,{}),html=await page.text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(script));
 assert.match(html,/approve_public_image/);assert.match(html,/reviewed_total_thb/);
 for(const route of ['capture','settlement-approve','materialize']){const r=await handlePartnerOwnerConsole(f.request('/v1/admin/partners/'+route,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),f.env,{});assert.equal(r.status,200);}
});

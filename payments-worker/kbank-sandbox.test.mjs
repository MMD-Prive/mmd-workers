import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleKbankSandbox, KbankSandboxCoordinator, KBANK_SMOKE_PATH } from './kbank-sandbox.mjs';
const request = (auth = 'internal') => new Request('https://payments'+KBANK_SMOKE_PATH, {method:'POST',headers:{'x-internal-token':auth}});
test('route fails closed before any bank call', async () => {
  const env = {AUTH_SERVICE_ADMIN_TO_PAYMENTS:'internal'};
  assert.equal((await handleKbankSandbox(request('wrong'),env)).status,401);
  assert.equal((await handleKbankSandbox(request(),env)).status,503);
  assert.equal(await handleKbankSandbox(new Request('https://payments/other'),env),null);
});
test('OAuth is sandbox-only, redacted, serialized and cooldown survives restart', async () => {
  const data = new Map();
  const state = {storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v)}};
  const env = {KBANK_SANDBOX_ENABLED:'true',KBANK_SANDBOX_CONSUMER_ID:'test-id',KBANK_SANDBOX_CONSUMER_SECRET:'test-secret'};
  const original = globalThis.fetch;
  let calls=0;
  globalThis.fetch=async(url,init)=>{
    calls++;
    assert.equal(url,'https://openapi-sandbox.kasikornbank.com/v2/oauth/token');
    assert.equal(init.redirect,'manual');
    assert.equal(init.body,'grant_type=client_credentials');
    assert.equal(init.headers.authorization,'Basic '+btoa('test-id:test-secret'));
    return Response.json({access_token:'must-not-leak',token_type:'Bearer',expires_in:'1799'});
  };
  try {
    const worker = new KbankSandboxCoordinator(state,env);
    const req=()=>new Request('https://kbank-coordinator/smoke',{method:'POST'});
    const responses=await Promise.all([worker.fetch(req()),worker.fetch(req())]);
    for(const response of responses){const result=await response.text();assert.equal(response.status,200);assert.ok(!result.includes('must-not-leak'));assert.equal(JSON.parse(result).transfers_enabled,false);}
    assert.equal(calls,1);
    assert.equal((await new KbankSandboxCoordinator(state,env).fetch(req())).status,429);
    assert.equal(calls,1);
    assert.ok(!JSON.stringify([...data]).includes('must-not-leak'));
  } finally {globalThis.fetch=original;}
});
test('upstream failures remain redacted and consume cooldown', async()=>{
  const data=new Map(); const state={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v)}};
  const env={KBANK_SANDBOX_ENABLED:'true',KBANK_SANDBOX_CONSUMER_ID:'id',KBANK_SANDBOX_CONSUMER_SECRET:'secret'};
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('secret');};
  try {const worker=new KbankSandboxCoordinator(state,env);const req=()=>new Request('https://kbank-coordinator/smoke',{method:'POST'});const r=await worker.fetch(req());assert.equal(r.status,502);assert.ok(!(await r.text()).includes('secret'));assert.equal((await worker.fetch(req())).status,429);}finally{globalThis.fetch=original;}
});


test('bank redirect is not followed and consumes cooldown without exposing destination', async () => {
  const data=new Map();
  const state={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v)}};
  const env={KBANK_SANDBOX_ENABLED:'true',KBANK_SANDBOX_CONSUMER_ID:'id',KBANK_SANDBOX_CONSUMER_SECRET:'secret'};
  const original=globalThis.fetch; let calls=0;
  globalThis.fetch=async(url,init)=>{
    calls++; assert.equal(init.redirect,'manual');
    return Response.json({access_token:'must-not-leak',token_type:'Bearer',expires_in:1799},{status:302,headers:{Location:'https://must-not-leak.example'}});
  };
  try {
    const worker=new KbankSandboxCoordinator(state,env);
    const req=()=>new Request('https://kbank-coordinator/smoke',{method:'POST'});
    const result=await worker.fetch(req());
    assert.equal(result.status,502);
    assert.deepEqual(await result.json(),{environment:'sandbox',ok:false,error:'kbank_oauth_failed',upstream_status:302});
    assert.equal((await worker.fetch(req())).status,429);
    assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});


test('only recognized OAuth errors survive response redaction', async () => {
  const original=globalThis.fetch;
  try {
    for(const [body, expected] of [
      [{error:'invalid_client',error_description:'secret-value'},'invalid_client'],
      [{ErrorCode:'unauthorized_client',Error:'secret-value'},'unauthorized_client'],
      [{fault:{faultstring:'secret-value',detail:{errorcode:'oauth.v2.InvalidClientIdentifier'}}},'invalid_client'],
      [{error:'secret-value',access_token:'secret-value'},undefined],
    ]) {
      const data=new Map(), state={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v)}};
      globalThis.fetch=async()=>Response.json(body,{status:401});
      const worker=new KbankSandboxCoordinator(state,{KBANK_SANDBOX_ENABLED:'true',KBANK_SANDBOX_CONSUMER_ID:'id',KBANK_SANDBOX_CONSUMER_SECRET:'secret'});
      const response=await worker.fetch(new Request('https://kbank-coordinator/smoke',{method:'POST'}));
      assert.equal(response.status,502);
      const result=await response.json();
      assert.equal(result.upstream_status,401);
      assert.equal(result.oauth_error,expected);
      assert.doesNotMatch(JSON.stringify(result),/secret-value/);
    }
  } finally {globalThis.fetch=original;}
});

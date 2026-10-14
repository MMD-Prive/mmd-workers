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
    assert.deepEqual(await result.json(),{
      environment:'sandbox',ok:false,error:'kbank_oauth_failed',upstream_status:302,
      bank_response_media_type:'json',bank_response_body_shape:'json_object',
      bank_error_shape:'none',bank_error_code_recognized:false,
    });
    assert.equal((await worker.fetch(req())).status,429);
    assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});


test('OAuth response metadata classifies JSON, HTML, malformed, scalar, and unknown error bodies without retaining content', async () => {
  const original=globalThis.fetch;
  try {
    const cases = [
      { name:'recognized OAuth object', body:'{"error":"invalid_client","error_description":"secret-description","access_token":"secret-token"}', contentType:'application/json; charset=utf-8', metadata:['json','json_object','oauth_error',true], oauthError:'invalid_client' },
      { name:'HTML gateway page', body:'<html>secret-html</html>', contentType:'text/html; charset=utf-8', metadata:['html','non_json','none',false] },
      { name:'malformed JSON', body:'{"error":"invalid_client"', contentType:'application/json', metadata:['json','non_json','none',false] },
      { name:'JSON scalar', body:'null', contentType:'application/json', metadata:['json','json_scalar','none',false] },
      { name:'unknown OAuth code', body:'{"error":"opaque-secret","error_description":"secret-description","access_token":"secret-token"}', contentType:'application/json', metadata:['json','json_object','oauth_error',false] },
      { name:'recognized KBank ErrorCode', body:'{"ErrorCode":"unauthorized_client","Error":"secret-error"}', contentType:'application/json', metadata:['json','json_object','kbank_error_code',true], oauthError:'unauthorized_client' },
      { name:'recognized code after unknown error', body:'{"error":"opaque-secret","ErrorCode":"unauthorized_client"}', contentType:'application/json', metadata:['json','json_object','kbank_error_code',true], oauthError:'unauthorized_client' },
      { name:'recognized gateway fault detail', body:'{"fault":{"faultstring":"secret-fault","detail":{"errorcode":"oauth.v2.InvalidClientIdentifier"}}}', contentType:'application/json', metadata:['json','json_object','gateway_fault_detail',true], oauthError:'invalid_client' },
      { name:'empty body with no content type', body:null, contentType:null, metadata:['missing','empty','none',false] },
    ];
    for (const entry of cases) {
      const data=new Map(), state={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v)}};
      globalThis.fetch=async()=>new Response(entry.body,{status:401,headers:entry.contentType?{'content-type':entry.contentType}:{}});
      const worker=new KbankSandboxCoordinator(state,{KBANK_SANDBOX_ENABLED:'true',KBANK_SANDBOX_CONSUMER_ID:'id',KBANK_SANDBOX_CONSUMER_SECRET:'secret'});
      const response=await worker.fetch(new Request('https://kbank-coordinator/smoke',{method:'POST'}));
      assert.equal(response.status,502);
      const result=await response.json();
      assert.equal(result.upstream_status,401);
      assert.deepEqual(
        [result.bank_response_media_type,result.bank_response_body_shape,result.bank_error_shape,result.bank_error_code_recognized],
        entry.metadata,
        entry.name,
      );
      assert.equal(result.oauth_error,entry.oauthError);
      assert.doesNotMatch(JSON.stringify(result),/secret-(?:description|token|html|error|fault)|opaque-secret/);
    }
  } finally {globalThis.fetch=original;}
});

test('oversized JSON is marked size-limited and its body is not exposed', async () => {
  const original=globalThis.fetch;
  const body=JSON.stringify({error:'invalid_client',payload:'secret-payload'.repeat(3000)});
  try {
    globalThis.fetch=async()=>new Response(body,{status:401,headers:{'content-type':'application/json'}});
    const state={storage:{get:async()=>undefined,put:async()=>{}}};
    const worker=new KbankSandboxCoordinator(state,{KBANK_SANDBOX_ENABLED:'true',KBANK_SANDBOX_CONSUMER_ID:'id',KBANK_SANDBOX_CONSUMER_SECRET:'secret'});
    const response=await worker.fetch(new Request('https://kbank-coordinator/smoke',{method:'POST'}));
    const result=await response.json();
    assert.equal(result.bank_response_media_type,'json');
    assert.equal(result.bank_response_body_shape,'size_limited');
    assert.equal(result.bank_error_shape,'none');
    assert.equal(result.bank_error_code_recognized,false);
    assert.doesNotMatch(JSON.stringify(result),/secret-payload|invalid_client/);
  } finally {globalThis.fetch=original;}
});


test('coordinator status reads shared history without writes or bank IO, including pending and restart', async () => {
  let previous; let writes=0, calls=0;
  const state={storage:{get:async()=>previous,put:async()=>{writes++;}}};
  const original=globalThis.fetch; globalThis.fetch=async()=>{calls++;throw Error('unexpected bank call');};
  try {
    const status=()=>new Request('https://kbank-coordinator/status',{method:'POST'});
    const worker=new KbankSandboxCoordinator(state,{});
    let data=await (await worker.fetch(status())).json();
    assert.deepEqual(data.cooldown,{retry_after_seconds:0,last_attempt_at:null,last_success:null,in_progress:false});
    const now=Date.now(); previous={nextAttemptAt:now+100000,success:false};
    worker.pending=Promise.resolve(); data=await (await worker.fetch(status())).json();
    assert.equal(data.cooldown.in_progress,true); assert.ok(data.cooldown.retry_after_seconds>0);
    assert.equal(data.cooldown.last_attempt_at,previous.nextAttemptAt-1800000);
    data=await (await new KbankSandboxCoordinator(state,{}).fetch(status())).json();
    assert.equal(data.cooldown.last_success,false); assert.ok(data.cooldown.retry_after_seconds>0);
    previous={nextAttemptAt:now-1,success:true};
    data=await (await worker.fetch(status())).json(); assert.equal(data.cooldown.retry_after_seconds,0);
    previous={nextAttemptAt:'bad',success:false}; assert.equal((await worker.fetch(status())).status,503);
    assert.equal(writes,0);assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});

test('authenticated status fails closed on coordinator failure without bank IO', async () => {
  const original=globalThis.fetch; let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('bank must not be called');};
  try {
    const env={AUTH_SERVICE_ADMIN_TO_PAYMENTS:'internal',KBANK_SANDBOX_ENABLED:'true',KBANK_SANDBOX_CONSUMER_ID:'id',KBANK_SANDBOX_CONSUMER_SECRET:'secret',
      KBANK_SANDBOX_COORDINATOR:{idFromName:n=>n,get:()=>({fetch:async req=>{assert.equal(new URL(req.url).pathname,'/status');throw Error('secret');}})}};
    const response=await handleKbankSandbox(new Request('https://payments/v1/internal/payments/kbank/sandbox/status',{method:'POST',headers:{'x-internal-token':'internal'}}),env);
    assert.equal(response.status,503);assert.equal((await response.json()).error,'sandbox_status_unavailable');assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceFetch, withRequestReference, withReferenceWorker} from '../src/liff-request-reference.js';
import {createStartDiagnostics} from '../src/liff-start-diagnostics.js';
import foundation from '../src/liff-identity-foundation.js';
import {handleLiffMemberShell} from '../src/liff-member-shell.js';
import {runInNewContext} from 'node:vm';

const uuid = () => crypto.randomUUID();
const profile = '/member/api/liff/profile';
const start = '/member/api/liff/start';
test('503 retry links the same flow and previous server request; does not replay start', async () => {
 const writes=[], tasks=[], calls=[]; let status=503;
 const ctx={waitUntil(p){assert.equal(this,ctx);tasks.push(p);}};
 const env={LIFF_IDENTITY_KV:{put:async(k,v,o)=>writes.push({k,row:JSON.parse(v),o})}};
 const old=console.info;console.info=()=>{};
 try {
  const send=createReferenceFetch(async(url,init)=>{
   calls.push(url);
   return withRequestReference(new Request('https://fixture.invalid'+url,init),env,ctx,url===start?'start':'profile',async ref=>{
    if(url===start)createStartDiagnostics({requestRef:ref,emit:row=>writes.push({row})}).complete(200);
    return new Response('{}',{status:url===start?200:status,headers:{'set-cookie':'synthetic=secret; HttpOnly'}});
   });
  });
  await send(start,{method:'POST',body:'synthetic-token'});
  const failed=await send(profile);status=200;
  const recovered=await send(profile,{diagnosticRetry:true});
  await Promise.all(tasks);
  assert.deepEqual(calls,[start,profile,profile]);
  const rows=writes.filter(x=>x.row.event==='liff_request_reference').map(x=>x.row);
  assert.equal(new Set(rows.map(x=>x.client_flow_ref)).size,1);
  assert.equal(rows.at(-1).client_retry_of,failed.headers.get('x-mmd-diag-request'));
  assert.notEqual(recovered.headers.get('x-mmd-diag-request'),failed.headers.get('x-mmd-diag-request'));
  assert.equal(rows.at(-1).status,200);
  assert.equal(writes.find(x=>x.row.event==='liff_start_timing').row.ref,rows[0].request_ref);
  assert(!JSON.stringify(writes).includes('secret'));assert(!JSON.stringify(writes).includes('synthetic-token'));
  assert(writes.filter(x=>x.o).every(x=>x.o.expirationTtl===172800));
 } finally {console.info=old;}
});
test('separate tabs do not share flow or retry; unrelated endpoints unchanged',async()=>{
 const calls=[];const raw=async(url,init)=>{calls.push({url,init});return new Response('{}',{headers:{'x-mmd-diag-request':uuid()}});};
 const a=createReferenceFetch(raw), b=createReferenceFetch(raw);
 await a(profile);await b(profile,{diagnosticRetry:true});
 assert.notEqual(calls[0].init.headers.get('x-mmd-diag-flow'),calls[1].init.headers.get('x-mmd-diag-flow'));
 assert.equal(calls[1].init.headers.get('x-mmd-diag-retry-of'),null);
 const init={headers:{accept:'application/json'}};await a('/api/member/app/updates',init);assert.equal(calls[2].init,init);
});
test('invalid refs, secrets and raw error text never reach diagnostic storage; failure preserves response',async()=>{
 const rows=[], tasks=[];const old=console.info;console.info=x=>rows.push(x);
 try {
  const req=new Request('https://fixture.invalid'+profile+'?token=secret',{headers:{'x-mmd-diag-flow':'LINE-ID-secret','x-mmd-diag-retry-of':'token-secret',cookie:'session=secret'}});
  const response=await withRequestReference(req,{LIFF_IDENTITY_KV:{put:async()=>{throw Error('secret');}}},{waitUntil:p=>tasks.push(p)},'profile',async()=>new Response('unchanged',{status:503}));
  await Promise.all(tasks);assert.equal(await response.text(),'unchanged');assert.equal(response.status,503);
  const error=Error('raw-secret');await assert.rejects(withRequestReference(req,{},undefined,'profile',async()=>{throw error;}),x=>x===error);
  assert(!JSON.stringify(rows).includes('secret'));assert(rows.every(x=>!('client_flow_ref' in x)));
 }finally{console.info=old;}
});
test('foundation emits a response reference for unauthenticated profile without changing authorization',async()=>{
 const old=console.info;console.info=()=>{};
 try{
  const r=await foundation.fetch(new Request('https://mmdbkk.com'+profile),{});
  assert(r.status>=400);assert.match(r.headers.get('x-mmd-diag-request'),/^[0-9a-f-]{36}$/);
 }finally{console.info=old;}
});
test('Owner Overlay response rewriting retains final server ref and ExecutionContext; nested timing shares ref',async()=>{
 const rows=[],tasks=[],binding={put:async()=>{}},env={LIFF_IDENTITY_KV:binding,MODEL_ENABLED:false};
 const ctx={waitUntil(p){assert.equal(this,ctx);tasks.push(p);}};
 const req=new Request('https://fixture.invalid'+start,{method:'POST'});
 const old=console.info;console.info=x=>rows.push(x);
 try{
  let innerRef;
  const response=await withReferenceWorker(req,env,ctx,async scoped=>{
   assert.equal(scoped.LIFF_IDENTITY_KV,binding);assert.equal(scoped.MODEL_ENABLED,false);
   await withRequestReference(req.clone(),scoped,ctx,'start',async ref=>{innerRef=ref;return new Response('{}',{status:503});});
   // Owner recovery can construct a new response and discard inner headers.
   return new Response('owner-response',{status:200,headers:{'set-cookie':'fixture=unchanged'}});
  });
  await Promise.all(tasks);
  assert.equal(response.headers.get('x-mmd-diag-request'),innerRef);
  assert.equal(response.headers.get('set-cookie'),'fixture=unchanged');
  assert.equal(await response.text(),'owner-response');assert.equal(rows.length,2);assert.equal(rows[1].status,200);
  assert.deepEqual(Object.keys(env),['LIFF_IDENTITY_KV','MODEL_ENABLED']);
 }finally{console.info=old;}
});
test('UUID failure is non-blocking and start clears prior retry reference',async()=>{
 const calls=[];const raw=async(u,i)=>{calls.push(i);return new Response('{}',{headers:{'x-mmd-diag-request':uuid()}});};
 await createReferenceFetch(raw,()=>{throw Error('unavailable');})(profile,{diagnosticRetry:true});
 assert(!('diagnosticRetry' in calls[0]));
 const send=createReferenceFetch(raw);await send(profile);await send(start,{method:'POST'});await send(profile,{diagnosticRetry:true});
 assert.equal(calls.at(-1).headers.get('x-mmd-diag-retry-of'),null);
});
for(const path of ['/member/liff?intent=status','/member/liff?intent=signup'])test('rendered source shell wires the reference sender and retry: '+path,async()=>{
 const html=await handleLiffMemberShell(new Request('https://mmdbkk.com'+path),{LIFF_ID:'synthetic'}).text();
 assert(html.includes('const referenceFetch = (function createReferenceFetch'));
 assert(html.includes('await referenceFetch(url, { ...init, signal: controller.signal })'));
 assert(html.includes('readProfile({ silent: true, diagnosticRetry: true })'));
 const marker='const referenceFetch = (';const begin=html.indexOf(marker)+marker.length;const end=html.indexOf(')(window.fetch.bind(window));',begin);
 const refs=[];
 const factory=runInNewContext('('+html.slice(begin,end)+')',{crypto,Headers});
 const send=factory(async(_url,init)=>{refs.push(init);return new Response('{}',{headers:{'x-mmd-diag-request':uuid()}});});
 await send(profile);await send(profile,{diagnosticRetry:true});
 assert(refs[1].headers.has('x-mmd-diag-retry-of'));assert(!('diagnosticRetry' in refs[1]));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {withRequestReference, withReferenceWorker} from '../src/liff-request-reference.js';

const request = () => new Request('https://fixture.invalid/member/api/liff/profile', {
  headers: {cookie:'synthetic-cookie-secret', authorization:'synthetic-token-secret', 'x-mmd-diag-flow':crypto.randomUUID()},
});
async function capture(response, run) {
  const rows=[], writes=[], tasks=[], old=console.info;
  console.info=row=>rows.push(row);
  const env={LIFF_IDENTITY_KV:{put:async(k,v)=>writes.push({key:k,row:JSON.parse(v)})}};
  const ctx={waitUntil(p){tasks.push(p);}};
  try {
    const result=await (run ? run(env,ctx) : withRequestReference(request(),env,ctx,'profile',async()=>response));
    await Promise.all(tasks);
    return {result,rows,writes};
  } finally {console.info=old;}
}
for (const code of ['LIFF_SESSION_REQUIRED','LIFF_SESSION_INVALID']) {
  test('401 allowlist linked to the same server reference: '+code,async()=>{
    const body=JSON.stringify({ok:false,error:{code,message:'synthetic-line-id-secret'},token:'synthetic-token-secret'});
    const {result,rows,writes}=await capture(new Response(body,{status:401,headers:{'content-type':'application/json; charset=utf-8','set-cookie':'synthetic-cookie-secret'}}));
    assert.equal(result.status,401);assert.equal(await result.text(),body);
    assert.equal(result.headers.get('set-cookie'),'synthetic-cookie-secret');
    assert.equal(rows.length,2);assert.equal(rows[0].request_ref,rows[1].request_ref);
    assert.equal(rows[1].request_ref,result.headers.get('x-mmd-diag-request'));
    assert.equal(rows[1].reason_code,code);assert(!('reason_code' in rows[0]));
    assert.equal(writes[1].row.reason_code,code);assert(writes[1].key.includes(rows[1].request_ref));
    assert(!JSON.stringify({rows,writes}).includes('secret'));
  });
}
for (const [name,body,status,type] of [
  ['unknown code','{"error":{"code":"synthetic-token-secret"}}',401,'application/json'],
  ['malformed JSON','synthetic-cookie-secret',401,'application/json'],
  ['non JSON','{"error":{"code":"LIFF_SESSION_INVALID"}}',401,'text/plain'],
  ['oversize',JSON.stringify({error:{code:'LIFF_SESSION_INVALID'},padding:'x'.repeat(4096)}),401,'application/json'],
  ['non401','{"error":{"code":"LIFF_SESSION_INVALID"}}',503,'application/json'],
]) test('omits reason and preserves response: '+name,async()=>{
  const {result,rows}=await capture(new Response(body,{status,headers:{'content-type':type}}));
  assert.equal(await result.text(),body);assert.equal(result.status,status);
  assert(rows.every(row=>!('reason_code' in row)));assert(!JSON.stringify(rows).includes('secret'));
});
test('stalled diagnostic clone is bounded and does not cancel original response',async()=>{
  let controller;
  const stream=new ReadableStream({start(c){controller=c;}});
  const pending=capture(new Response(stream,{status:401,headers:{'content-type':'application/json'}}));
  const {result,rows}=await pending;
  assert(!('reason_code' in rows[1]));
  controller.enqueue(new TextEncoder().encode('original'));controller.close();
  assert.equal(await result.text(),'original');
});
test('Owner Overlay final status owns reason; nested handler does not emit duplicate',async()=>{
  const {result,rows}=await capture(null,(env,ctx)=>withReferenceWorker(request(),env,ctx,async scoped=>{
    await withRequestReference(request(),scoped,ctx,'profile',async()=>Response.json({error:{code:'LIFF_SESSION_INVALID'}},{status:401}));
    return Response.json({ok:true},{status:200});
  }));
  assert.equal(result.status,200);assert.equal(rows.length,2);
  assert(rows.every(row=>!('reason_code' in row)));
});

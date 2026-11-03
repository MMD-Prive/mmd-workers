import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Execute the exact Refund handler; unrelated webhook/module imports are outside
// this focused harness. Auth and formatting helpers are stubs, not auth acceptance.
const source=await readFile(new URL(process.env.REFUND_BASELINE==='1'?'../refund-line-handler.before.js':'../member-dashboard-chat-worker/src/index.js',import.meta.url),'utf8');
const start=source.indexOf('async function handleServiceBoundRefundReceipt(');
const next=source.indexOf('\nasync function ',start+1);
const end=next<0?source.length:next;
for(const first of [408,500,502,503])test(`LINE ${first} after possible acceptance must not trigger image fallback`,async()=>{
  let pushes=0;
  const context={Response,Number,Boolean,JSON,hasServiceBindingAuth:()=>true,readJson:async()=>({line_user_id:'synthetic',receipt_url:'synthetic',mime_type:'image/jpeg',byte_size:100}),getLineUserId:()=> 'synthetic',safeRefundReceiptUrl:x=>x,asString:x=>String(x||''),buildRefundReceiptCustomerText:()=> 'fixture',sanitizeLineText:x=>x,LINE_PUSH_URL:'https://fixture.invalid/push',json:(x,status=200)=>Response.json(x,{status}),fetch:async()=>{pushes++;return new Response('{}',{status:first});}};
  const handle=vm.runInNewContext(source.slice(start,end)+';handleServiceBoundRefundReceipt',context);
  const response=await handle({method:'POST'},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic'});
  assert.equal(pushes,1);assert.equal(response.status,502);assert.equal((await response.json()).unknown,true);
});
test('definite image rejection can use one secure-link fallback',async()=>{
  let pushes=0;
  const context={Response,Number,Boolean,JSON,hasServiceBindingAuth:()=>true,readJson:async()=>({mime_type:'image/jpeg',byte_size:100}),getLineUserId:()=> 'synthetic',safeRefundReceiptUrl:()=> 'synthetic',asString:x=>String(x||''),buildRefundReceiptCustomerText:()=> 'fixture',sanitizeLineText:x=>x,LINE_PUSH_URL:'https://fixture.invalid/push',json:(x,status=200)=>Response.json(x,{status}),fetch:async()=>new Response('{}',{status:++pushes===1?400:200})};
  const handle=vm.runInNewContext(source.slice(start,end)+';handleServiceBoundRefundReceipt',context);
  const response=await handle({method:'POST'},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic'});
  assert.equal(pushes,2);assert.equal((await response.json()).mode,'secure_link_fallback');
});

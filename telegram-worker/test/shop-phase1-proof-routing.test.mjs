import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function request(thread,secret='fixture-secret'){
 const form=new FormData();form.append('chat_id','-100fixture');form.append('message_thread_id',String(thread));form.append('document',new Blob(['fixture'],{type:'image/png'}),'fixture.png');
 return new Request('https://telegram-worker.internal/telegram/internal/payments/proof-document',{method:'POST',headers:{authorization:'Bearer '+secret},body:form});
}
const env={TELEGRAM_BOT_TOKEN:'fixture-bot',AUTH_SERVICE_PAYMENTS_TO_TELEGRAM:'fixture-secret',TELEGRAM_CHAT_ID:'-100fixture',TG_THREAD_HIMAI_PAYMENTS:'158',TG_THREAD_MMD_SHOP_PAYMENTS:'161'};
for(const thread of [158,161])test('payment service may deliver proof to canonical shop thread '+thread,async()=>{
 const original=globalThis.fetch;let sent;
 globalThis.fetch=async(input,init)=>{sent=init.body;assert.match(String(input),/api.telegram.org/);return Response.json({ok:true,result:{message_id:1}})};
 try{const r=await worker.fetch(request(thread),env,{});const body=await r.json();assert.equal(body.ok,true);assert.equal(sent.get('message_thread_id'),String(thread))}finally{globalThis.fetch=original}
});
test('proof document still rejects nonpayment topics and invalid service authentication',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must_not_send')};
 try{for(const req of [request(9),request(158,'wrong')]){const r=await worker.fetch(req,env,{});assert.equal((await r.json()).ok,false)}assert.equal(calls,0)}finally{globalThis.fetch=original}
});

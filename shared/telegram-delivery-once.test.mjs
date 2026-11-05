import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryR2} from './test/payment-memory-r2.mjs';
import {dispatchPaymentNotification,drainPaymentNotifications} from './payment-notification-outbox.mjs';
import {deliverTelegramOnce} from './telegram-delivery-once.mjs';

for(const mode of ['lost_response','invalid_json','gateway_error','crash_after_accept'])
test(`Telegram accepted then ${mode}: fresh invocation never resends`,async()=>{
  const bucket=memoryR2(),lane='synthetic-telegram';let sends=0;
  const deliver=(journal,checkpoint)=>deliverTelegramOnce(journal,checkpoint,async()=>{
    sends++;
    if(mode==='lost_response')throw new Error('synthetic response lost');
    if(mode==='invalid_json')return new Response('broken');
    if(mode==='gateway_error')return new Response('',{status:502});
    return Response.json({telegram:{ok:true}});
  });
  const put=bucket.put.bind(bucket);let fail=false;
  bucket.put=async(key,value,options)=>{
    const record=JSON.parse(value);
    if(mode==='crash_after_accept'&&sends===1&&record.status==='delivered'&&!fail){fail=true;throw new Error('synthetic crash');}
    return put(key,value,options);
  };
  try{await dispatchPaymentNotification({bucket,lane,eventKey:'same-event',payload:{},deliver});}catch(error){assert.equal(mode,'crash_after_accept');}
  const out=await drainPaymentNotifications({bucket,lane,deliver,now:Date.now()+360000});
  assert.equal(sends,1);
  if(mode==='crash_after_accept')assert.equal(out.manual_review,1);
  await dispatchPaymentNotification({bucket,lane,eventKey:'same-event',payload:{},deliver,now:Date.now()+720000});
  assert.equal(sends,1);
});

test('failure to persist pre-send checkpoint never calls provider',async()=>{
  let sends=0;
  await assert.rejects(deliverTelegramOnce({state:{}},async()=>{throw new Error('storage unavailable');},async()=>{sends++;}));
  assert.equal(sends,0);
});

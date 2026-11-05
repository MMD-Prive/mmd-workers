import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountNotificationReview} from './src/notification-manual-review-client.js';
import wrapper from './src/job-orchestrator-owner-ops-wrapper.js';
import delegated from './src/cancellation-credit-recovery.js';
import {memoryR2} from '../shared/test/payment-memory-r2.mjs';

test('manual review endpoint requires existing owner cookie and same-origin writes',async t=>{
  let role='owner';t.mock.method(delegated,'fetch',async()=>Response.json({authenticated:true,actor_id:'synthetic-owner',actor_role:role}));
  const env={PRIVATE_MODEL_MEDIA:memoryR2()},url='https://mmdbkk.com/v1/admin/jobs/notification-review';
  assert.equal((await wrapper.fetch(new Request(url),env,{})).status,401);
  role='model';assert.equal((await wrapper.fetch(new Request(url,{headers:{cookie:'synthetic'}}),env,{})).status,401);
  role='owner';assert.equal((await wrapper.fetch(new Request(url,{headers:{cookie:'synthetic'}}),env,{})).status,200);
  assert.equal((await wrapper.fetch(new Request(url,{method:'POST',headers:{cookie:'synthetic',origin:'https://evil.test'},body:'{}'}),env,{})).status,403);
  assert.equal((await wrapper.fetch(new Request(url,{method:'POST',headers:{cookie:'synthetic',origin:'https://mmdbkk.com'},body:'{}'}),env,{})).status,400);
});

test('manual review UI requires inspection checkbox, evidence and explicit confirmation before resend',async()=>{
  const dom=new JSDOM('<main></main>',{url:'https://mmdbkk.com/internal/admin/jobs/completion',runScripts:'outside-only'}),w=dom.window;
  const calls=[];w.confirm=()=>true;
  w.fetch=async(url,options={})=>{
    calls.push({url,...options});
    return {ok:true,json:async()=>options.method==='POST'?{ok:true,delivery_status:'delivered'}:{ok:true,items:[{id:'synthetic',lane:'model-payout-instructions',session_id:'synthetic-session',state:'payout_pending',recipient_last4:'2345',account_last4:'0000',can_resend:true,snapshot:'synthetic'}]}};
  };
  try{
    w.eval('('+mountNotificationReview.toString()+')(document.querySelector("main"))');
    await new Promise(setImmediate);
    const row=w.document.querySelector('article'),buttons=row.querySelectorAll('button'),note=row.querySelector('input:not([type=checkbox])'),check=row.querySelector('[type=checkbox]');
    assert.equal(buttons[1].disabled,true);
    note.value='Checked synthetic Telegram history';note.dispatchEvent(new w.Event('input'));
    assert.equal(buttons[1].disabled,true);
    check.checked=true;check.dispatchEvent(new w.Event('change'));
    assert.equal(buttons[1].disabled,false);buttons[1].click();await new Promise(setImmediate);
    const posted=JSON.parse(calls.find(call=>call.method==='POST').body);
    assert.equal(posted.decision,'not_received');assert.equal(posted.snapshot,'synthetic');
    assert.match(w.document.querySelector('[role=status]').textContent,/ส่งสำเร็จ/);
    buttons[1].click();assert.equal(calls.filter(call=>call.method==='POST').length,1);
  }finally{w.close();}
});

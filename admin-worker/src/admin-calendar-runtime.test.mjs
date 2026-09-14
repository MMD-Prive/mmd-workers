import test from 'node:test';
import assert from 'node:assert/strict';
import { readAdminCalendar, calendarPageResponse } from './admin-calendar-runtime-v2.js';

const IDS = {
  sessions:'tblC98mKWbzmPuNzX', jobs:'tbl0jxIjN8QYwGABX', payments:'tblWGGJJOx5eBvBZJ', clients:'tblVv58TCbwh5j1fS', models:'tblI4B0bI446vp9GX', cal:'tbl6saWYEQrEdnMIK'
};
const f = {
  sid:'fldLTq2kZbyRv22IA', jid:'fldHw5HdDDdkHXMhG', client:'fld6P6if0vDZCeV0C', model:'fldrXQAyOMPCvbOaY', start:'fldBeG0FkWwa8kgnp', end:'fldiDSz0wW9Ct9I3P', duration:'fldP7Xx99uf5BvJpF', ack:'fldFgkHXivIAThfDz', modelState:'fld57fhdWqIcOy4Jp', total:'fldeBf4gl5iTBj7eX', paymentRef:'fldojgjSQLaO0uQLX',
  jobId:'fldwreJwlz8sWd6GM', jobModel:'fldscPK15ejBw0BAH', jobClient:'fldlPdR0pmynCY6fW', jobBudget:'fldSspHLxJPQOg7wA',
  paySid:'fld2wdhBvc8xrV6y5', payRef:'fldOO6SY49iDw8VBZ', payAmount:'fldvCSwrUW8OMAooS', payVerify:'fldJ7a0Ube9F0bmRy', payStage:'fldrr9g8ZZjqAbdKQ', payStatus:'fldEJ1hmm7KwWuI6q',
  clientName:'fldrHqkGQzvBLRxlP', modelName:'fldShiT60bmCxFxRu', modelId:'fldVWbT0gsSe0hn7Q',
  calUid:'fld42rRY3ufGeXCcf', calSid:'fldd0STLRxOGIKXPn', calJid:'fldzvGB5u7t55kwUQ', calStatus:'fld449t1h6s7jbcnf', calTrigger:'fldNhk22zLTvR9Y4C', calEvent:'fldfC6D0RXyogXcMG'
};

function fixture({ verified=false, duration=3, crossMidnight=false }={}) {
  const start='2026-09-17T15:00:00.000Z';
  const end=crossMidnight?'2026-09-17T19:30:00.000Z':'2026-09-17T18:00:00.000Z';
  return {
    [IDS.sessions]:[{id:'recSession',fields:{[f.sid]:'SES-17',[f.jid]:'JOB-17',[f.client]:['recClient'],[f.model]:['recModel'],[f.start]:start,[f.end]:end,[f.duration]:duration,[f.ack]:'2026-09-14T01:00:00Z',[f.modelState]:'model_confirmed',[f.total]:20000,[f.paymentRef]:'PAY-17'}}],
    [IDS.jobs]:[{id:'recJob',fields:{[f.jobId]:'JOB-17',[f.jobClient]:['recClient'],[f.jobModel]:['recModel'],[f.jobBudget]:20000}}],
    [IDS.payments]:[{id:'recPay',fields:{[f.paySid]:'SES-17',[f.payRef]:'PAY-17',[f.payAmount]:10000,[f.payVerify]:verified?'official_verified':'pending_review',[f.payStage]:'deposit',[f.payStatus]:verified?'paid':'pending'}}],
    [IDS.clients]:[{id:'recClient',fields:{[f.clientName]:'คุณเอ็ม'}}],
    [IDS.models]:[{id:'recModel',fields:{[f.modelName]:'Model A',[f.modelId]:'GWs17'}}],
    [IDS.cal]:[{id:'recCal',fields:{[f.calUid]:'cal-uid-real-17',[f.calSid]:'SES-17',[f.calJid]:'JOB-17',[f.calStatus]:'linked',[f.calTrigger]:'BOOKING_CREATED',[f.calEvent]:'2026-09-14T02:00:00Z'}}],
  };
}
function installFetch(data){
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url);
    const table=decodeURIComponent(url.pathname.split('/').pop());
    return Response.json({records:data[table]||[]});
  };
  return ()=>{globalThis.fetch=original};
}

test('calendar joins client job model deposit and real Cal booking UID', async()=>{
  const restore=installFetch(fixture());
  try{
    const out=await readAdminCalendar({AIRTABLE_API_KEY:'test'},'2026-09-17');
    assert.equal(out.ok,true);
    assert.equal(out.schema,'mmd.admin.calendar.v1');
    assert.equal(out.items.length,1);
    const row=out.items[0];
    assert.equal(row.client.name,'คุณเอ็ม');
    assert.equal(row.job.job_id,'JOB-17');
    assert.equal(row.model.name,'Model A');
    assert.equal(row.deposit.amount_thb,10000);
    assert.equal(row.deposit.authority,'payments-worker');
    assert.equal(row.cal.booking_uid,'cal-uid-real-17');
    assert.equal(row.internal_hold,true);
  } finally { restore(); }
});

test('verified deposit clears Internal Hold without changing payment authority', async()=>{
  const restore=installFetch(fixture({verified:true}));
  try{
    const out=await readAdminCalendar({AIRTABLE_API_KEY:'test'},'2026-09-17');
    assert.equal(out.items[0].deposit.verified,true);
    assert.equal(out.items[0].internal_hold,false);
    assert.equal(out.items[0].deposit.authority,'payments-worker');
  } finally { restore(); }
});

test('work over five hours enters pricing review', async()=>{
  const restore=installFetch(fixture({duration:6}));
  try{
    const out=await readAdminCalendar({AIRTABLE_API_KEY:'test'},'2026-09-17');
    assert.equal(out.items[0].pricing.review_required,true);
  } finally { restore(); }
});

test('worker calendar page is noindex and fetches protected API', async()=>{
  const page=calendarPageResponse();
  const html=await page.text();
  assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.match(html,/\/v1\/admin\/calendar/);
  assert.match(html,/Client \+ Job \+ Model \+ Deposit \+ Cal booking UID/);
});

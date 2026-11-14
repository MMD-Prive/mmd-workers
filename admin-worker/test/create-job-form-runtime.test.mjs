import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { handleCreateJobWorkerPage } from '../src/create-job-worker-page.js';
import { run } from './fixtures/create-job-form-runtime.mjs';
const CLIENT = 'recCLIENT00000001', MODEL = 'recMODEL000000001';
const settle = async () => { for (let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve)); };
async function page({ create, preflight, privateBackend=false, captainReceipt }={}) {
  const calls=[], errors=[];
  const url='https://mmdbkk.com/internal/admin/jobs/create-job'+(captainReceipt?'?draft=captain-zero':'');
  let outcome;
  const html=await handleCreateJobWorkerPage(new Request('https://mmdbkk.com/internal/admin/jobs/create-job')).text();
  const dom=new JSDOM(html,{url,runScripts:'dangerously',beforeParse(w){
    w.scrollTo=()=>{};
    w.addEventListener('error',e=>errors.push(e.error));
    w.fetch=async(path,opts={})=>{
      calls.push({path,body:opts.body?JSON.parse(opts.body):null});
      if(path==='/v1/admin/jobs/edit?preview=captain-receipt')return captainReceipt();
      if(path==='/v1/admin/clients/lineage-lookup')return Response.json({records:[{client_id:captainReceipt?'recavk9fpKRed8adm':CLIENT,client_name:'Client',canonical_name:'Client',line_user_id:privateBackend?'U11111111111111111111111111111111':'U-client',lineage_source:'canonical_client'}]});
      if(path.startsWith('/v1/admin/models/search?'))return Response.json({items:[{model_id:captainReceipt?'rec25Xt7QODd763vI':MODEL,model_name:'Mira',model_lookup_key:privateBackend?'private/standard/Mira':'public/travel/Mira',visibility:privateBackend?'private':'public',access_folder:privateBackend?'standard':'travel',availability_state:'unknown'}]});
      if(path==='/internal/admin/jobs/create-job/preflight')return Response.json(await (preflight?.(calls.at(-1).body)||{ok:true,can_create:true,message:'Synthetic readiness passed'}));
      if(path==='/v1/admin/job/create'){
        if(create)return create(calls.at(-1).body);
        outcome=await run(calls.at(-1).body,{privateJob:privateBackend});
        return Response.json(outcome.data,{status:outcome.status});
      }
      throw Error('Unexpected fetch: '+path);
    };
  }});
  const w=dom.window,d=w.document,$=id=>d.getElementById(id);
  const fill=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
  const click=async id=>{if(!$(id).disabled)await $(id).onclick.call($(id),new w.MouseEvent('click'));await settle();};
  async function completeNewForm({visibility='public'}={}){
    assert.equal($('date').value,'');assert.equal($('amount').value,'');
    fill('cq','Synthetic');await click('cs');d.querySelector('#clients .result').click();await click('next1');
    const radio=d.querySelector('input[name="visibility"][value="'+visibility+'"]');radio.click();
    if(visibility==='public'){fill('publicFormat','event');fill('publicFolder','travel');}
    else{fill('ptype','pn');fill('folder','standard');fill('orientation','gay');}
    await click('next2');fill('mq','Synthetic');await click('ms');d.querySelector('#models .result').click();await click('next3');
    fill('date','2026-11-20');fill('time','19:00');fill('duration','120');fill('location','Synthetic fixture location');
    if(visibility==='public'){fill('duties','Synthetic event hosting');fill('customerCount','2');}
    await click('next4');fill('amount',captainReceipt?'33000':'10000');fill('payout','7000');await click('next5');fill('brief','Synthetic model brief');fill('note','Synthetic internal note');await click('next6');
    assert.deepEqual(errors,[]);
    assert.equal(d.querySelector('.step:not(.hide)').dataset.step,'7');
  }
  return{dom,w,d,$,fill,click,completeNewForm,calls,errors,get outcome(){return outcome;}};
}

test('new blank form searches, reviews, persists through canonical workers and displays its payment URL only',async t=>{
  const h=await page();t.after(()=>h.dom.window.close());await h.completeNewForm();assert.equal(h.$('create').disabled,false);await h.click('create');
  assert.equal(h.outcome.status,200,JSON.stringify(h.outcome.data));
  assert.equal(h.outcome.records.get('tblC98mKWbzmPuNzX').length,1);assert.equal(h.outcome.records.get('tblWGGJJOx5eBvBZJ').length,1);assert.equal(h.outcome.records.get('tbl0jxIjN8QYwGABX').length,1);
  assert.equal(h.calls.filter(x=>x.path==='/v1/admin/job/create').length,1);
  const url=new URL(h.d.querySelector('.payment-url').value);assert.equal(url.origin,'https://miniapp.line.me');assert.ok(url.searchParams.get('t'));
  assert.equal(url.searchParams.get('t'),new URL(h.outcome.data.customer_payment_url).searchParams.get('t'));
  assert.equal(h.outcome.data.amount_due_thb,3000);assert.equal(h.outcome.data.confirmation_release_state,'held_until_payment_approved');
  assert.doesNotMatch(h.$('notice').textContent,/job-confirmation\?t=|job-model\?t=/);
  assert.equal(h.outcome.issuances[0].payment_method,'');assert.equal(h.$('create').disabled,true);
});

test('preflight failure preserves the new form and does not send create until recheck succeeds',async t=>{
  let ready=false;const h=await page({preflight:()=>({ok:true,can_create:ready,message:ready?'Ready':'Unavailable'})});t.after(()=>h.dom.window.close());await h.completeNewForm();
  assert.equal(h.$('create').disabled,true);assert.equal(h.calls.filter(x=>x.path==='/v1/admin/job/create').length,0);assert.equal(h.$('amount').value,'10000');
  ready=true;await h.click('recheck');assert.equal(h.$('create').disabled,false);assert.equal(h.$('location').value,'Synthetic fixture location');
});

test('private unknown availability requires explicit acknowledgement before submission',async t=>{
  const h=await page({preflight:()=>({ok:true,can_create:true,availability:'unknown',message:'Availability unknown'}),create:()=>Response.json({ok:true,session_id:'sess_fixture',customer_payment_url:'https://mmdbkk.com/sigil/pay?t=abc.def'})});t.after(()=>h.dom.window.close());await h.completeNewForm({visibility:'private'});
  assert.equal(h.$('create').disabled,true);h.$('availabilityAck').click();assert.equal(h.$('create').disabled,false);await h.click('create');assert.equal(h.calls.filter(x=>x.path==='/v1/admin/job/create').length,1);
});

test('uncertain backend creation locks resubmission and displays recovery identifiers',async t=>{
  const h=await page({create:async payload=>{const result=await run(payload,{failPayment:true});assert.equal(result.data.creation_outcome,'unknown');return Response.json(result.data,{status:result.status});}});t.after(()=>h.dom.window.close());await h.completeNewForm();await h.click('create');
  assert.equal(h.$('create').disabled,true,'An uncertain create must not be repeated');
  assert.match(h.$('notice').textContent,/Session|session/);assert.ok(h.d.querySelector('#notice a[href^="/internal/admin/jobs/all?session_id="]'));
  await h.click('recheck');assert.equal(h.$('create').disabled,true);assert.equal(h.calls.filter(x=>x.path==='/v1/admin/job/create').length,1);
});

test('successful creation cannot be re-enabled by the readiness button',async t=>{
  const h=await page();t.after(()=>h.dom.window.close());await h.completeNewForm();await h.click('create');await h.click('recheck');assert.equal(h.$('create').disabled,true);
});

test('in-flight create cannot be re-enabled by recheck and dispatches once',async t=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});const h=await page({create:()=>pending});t.after(()=>h.dom.window.close());await h.completeNewForm();h.$('create').click();await settle();await h.click('recheck');assert.equal(h.$('create').disabled,true);
  finish(Response.json({ok:true,session_id:'sess_fixture',customer_payment_url:'https://mmdbkk.com/sigil/pay?t=abc.def'}));await settle();assert.equal(h.calls.filter(x=>x.path==='/v1/admin/job/create').length,1);
});

test('a transport failure after POST preserves inputs and requires existing-job review',async t=>{
  const h=await page({create:()=>{throw new TypeError('Network failure after submission');}});t.after(()=>h.dom.window.close());await h.completeNewForm();await h.click('create');
  assert.equal(h.$('create').disabled,true);assert.equal(h.$('recheck').disabled,true);assert.equal(h.$('amount').value,'10000');assert.equal(h.$('location').value,'Synthetic fixture location');
  assert.ok(h.d.querySelector('#notice a[href="/internal/admin/jobs/all"]'));assert.doesNotMatch(h.$('notice').textContent,/สร้างงานสำเร็จ/);
});

test('a definite validation rejection allows recheck without clearing the form',async t=>{
  let count=0;const h=await page({create:()=>{count++;return count===1?Response.json({ok:false,error:{code:'invalid_input',message:'Check input'}},{status:400}):Response.json({ok:true,session_id:'sess_fixture',customer_payment_url:'https://mmdbkk.com/sigil/pay?t=abc.def'});}});t.after(()=>h.dom.window.close());await h.completeNewForm();await h.click('create');
  assert.equal(h.$('create').disabled,true);assert.equal(h.$('recheck').disabled,false);assert.equal(h.$('amount').value,'10000');await h.click('recheck');assert.equal(h.$('create').disabled,false);await h.click('create');assert.match(h.$('notice').textContent,/สร้างงานสำเร็จ/);assert.equal(count,2);
});

for(const url of [undefined,'https://evil.example/sigil/pay?t=abc.def','https://mmdbkk.com/sigil/pay?t=not-signed'])test('an incomplete or untrusted payment URL never claims success: '+String(url),async t=>{
  const h=await page({create:()=>Response.json({ok:true,session_id:'sess_fixture',customer_payment_url:url})});t.after(()=>h.dom.window.close());await h.completeNewForm();await h.click('create');assert.equal(h.$('create').disabled,true);assert.equal(h.d.querySelector('.payment-url'),null);assert.doesNotMatch(h.$('notice').textContent,/สร้างงานสำเร็จ/);assert.match(h.$('notice').textContent,/sess_fixture/);
});

test('new private form reaches canonical membership/model gates and returns a signed deposit URL',async t=>{
  const h=await page({privateBackend:true});t.after(()=>h.dom.window.close());await h.completeNewForm({visibility:'private'});await h.click('create');
  assert.equal(h.outcome.status,200,JSON.stringify(h.outcome.data));assert.equal(h.outcome.data.amount_due_thb,3000);assert.equal(h.outcome.records.get('tblC98mKWbzmPuNzX').length,1);assert.equal(h.outcome.records.get('tblWGGJJOx5eBvBZJ').length,1);assert.equal(h.outcome.records.get('tbl0jxIjN8QYwGABX').length,1);assert.ok(h.d.querySelector('.payment-url'));
});

for(const [body,status] of [[{ok:false,error:'not_created',creation_outcome:'not_created'},503],[{ok:false,error:'unknown',creation_outcome:'unknown',session_id:'sess_fixture',payment_ref:'pay_fixture'},400],[{ok:false,error:'indeterminate',creation_outcome:'indeterminate'},500],[{ok:false,error:'backend_failure'},500]])test('resubmission follows explicit outcome, not only HTTP status: '+body.error,async t=>{
  const h=await page({create:()=>Response.json(body,{status})});t.after(()=>h.dom.window.close());await h.completeNewForm();await h.click('create');assert.equal(h.$('recheck').disabled,body.creation_outcome!=='not_created');
  if(body.payment_ref)assert.match(h.$('notice').textContent,/pay_fixture/);
});

test('HTTP-200 failure and malformed successful response are never presented as created',async t=>{
  for(const response of [Response.json({ok:false,error:'invalid_input'}),new Response('not JSON',{status:200})]){
    const h=await page({create:()=>response});t.after(()=>h.dom.window.close());await h.completeNewForm();await h.click('create');assert.doesNotMatch(h.$('notice').textContent,/สร้างงานสำเร็จ/);assert.equal(h.d.querySelector('.payment-url'),null);
  }
});

test('Captain draft displays verified receipt and proposed balance without sending writes',async t=>{
  const h=await page({privateBackend:true,captainReceipt:()=>Response.json({ok:true,received_thb:7500})});
  t.after(()=>h.dom.window.close());
  await h.completeNewForm({visibility:'private'});
  assert.match(h.$('review').textContent,/33,000.*7,500.*25,500/);
  assert.equal(h.$('create').disabled,true);
  await h.$('create').onclick();
  assert.equal(h.calls.filter(call=>call.path==='/v1/admin/jobs/edit?preview=captain-receipt'&&call.body===null).length,1);
  assert.equal(h.calls.some(call=>/\/job\/create$|\/preflight$/.test(call.path)),false);
});

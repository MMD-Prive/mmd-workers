import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { webcrypto } from 'node:crypto';
import { renderOwnerJobEdit } from './src/owner-job-edit-page.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
test('owner can choose Mek, review and press final Save with separated customer/model amounts',async()=>{
 let submitted;
 const dom=new JSDOM(renderOwnerJobEdit(),{url:'https://mmdbkk.com/internal/admin/jobs/edit?session_id=sess_fixture',runScripts:'dangerously',beforeParse(w){
 Object.defineProperty(w,'crypto',{value:webcrypto});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async(url,opts={})=>{let d;if(url.includes('history='))d={ok:true,history:[]};else if(url.includes('/models?'))d={ok:true,models:[{id:'recBBBBBBBBBBBBBB',name:'Mek'}]};else if(opts.method==='POST'){submitted=JSON.parse(opts.body);d={ok:true,amount:23000,payout:14000,paid:4700,remaining:18300};}else d={ok:true,revision:'fixture-revision',job:{session_id:'sess_fixture',client:'ลูกค้าทดสอบ',model_id:'recAAAAAAAAAAAAAA',model_name:'Film IT',date:'2026-10-26',location:'สถานที่ทดสอบ',paid:4700,travel:0,model_travel:0,pricing:{client_base_amount_thb:12500,model_base_payout_thb:7000,addons:[{option:'mk',client_amount_thb:3000,model_payout_thb:1500}]}}};return {ok:true,json:async()=>d};};
 }});
 try{await tick();const w=dom.window,d=w.document,$=id=>d.getElementById(id);
 assert.equal($('editor').hidden,false);$('search').value='Mek';$('searchButton').click();await tick();$('results').querySelector('button').click();assert.equal($('modelName').textContent,'Mek');
 for(const [id,value]of [['clientBase','20000'],['modelBase','12000'],['m_mk','2000'],['reason','เปลี่ยนน้องตามที่ตกลง']]){$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
 assert.match($('total').textContent,/23,000/);assert.match($('payout').textContent,/14,000/);assert.match($('remaining').textContent,/18,300/);
 $('editor').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal($('confirm').open,true);assert.equal(submitted,undefined);$('save').click();await tick();assert.equal(submitted.model_id,'recBBBBBBBBBBBBBB');assert.equal(submitted.model_base,12000);assert.equal(submitted.client_base,20000);assert.equal(submitted.addons[0].model_payout_thb,2000);assert.match($('message').textContent,/บันทึกแล้ว/);assert.equal($('confirm').open,false);
 }finally{dom.window.close();}
});

import { setup as captainFixture, actor as captainActor } from './owner-job-edit-captain-fixture.mjs';
import { CAPTAIN } from './src/owner-job-edit-captain.js';
import { handleOwnerJobEdit, S, J } from './src/owner-job-edit.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';

globalThis.crypto ||= webcrypto;
async function until(predicate, label) {
 const deadline=Date.now()+3000;
 while(!predicate()){if(Date.now()>deadline)throw Error('Timed out: '+label);await tick();}
}
async function captainBrowser({loseFirstSaveReply=false}={}) {
 const previousFetch=globalThis.fetch,h=captainFixture(),posts=[],responses=[];
 h.env.JOB_EDIT_COORDINATOR={getByName:id=>{assert.equal(id,CAPTAIN.session);return h.journal;}};
 const cookie=await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'),captainActor,h.env);
 let lost=false;
 const dom=new JSDOM(renderOwnerJobEdit(),{url:'https://mmdbkk.com/internal/admin/jobs/edit?session_id='+CAPTAIN.session,runScripts:'dangerously',beforeParse(w){
   Object.defineProperty(w,'crypto',{value:webcrypto});
   w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
   w.HTMLDialogElement.prototype.close=function(){this.open=false;};
   // No real network, Airtable, Payment issuer, or MY Partner upload API is used.
   w.fetch=async(url,options={})=>{
     const u=new URL(url,w.location.href);assert.equal(u.origin,'https://mmdbkk.com');assert.equal(u.pathname,'/v1/admin/jobs/edit');
     const isWrite=options.method==='POST';if(isWrite)posts.push(options.body);
     const req=new Request(u,{method:options.method||'GET',headers:{cookie:'mmd_admin_gate_v1='+cookie,origin:u.origin,'content-type':'application/json'},...(isWrite?{body:options.body}:{})});
     const response=await handleOwnerJobEdit(req,h.env);responses.push({method:req.method,status:response.status});
     if(isWrite&&loseFirstSaveReply&&!lost&&response.ok){lost=true;throw Error('Simulated lost response after commit');}
     return response;
   };
 }});
 return {h,posts,responses,dom,$:id=>dom.window.document.getElementById(id),close(){dom.window.close();globalThis.fetch=previousFetch;}};
}
test('JSDOM Captain: actual Owner API and journal, Back preserves proposal, duplicate save never collects', {timeout:5000},async()=>{
 const b=await captainBrowser({loseFirstSaveReply:true});const {$,h}=b;
 try{
   await until(()=>$('captainAmend').hidden===false&&!$('captainAmend').disabled,'load existing job');
   $('captainAmend').click();await until(()=>$('confirm').open,'preview');
   const summary=$('confirmText').textContent;
   for(const expected of ['EMs20 - Zero','Kendo','33,000','23,000','7,500','25,500','รวมค่าตัวโมเดลและค่าดูแล'])assert.ok(summary.includes(expected),expected);
   $('back').click();assert.equal($('confirm').open,false);assert.deepEqual(h.writes,[]);assert.equal(b.posts.length,0);
   $('captainAmend').click();await until(()=>$('confirm').open&&!$('save').disabled,'review again');
   assert.equal($('confirmText').textContent,summary);
   $('save').click();$('save').click();
   await until(()=>$('retry').hidden===false&&!$('retry').disabled,'retry lost reply');
   assert.equal(b.posts.length,1);assert.deepEqual(h.writes,['job','session']);
   $('retry').click();await until(()=>$('message').textContent.includes('บันทึกแล้ว'),'same-request retry');
   assert.equal(b.posts.length,2);assert.equal(b.posts[0],b.posts[1]);assert.deepEqual(h.writes,['job','session']);
   assert.equal(h.session.fields[S.amount],33000);assert.equal(h.job.fields[J.amount],33000);
   assert.equal(h.session.fields[S.name],'EMs20 - Zero');assert.equal(h.job.fields[J.name],'EMs20 - Zero');
   assert.equal(h.session.fields[S.deposit],7500);assert.equal(h.session.fields[S.due],25500);
   const source=JSON.parse(h.session.fields[S.source]);assert.equal(source.partner_cost_thb,23000);assert.equal(source.partner_rate_includes_model,true);assert.equal(source.settlement_mode,'bundled_partner_rate');
   assert.equal(h.payments.length,1);assert.equal(h.payments[0].fields.fldvCSwrUW8OMAooS,7500);
   assert.ok(h.payCalls.every(path=>path==='/v1/internal/payments/balance'));assert.equal(h.memory.has('pending'),false);
   assert.equal([...h.memory.keys()].filter(k=>k.startsWith('audit:')).length,1);
   assert.match($('message').textContent,/ต้นทุนรวม Kendo 23,000/);assert.match($('message').textContent,/25,500/);
 }finally{b.close();}
});
for(const [label,change,message,status]of [
 ['relationship absent (not inferred from MY Partner uploads)',h=>h.relations=false,/ยืนยันว่า EMs20 อยู่กับ Kendo/,409],
 ['source unreadable',h=>h.sourceUnavailable=true,/อ่านความสัมพันธ์/,503],
 ['existing confirmation URL unresolved',h=>h.session.fields[S.customerLink]='https://fixture.invalid/opaque',/ลิงก์ยืนยันเดิม/,409],
])test('JSDOM Captain preview stops: '+label,{timeout:5000},async()=>{
 const b=await captainBrowser();try{
   await until(()=>!b.$('captainAmend').hidden&&!b.$('captainAmend').disabled,'job');change(b.h);
   b.$('captainAmend').click();await until(()=>b.responses.some(r=>r.status===status)&&!b.$('captainAmend').disabled,'rejection');
   assert.equal(b.$('confirm').open,false);assert.equal(b.$('save').disabled,true);assert.match(b.$('message').textContent,message);
   assert.deepEqual(b.h.writes,[]);assert.equal(b.posts.length,0);
 }finally{b.close();}
});
test('JSDOM Captain: relationship changed after review stops final Save without collecting',{timeout:5000},async()=>{
 const b=await captainBrowser();try{
   await until(()=>!b.$('captainAmend').hidden&&!b.$('captainAmend').disabled,'job');
   b.$('captainAmend').click();await until(()=>b.$('confirm').open&&!b.$('save').disabled,'review');
   b.h.relations=false;b.$('save').click();
   await until(()=>b.responses.some(r=>r.method==='POST'&&r.status===409)&&!b.$('confirm').open,'blocked save');
   assert.deepEqual(b.h.writes,[]);assert.equal(b.h.payments.length,1);assert.ok(b.h.payCalls.every(p=>p.endsWith('/balance')));
 }finally{b.close();}
});

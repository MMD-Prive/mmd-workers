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

test('cancel reads a fresh revision and reload sends the original revision to endpoint in recovery mode', async () => {
 const {handleAdminJobVoidRequest} = await import('./src/admin-job-void.js');
 const {JobEditJournal} = await import('./src/owner-job-edit-coordinator.js');
 const {revision} = await import('./src/owner-job-edit.js');
 const sessionId = 'sess_fixture';
 const fresh = 'a'.repeat(64);
 const actor = {id:'fixture-owner',role:'owner'};
 const calls = [];
 const entries = new Map();
 const storage = {get:async k=>entries.get(k),delete:async k=>entries.delete(k)};
 let coordinator = new JobEditJournal(storage,{});
 const env = {JOB_EDIT_COORDINATOR:{getByName(id){assert.equal(id,sessionId);return coordinator;}}};
 const job = {session_id:sessionId,client:'Fixture',model_id:'recAAAAAAAAAAAAAA',model_name:'Film',
   travel:0,model_travel:0,paid:0,pricing:{client_base_amount_thb:100,model_base_payout_thb:50,addons:[]}};
 let reads = 0;
 function open(saved){
   return new JSDOM(renderOwnerJobEdit(),{url:'https://mmdbkk.com/internal/admin/jobs/edit?session_id='+sessionId,
     runScripts:'dangerously',beforeParse(w){
       w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
       w.HTMLDialogElement.prototype.close=function(){this.open=false;};
       if(saved)w.sessionStorage.setItem('mmd:cancel:'+sessionId,saved);
       w.fetch=async(url,opts)=>{
         if(url.includes('history='))return Response.json({ok:true,history:[]});
         if(url.includes('/jobs/edit?'))return Response.json({ok:true,job,revision:++reads===1?'b'.repeat(64):fresh});
         assert.equal(url,'/v1/admin/job/void');
         const body=JSON.parse(opts.body);
         calls.push(body);
         if(!body.recover){
           const hash=await revision({body:{session_id:sessionId,revision:fresh,reason:''},actor});
           entries.set('void:done:'+hash,{ok:true,voided:true,session_id:sessionId});
           throw Error('lost response');
         }
         return handleAdminJobVoidRequest(new Request('https://mmdbkk.com'+url,{
           method:'POST',headers:{origin:'https://mmdbkk.com'},body:opts.body,
         }),env,actor);
       };
     }});
 }
 let dom=open();
 try{
   const first=dom.window.document;
   await tick();
   await first.getElementById('reviewVoid').onclick();
   assert.equal(first.getElementById('voidDialog').open,true);
   assert.equal(calls.length,0);
   first.getElementById('submitVoid').click();
   await tick();
   const saved=dom.window.sessionStorage.getItem('mmd:cancel:'+sessionId);
   assert.equal(JSON.parse(saved).revision,fresh);
   dom.window.close();
   coordinator=new JobEditJournal(storage,{});
   dom=open(saved);
   const second=dom.window.document;
   assert.equal(second.getElementById('recoverVoid').hidden,false);
   second.getElementById('recoverVoid').click();
   await tick();
   assert.deepEqual(calls.map(x=>[x.revision,x.recover]),[[fresh,false],[fresh,true]]);
   assert.equal(second.getElementById('voidStatus').textContent,'ยกเลิกงานแล้ว');
   assert.equal(dom.window.sessionStorage.getItem('mmd:cancel:'+sessionId),null);
 }finally{dom.window.close();}
});

test('receipt not found unlocks fresh review without submitting cancel again', async () => {
 const id = 'sess_fixture';
 const previous = 'a'.repeat(64);
 const fresh = 'c'.repeat(64);
 const key = 'mmd:cancel:'+id;
 const calls = [];
 const dom = new JSDOM(renderOwnerJobEdit(), {
   url:'https://mmdbkk.com/internal/admin/jobs/edit?session_id='+id,
   runScripts:'dangerously',
   beforeParse(w){
     w.sessionStorage.setItem(key, JSON.stringify({session_id:id,revision:previous,confirm:true}));
     w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
     w.HTMLDialogElement.prototype.close=function(){this.open=false;};
     w.fetch=async(url,opts)=>{
       if(url.includes('history='))return Response.json({ok:true,history:[]});
       if(url.includes('/jobs/edit?'))return Response.json({ok:true,revision:fresh,job:{
         session_id:id, pricing:{addons:[]},
       }});
       assert.equal(url,'/v1/admin/job/void');
       const body=JSON.parse(opts.body);
       calls.push(body);
       return body.recover
         ? Response.json({ok:false,error:'void_receipt_not_found'},{status:404})
         : Response.json({ok:true});
     };
   },
 });
 try{
   const get = id => dom.window.document.getElementById(id);
   await get('recoverVoid').onclick();
   assert.equal(dom.window.sessionStorage.getItem(key),null);
   assert.equal(get('reviewVoid').disabled,false);
   assert.equal(get('recoverVoid').hidden,true);
   assert.deepEqual(calls.map(x=>[x.revision,x.recover]),[[previous,true]]);
   await get('reviewVoid').onclick();
   assert.equal(get('voidDialog').open,true);
   assert.equal(calls.length,1);
   await get('submitVoid').onclick();
   assert.deepEqual(calls.map(x=>[x.revision,x.recover]),[[previous,true],[fresh,false]]);
 }finally{dom.window.close();}
});

// --- Cancel UI regressions (late response A -> B, visible success, resend, recovery) ---
const REV_A = 'a'.repeat(64);
function openCancelPage(sessionId, {saved, voidReply} = {}) {
 const urls = [], voidCalls = [];
 const jobFor = id => ({session_id:id,client:'Client '+id,model_id:'recAAAAAAAAAAAAAA',model_name:'Model '+id,
   date:'2026-12-01',location:'BKK',travel:0,model_travel:0,paid:0,
   pricing:{client_base_amount_thb:100,model_base_payout_thb:50,addons:[]}});
 const dom = new JSDOM(renderOwnerJobEdit(), {
   url:'https://mmdbkk.com/internal/admin/jobs/edit?session_id='+sessionId,
   runScripts:'dangerously',
   beforeParse(w){
     w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
     w.HTMLDialogElement.prototype.close=function(){this.open=false;};
     if(saved)w.sessionStorage.setItem('mmd:cancel:'+sessionId,JSON.stringify(saved));
     w.fetch=async(url,opts)=>{
       urls.push(url);
       if(url.includes('history='))return Response.json({ok:true,history:[]});
       if(url.includes('list=1'))return Response.json({ok:true,jobs:[]});
       if(url.includes('/jobs/edit?')){
         const id=new URL(url,'https://mmdbkk.com').searchParams.get('session_id');
         return Response.json({ok:true,job:jobFor(id),revision:REV_A});
       }
       assert.equal(url,'/v1/admin/job/void');
       const body=JSON.parse(opts.body);
       voidCalls.push(body);
       return voidReply(body);
     };
   },
 });
 return {dom, urls, voidCalls, get: id => dom.window.document.getElementById(id)};
}
const okReply = body => Response.json({ok:true,voided:true,session_id:body.session_id});
async function startCancel(page) {
 await tick();
 await page.get('reviewVoid').onclick();
 assert.equal(page.get('voidDialog').open,true);
}

test('late cancel response for job A cannot hide or replace job B', async () => {
 let release;
 const page = openCancelPage('sess_A', {voidReply: body => new Promise(r => { release = () => r(okReply(body)); })});
 try {
   await startCancel(page);
   page.get('submitVoid').click();
   await tick();
   // While A is still pending, try to open B the way the lookup form / job list does.
   page.get('session').value = 'sess_B';
   page.get('lookup').dispatchEvent(new page.dom.window.Event('submit',{cancelable:true}));
   await tick();
   assert.equal(page.urls.some(u => u.includes('session_id=sess_B')), false);
   assert.equal(page.get('client').textContent, 'Client sess_A');
   release();
   await tick();
   assert.equal(page.get('editor').hidden, true);
   assert.match(page.get('message').textContent, /sess_A/);
   // After A has finished, B opens normally and keeps its own cancel box.
   page.get('session').value = 'sess_B';
   page.get('lookup').dispatchEvent(new page.dom.window.Event('submit',{cancelable:true}));
   await tick();
   assert.equal(page.get('editor').hidden, false);
   assert.equal(page.get('client').textContent, 'Client sess_B');
   assert.equal(page.get('cancelJob').hidden, false);
   assert.equal(page.voidCalls.length, 1);
 } finally { page.dom.window.close(); }
});

test('cancel success message is outside the hidden cancel box', async () => {
 const page = openCancelPage('sess_A', {voidReply: okReply});
 try {
   await startCancel(page);
   page.get('submitVoid').click();
   await tick();
   assert.equal(page.get('cancelJob').hidden, true);
   assert.equal(page.get('editor').hidden, true);
   assert.match(page.get('message').textContent, /ยกเลิกงานแล้ว/);
   assert.equal(page.get('message').closest('[hidden]'), null);
   assert.equal(page.dom.window.sessionStorage.getItem('mmd:cancel:sess_A'), null);
 } finally { page.dom.window.close(); }
});

test('double press on confirm cancel sends one write', async () => {
 let release;
 const page = openCancelPage('sess_A', {voidReply: body => new Promise(r => { release = () => r(okReply(body)); })});
 try {
   await startCancel(page);
   page.get('submitVoid').click();
   page.get('submitVoid').click();
   await tick();
   release();
   await tick();
   assert.equal(page.voidCalls.length, 1);
   assert.equal(page.voidCalls[0].recover, false);
 } finally { page.dom.window.close(); }
});

test('recovery after reload reuses the saved revision and shows a visible result', async () => {
 const saved = {session_id:'sess_A',revision:REV_A,confirm:true};
 const page = openCancelPage('sess_A', {saved, voidReply: okReply});
 try {
   await tick();
   assert.equal(page.get('recoverVoid').hidden, false);
   assert.equal(page.get('reviewVoid').disabled, true);
   page.get('recoverVoid').click();
   await tick();
   assert.deepEqual(page.voidCalls.map(x => [x.revision, x.recover]), [[REV_A, true]]);
   assert.match(page.get('message').textContent, /ยกเลิกงานแล้ว/);
   assert.equal(page.get('message').closest('[hidden]'), null);
   assert.equal(page.dom.window.sessionStorage.getItem('mmd:cancel:sess_A'), null);
 } finally { page.dom.window.close(); }
});

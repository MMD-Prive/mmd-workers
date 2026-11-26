import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {partnerModelsPage} from '../src/partner-models-page.js';
const id='a'.repeat(32),m1='b'.repeat(32),m2='c'.repeat(32),flush=()=>new Promise(r=>setTimeout(r,20));
test('partner sees a two-person combined quote and submits two selected models together',async()=>{
 const errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const brief={date:'2030-01-01',time:'20:00',location:'Studio',duration:'2 hours',budget:15000,spec:'Test',format:'VIP + MK',extra:'',requestedCount:2,services:['VIP','MK'],pricing:{mode:'total',basis:'all',amount:15000}};
 const view={ok:true,jobId:id,title:'Two models',revision:1,expiresAt:new Date(Date.now()+86400000).toISOString(),brief,models:[m1,m2].map((id,i)=>({id,name:'Model '+i,status:'pending',photos:[]}))};
 const dom=new JSDOM(partnerModelsPage,{url:'https://mmdbkk.com/partner/models#s='+id+'&t='+'x'.repeat(43),runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.crypto.randomUUID=()=> 'synthetic-request-12345';w.fetch=async(path,opts={})=>{calls.push({path,...opts});return Response.json(path.endsWith('/selection')?{ok:true,revision:2,receiptId:'receipt-test'}:view);};}});
 try{await flush();const d=dom.window.document;assert.equal(d.getElementById('workspace').hidden,false);assert.match(d.getElementById('briefValues').textContent,/2 คน/);assert.match(d.getElementById('briefValues').textContent,/15,000/);
 for(const id of [m1,m2])d.querySelector('[data-pick="'+id+'"]').click();assert.equal(d.getElementById('footerCount').textContent,'2');d.getElementById('reviewSelection').click();d.getElementById('submitSelection').click();await flush();
 const payload=JSON.parse(calls.find(x=>x.path.endsWith('/selection')).body);assert.deepEqual(payload.modelIds,[m1,m2]);assert.equal(errors.length,0);
 }finally{dom.window.close();}
});

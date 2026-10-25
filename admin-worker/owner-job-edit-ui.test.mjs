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

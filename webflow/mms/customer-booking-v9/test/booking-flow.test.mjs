import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {responseFor} from './fixture.mjs';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const original=[0,1,2,3].map(i=>read('./fixtures/embed-'+i+'.html'));
const candidate=original.map((s,i)=>i===1?read('../guided-compat.html'):i===3?read('../booking.html'):s);
const scripts=s=>[...s.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m=>({src:/src="([^"]+)"/.exec(m[1])?.[1],body:m[2],id:/id="([^"]+)"/.exec(m[1])?.[1]}));
async function settle(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.ok(check(),'fixture UI did not settle');}
async function page(scenario='ready'){
 const dom=new JSDOM('<!doctype html><html><head>'+read('../page-head.html')+'</head><body>'+candidate.join('\n')+read('./fixtures/page-footer.html')+'</body></html>',{url:'http://127.0.0.1/male-massage/member/mms-booking',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];w.AbortController=AbortController;w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(path,options={})=>{calls.push({path,method:options.method||'GET',body:options.body});const f=responseFor(path,options.method||'GET',scenario);return new Response(JSON.stringify(f.body),{status:f.status});};
 let external=0;
 for(const s of scripts(candidate.join('\n')+read('./fixtures/page-footer.html'))){w.eval(s.src?read('./fixtures/core-'+(++external)+'.js'):s.body);}
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 await settle(()=>w.document.querySelector('#mmb2-error').textContent||w.document.querySelectorAll('input[name=skills]').length===8);
 return {w,calls,$:id=>w.document.getElementById(id),close:()=>w.close()};
}
function change(p,id,value){const e=p.$(id);e.value=value;e.dispatchEvent(new p.w.Event('change',{bubbles:true}));}
function choose(p){const e=p.w.document.querySelector('input[name=skills]');e.checked=true;e.dispatchEvent(new p.w.Event('change',{bubbles:true}));p.$('mmb2-recipient-male').checked=true;change(p,'mmb2-zone','BKK-FIXTURE');change(p,'mmb2-date','2099-01-15');change(p,'mmb2-time','14:30');}
test('presentation diff preserves all original scripts, endpoint attributes and input contracts',()=>{
 assert.deepEqual(scripts(candidate.join('\n')).filter(s=>s.id!=='mms-booking-digital-inputs'),scripts(original.join('\n')));
 const old=new JSDOM(original.join('\n')),next=new JSDOM(candidate.join('\n'));
 const fields=dom=>[...dom.window.document.querySelectorAll('input,select,textarea,form')].filter(e=>!e.dataset.digitalControl).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,required:e.required,maxLength:e.maxLength}));
 assert.deepEqual(fields(next),fields(old));assert.equal(next.window.document.querySelectorAll('#mmb2-error').length,1);assert.equal(next.window.document.querySelector('#mmb2-error').closest('[data-booking-stage]'),null);old.window.close();next.window.close();
});
test('verified fixture loads services and preserves three-stage navigation',async()=>{const p=await page();try{assert.equal(p.$('mmb2-gate').hidden,true);assert.equal(p.w.document.querySelectorAll('input[name=skills]').length,8);p.$('mmb2-next').click();assert.equal(p.$('mmb2-service').hidden,true);assert.equal(p.$('mmb2-details').hidden,false);p.$('mmb2-next').click();assert.equal(p.$('mmb2-review').hidden,false);assert.equal(p.$('mmb2-next').disabled,true);}finally{p.close();}});
test('signed-out account keeps the gate and blocks prebooking',async()=>{const p=await page('signed-out');try{assert.equal(p.$('mmb2-gate').hidden,false);assert.equal(p.$('mmb2-submit').disabled,true);await p.w.MMB2.submit({preventDefault(){}});assert.equal(p.calls.some(c=>c.path.endsWith('/prebookings')),false);assert.equal(p.$('mmb2-success').hidden,true);}finally{p.close();}});
test('provider error stays an error and does not become successful booking',async()=>{const p=await page('error');try{assert.ok(p.$('mmb2-error').textContent);assert.equal(p.$('mmb2-error').closest('[hidden]'),null);assert.equal(p.$('mmb2-submit').disabled,true);assert.equal(p.$('mmb2-success').hidden,true);}finally{p.close();}});
test('invalid details and unchecked consent never send a request',async()=>{const p=await page();try{await p.w.MMB2.submit({preventDefault(){}});assert.equal(p.calls.some(c=>c.path.endsWith('/prebookings')),false);choose(p);await p.w.MMB2.submit({preventDefault(){}});assert.match(p.$('mmb2-error').textContent,/ยืนยัน/);assert.equal(p.calls.some(c=>c.path.endsWith('/prebookings')),false);}finally{p.close();}});
test('failed submission preserves original payload and retry request key without fake success',async()=>{const p=await page();try{choose(p);change(p,'mmb2-location-note','สถานที่ตัวอย่างสำหรับทดสอบ');p.$('mmb2-consent').checked=true;await p.w.MMB2.submit({preventDefault(){}});await p.w.MMB2.submit({preventDefault(){}});const requests=p.calls.filter(c=>c.path.endsWith('/prebookings'));assert.equal(requests.length,2);const a=JSON.parse(requests[0].body),b=JSON.parse(requests[1].body);assert.equal(a.idempotency_key,b.idempotency_key);assert.equal(a.zone,'BKK-FIXTURE');assert.equal(a.duration_minutes,90);assert.equal(a.recipient_gender,'male');assert.deepEqual(a.skills,['aroma_therapy_oil']);assert.equal('latitude' in a,false);assert.equal('longitude' in a,false);assert.equal(p.$('mmb2-success').hidden,true);assert.equal(p.$('mmb2-form').hidden,false);assert.match(p.$('mmb2-error').textContent,/พรีวิว/);}finally{p.close();}});
test('minimum duration and maximum six selections remain unchanged',async()=>{const p=await page();try{assert.equal(p.$('mmb2-duration').value,'90');const boxes=[...p.w.document.querySelectorAll('input[name=skills]')];for(const e of boxes){e.checked=true;e.dispatchEvent(new p.w.Event('change',{bubbles:true}));}assert.equal(p.w.MMB2.skill().length,6);assert.match(p.$('mmb2-skill-error').textContent,/6/);}finally{p.close();}});

test('digital picks mirror only canonical options and preserve original payload values',async()=>{const p=await page();try{const duration=p.w.document.querySelector('[data-digital-for="mmb2-duration"]');const radio=duration.querySelector('input[value="120"]');radio.click();assert.equal(p.$('mmb2-duration').value,'120');change(p,'mmb2-duration','90');assert.equal(duration.querySelector('input[value="90"]').checked,true);const zone=p.w.document.querySelector('[data-digital-for="mmb2-zone"]');const search=zone.querySelector('input[type="search"]');search.value='no fixture';search.dispatchEvent(new p.w.Event('input',{bubbles:true}));assert.equal(zone.querySelectorAll('input[type="radio"]').length,0);assert.match(zone.textContent,/ไม่พบตัวเลือก/);assert.equal(p.calls.some(c=>c.method==='POST'),false);}finally{p.close();}});
test('digital picker follows dynamic source readiness and preserves focus on selection',async()=>{const p=await page();try{const source=p.$('mmb2-duration'),shell=p.w.document.querySelector('[data-digital-for="mmb2-duration"]');const choice=shell.querySelector('input[value="120"]');choice.focus();choice.click();assert.equal(p.w.document.activeElement.value,'120');assert.equal(source.value,'120');source.disabled=true;await settle(()=>shell.querySelector('fieldset').disabled);source.disabled=false;source.add(new p.w.Option('ตัวเลือกจาก fixture','240'));await settle(()=>shell.querySelector('input[value="240"]'));assert.equal(shell.querySelector('fieldset').disabled,false);assert.equal(p.calls.some(c=>c.method==='POST'),false);}finally{p.close();}});
test('embedded digital adapter is the reviewed editable source',()=>{const adapter=scripts(read('../booking.html')).find(s=>s.id==='mms-booking-digital-inputs');assert.equal(adapter.body.trim(),read('../digital-inputs.js').trim());});

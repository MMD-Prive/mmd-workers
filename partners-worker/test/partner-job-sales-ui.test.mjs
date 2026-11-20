import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {build} from 'esbuild';
import {fixture,apiModule,SESSION} from './helpers/partner-fixture.mjs';
const js=(await build({entryPoints:[new URL('../src/partner-job-sales-ui.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
const {PARTNER_JOB_SALES_JS}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(fn){for(let i=0;i<50;i++){if(fn())return;await pause();}assert.fail('UI did not settle');}
test('UI persists per-job proposal through real handlers and keeps failed input',async t=>{
 const f=await fixture();t.after(f.restore);const w=new Window({url:'https://www.mmdbkk.com/?t=fixture'});t.after(()=>w.happyDOM.close());
 let failSave=false;
 w.bridge=async(path,options)=>{if(failSave&&options)throw Error('Temporary failure');const response=await f.call(path,{method:options?.method,body:options?.body?JSON.parse(options.body):undefined,headers:options?.headers});const payload=await response.json();if(!response.ok)throw Error(payload.error.message);return payload;};
 w.document.write('<div id="root"><div id="host"></div></div>');
 w.eval(`var root=document.querySelector('#root'),state={authBlocked:false,stale:false};var api=window.bridge;var stableSubmissionKey=()=> 'ui-stable-test-key';var completedSubmission=()=>{};${PARTNER_JOB_SALES_JS}`);
 const mount=async()=>{w.document.querySelector('#host').replaceChildren();w.mountJobSales(w.document.querySelector('#host'),SESSION);await waitFor(()=>w.document.querySelector('form'));return w.document.querySelector('form');};
 let form=await mount();form.elements.system.value='bridge';form.elements.system.dispatchEvent(new w.Event('change'));assert.equal(form.querySelector('[data-bridge-field]').hidden,false);assert.equal(form.querySelector('[data-profit-field]').hidden,true);
 form.elements.source_rate_thb.value='6000';form.elements.customer_sell_rate_thb.value='9000';form.elements.commission_percent.value='7';form.elements.note.value='UI fixture';form.elements.share_with_mmd.checked=true;
 form.dispatchEvent(new w.Event('submit',{cancelable:true}));await waitFor(()=>w.document.querySelector('[data-sales-status]').textContent.startsWith('บันทึกข้อเสนอของงานนี้แล้ว'));
 form=await mount();assert.equal(form.elements.system.value,'bridge');assert.equal(form.elements.source_rate_thb.value,'6000');
 form.elements.system.value='profit_share';form.elements.system.dispatchEvent(new w.Event('change'));assert.equal(form.querySelector('[data-profit-field]').hidden,false);assert.equal(form.querySelector('[data-bridge-field]').hidden,true);
 form.elements.partner_share_percent.value='55';form.elements.share_with_mmd.checked=true;failSave=true;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await waitFor(()=>w.document.querySelector('[data-sales-status]').textContent.includes('Temporary failure'));assert.equal(form.elements.partner_share_percent.value,'55');assert.equal(form.elements.system.value,'profit_share');assert.equal(form.querySelector('button').disabled,false);
 assert.equal(f.writes.length,0);assert.equal(f.messages.length,0);
});

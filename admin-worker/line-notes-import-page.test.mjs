import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {renderLineNotesImportPage} from './src/line-notes-import-page.js';

async function ui(replies) {
 const input={line_user_id:'U'+'a'.repeat(32),current_line_rename:'fixture',raw_line_notes:'fixture completed service',reason:'reviewed fixture',service_date:'2026-09-01',service_amount_thb:'2500',model_name:'fixture',confirmed:'on'};
 const nodes=new Map(),calls=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{hidden:true,children:[],listeners:{},addEventListener(event,fn){this.listeners[event]=fn},replaceChildren(){this.children=[]},append(child){this.children.push(child)}});return nodes.get(id)}
 const html=await renderLineNotesImportPage().text();
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{
  document:{getElementById:node,createElement:()=>({})},crypto:webcrypto,TextEncoder,
  FormData:class{constructor(){return Object.entries(input)}},
  fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return replies.shift()()},
 });
 return {input,nodes,calls,submit:()=>node('intake').listeners.submit({preventDefault(){}}),retry:()=>node('retry').listeners.click()};
}

test('reviewed form imports then refreshes the matched client and shows actual points',async()=>{
 const page=await ui([()=>Response.json({ok:true,canonical_client_id:'recFixtureClient'}),()=>Response.json({ok:true,points:{value:25},recovery:{state:'reconciled'}})]);
 await page.submit();assert.equal(page.calls.length,2);assert.equal(page.calls[0].body.service_history_candidate.service_amount_thb,2500);
 assert.deepEqual(page.calls[1].body,{client_id:'recFixtureClient',confirm_reviewed:true});
 assert.match(page.nodes.get('status').textContent,/25 Points/);assert.equal(page.nodes.get('progress').value,100);
 assert.match(page.nodes.get('next').children[1].href,/recovery\?client_id=recFixtureClient/);
});

test('failed refresh keeps evidence and retries only recovery, never a second import',async()=>{
 const page=await ui([()=>Response.json({ok:true,canonical_client_id:'recFixtureClient'}),()=>Response.json({ok:false,error:'unavailable'},{status:503}),()=>Response.json({ok:true,points:{value:25}})]);
 await page.submit();assert.equal(page.nodes.get('retry').hidden,false);assert.match(page.nodes.get('status').textContent,/Note บันทึกไว้แล้ว/);
 await page.retry();assert.equal(page.calls.filter(x=>x.url.endsWith('/line-ofc/import')).length,1);assert.equal(page.nodes.get('retry').hidden,true);
 assert.equal(page.input.raw_line_notes,'fixture completed service');
});

test('unconfirmed service amounts cannot be submitted',async()=>{
 const page=await ui([]);delete page.input.confirmed;await page.submit();assert.equal(page.calls.length,0);assert.match(page.nodes.get('status').textContent,/ยืนยัน/);
});

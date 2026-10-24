import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {decorateCeoModels} from '../src/ceo-models-page.mjs';
import {modelsClient} from '../src/ceo-models-client.mjs';

const source='<html><head></head><body><section id="model-supply-v3"><strong data-total>0</strong></section><script>var r=document.getElementById("model-supply-v3"); oldRuntime()</script></body></html>';
test('only replaces the authenticated Models HTML runtime once and preserves response metadata',async()=>{
 const req=new Request('https://example.com/internal/ceo/models');
 const res=await decorateCeoModels(req,new Response(source,{headers:{'content-type':'text/html','x-auth':'passed','etag':'old'}}));
 const html=await res.text();assert.match(html,/data-ceo-models-runtime/);assert.doesNotMatch(html,/oldRuntime/);assert.match(html,/<strong data-total>—/);assert.equal(res.headers.get('x-auth'),'passed');assert.equal(res.headers.get('etag'),null);
 for(const url of ['/internal/admin/models','/internal/ceo/models-extra']){const original=new Response(source);assert.equal(await decorateCeoModels(new Request('https://example.com'+url),original),original)}
 const denied=new Response('login',{status:401,headers:{'content-type':'text/html'}});assert.equal(await decorateCeoModels(req,denied),denied);
 const drift=source.replace('var r=document','var changed=document');assert.equal(await (await decorateCeoModels(req,new Response(drift,{headers:{'content-type':'text/html'}}))).text(),drift);
});
function harness(reviewOk=true){
 const nodes=new Map();const node=s=>{if(!nodes.has(s))nodes.set(s,{textContent:'0',innerHTML:'',disabled:false,setAttribute(){},value:''});return nodes.get(s)};
 const root={querySelector:node,querySelectorAll:()=>['[data-total]','[data-multi]','[data-ready]','[data-family="A"]'].map(node),setAttribute(){},addEventListener(){}};
 const calls=[];let release;const gate=new Promise(r=>release=r);
 const fetch=async url=>{calls.push(url);await gate;const data=url.includes('review-queue')?(reviewOk?{items:[]}:{error:'unavailable'}):url.includes('models/list')?{items:[{id:'rec1',fields:{working_name:'Travel Name',compcard_family:'A'}},{id:'rec2',fields:{compcard_family:'B'}}]}:{};return {status:200,ok:!url.includes('review-queue')||reviewOk,headers:{get:()=> 'application/json'},json:async()=>data}};
 vm.runInNewContext('('+modelsClient.toString()+')()',{document:{getElementById:()=>root,addEventListener(){}},fetch,AbortSignal,location:{pathname:'/internal/ceo/models'},URL});
 return {node,calls,release};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('shows unknown while loading, reads Airtable fields, avoids classifying names, labels partial inventory',async()=>{
 const h=harness();assert.equal(h.node('[data-total]').textContent,'—');assert.equal(h.node('[data-refresh]').disabled,true);
 h.node('[data-refresh]').onclick();assert.equal(h.calls.length,2);
 h.release();await settle();await settle();
 assert.equal(h.node('[data-family="A"]').textContent,1);assert.equal(h.node('[data-family="B"]').textContent,1);assert.equal(h.node('[data-family="C"]').textContent,0);
 assert.equal(h.node('[data-ready]').textContent,'—');assert.match(h.node('[data-supply-state]').textContent,/สูงสุด 100/);assert.equal(h.node('[data-state]').textContent,'โหลดครบ 100%');assert.equal(h.node('[data-refresh]').disabled,false);
});
test('review errors remain visible and do not become ready or zero-count results',async()=>{
 const h=harness(false);h.release();await settle();await settle();
 assert.equal(h.node('[data-review-count]').textContent,'—');assert.match(h.node('[data-review-state]').textContent,/ไม่สำเร็จ/);assert.match(h.node('[data-state]').textContent,/บางส่วน/);assert.equal(h.node('[data-refresh]').disabled,false);
});

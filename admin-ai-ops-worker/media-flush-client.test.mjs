import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=await readFile(new URL('./src/gate.js',import.meta.url),'utf8');
const client=vm.runInNewContext(source.slice(source.indexOf('const MEDIA_FLUSH_CLIENT_LAYER = ')).replace('const MEDIA_FLUSH_CLIENT_LAYER = ','').trim().replace(/;$/,''));
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.style={};}
 append(...nodes){this.children.push(...nodes);}appendChild(node){this.children.push(node);return node;}prepend(node){this.children.unshift(node);}setAttribute(k,v){this.attrs[k]=v;}replaceChildren(...nodes){this.children=nodes;}
 querySelector(){return this.children.find(n=>n.attrs['data-mmd-media-flush']);}
}
function page(fetch,storage=new Map()){
 const host=new Node('host'),head=new Node('head'),document={head,body:{},documentElement:{},readyState:'complete',createElement:tag=>new Node(tag),querySelector:()=>host};
 vm.runInNewContext(client,{window:{},document,location:{pathname:'/internal/admin/dashboard'},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,fetch,AbortController,MutationObserver:class{observe(){}},setTimeout:(fn,ms)=>setTimeout(fn,ms>=100000?10000:0),clearTimeout,Date,Promise});
 const panel=host.children[0];return {storage,button:panel.children.find(n=>n.tag==='button'&&n.textContent.startsWith('FLUSH')),fresh:panel.children.find(n=>n.textContent==='ตรวจสื่อใหม่'),status:panel.children.find(n=>n.attrs.role==='status')};
}
const complete=()=>Response.json({ok:true,mode:'private_staging',state:'pending_review',completed_count:797,total_candidates:797,source_scan_complete:true,continue_required:false,checked_at:new Date().toISOString()});
test('lost start response, repeat click and reload retain the same run; new scan is explicit',async()=>{
 const runs=new Set(),ids=[],signals=[];let lose=true;
 const fetch=async(_,init)=>{signals.push(init.signal);const input=JSON.parse(init.body);if(input.action==='review_queue')return Response.json({ok:true,items:[],incomplete:false});ids.push(input.run_id);runs.add(input.run_id);if(lose){lose=false;throw new TypeError('lost reply');}return complete();};
 const first=page(fetch);await first.button.onclick();assert.equal(runs.size,1);assert.equal(ids[0],ids[1]);assert.match(first.status.textContent,/797\/797/);
 await first.button.onclick();assert.equal(runs.size,1);
 const reloaded=page(fetch,first.storage);await reloaded.button.onclick();assert.equal(runs.size,1);assert.equal(new Set(signals).size,signals.length);
 await reloaded.fresh.onclick();assert.equal(runs.size,2);
});
test('persistent outage pauses safely and the next click resumes the saved run',async()=>{
 const ids=[];let online=false;
 const fetch=async(_,init)=>{const input=JSON.parse(init.body);if(input.action==='review_queue')return Response.json({ok:true,items:[]});ids.push(input.run_id);return online?complete():Response.json({ok:false,error:'media_flush_preview_unavailable'},{status:503});};
 const p=page(fetch);await p.button.onclick();assert.equal(ids.length,5);assert.equal(new Set(ids).size,1);assert.match(p.status.textContent,/หยุดชั่วคราว/);assert.equal(p.button.disabled,false);
 online=true;await p.button.onclick();assert.equal(new Set(ids).size,1);assert.match(p.status.textContent,/797\/797/);
});

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
 vm.runInNewContext(client,{window:{},document,location:{pathname:'/internal/admin/dashboard'},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,fetch,URL,AbortSignal,AbortController,MutationObserver:class{observe(){}},setTimeout:(fn,ms)=>setTimeout(fn,ms>=100000?10000:0),clearTimeout,Date,Promise});
 const panel=host.children[0];return {panel,storage,button:panel.children.find(n=>n.tag==='button'&&n.textContent.startsWith('FLUSH')),fresh:panel.children.find(n=>n.textContent==='ตรวจสื่อใหม่'),status:panel.children.find(n=>n.attrs.role==='status')};
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

function descendants(node){return [node,...node.children.flatMap(descendants)];}
test('queue loads 797 unique rows, filters Hidden, opens private media and saves a model proposal without approval',async()=>{
 const items=Array.from({length:797},(_,i)=>({id:'rec'+String(i).padStart(14,'0'),intake_id:String(i).padStart(64,'a'),category:i<117?'farang':'up_country',visibility:i===796?'hidden':'review',source_visibility:'review',mime:'image/jpeg',revision:'b'.repeat(64),model:null}));let saves=0;const actions=[];
 const fetch=async(_,init)=>{const input=JSON.parse(init.body);actions.push(input.action);
 if(input.action==='review_queue'){const start=Number(input.cursor||0);return Response.json({ok:true,items:items.slice(start,start+100),cursor:start+100<797?String(start+100):null});}
 if(input.action==='review_media')return new Response(new Uint8Array([255,216,255,1]),{headers:{'content-type':'image/jpeg'}});
 if(input.action==='review_models')return Response.json({ok:true,items:[{id:'rec00000000009999',name:'Synthetic Model',key:'TEST'}]});
 if(input.action==='review_save'){saves++;assert.equal(input.model_id,'rec00000000009999');assert.equal(input.visibility,'hidden');return Response.json({ok:true,item:{...items[796],model:{id:input.model_id,name:'Synthetic Model',key:'TEST'},revision:'c'.repeat(64)},publication:false});}
 throw Error('unexpected action '+input.action);};
 const p=page(fetch),find=text=>descendants(p.panel).find(n=>n.textContent===text),attr=name=>descendants(p.panel).find(n=>n.attrs['aria-label']===name);
 await find('เปิดคิวรออนุมัติ').onclick();assert.ok(descendants(p.panel).some(n=>n.textContent?.includes('โหลดครบ 797 รายการ')));assert.equal(actions.length,8);
 attr('กรอง Review/Hidden').value='hidden';attr('กรอง Review/Hidden').onchange();assert.equal(descendants(p.panel).filter(n=>n.textContent==='ดูสื่อ / จับคู่').length,1);
 await find('ดูสื่อ / จับคู่').onclick();assert.ok(descendants(p.panel).some(n=>n.tag==='img'&&n.src.startsWith('blob:')));
 attr('ค้นหาโมเดล').value='TEST';await find('ค้นหาโมเดล').onclick();find('Synthetic Model · TEST').onclick();await find('บันทึกข้อเสนอ · ยังรออนุมัติ').onclick();assert.equal(saves,1);assert.ok(descendants(p.panel).some(n=>n.textContent?.includes('บันทึกข้อเสนอแล้ว')));assert.equal(actions.some(a=>/approve|publish/.test(a)),false);
 find('ปิดสื่อ').onclick();assert.equal(descendants(p.panel).some(n=>n.tag==='img'),false);
});

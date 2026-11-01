import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=await readFile(new URL('./src/gate.js',import.meta.url),'utf8');
const client=vm.runInNewContext(source.slice(source.indexOf('const MEDIA_FLUSH_CLIENT_LAYER = ')).replace('const MEDIA_FLUSH_CLIENT_LAYER = ','').trim().replace(/;$/,''));
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.style={};this.value='';this.open=false;}
 append(...nodes){this.children.push(...nodes);}appendChild(node){this.children.push(node);return node;}prepend(node){this.children.unshift(node);}setAttribute(k,v){this.attrs[k]=v;}replaceChildren(...nodes){this.children=nodes;}
 showModal(){this.open=true;}close(){this.open=false;this.onclose?.();}
 querySelector(){return this.children.find(n=>n.attrs['data-mmd-media-flush']);}
}
function page(fetch,storage=new Map(),urlApi=URL){
 let observe;const host=new Node('host'),head=new Node('head'),document={head,body:new Node('body'),documentElement:{},readyState:'complete',createElement:tag=>new Node(tag),createTextNode:text=>Object.assign(new Node('text'),{textContent:text}),querySelector:()=>host};
 vm.runInNewContext(client,{window:{},document,location:{pathname:'/internal/admin/dashboard'},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,fetch,URL:urlApi,AbortSignal,AbortController,MutationObserver:class{constructor(fn){observe=fn;}observe(){}},setTimeout:(fn,ms)=>setTimeout(fn,ms>=100000?10000:0),clearTimeout,Date,Promise});
 const panel=host.children[0];return {panel,body:document.body,remount:()=>{host.replaceChildren();observe();return host.children[0];},storage,button:panel.children.find(n=>n.tag==='button'&&n.textContent.startsWith('FLUSH')),fresh:panel.children.find(n=>n.textContent==='ตรวจสื่อใหม่'),status:panel.children.find(n=>n.attrs.role==='status')};
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
 const oldQueue=p.panel.children.find(n=>n.tag==='section'),newPanel=p.remount();assert.equal(newPanel.children.find(n=>n.tag==='section'),oldQueue);assert.ok(descendants(newPanel).some(n=>n.textContent?.includes('โหลดครบ 797 รายการ')));p.panel=newPanel;
 assert.equal(find('ถัดไป').disabled,false);find('ถัดไป').onclick();assert.ok(descendants(p.panel).some(n=>n.textContent?.includes('หน้า 2/32')));find('ก่อนหน้า').onclick();
 attr('กรอง Review/Hidden').value='hidden';attr('กรอง Review/Hidden').onchange();assert.equal(descendants(p.panel).filter(n=>n.textContent==='ดูสื่อ / จับคู่').length,1);
 await find('ดูสื่อ / จับคู่').onclick();assert.ok(descendants(p.panel).some(n=>n.tag==='img'&&n.src.startsWith('blob:')));
 attr('ค้นหาโมเดล').value='TEST';await find('ค้นหาโมเดล').onclick();find('Synthetic Model · TEST').onclick();await find('บันทึกข้อเสนอ · ยังรออนุมัติ').onclick();assert.equal(saves,1);assert.ok(descendants(p.panel).some(n=>n.textContent?.includes('บันทึกข้อเสนอแล้ว')));assert.equal(actions.some(a=>/approve|publish/.test(a)),false);
 find('ปิดสื่อ').onclick();assert.equal(descendants(p.panel).some(n=>n.tag==='img'),false);
});

test('read-only full-page inspection separates 85 drafts / 739 files from 3 cases / 27 files and revokes previews',async()=>{
 const rid=n=>'rec'+String(n).padStart(14,'0');const models=Array.from({length:85},(_,i)=>({id:rid(40000+i),kind:'model',model_id:rid(50000+i),name:i===0?'Alpha Synthetic':'Model '+i,category:i<14?'farang':'up_country',source_path:'Root/Area/'+i,folder_id:'folder_synthetic_'+i,media_count:i===0?2:i<=65?9:8}));
 const cases=[{id:rid(60000),kind:'exception',name:'Folk Synthetic',media_count:14,category:'up_country'},{id:rid(60001),kind:'exception',name:'Simba Synthetic',media_count:6,category:'farang'},{id:rid(60002),kind:'exception',name:'Surathani Synthetic',media_count:7,category:'up_country'}].map(x=>({...x,folder_id:'folder_synthetic_case',source_path:'Root/Case/'+x.name}));
 const all=[...models,...cases],actions=[],mimeById=new Map();let urls=0,revoked=0;
 const fetch=async(_,init)=>{const input=JSON.parse(init.body);actions.push(input.action);
  if(input.action==='review_draft_queue')return Response.json({ok:true,read_only:true,publication:false,items:all,cursor:null});
  if(input.action==='review_draft_detail'){const item=all.find(x=>x.id===input.record_id);const media=Array.from({length:item.media_count},(_,i)=>({id:rid(70000+i),intake_id:String(i).padStart(64,'a'),mime:i%2?'video/mp4':'image/jpeg',bytes:24,visibility:i%2?'hidden':'review',source_path:item.source_path,file_id:'drive_synthetic_file_'+i,file_name:item.kind==='exception'?String(i)+'.jpg':null}));for(const m of media)mimeById.set(m.id,m.mime);return Response.json({ok:true,read_only:true,publication:false,item,model:item.kind==='model'?{id:item.model_id}:null,media,evidence:{source_path:item.source_path,source_folder_id:item.folder_id,summary:'Synthetic source evidence only',recorded_at:'2026-11-01T00:00:00Z',registry_candidates:[],observed_paths:[item.source_path]}});}
  if(input.action==='review_media')return new Response(new Uint8Array([255,216,255,1]),{headers:{'content-type':mimeById.get(input.record_id)}});
  throw Error('unexpected write or action '+input.action);
 };
 const p=page(fetch,new Map(),{createObjectURL:()=>{urls++;return 'blob:synthetic-'+urls;},revokeObjectURL:()=>{revoked++;}}),allNodes=()=>descendants(p.body),find=text=>allNodes().find(n=>n.textContent===text),byAttr=(key,value)=>allNodes().find(n=>n.attrs[key]===value);
 await descendants(p.panel).find(n=>n.textContent==='เปิดหน้าตรวจโมเดลร่าง').onclick();const modal=allNodes().find(n=>n.tag==='dialog');assert.equal(modal.open,true);assert.ok(allNodes().some(n=>n.textContent?.includes('85 โมเดลร่าง · 739 ไฟล์ · 3 เคสแยก / 27 ไฟล์')));assert.equal(actions.includes('review_media'),false);assert.equal(find('ก่อนหน้า').disabled,true);assert.equal(find('ถัดไป').disabled,false);
 const groupSearch=byAttr('aria-label','ค้นโมเดลร่างหรือเคส');groupSearch.value='Model 84';groupSearch.oninput();assert.equal(allNodes().filter(n=>n.attrs['data-draft-group']).length,1);await byAttr('data-draft-group',rid(40084)).onclick();assert.ok(allNodes().some(n=>n.textContent==='Model 84 · 8 ไฟล์'));
 await find('โมเดลร่าง (85)').onclick();await byAttr('data-draft-media',rid(70000)).onclick();assert.equal(allNodes().some(n=>n.tag==='img'&&n.src==='blob:synthetic-1'),true);assert.equal(urls,1);
 const filter=byAttr('aria-label','ชนิดสื่อของโมเดล');filter.value='video/';filter.onchange();assert.equal(revoked,1);assert.equal(allNodes().filter(n=>n.attrs['data-draft-media']).length,1);await byAttr('data-draft-media',rid(70001)).onclick();assert.equal(allNodes().some(n=>n.tag==='video'&&n.controls===true),true);
 await find('เคสแยก (3)').onclick();assert.equal(revoked,2);assert.equal(groupSearch.value,'');assert.equal(allNodes().filter(n=>n.attrs['data-draft-group']).length,3);assert.ok(allNodes().some(n=>n.textContent==='Folk Synthetic · 14 ไฟล์'));
 const links=allNodes().filter(n=>n.tag==='a');assert.ok(links.every(n=>/^https:\/\/(drive.google.com|airtable.com)\//.test(n.href)));assert.ok(actions.every(x=>['review_draft_queue','review_draft_detail','review_media'].includes(x)));assert.equal(allNodes().some(n=>n.tag==='button'&&/บันทึก|อนุมัติ|เผยแพร่/.test(n.textContent||'')),false);
 find('ปิดหน้าตรวจ').onclick();assert.equal(modal.open,false);assert.equal(allNodes().some(n=>n.tag==='img'||n.tag==='video'),false);
});

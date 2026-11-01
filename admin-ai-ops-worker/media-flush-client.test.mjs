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
 querySelectorAll(){return descendants(this).filter(n=>['button','input','select','textarea'].includes(n.tag));}
 querySelector(){return this.children.find(n=>n.attrs['data-mmd-media-flush']);}
}
function page(fetch,storage=new Map(),urlApi=URL,persistent=new Map()){
 let observe;const host=new Node('host'),head=new Node('head'),document={head,body:new Node('body'),documentElement:{},readyState:'complete',createElement:tag=>new Node(tag),createTextNode:text=>Object.assign(new Node('text'),{textContent:text}),querySelector:()=>host};
 vm.runInNewContext(client,{window:{},document,location:{pathname:'/internal/admin/dashboard'},localStorage:{getItem:k=>persistent.get(k),setItem:(k,v)=>persistent.set(k,v),removeItem:k=>persistent.delete(k)},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,fetch,URL:urlApi,AbortSignal,AbortController,MutationObserver:class{constructor(fn){observe=fn;}observe(){}},setTimeout:(fn,ms)=>setTimeout(fn,ms>=100000?10000:0),clearTimeout,Date,Promise});
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
 const rid=n=>'rec'+String(n).padStart(14,'0');const models=Array.from({length:85},(_,i)=>({id:rid(40000+i),kind:'model',inspection_result:'unreviewed',model_id:rid(50000+i),name:i===0?'Alpha Synthetic':'Model '+i,category:i<14?'farang':'up_country',source_path:'Root/Area/'+i,folder_id:'folder_synthetic_'+i,media_count:i===0?2:i<=65?9:8}));
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
 const links=allNodes().filter(n=>n.tag==='a');assert.ok(links.every(n=>/^https:\/\/(drive.google.com|airtable.com)\//.test(n.href)));assert.ok(actions.every(x=>['review_draft_queue','review_draft_detail','review_media'].includes(x)));assert.equal(allNodes().some(n=>n.tag==='button'&&!n.attrs['data-inspection-count']&&/บันทึก|อนุมัติ|เผยแพร่/.test(n.textContent||'')),false);
 find('ปิดหน้าตรวจ').onclick();assert.equal(modal.open,false);assert.equal(allNodes().some(n=>n.tag==='img'||n.tag==='video'),false);
});

test('model inspection requires reason, freezes duplicate clicks, retries one operation, renders history and leaves cases read-only',async()=>{
 const item={id:'rec00000000004000',kind:'model',inspection_result:'unreviewed',model_id:'rec00000000005000',name:'Synthetic reviewer test',category:'up_country',source_path:'Synthetic/Test',folder_id:'synthetic_test_folder',media_count:0},exception={...item,id:'rec00000000006000',kind:'exception',name:'Synthetic separated case'};
 let log=[],revision='a'.repeat(64),lost=false,saves=0,release;const inputs=[];
 const fetch=async(_,init)=>{const input=JSON.parse(init.body);inputs.push(input);
  if(input.action==='review_draft_queue')return Response.json({ok:true,read_only:true,publication:false,items:[item,exception]});
  if(input.action==='review_draft_detail')return Response.json({ok:true,read_only:true,publication:false,item:input.record_id===item.id?item:exception,model:input.record_id===item.id?{id:item.model_id}:null,media:[],evidence:{source_folder_id:item.folder_id,source_path:item.source_path,summary:'Synthetic only',recorded_at:'2026-11-01T00:00:00Z',observed_paths:[],registry_candidates:[]},inspection:input.record_id===item.id?{revision,current:log.at(-1)||null,history:log,history_limit:100,can_save:true}:null});
  if(input.action==='review_draft_save'){saves++;if(!lost){lost=true;log.push({operation_id:input.operation_id,result:input.result,reason:input.reason,actor:'synthetic-owner',at:'2026-11-01T00:00:00Z'});revision='b'.repeat(64);await new Promise(r=>release=r);throw Error('Lost committed response');}assert.equal(input.operation_id,log[0].operation_id);return Response.json({ok:true,publication:false,pending_review:true,already_saved:true,inspection:{revision,current:log[0],history:log,history_limit:100,can_save:true}});}
  throw Error('Unexpected mutation');
 };
 const p=page(fetch),nodes=()=>descendants(p.body),find=text=>nodes().find(n=>n.textContent===text),attr=value=>nodes().find(n=>n.attrs['aria-label']===value);
 await descendants(p.panel).find(n=>n.textContent==='เปิดหน้าตรวจโมเดลร่าง').onclick();const save=find('บันทึกผลตรวจ · ยังรออนุมัติ');await save.onclick();assert.equal(saves,0);assert.ok(nodes().some(n=>n.textContent==='เลือกผลตรวจและกรอกเหตุผลก่อนบันทึก'));
 attr('ผลตรวจโมเดลร่าง').value='needs_more_evidence';attr('เหตุผลการตรวจโมเดลร่าง').value='Synthetic <script> must remain plain text';const pending=save.onclick();assert.equal(save.disabled,true);await save.onclick();assert.equal(saves,1);assert.equal(find('ปิดหน้าตรวจ').disabled,true);release();await pending;assert.equal(saves,2);assert.equal(log.length,1);assert.equal(save.disabled,false);assert.equal(attr('เหตุผลการตรวจโมเดลร่าง').value,'');assert.ok(nodes().some(n=>n.textContent?.includes('รายการนี้บันทึกไว้แล้ว')));assert.ok(nodes().some(n=>n.tag==='li'&&n.textContent.includes('Synthetic <script>')));
 assert.ok(nodes().some(n=>n.textContent?.includes('บันทึกผลตรวจแล้ว 1 / 1 โมเดล (100%)')));assert.equal(nodes().find(n=>n.attrs['data-inspection-count']==='unreviewed').textContent,'ยังไม่ตรวจ · 0');
 await find('เคสแยก (1)').onclick();assert.equal(nodes().some(n=>n.attrs['data-model-inspection']!==undefined),false);assert.ok(inputs.every(i=>!('approve'in i)&&!('model_id'in i)&&!('actor'in i)));
});

test('progress covers all queue pages and filters latest outcomes with category/search while cases stay separate',async()=>{
 const rid=n=>'rec'+String(n).padStart(14,'0'),results=['unreviewed','checked_pending_approval','needs_more_evidence','needs_correction'];
 const models=Array.from({length:85},(_,i)=>({id:rid(40000+i),kind:'model',model_id:rid(50000+i),inspection_result:i<10?results[0]:results[1+Math.floor((i-10)/25)],inspection_count:i<10?0:3,name:'Synthetic '+String(i).padStart(2,'0'),category:i<14?'farang':'up_country',source_path:'Root/Area/'+i,folder_id:'folder_synthetic_'+i,media_count:i===0?2:i<=65?9:8}));
 const cases=[14,6,7].map((n,i)=>({...models[0],id:rid(60000+i),kind:'exception',name:'Case '+i,media_count:n})),all=[...models,...cases],calls=[];
 const fetch=async(_,init)=>{const input=JSON.parse(init.body);calls.push(input.action);if(input.action==='review_draft_queue'){const start=Number(input.cursor||0);return Response.json({ok:true,read_only:true,publication:false,items:all.slice(start,start+40),cursor:start+40<all.length?String(start+40):null});}assert.equal(input.action,'review_draft_detail');const item=all.find(r=>r.id===input.record_id);return Response.json({ok:true,read_only:true,publication:false,item,model:item.kind==='model'?{id:item.model_id}:null,media:[],evidence:{source_path:item.source_path,source_folder_id:item.folder_id,recorded_at:'2026-11-01T00:00:00Z',summary:'Synthetic source',observed_paths:[],registry_candidates:[]}});};
 const p=page(fetch),nodes=()=>descendants(p.body),find=text=>nodes().find(n=>n.textContent===text),attr=value=>nodes().find(n=>n.attrs['aria-label']===value),count=value=>nodes().find(n=>n.attrs['data-inspection-count']===value),rows=()=>nodes().filter(n=>n.attrs['data-draft-group']);
 await descendants(p.panel).find(n=>n.textContent==='เปิดหน้าตรวจโมเดลร่าง').onclick();assert.equal(calls.filter(x=>x==='review_draft_queue').length,3);assert.ok(nodes().some(n=>n.textContent?.includes('บันทึกผลตรวจแล้ว 75 / 85 โมเดล (88%)')));assert.equal(count('unreviewed').textContent,'ยังไม่ตรวจ · 10');assert.equal(count('needs_correction').textContent,'ต้องแก้ข้อมูล · 25');
 await count('unreviewed').onclick();assert.equal(rows().length,10);assert.equal(find('ถัดไป').disabled,true);assert.ok(rows().every(r=>r.textContent.includes('ผลตรวจ: ยังไม่ตรวจ')));
 await count('needs_more_evidence').onclick();assert.equal(rows().length,10);assert.ok(nodes().some(n=>n.textContent?.startsWith('พบ 25 จาก 85')));find('ถัดไป').onclick();assert.ok(nodes().some(n=>n.textContent==='2 / 3'));
 attr('หมวดโมเดลร่าง').value='farang';await attr('หมวดโมเดลร่าง').onchange();assert.equal(rows().length,0);assert.equal(nodes().some(n=>n.textContent?.includes('รายการที่เปิดอยู่อยู่นอกตัวกรอง')),false);assert.ok(nodes().some(n=>n.textContent==='ไม่พบรายการตามตัวกรอง'));
 await count('needs_correction').onclick();attr('ค้นโมเดลร่างหรือเคส').value='Synthetic 84';await attr('ค้นโมเดลร่างหรือเคส').oninput();assert.equal(rows().length,1);assert.equal(rows()[0].attrs['data-draft-group'],rid(40084));
 await find('เคสแยก (3)').onclick();assert.equal(rows().length,3);assert.equal(attr('กรองผลตรวจโมเดลร่าง').hidden,true);assert.ok(nodes().some(n=>n.textContent?.includes('75 / 85')));assert.ok(calls.every(a=>a==='review_draft_queue'||a==='review_draft_detail'));
});
test('incomplete, duplicate or unknown outcome data never produces a misleading progress total',async()=>{
 for(const mode of ['missing','duplicate','later_page_failure']){
  const item={id:'rec00000000004000',kind:'model',name:'Synthetic',inspection_result:'unreviewed'};
  const p=page(async(_,init)=>{const input=JSON.parse(init.body);assert.equal(input.action,'review_draft_queue');if(mode==='later_page_failure'&&input.cursor)return Response.json({ok:false,error:'history_unavailable'},{status:503});return Response.json({ok:true,read_only:true,publication:false,items:mode==='missing'?[{...item,inspection_result:undefined}]:mode==='duplicate'?[item,item]:[item],cursor:mode==='later_page_failure'?'second':null});});
  await descendants(p.panel).find(n=>n.textContent==='เปิดหน้าตรวจโมเดลร่าง').onclick();const nodes=()=>descendants(p.body);assert.equal(nodes().find(n=>n.attrs['data-draft-progress']!==undefined).hidden,true);assert.ok(nodes().some(n=>n.textContent?.includes('อ่านข้อมูลไม่ครบ')));const filter=nodes().find(n=>n.attrs['aria-label']==='กรองผลตรวจโมเดลร่าง');filter.value='unreviewed';await filter.onchange();assert.equal(nodes().find(n=>n.attrs['data-draft-progress']!==undefined).hidden,true);
 }
});

function continuationFixture(count=85,persistent=new Map()){
 const rid=n=>'rec'+String(n).padStart(14,'0'),models=Array.from({length:count},(_,i)=>({id:rid(40000+i),kind:'model',model_id:rid(50000+i),name:'Synthetic '+String(i).padStart(2,'0'),category:'up_country',source_path:'Synthetic/'+i,folder_id:'synthetic_folder_'+i,media_count:0})),cases=[{...models[0],id:rid(60000),kind:'exception',name:'Separate case',media_count:27}],history=new Map(),calls=[];let offline=false,queueOffline=false,detailOffline=null,lose=false,stale=null;
 const view=id=>{const entries=history.get(id)||[];return {revision:(entries.length?'b':'a').repeat(64),current:entries.at(-1)||null,history:entries,history_limit:100,can_save:true};};
 const fetch=async(_,init)=>{const input=JSON.parse(init.body);calls.push(input);
  if(input.action==='review_draft_queue'&&queueOffline)return Response.json({ok:false,error:'Synthetic queue outage'},{status:503});if(input.action==='review_draft_queue')return Response.json({ok:true,read_only:true,publication:false,items:[...models.map(m=>({...m,inspection_result:view(m.id).current?.result||'unreviewed'})),...cases]});
  if(input.action==='review_draft_detail'&&input.record_id===detailOffline)return Response.json({ok:false,error:'Synthetic detail outage'},{status:503});if(input.action==='review_draft_detail'){const item=[...models,...cases].find(m=>m.id===input.record_id);if(stale===item.id){history.set(item.id,[{operation_id:'external',result:'needs_correction',reason:'Other reviewer',actor:'owner',at:new Date().toISOString()}]);stale=null;}return Response.json({ok:true,read_only:true,publication:false,item,model:item.kind==='model'?{id:item.model_id}:null,inspection:item.kind==='model'?view(item.id):null,media:[],evidence:{source_path:item.source_path,source_folder_id:item.folder_id,summary:'Synthetic only',recorded_at:new Date().toISOString(),observed_paths:[],registry_candidates:[]}});}
  assert.equal(input.action,'review_draft_save');if(offline)return Response.json({ok:false,error:'Synthetic outage'},{status:503});const entries=history.get(input.record_id)||[],exists=entries.some(e=>e.operation_id===input.operation_id);if(!exists)history.set(input.record_id,[...entries,{operation_id:input.operation_id,result:input.result,reason:input.reason,actor:'synthetic-owner',at:new Date().toISOString()}]);if(lose){lose=false;throw Error('Lost committed reply');}return Response.json({ok:true,publication:false,pending_review:true,already_saved:exists,inspection:view(input.record_id)});
 };
 let p=page(fetch,new Map(),URL,persistent);const nodes=()=>descendants(p.body),find=text=>nodes().find(n=>n.textContent===text),attr=value=>nodes().find(n=>n.attrs['aria-label']===value);
 return {p,models,history,calls,nodes,find,attr,persistent,reload:()=>p=page(fetch,new Map(),URL,persistent),setOffline:v=>offline=v,setQueueOffline:v=>queueOffline=v,setDetailOffline:v=>detailOffline=v,setLose:v=>lose=v,setStale:v=>stale=v,open:()=>descendants(p.panel).find(n=>n.textContent==='เปิดหน้าตรวจโมเดลร่าง').onclick(),save:async()=>{attr('ผลตรวจโมเดลร่าง').value='checked_pending_approval';attr('เหตุผลการตรวจโมเดลร่าง').value='Synthetic review only';return find('บันทึกแล้วไปโมเดลที่ยังไม่ตรวจถัดไป').onclick();}};
}
test('save-next continuously reviews all 85 models once, updates progress and stops before exceptions',async()=>{
 const f=continuationFixture();await f.open();for(let i=0;i<85;i++){assert.ok(f.find(f.models[i].name+' · 0 ไฟล์'));await f.save();}assert.equal(f.history.size,85);assert.ok([...f.history.values()].every(h=>h.length===1));assert.equal(f.calls.filter(c=>c.action==='review_draft_save').length,85);assert.ok(f.nodes().some(n=>n.textContent?.includes('85 / 85 โมเดล (100%)')));assert.ok(f.nodes().some(n=>n.textContent?.includes('ไม่เหลือโมเดลที่ยังไม่ตรวจในคิวล่าสุด')));assert.equal(f.nodes().some(n=>n.attrs['data-save-next']!==undefined),false);assert.equal(f.calls.some(c=>c.action==='review_draft_detail'&&c.record_id==='rec00000000060000'),false);
});
test('save-next wraps the full queue across pages/filters and skips a candidate just reviewed elsewhere',async()=>{
 const f=continuationFixture(12);await f.open();const chosen=f.nodes().find(n=>n.attrs['data-draft-group']===f.models[8].id);await chosen.onclick();f.setStale(f.models[9].id);f.setLose(true);await f.save();assert.ok(f.find(f.models[10].name+' · 0 ไฟล์'));assert.equal(f.history.get(f.models[8].id).length,1);assert.equal(f.attr('กรองผลตรวจโมเดลร่าง').value,'unreviewed');assert.equal(f.attr('ค้นโมเดลร่างหรือเคส').value,'');assert.ok(f.nodes().some(n=>n.textContent==='1 / 1'));await f.save();await f.save();assert.ok(f.find(f.models[0].name+' · 0 ไฟล์'));assert.ok(f.calls.filter(c=>c.action==='review_draft_save'&&c.record_id===f.models[8].id).every((c,_,a)=>c.operation_id===a[0].operation_id));
});
test('save-next keeps the current model and reason during validation/outage, then resumes with the same operation',async()=>{
 const f=continuationFixture(2);await f.open();await f.find('บันทึกแล้วไปโมเดลที่ยังไม่ตรวจถัดไป').onclick();assert.equal(f.calls.filter(c=>c.action==='review_draft_save').length,0);f.setOffline(true);await f.save();assert.ok(f.find(f.models[0].name+' · 0 ไฟล์'));assert.equal(f.attr('เหตุผลการตรวจโมเดลร่าง').value,'Synthetic review only');assert.equal(f.calls.filter(c=>c.action==='review_draft_queue').length,1);const first=f.calls.find(c=>c.action==='review_draft_save');f.setOffline(false);await f.find('บันทึกแล้วไปโมเดลที่ยังไม่ตรวจถัดไป').onclick();assert.ok(f.find(f.models[1].name+' · 0 ไฟล์'));assert.ok(f.calls.filter(c=>c.action==='review_draft_save').every(c=>c.operation_id===first.operation_id));
});
test('save-next selects the correct list page and clears a restrictive search',async()=>{
 const f=continuationFixture(25);await f.open();f.attr('ค้นโมเดลร่างหรือเคส').value='Synthetic 12';await f.attr('ค้นโมเดลร่างหรือเคส').oninput();await f.save();assert.ok(f.find(f.models[13].name+' · 0 ไฟล์'));assert.ok(f.nodes().some(n=>n.textContent==='2 / 3'));assert.equal(f.attr('ค้นโมเดลร่างหรือเคส').value,'');
});
test('a committed save followed by queue failure stays confirmed and does not save again',async()=>{
 const f=continuationFixture(2);await f.open();f.setQueueOffline(true);await f.save();assert.equal(f.history.size,1);assert.equal(f.calls.filter(c=>c.action==='review_draft_save').length,1);assert.ok(f.nodes().some(n=>n.textContent?.includes('บันทึกผลตรวจแล้ว · ยังอ่านคิวถัดไปไม่ได้')));f.setQueueOffline(false);await f.find('โหลดข้อมูลล่าสุด').onclick();assert.ok(f.find(f.models[1].name+' · 0 ไฟล์'));assert.equal(f.calls.filter(c=>c.action==='review_draft_save').length,1);
});

test('latest model resumes after close/reopen and a new page across all 85 models without retaining draft reasons',async()=>{
 const f=continuationFixture();await f.open();f.attr('ค้นโมเดลร่างหรือเคส').value='Synthetic 84';await f.attr('ค้นโมเดลร่างหรือเคส').oninput();f.attr('เหตุผลการตรวจโมเดลร่าง').value='DO NOT PERSIST unsaved private reason';const saved=JSON.parse(f.persistent.get('mmd.flush.draft-review.resume.v1'));assert.deepEqual(saved,{schema:1,record_id:f.models[84].id,model_id:f.models[84].model_id});assert.equal([...f.persistent.values()].some(v=>v.includes('DO NOT PERSIST')),false);
 f.find('ปิดหน้าตรวจ').onclick();await f.open();assert.ok(f.find(f.models[84].name+' · 0 ไฟล์'));assert.equal(f.attr('ค้นโมเดลร่างหรือเคส').value,'');assert.equal(f.attr('เหตุผลการตรวจโมเดลร่าง').value,'');assert.ok(f.find('9 / 9'));assert.ok(f.nodes().some(n=>n.textContent?.includes('กลับมาตรวจต่อ: Synthetic 84')));
 f.history.set(f.models[84].id,[{operation_id:'external',result:'needs_correction',reason:'Fresh server review',actor:'owner',at:new Date().toISOString()}]);f.reload();await f.open();assert.ok(f.find(f.models[84].name+' · 0 ไฟล์'));assert.equal(f.attr('ผลตรวจโมเดลร่าง').value,'needs_correction');assert.ok(f.nodes().some(n=>n.textContent?.includes('Fresh server review')));assert.equal(f.calls.some(c=>c.action==='review_draft_save'),false);
});
test('exception browsing never replaces the last model; save-next remembers its newly opened model',async()=>{
 const f=continuationFixture(3);await f.open();await f.save();const pointer=f.persistent.get('mmd.flush.draft-review.resume.v1');assert.equal(JSON.parse(pointer).record_id,f.models[1].id);await f.find('เคสแยก (1)').onclick();assert.equal(f.persistent.get('mmd.flush.draft-review.resume.v1'),pointer);f.find('ปิดหน้าตรวจ').onclick();await f.open();assert.ok(f.find(f.models[1].name+' · 0 ไฟล์'));assert.equal(f.nodes().some(n=>n.attrs['data-save-next']!==undefined),true);
});
test('corrupt, oversized and unrecognized bookmarks are ignored; missing or rebound models fall back to unreviewed models',async()=>{
 const key='mmd.flush.draft-review.resume.v1';for(const raw of ['bad json','x'.repeat(1000),JSON.stringify({schema:2,record_id:'rec00000000040002',model_id:'rec00000000050002'}),JSON.stringify({schema:1,record_id:'rec00000000040002',model_id:'rec00000000050002',reason:'must reject'})]){const f=continuationFixture(3,new Map([[key,raw]]));await f.open();assert.ok(f.find(f.models[0].name+' · 0 ไฟล์'));assert.equal(f.calls.some(c=>c.action==='review_draft_save'),false);}
 for(const pointer of [{schema:1,record_id:'rec00000000099999',model_id:'rec00000000050002'},{schema:1,record_id:'rec00000000040002',model_id:'rec00000000099999'},{schema:1,record_id:'rec00000000060000',model_id:'rec00000000050000'}]){const f=continuationFixture(3,new Map([[key,JSON.stringify(pointer)]]));f.history.set(f.models[0].id,[{result:'needs_correction',reason:'Already reviewed',actor:'owner',at:new Date().toISOString()}]);await f.open();assert.ok(f.find(f.models[1].name+' · 0 ไฟล์'));assert.ok(f.nodes().some(n=>n.textContent?.includes('โมเดลล่าสุดไม่อยู่ในคิวเดิมแล้ว')));assert.equal(JSON.parse(f.persistent.get(key)).record_id,f.models[1].id);}
});
test('blocked browser storage leaves review usable and remembers the last model in the current page only',async()=>{
 const denied={get(){throw Error('blocked');},set(){throw Error('quota');},delete(){throw Error('blocked');}},f=continuationFixture(3,denied);await f.open();await f.nodes().find(n=>n.attrs['data-draft-group']===f.models[2].id).onclick();f.find('ปิดหน้าตรวจ').onclick();await f.open();assert.ok(f.find(f.models[2].name+' · 0 ไฟล์'));assert.ok(f.nodes().some(n=>n.textContent?.includes('เบราว์เซอร์ไม่อนุญาตให้จำตำแหน่งหลังปิดหน้า')));assert.equal(f.calls.some(c=>c.action==='review_draft_save'),false);
});
test('failed resume reads retain the bookmark and explicit reload retries the same model without writes',async()=>{
 const f=continuationFixture(3);await f.open();await f.nodes().find(n=>n.attrs['data-draft-group']===f.models[2].id).onclick();const before=f.persistent.get('mmd.flush.draft-review.resume.v1');f.reload();f.setDetailOffline(f.models[2].id);await f.open();assert.equal(f.persistent.get('mmd.flush.draft-review.resume.v1'),before);assert.ok(f.nodes().some(n=>n.textContent?.includes('ยังเปิดโมเดลล่าสุดไม่ได้')));f.setDetailOffline(null);await f.find('โหลดข้อมูลล่าสุด').onclick();assert.ok(f.find(f.models[2].name+' · 0 ไฟล์'));assert.equal(f.calls.some(c=>c.action==='review_draft_save'),false);
});

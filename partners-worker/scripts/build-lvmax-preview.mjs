// Read-only synthetic preview built from the production page renderer.
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]||'partners-worker/.preview');
const js=(await build({entryPoints:[new URL('../src/public-index.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let html=await(await worker.fetch(new Request('https://www.mmdbkk.com/partner/dashboard?t=lvmax-design-example'),{},{})).text();
const ids=['recAAAAAAAAAAAAAA','recBBBBBBBBBBBBBB','recCCCCCCCCCCCCCC','recDDDDDDDDDDDDDD'];
const models=['Co Model A','Co Model B','Co Model C','Co Model D'].map((display_name,i)=>({model_record_id:ids[i],display_name,age:25+i,height_cm:180+i,weight_kg:72+i,profile_summary:['งานถ่ายภาพและอีเวนต์ · นัดหมายล่วงหน้า','งานโฆษณา · พร้อมเดินทางในกรุงเทพฯ','งานแฟชั่นและแคมเปญ','กำลังเตรียมข้อมูลโปรไฟล์'][i],skills_summary:'ข้อมูลตัวอย่างเพื่อออกแบบ',image_url:'',roster_active:true,availability_status:i===1?'busy':'available',sales_control:{approved_policy:i===3?null:{sales_visibility:i===2?'off':'on',partner_source_rate_thb:8000+i*1000,customer_sell_rate_thb:12000+i*1000},proposal:i===3?{status:'Review'}:null},working_system:{status:'approved',system:'co_partner',label:'Co-Partner',source_rate_thb:8000,version:1},working_system_history:[],profile_request_status:i===3?'review':null}));
const date=(days,hour)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(hour-7,0,0,0);return d.toISOString();};
const jobs=[0,1,2].map((i)=>({session_record_id:'recJOB'+String(i).repeat(14),model_record_id:ids[i],model_name:models[i].display_name,start_at:date(i+1,[18,14,10][i]),end_at:date(i+1,[20,16,12][i]),date:date(i+1,18),work_type:['งานถ่ายภาพ','งานอีเวนต์','งานแคมเปญ'][i],location:['ล็อบบี้สตูดิโอ A','จุดลงทะเบียนอาคาร B','ทางเข้าอาคาร C'][i],client_alias:'ลูกค้าตัวอย่าง',working_system:'co_partner',status:i===1?'pending':'confirmed',confirmation_allowed:i===1,partner_source_rate_thb:8000,notification_status:i===1?'pending_change':'sent'}));
jobs.push({...jobs[0],session_record_id:'recOLD00000000000',start_at:date(-3,18),end_at:date(-3,20),status:'completed',confirmation_allowed:false});
const data={ok:true,partner:{id:'partner-design-example',name:'MY PARTNER · ข้อมูลจำลอง',telegram_connected:false},models,jobs,model_changes:[],commissions:[],summary:{activeModels:4,upcomingJobs:3,pendingAmount:0,paidAmount:0},finance:{summary:{},rows:[],payout_profile:{}}};
const announcements=[0,1,2].map(i=>({id:'announcement-fixture-'+i,revision:'fixture-'+i,title:['ถ่ายภาพแคมเปญ · ลุคเรียบมั่นใจ','เปิดตัวแบรนด์ · งานอีเวนต์','แฟชั่นสตูดิโอ · ทดลองลุค'][i],brief:'ข้อมูลตัวอย่างเพื่อออกแบบ · ตรวจบรีฟและข้อตกลงก่อนเสนอคนในสังกัด',category:['ถ่ายภาพ','อีเวนต์','แฟชั่น'][i],area:['กรุงเทพฯ · สาทร','กรุงเทพฯ · สุขุมวิท','กรุงเทพฯ · อารีย์'][i],requirements:'นายแบบที่มีทักษะตรงกับงาน · แจ้งสถานะคิวก่อนเสนอ',start_at:date(i+3,13),end_at:date(i+3,17),deadline:date(i+2,18),required_count:i+1,budget_min:8000+i*2000,budget_max:10000+i*2000,budget_basis:i===1?'total':'model_net',travel_terms:'ค่าเดินทางแยกตามข้อตกลงของงาน',partner_fee_terms:'ตรวจข้อตกลง Partner ก่อนยืนยัน ไม่รวมกับค่าตัวที่เสนอ',status:'open',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),proposals:i===2?[{id:'proposal-fixture',model_id:ids[0],model_name:models[0].display_name,status:'more_information',rate:12000,availability:'checking',note:'ข้อมูลตัวอย่าง',decision_note:'ขอรูปปัจจุบันและยืนยันคิวเพิ่มเติม',updated_at:new Date().toISOString()}]:[]}));
const mock=`<script>
(function(){
const data=${JSON.stringify(data).replace(/</g,'\\u003c')};
let order={model_ids:[],revision:null};try{order=JSON.parse(localStorage.getItem('partner-lvmax-order-preview'))||order;}catch{}
let vault=null;
const announcements=${JSON.stringify(announcements).replace(/</g,'\\u003c')};
let preferences={category:'',area:'',budget_min:null,enabled:false,seen_at:null},preferenceRevision=null;
window.fetch=async function(input,options={}){
 const url=new URL(typeof input==='string'?input:input.url,location.href),path=url.pathname;
 const method=options.method||'GET';let body={};if(typeof options.body==='string'){try{body=JSON.parse(options.body);}catch{}}
 const ok=(value)=>Promise.resolve(new Response(JSON.stringify({ok:true,...value}),{status:200,headers:{'content-type':'application/json'}}));
 if(path==='/v1/partner/announcements')return ok({announcements,next_cursor:null});
 if(path==='/v1/partner/announcements/detail')return ok({announcement:announcements.find(a=>a.id===url.searchParams.get('id'))});
 if(path==='/v1/partner/announcements/preferences'){if(method==='POST'){preferences={...body,seen_at:body.mark_read?new Date().toISOString():preferences.seen_at};preferenceRevision=String(Date.now());}return ok({preferences,revision:preferenceRevision});}
 if(path==='/v1/partner/dashboard')return ok(data);
 if(path==='/v1/partner/jobs/detail'){const job=data.jobs.find(j=>j.session_record_id===url.searchParams.get('session_record_id'));return ok({detail:{session_record_id:job.session_record_id,lifecycle:'en_route',updated_at:new Date().toISOString(),location:job.location,eta:{status:'active',arrival_at:new Date(Date.now()+25*60000).toISOString(),updated_at:new Date().toISOString(),server_now:new Date().toISOString()},reconfirm:{recorded_acknowledged_at:null},history_complete:false,communications_available:false,model_actions_allowed:false}});}
 if(path==='/v1/partner/roster-order'){
  if(method==='POST'){if(body.revision!==order.revision)return new Response(JSON.stringify({ok:false,error:'roster_order_conflict'}),{status:409});order={model_ids:body.model_ids,revision:String(Date.now())};try{localStorage.setItem('partner-lvmax-order-preview',JSON.stringify(order));}catch{}}
  return ok(order);
 }
 if(path==='/v1/partner/private-vault'){if(method==='POST'){vault={envelope:body.envelope,revision:String(Date.now())};}return ok(vault||{envelope:null,revision:null});}
 if(path==='/v1/partner/models/assets')return ok({assets:[]});
 // Real workflow actions deliberately cannot succeed in this presentation preview.
 return new Response(JSON.stringify({ok:false,error:'design_preview_only'}),{status:409,headers:{'content-type':'application/json'}});
};
})();
</script>`;
html=html.replace('<head>','<head>'+mock).replace('<title>','<title>LV MAX · ตัวอย่างเพื่อออกแบบ · ');
html=html.replace('<body ', '<body data-lv-preview="true" ');
html=html.replace(/(<body[^>]*>)/,'$1<div class="lv-preview-banner">LV MAX · ข้อมูลจำลอง · ทดลองจัดลำดับและดูแบบได้ — ไม่ส่งข้อความหรือเปลี่ยนข้อมูลจริง</div>');
html=html.replace('var token = params.get("t") || "";', 'var token = "lvmax-design-example";');
html=html.replaceAll('กรุณาลองอีกครั้ง หรือติดต่อ MMD เพื่อตรวจสอบรายการ','ตัวอย่างเพื่อออกแบบ — การทำรายการนี้ยังไม่พร้อมใช้จริงในพรีวิว');
html=html.replace('</head>','<style>.lv-preview-banner{padding:10px 18px;text-align:center;font:12px/1.6 Anuphan,system-ui,sans-serif;color:#fff9ef;background:#30241c}.lv-preview-size{max-width:390px;margin:0 auto}</style></head>');
await mkdir(output,{recursive:true});await mkdir(output+'/partner/dashboard',{recursive:true});
html=html.replace(/href="\/partner[^"]*"/g,'href="/capabilities.html"');
await writeFile(output+'/index.html',html);
await writeFile(output+'/qa-responsive.html',`<!doctype html><html lang="th"><meta charset="utf-8"><title>MY PARTNER Responsive QA</title><style>body{margin:0;background:#e4ddd2;font:14px system-ui}nav{padding:10px;display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:0;background:white}button{padding:10px;min-height:44px}iframe{display:block;height:calc(100vh - 76px);min-height:500px;border:0;margin:auto;background:#fffdf8}</style><nav><button data-width="320">320 px</button><button data-width="390">390 px</button><button data-width="430">430 px</button><button data-width="768">768 px</button><button data-width="1280">1280 px</button><button data-width="1440">1440 px</button><button id="text">Text 200%</button><button id="normal">Text 100%</button></nav><iframe title="MY PARTNER ตัวอย่าง" width="390" src="/"></iframe><script>document.querySelectorAll('[data-width]').forEach(b=>b.onclick=()=>{document.querySelector('iframe').width=b.dataset.width});document.querySelector('#text').onclick=()=>{document.querySelector('iframe').src='/qa-text.html'};document.querySelector('#normal').onclick=()=>{document.querySelector('iframe').src='/'}</script></html>`);
await writeFile(output+'/qa-text.html',html.replace('</body>',`<script>window.addEventListener('load',()=>{const zoom=()=>{if(!document.querySelector('[data-home-models] [data-model]'))return false;const items=[...document.querySelectorAll('body *')].filter(e=>!['SCRIPT','STYLE'].includes(e.tagName)).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);items.forEach(([e,n])=>e.style.fontSize=(n*2)+'px');return true;};if(!zoom()){const observer=new MutationObserver(()=>{if(zoom())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}});</script></body>`));await writeFile(output+'/partner/dashboard/index.html',html);
console.log('Synthetic LV Max preview built. No live API transport.');

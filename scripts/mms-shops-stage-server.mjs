import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { StageShopLedger, stageShopCatalog } from '../mms-worker/src/shop-ledger-stage.mjs';
import { renderMmsShopsOwnerStage } from '../admin-worker/src/mms-shops-owner-stage.mjs';
import { renderKalimaPartnerStage } from '../partners-worker/src/kalima-partner-stage.mjs';
import { renderRelaxSpaPage } from '../admin-worker/src/relax-spa-page.js';
import { stageActorForPersona } from './mms-shops-stage-access.mjs';

// Loopback-only Stage with synthetic role identities. Never a production auth adapter.
const port = 8767, directory = fileURLToPath(new URL('../output/stage-data/', import.meta.url));
await mkdir(directory, { recursive: true });
class LocalStore {
  queue = Promise.resolve();
  file(key) { const shop = ['kalima','relax'].find(s => stageShopCatalog(s).ledger_key === key); if (!shop) throw Error('STAGE_STORAGE_SCOPE_INVALID'); return directory + shop + '.json'; }
  async get(key) { try { return JSON.parse(await readFile(this.file(key), 'utf8')); } catch(e) { if(e.code==='ENOENT')return undefined;throw e; } }
  transaction(fn) { const p=this.queue.then(async()=>{ const pending=new Map();const result=await fn({get:async k=>pending.has(k)?structuredClone(pending.get(k)):this.get(k),put:async(k,v)=>pending.set(k,structuredClone(v))});for(const [key,value]of pending){const path=this.file(key);await writeFile(path+'.tmp',JSON.stringify(value,null,2));await rename(path+'.tmp',path);}return result;});this.queue=p.catch(()=>{});return p; }
}
const store = new LocalStore(), ledger = new StageShopLedger(store);
for(const shop of ['kalima','relax'])await store.transaction(async tx=>{const catalog=stageShopCatalog(shop);if(!await tx.get(catalog.ledger_key))await tx.put(catalog.ledger_key,{shop_key:shop,agreement:catalog.agreement,courses:catalog.courses,quotes:[],receipts:[],events:[],requests:{}});});
const bootstrap = persona => `<script>
(async()=>{
const persona=${JSON.stringify(persona)};
async function connect(shop,panel,courseSelector,rowSelector){
 const res=await fetch('/stage-api/'+persona+'/shops/'+shop);const payload=await res.json();if(!res.ok||!payload.ok)throw Error(payload.error?.code||'STAGE_READ_FAILED');const data=payload.data;
 const courses=[...panel.querySelectorAll(courseSelector)];if(courses.length!==data.courses.length)throw Error('STAGE_CATALOG_MISMATCH');
 courses.forEach((node,i)=>{node.dataset.courseId=data.courses[i].course_id;const rows=[...node.querySelectorAll(rowSelector)];if(rows.length!==data.courses[i].rates.length)throw Error('STAGE_RATE_MISMATCH');rows.forEach((row,j)=>{const rate=data.courses[i].rates[j];row.firstElementChild.textContent=rate.minutes+' นาที';row.lastElementChild.textContent=(rate.room_course_amount/100).toLocaleString('en-US')+' บาท';});});
 const status=panel.querySelector('[data-stage-connection]');if(status)status.textContent='Ledger Stage แยกร้าน · '+data.ledger.quotes.length+' ใบเสนอราคาทดสอบ · บัญชีร้านจริง: รอยืนยัน';
}
try{if(persona==='owner'){await connect('kalima',document.querySelector('#shop-kalima'),'details.course','.price');await connect('relax',document.querySelector('#shop-relax'),'details.course','.price');}
else if(persona==='partner-kalima')await connect('kalima',document.querySelector('[data-page="courses"]'),'details.course','.price');
else{const refresh=async()=>{const panel=document.querySelector('#relax-stage-menu');if(panel&&!panel.dataset.connecting){panel.dataset.connecting='true';observer.disconnect();try{await connect('relax',panel,'details.cost','.row');}catch(e){panel.textContent='ยังอ่าน Stage ไม่สำเร็จ: '+e.message;}}};const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true});await refresh();}
document.documentElement.dataset.stageData='connected';}catch(e){document.documentElement.dataset.stageData='error';const notice=document.createElement('p');notice.textContent='ยังอ่าน Stage ไม่สำเร็จ: '+e.message;document.body.prepend(notice);}
})();</script>`;
function page(path,connected=true){let html,persona;if(path==='/owner'){persona='owner';html=renderMmsShopsOwnerStage();}
else if(path==='/partner/kalima'){persona='partner-kalima';html=renderKalimaPartnerStage();}
else if(path==='/partner/relax'){persona='partner-relax';html=renderRelaxSpaPage({partner:true,stageMenu:true});html=html.replace('<head>','<head><script>window.fetch=((original)=>async(url,options)=>String(url).startsWith("/v1/partner/relax-spa/")?new Response(JSON.stringify({ok:true,data:{actor:{id:"stage-partner-relax",role:"mms_partner"},referrals:[],agreements:[],services:[],events:[]}}),{headers:{"Content-Type":"application/json"}}):original(url,options))(window.fetch.bind(window));</script>');html=html.replace('</head>','<style>@media(max-width:760px){main{padding:10px 12px 24px}.hero{margin:8px 0;padding:13px 14px;border-radius:16px}.hero h1{font-size:25px;margin:5px 0}.hero .kicker{font-size:9px}.hero>p:not(.mms-powered),.flow,#stats,section[aria-labelledby="mms-package-payment-title"],footer,#refresh{display:none!important}.nav{margin:7px -12px;padding:3px 12px;position:sticky;top:0;background:var(--paper);z-index:4}.nav a{padding:9px 11px;font-size:12px}.card{padding:12px;border-radius:15px}.cost{padding:8px;gap:4px}#content{margin-top:5px!important}}</style></head>');}
else return null;
html=html.replace('<main', '<aside data-stage-identity style="padding:12px 16px;background:#e4ebd7;color:#243d30;font:13px/1.6 system-ui">STAGE · บัญชีจำลองสำหรับตรวจหน้าจอเท่านั้น · บัญชีร้านจริง: รอยืนยัน · ยังไม่ผูก Partner หรือ Ledger จริง</aside><main');
return html.replace('</body>',(connected?bootstrap(persona):'')+'</body>');}
if(process.argv.includes('--render-only')) {
  const output=fileURLToPath(new URL('../output/stage/',import.meta.url));
  await mkdir(output,{recursive:true});
  for(const [route,name] of [['/owner','owner.html'],['/partner/kalima','kalima-partner.html'],['/partner/relax','partner.html']])await writeFile(output+name,page(route,false));
  console.log('Stage HTML rebuilt; open via loopback server for local data connection.');
} else http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:'+port);const match=url.pathname.match(/^\/stage-api\/(owner|partner-kalima|partner-relax)\/shops\/(kalima|relax)(\/quote)?$/);
if(match){const [,persona,shop,quote]=match;const actor=stageActorForPersona(persona);let data;
if(quote){if(req.method!=='POST')throw Object.assign(Error('METHOD_NOT_ALLOWED'),{status:405});if(req.headers.origin!=='http://127.0.0.1:'+port)throw Object.assign(Error('ORIGIN_NOT_ALLOWED'),{status:403});let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw Error('BODY_TOO_LARGE');}data=await ledger.quote(actor,shop,JSON.parse(raw));}
else{if(req.method!=='GET')throw Object.assign(Error('METHOD_NOT_ALLOWED'),{status:405});data=await ledger.snapshot(actor,shop);}
res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,data}));}
if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
if(req.method!=='GET'){res.writeHead(405);return res.end();}const html=page(url.pathname);res.writeHead(html?200:404,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html||'Stage page not found');
}catch(e){res.writeHead(e.status||409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:false,error:{code:e.code||e.message||'STAGE_ERROR'}}));}}).listen(port,'127.0.0.1',()=>console.log('Local Stage: http://127.0.0.1:'+port+'/owner'));

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCredentialBoundAdminSession} from '../admin-worker/src/credential-bound-admin-session.js';
const require=createRequire(path.resolve(process.env.REFUND_TOOLS_DIR||'../runtime-tools','package.json'));
const {Miniflare}=require('miniflare');
const {decode}=require('@jridgewell/sourcemap-codec');
const output=path.resolve(process.env.REFUND_OUTPUT_DIR||'refund-bundles');
const input=path.resolve(process.env.REFUND_BASELINES_DIR||'refund-live-baselines');
const manifest=JSON.parse(readFileSync(path.join(output,'preserved-manifest.json')));
const hash=x=>createHash('sha256').update(x).digest('hex');
const code=(worker,baseline=false)=>{
 const name=manifest.workers.find(w=>w.worker===worker).main_module;
 return readFileSync(path.join(baseline?input:output,worker,name),'utf8');
};
const modules=(worker,extra='',baseline=false)=>[
 {type:'ESModule',path:'entry.mjs',contents:`export {default${extra}} from './subject.js';`},
 {type:'ESModule',path:'subject.js',contents:code(worker,baseline)}
];

test('exact artifact hashes, complete live interface set and unchanged source overlays',()=>{
 const snapshot=JSON.parse(readFileSync(path.join(input,'snapshot.json')));
 for(const w of manifest.workers){
  assert.equal(hash(code(w.worker)),w.candidate_sha256);
  assert.equal(hash(code(w.worker,true)),w.baseline_sha256);
  for(const h of snapshot.workers.find(x=>x.worker===w.worker).named_handlers)assert.ok(w.exports.includes(h.name));
  const file=w.main_module+'.map';
  const a=JSON.parse(readFileSync(path.join(input,w.worker,file))),b=JSON.parse(readFileSync(path.join(output,w.worker,file)));
  const before=new Map(a.sources.map((n,i)=>[n,a.sourcesContent[i]]));
  const after=new Map(b.sources.map((n,i)=>[n,b.sourcesContent[i]]));
  const allowed=w.worker==='admin-worker'?['refund-ops.js']:['src/index.js'];
  for(const [name,content] of before){assert.ok(after.has(name),'original source retained');if(!allowed.some(x=>name.endsWith(x)))assert.equal(after.get(name),content,'non-Refund overlay unchanged: '+name);}
  const sourceLines=b.sourcesContent.map(s=>s.split('\n').length);
  const lines=decode(b.mappings);assert.ok(lines.length<=code(w.worker).split('\n').length);
  for(const line of lines)for(const s of line)if(s.length>=4){assert.ok(s[1]>=0&&s[1]<b.sources.length);assert.ok(s[2]>=0&&s[2]<sourceLines[s[1]]);}
 }
 assert.equal(manifest.workers[0].exact_baseline_reproduced,true);
 assert.equal(manifest.workers[1].compiled_outside_guard_byte_equal,true);
});

const credentials={ADMIN_LOGIN_CREDENTIAL:'synthetic-owner',ADMIN_SESSION_SECRET:'synthetic-session-secret'};
const origin='https://www.mmdbkk.com';
const cookie=await createCredentialBoundAdminSession(new Request(origin),{id:'synthetic-owner',role:'owner'},credentials);
const auth={Cookie:'mmd_admin_gate_v1='+cookie,Origin:origin};
for(const fault of ['none','receipt-after-commit','projection-after-commit','line-after-delivery','telegram-after-delivery'])test('preserved full admin receipt/reload: '+fault,async()=>{
 let patches=0,line=0,telegram=0;
 const inbox='refund_preserved_synthetic';
 const record={id:'recPreservedSynthetic',fields:{inbox_id:inbox,status:'new',line_user_id:'U'+'a'.repeat(32),payload_json:JSON.stringify({purpose:'refund',refund_amount_due:'4500'})}};
 const mf=new Miniflare({modules:modules('admin-worker'),compatibilityDate:'2026-01-01',r2Buckets:['LINE_SLIP_EVIDENCE'],bindings:{...credentials,AIRTABLE_BASE_ID:'fixture',AIRTABLE_API_KEY:'synthetic',AIRTABLE_TABLE_CONSOLE_INBOX_ID:'fixture',CONFIRM_KEY:'synthetic',TELEGRAM_BOT_TOKEN:'synthetic',TELEGRAM_CHAT_ID:'synthetic'},
  serviceBindings:{MEMBER_DASHBOARD_CHAT_WORKER:async()=>{line++;if(fault==='line-after-delivery')throw Error('synthetic lost acknowledgement');return Response.json({ok:true,mode:'fixture',status:200});}},
  outboundService:async request=>{
   const host=new URL(request.url).hostname;
   if(host==='api.telegram.org'){telegram++;return Response.json(fault==='telegram-after-delivery'?{error:'lost acknowledgement'}:{ok:true,result:{message_id:telegram}},{status:fault==='telegram-after-delivery'?504:200});}
   assert.equal(host,'api.airtable.com','deny real network');
   if(request.method==='GET')return Response.json({records:[structuredClone(record)]});
   assert.equal(request.method,'PATCH');patches++;Object.assign(record.fields,(await request.json()).fields);
   if(fault==='receipt-after-commit'&&patches===1||fault==='projection-after-commit'&&patches===2)return Response.json({error:'synthetic lost acknowledgement'},{status:504});
   return Response.json(record);
  }});
 try{
  const form=new FormData();form.set('inbox_id',inbox);form.set('refund_amount','4500');form.set('file',new File(['synthetic receipt'],'receipt.jpg',{type:'image/jpeg'}));
  const encoded=new Request(origin+'/v1/admin/refunds/receipt',{method:'POST',body:form});
  const first=await mf.dispatchFetch(encoded.url,{method:'POST',headers:{...Object.fromEntries(encoded.headers),...auth},body:await encoded.arrayBuffer()});
  assert.equal(first.status,fault.includes('commit')?503:200);
  for(let n=0;n<2;n++)await mf.dispatchFetch(origin+'/v1/admin/refunds/recover',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({inbox_id:inbox})});
  const read=await (await mf.dispatchFetch(origin+'/v1/admin/refunds/list?inbox_id='+inbox,{headers:auth})).json();
  assert.equal(read.items[0].receipt_uploaded,true);assert.equal(line,fault==='receipt-after-commit'?0:1);assert.equal(telegram,fault==='receipt-after-commit'?0:1);
  if(fault.includes('commit'))assert.equal(read.items[0].receipt_record_state,'unknown');
  if(fault==='line-after-delivery')assert.equal(read.items[0].customer_receipt_delivery_status,'unknown');
  if(fault==='telegram-after-delivery')assert.equal(read.items[0].owner_telegram_delivery_status,'unknown');
  const denied=await mf.dispatchFetch(origin+'/v1/admin/refunds/list');assert.equal(denied.status,401);
 }finally{await mf.dispose();}
});

for(const [initial,baseline] of [[500,true],[500,false],[408,false],[400,false]])test(`preserved LINE ${baseline?'baseline':'candidate'} initial ${initial}`,async()=>{
 let pushes=0;
 const mf=new Miniflare({modules:modules('member-dashboard-chat-worker','',baseline),compatibilityDate:'2026-01-01',bindings:{LINE_CHANNEL_ACCESS_TOKEN:'synthetic'},outboundService:request=>{
  assert.equal(new URL(request.url).hostname,'api.line.me');assert.equal(request.method,'POST');pushes++;return new Response('{}',{status:pushes===1?initial:200});
 }});
 try{
  const response=await mf.dispatchFetch('https://member-dashboard-chat-worker.local/__internal/line/refund-receipt-notify',{method:'POST',headers:{'content-type':'application/json','x-mmd-internal-call':'true','x-mmd-service-binding':'admin-worker'},body:JSON.stringify({line_user_id:'U'+'a'.repeat(32),receipt_url:origin+'/refund-receipt/media?i=synthetic&e=9999999999&s='+'a'.repeat(64),mime_type:'image/jpeg',byte_size:100})});
  const unknown=!baseline&&initial!==400;assert.equal(pushes,unknown?1:2);assert.equal(response.status,unknown?502:200);if(unknown)assert.equal((await response.json()).unknown,true);
 }finally{await mf.dispose();}
});

test('preserved GuideOwnerNotifications named RPC: health and denied notification remain callable',async()=>{
 let health=0;
 const mf=new Miniflare({workers:[
  {name:'subject',modules:modules('member-dashboard-chat-worker',', GuideOwnerNotifications'),compatibilityDate:'2026-01-01',bindings:{TELEGRAM_OPS_CHAT_ID:'-100123',TELEGRAM_ALERTS_THREAD_ID:'1',AUTH_SERVICE_LINE_TO_TELEGRAM:'synthetic'},serviceBindings:{TELEGRAM_WORKER:async request=>{assert.equal(request.method,'GET');assert.equal(new URL(request.url).pathname,'/telegram/internal/router/health');health++;return Response.json({canonical_owner:'telegram-worker',transport:{live_probe:{bot_api_ok:true}}});}},outboundService:()=>{throw Error('real network forbidden');}},
  {name:'probe',modules:true,script:`export default {async fetch(r,env){return Response.json(new URL(r.url).pathname==='/deny'?await env.GUIDE.notifyGuideRequest({channel:'not-telegram',request_id:'synthetic'}):await env.GUIDE.ownerProfile());}}`,compatibilityDate:'2026-01-01',serviceBindings:{GUIDE:{name:'subject',entrypoint:'GuideOwnerNotifications'}}}
 ]});
 try{
  const probe=await mf.getWorker('probe');const profile=await (await probe.fetch('https://fixture.invalid/profile')).json();assert.equal(profile.ok,true);assert.equal(health,1);
  const denied=await (await probe.fetch('https://fixture.invalid/deny')).json();assert.equal(denied.error,'channel_changed');assert.equal(health,1);
 }finally{await mf.dispose();}
});

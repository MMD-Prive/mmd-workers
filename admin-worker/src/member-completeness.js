import {classifyMemberCompleteness} from '../../shared/member-completeness.mjs';
import {readCredentialBoundAdminActor} from './credential-bound-admin-session.js';
import {isOwnerActor} from './owner-my-mmd-recovery-diagnostic.js';
export const MEMBER_COMPLETENESS_API='/v1/admin/my-mmd/completeness';
export const MEMBER_COMPLETENESS_PAGE='/internal/admin/my-mmd/completeness';
const headers={'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'};
const sources={
 members:['tblgWc5VRon5o8Mhk',['member_id','line_id','Clients','Membership Status','Membership Expiry','Points Balance','Full Name']],
 clients:['tblVv58TCbwh5j1fS',['line_user_id']],
 entitlements:['tblNImdF9PKAxhXGi',['member_id','member','client','expire_at','member_status','source_ref']],
 ledger:['tbl5dfnwjUFMLbnWL',['member_id','points','idempotency_key','transaction_status','source','created_at']],
};
export function isMemberCompletenessRequest(request){return [MEMBER_COMPLETENESS_API,MEMBER_COMPLETENESS_PAGE].includes(new URL(request.url).pathname.replace(/\/$/,''));}
async function list(env,table,fields){
 const rows=[];let offset='';
 for(let page=0;page<50;page++){
  const u=new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${table}`);u.searchParams.set('pageSize','100');for(const f of fields)u.searchParams.append('fields[]',f);if(offset)u.searchParams.set('offset',offset);
  const req=new Request(u,{headers:{Authorization:`Bearer ${env.AIRTABLE_API_KEY}`},signal:AbortSignal.timeout(10000)});const r=env.AIRTABLE_HTTP?.fetch?await env.AIRTABLE_HTTP.fetch(req):await fetch(req);
  if(!r.ok)throw Error('source_unavailable');const d=await r.json();if(!Array.isArray(d.records))throw Error('source_malformed');rows.push(...d.records);offset=d.offset||'';if(!offset)return rows;
 }throw Error('source_incomplete');
}
export async function handleMemberCompleteness(request,env){
 const json=(body,status=200)=>Response.json(body,{status,headers});
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 const actor=await readCredentialBoundAdminActor(request,env);if(!isOwnerActor(actor))return json({ok:false,error:'owner_required'},403);
 if(new URL(request.url).pathname.replace(/\/$/,'')===MEMBER_COMPLETENESS_PAGE)return new Response(page(),{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 if(!env.AIRTABLE_API_KEY||!env.AIRTABLE_BASE_ID)return json({ok:false,error:'source_not_configured'},503);
 try{const data={};for(const [key,[table,fields]] of Object.entries(sources))data[key]=await list(env,table,fields);return json({ok:true,checked_at:new Date().toISOString(),coverage:Object.fromEntries(Object.entries(data).map(([key,rows])=>[key,{read:rows.length,all_pages_read:true}])),...classifyMemberCompleteness(data)});}catch{return json({ok:false,state:'partial',error:'completeness_unavailable',message:'ยังอ่านข้อมูลไม่ครบ กรุณาลองใหม่'},503);}
}
function page(){return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SĪGIL · ตรวจข้อมูลสมาชิก</title><style>body{background:#e9eaed;color:#25272b;font:18px/1.65 system-ui,sans-serif;margin:0}main{max-width:1000px;margin:auto;padding:24px}a{color:#883600}button{min-height:48px;background:#ad4600;color:white;border:0;padding:12px 24px;font:inherit;border-radius:12px}li,pre{background:white;padding:16px;border-radius:12px;overflow-wrap:anywhere}pre{white-space:pre-wrap;font:inherit}</style><main><a href="/internal/admin/dashboard">← SĪGIL system</a><h1>ตรวจข้อมูลสมาชิก</h1><p>ตรวจโครงสร้างและการเชื่อมข้อมูล ไม่ใช่การยืนยันตัวตน ประวัติ หรือยอดเงินโดยอัตโนมัติ</p><button id="reload">ตรวจใหม่</button><p id="state" role="status">กำลังอ่านข้อมูล</p><pre id="counts"></pre><ul id="queue"></ul><a href="/internal/admin/membership-access">เปิดเครื่องมือตรวจและแก้สิทธิ์สมาชิก</a> · <a href="/internal/admin/my-mmd/recovery">ตรวจหลักฐานตัวตนและประวัติ</a></main><script>async function load(){document.getElementById('state').textContent='กำลังอ่านข้อมูล';document.getElementById('counts').textContent='';document.getElementById('queue').replaceChildren();try{const r=await fetch('${MEMBER_COMPLETENESS_API}',{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok||!d.ok)throw Error();document.getElementById('state').textContent='ตรวจโครงสร้างแล้ว · '+d.checked_at;document.getElementById('counts').textContent=JSON.stringify({coverage:d.coverage,counts:d.counts,clients:d.clients,ledger:d.ledger},null,2);for(const row of (d.rows||[]).filter(x=>x.reasons.length)){const li=document.createElement('li');li.textContent=row.record_id+' · '+row.reasons.join(', ');document.getElementById('queue').append(li)}}catch{document.getElementById('state').textContent='ยังอ่านข้อมูลไม่ครบ กดตรวจใหม่ได้ · ไม่แสดงยอดศูนย์แทนข้อมูลที่ขาด'}}document.getElementById('reload').onclick=load;load();</script></html>`;}

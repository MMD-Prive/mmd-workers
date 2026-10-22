export function wireMmsAiOpsUi(page = '') {
  if (!page || page.includes('data-mms-ai-ops-v1')) return page;
  const panel = `<section class="form-card mms-live-ops" data-mms-ai-ops-v1 aria-labelledby="mmsOpsTitle">
<div class="section-head"><div><span class="section-kicker">MMS · CONNECTED OPERATIONS</span><h2 id="mmsOpsTitle">Kenji AI + HENNA</h2><p>ดูสิ่งที่ต้องจัดการ แล้วเปิดทำต่อในรายการจริงได้เลยครับ</p></div><button type="button" class="btn" id="mmsOpsRefresh">อัปเดต</button></div>
<p id="mmsOpsStatus" role="status" aria-live="polite">กำลังอ่านข้อมูล MMS…</p>
<div id="mmsOpsContent" hidden>
<div class="mms-ops-grid"><article><h3>Kenji · ดูงานต่อ</h3><p id="mmsOpsQueueNote"></p><div id="mmsOpsActions" class="mms-ops-actions"></div><p id="mmsOpsReadiness"></p><a class="btn" href="/internal/ceo/kenji-control">เปิด Kenji Control ↗</a></article>
<article><h3>HENNA · ดูแลการสื่อสาร</h3><p id="mmsHennaStatus"></p><p id="mmsHennaHandoff"></p><a class="btn" href="/internal/admin/telegram-brief">เปิด HYPE + HENNA ↗</a><p class="mms-ops-footnote">สถานะการเชื่อมต่อยังไม่ใช่หลักฐานว่าข้อความส่งถึงผู้รับครับ</p></article></div>
<details><summary>สถานะและแหล่งข้อมูล</summary><p id="mmsKenjiControls"></p><ul id="mmsOpsSources"></ul><p class="mms-ops-footnote">สรุปจากจำนวนและสถานะที่อ่านได้ การอนุมัติ ส่งข้อความ และจัดการเงิน ใช้หน้าทำงานเดิมตามสิทธิ์ของคุณ</p></details></div></section>`;
  const styles = `<style>
@font-face{font-family:MMSOpsSeed;src:url(https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:MMSOpsSeed;src:url(https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2) format('woff2');font-weight:600 800;font-display:swap}
[data-mms-ai-ops-v1]{margin-bottom:20px;background:#f4f7f1;color:#173d2b;border:1px solid #ccdacd;border-radius:22px;padding:20px;min-width:0;font-family:MMSOpsSeed,'LINE Seed Sans TH',Tahoma,sans-serif}
[data-mms-ai-ops-v1] h2,[data-mms-ai-ops-v1] h3,[data-mms-ai-ops-v1] p,[data-mms-ai-ops-v1] li,[data-mms-ai-ops-v1] summary{color:#173d2b;-webkit-text-fill-color:#173d2b}
[data-mms-ai-ops-v1] h2{font-size:clamp(24px,5vw,32px);line-height:1.25}[data-mms-ai-ops-v1] h3{font-size:19px;line-height:1.4}[data-mms-ai-ops-v1] p,[data-mms-ai-ops-v1] li{font-size:14px;line-height:1.7;overflow-wrap:anywhere}
.mms-ops-grid{display:grid;gap:12px}.mms-ops-grid article{min-width:0;background:#fff;padding:12px 0;border-radius:16px}.mms-ops-actions{display:grid;gap:8px;margin-bottom:12px}
[data-mms-ai-ops-v1] .btn{display:inline-flex;align-items:center;justify-content:space-between;gap:10px;min-height:46px!important;max-width:100%;height:auto;white-space:normal;text-align:left;color:#fff;-webkit-text-fill-color:#fff;background:#173d2b;border-color:#173d2b;font-size:14px!important;line-height:1.5;text-decoration:none}
[data-mms-ai-ops-v1] .btn:focus-visible,[data-mms-ai-ops-v1] summary:focus-visible{outline:3px solid #749d36;outline-offset:3px}[data-mms-ai-ops-v1] .btn:disabled{opacity:.65}
[data-mms-ai-ops-v1] .section-head{display:flex;align-items:flex-start;flex-wrap:wrap;gap:12px}[data-mms-ai-ops-v1] .section-head>div{flex:1 1 210px}[data-mms-ai-ops-v1] .mms-ops-footnote{font-size:12px;color:#4d6254;-webkit-text-fill-color:#4d6254}
[data-mms-ai-ops-v1] details{margin-top:12px;padding-top:12px;border-top:1px solid #ccdacd}[data-mms-ai-ops-v1] summary{min-height:44px;cursor:pointer;font-weight:650;line-height:1.6}[data-mms-ai-ops-v1] ul{padding-left:20px}[data-mms-ai-ops-v1] [hidden]{display:none!important}
@media(min-width:760px){.mms-ops-grid{grid-template-columns:1fr 1fr}.mms-ops-grid article{padding:18px}}
</style>`;
  const script = `<script data-mms-ai-ops-client>(function(){
'use strict';
var root=document.querySelector('[data-mms-ai-ops-v1]');if(!root)return;
var refresh=document.getElementById('mmsOpsRefresh'),status=document.getElementById('mmsOpsStatus'),content=document.getElementById('mmsOpsContent'),actions=document.getElementById('mmsOpsActions'),pending=false;
function text(id,value){document.getElementById(id).textContent=value}
function state(value,on,off){return value===true?on:value===false?off:'ยังตรวจไม่ได้'}
function goTab(){var tab=location.hash.slice(1);if(!['applications','prebookings','therapists','overview'].includes(tab))return;var button=document.querySelector('[data-tab="'+tab+'"]');if(button)button.click()}
window.addEventListener('hashchange',goTab);goTab();
function render(data){
 var s=data.sources,q=data.queue;actions.replaceChildren();
 text('mmsOpsQueueNote',s.snapshot.complete&&s.workspace.complete?'อ่านข้อมูลครบจากคิว MMS':'อ่านข้อมูลได้บางส่วน · จำนวนอาจยังไม่ครบ');
 (data.actions||[]).forEach(function(a){if(!/^\\/internal\\/admin\\/mms#(applications|therapists|prebookings)$/.test(a.href))return;var link=document.createElement('a');link.className='btn';link.href=a.href;link.textContent=a.label+' · '+a.count+(a.partial?' (ที่อ่านได้)':'')+' ↗';link.addEventListener('click',function(){requestAnimationFrame(goTab)});actions.append(link)});
 if(!actions.children.length){var p=document.createElement('p');p.textContent=s.snapshot.complete&&s.workspace.complete?'ยังไม่มีรายการในคิวที่ต้องดูต่อ':'ยังสรุปคิวทั้งหมดไม่ได้ กดอัปเดตเพื่อตรวจอีกครั้งครับ';actions.append(p)}
 text('mmsOpsReadiness','Therapist ที่พร้อมให้จับคู่: '+(q.available_therapists==null?'ยังตรวจไม่ได้':q.available_therapists+(s.workspace.complete?' คน':' คนที่อ่านได้'))+' · งานจริงในแอป: '+(q.production_jobs==null?'ยังตรวจไม่ได้':q.production_jobs+(s.workspace.complete?'':' (ที่อ่านได้)')));
 text('mmsHennaStatus','LINE: '+state(data.henna.configured,'ตั้งค่าแล้ว','ยังตั้งค่าไม่ครบ')+' · ตอบอัตโนมัติ: '+state(data.henna.auto_reply_enabled,'เปิด','ปิด'));
 var ops=data.henna.lanes.find(function(l){return l.key==='mms_ops'});
 text('mmsHennaHandoff','ส่งต่อ MMS: '+state(data.henna.handoff_binding_configured,'มีตัวเชื่อม','ยังไม่มีตัวเชื่อม')+' · ปลายทาง: '+(ops&&ops.status==='configured'?'ตั้งค่าแล้ว':ops&&ops.status!=='unknown'?'ต้องตรวจการตั้งค่า':'ยังตรวจไม่ได้'));
 text('mmsKenjiControls','Kenji LINE: '+state(data.kenji.line_auto_reply_enabled,'เปิดตอบ','ปิดตอบ')+' · ตัวหยุดการตอบ Model: '+state(data.kenji.model_reply_kill_switch_active,'ทำงาน','ไม่ทำงาน')+' · ตัวหยุดการแก้ข้อมูล: '+state(data.kenji.mutations_kill_switch_active,'ทำงาน','ไม่ทำงาน'));
 var list=document.getElementById('mmsOpsSources');list.replaceChildren();Object.keys(s).forEach(function(key){var li=document.createElement('li');var names={snapshot:'ใบสมัครและคำขอจอง',workspace:'Therapist และงานในแอป',henna:'HENNA · MMS LINE',kenji_controls:'Kenji · ค่าควบคุม',telegram:'Telegram · เส้นทาง MMS'};li.textContent=names[key]+': '+(s[key].available?(s[key].complete===false?'อ่านได้บางส่วน':'อ่านได้'):'ยังอ่านไม่ได้');list.append(li)});
 content.hidden=false;status.textContent='ตรวจล่าสุด '+new Date(data.checked_at).toLocaleString('th-TH');
}
async function load(){if(pending)return;pending=true;refresh.disabled=true;content.hidden=true;actions.replaceChildren();status.replaceChildren();status.textContent='กำลังอ่านข้อมูล MMS…';var c=new AbortController(),timer=setTimeout(function(){c.abort()},12000);try{
 var response=await fetch('/v1/admin/mms/ai-ops',{method:'GET',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},signal:c.signal});
 if(response.status===401||response.status===403){status.textContent='กรุณาเข้าสู่ระบบอีกครั้งครับ ';var login=document.createElement('a');login.href='/internal/admin/login?next=%2Finternal%2Fadmin%2Fmms';login.textContent='เข้าสู่ระบบ';status.append(login);return}
 var data=await response.json();if(!response.ok||data.ok!==true||data.schema!=='mms_ai_ops_read_v1')throw Error('invalid_source');render(data);
 }catch(e){content.hidden=true;status.textContent='ยังอ่านข้อมูลล่าสุดไม่ได้ กดอัปเดตเพื่อลองอีกครั้งครับ'}finally{clearTimeout(timer);pending=false;refresh.disabled=false}}
refresh.addEventListener('click',load);window.addEventListener('mms-admin:snapshot',load);load();
})();</script>`;
  return page.replace('<section class="panel active" id="overview" aria-labelledby="overviewTitle">', '<section class="panel active" id="overview" aria-labelledby="overviewTitle">' + panel)
    .replace('</head>', styles + '</head>').replace('</body>', script + '</body>');
}

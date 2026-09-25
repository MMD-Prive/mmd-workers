const AIRTABLE_API = "https://api.airtable.com/v0";
const CLAIMS_TABLE_DEFAULT = "tbluoZ5JiRcoUP6WT";

export const MODEL_LINK_AIRTABLE_TIMEOUT_MS = 9000;
export const MODEL_LINK_QUEUE_API_TIMEOUT_MS = 12000;
export const MODEL_LINK_SEARCH_API_TIMEOUT_MS = 14000;
export const MODEL_LINK_BIND_API_TIMEOUT_MS = 18000;

export function safePictureUrl(value) {
  const raw = clean(value);
  if (!raw || raw.length > 2048) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href.slice(0, 2048) : "";
  } catch {
    return "";
  }
}

export function safeClaimSummaryWithAvatar(record) {
  const fields = record?.fields || {};
  const hash = clean(fields.line_user_id_hash);
  return {
    claim_id: clean(fields.claim_id),
    line_display_name: clean(fields.line_display_name),
    line_picture_url: safePictureUrl(fields.line_picture_url),
    claim_status: clean(fields.claim_status),
    environment: clean(fields.line_environment) || "published",
    verified_at: clean(fields.verified_at),
    linked_at: clean(fields.linked_at),
    line_ref: hash ? hash.slice(0, 8) : "",
  };
}

export async function listPendingModelLineClaimsWithAvatar(env) {
  const result = await airtableList(
    env,
    claimsTable(env),
    'OR({claim_status}="verified_unlinked",{claim_status}="conflict")',
    100,
    MODEL_LINK_AIRTABLE_TIMEOUT_MS,
  );

  if (!result.ok) {
    return {
      ok: false,
      error: "identity_claim_queue_unavailable",
      status: result.status || 503,
    };
  }

  const items = result.records
    .map(safeClaimSummaryWithAvatar)
    .filter((item) => item.claim_id)
    .sort((a, b) => String(b.verified_at || "").localeCompare(String(a.verified_at || "")));

  return { ok: true, count: items.length, items };
}

export function renderModelLineLinkPageWithAvatar() {
  const body = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD MODEL · คิวเชื่อม LINE</title><style>
:root{color-scheme:dark;--bg:#090908;--line:#393329;--gold:#d8bd83;--text:#f5f0e4;--muted:#aaa296;--ok:#72c68f;--danger:#e07f75;--blue:#86b9dc;--burg:#c995a3}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#2c2315 0,transparent 34%),var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue","Noto Sans Thai",sans-serif}.wrap{width:min(1160px,100%);margin:auto;padding:24px}.top,.row,.identity{display:flex}.top{gap:16px;align-items:flex-start;justify-content:space-between;margin-bottom:24px}.eyebrow{font-size:14px;letter-spacing:.18em;color:var(--gold);font-weight:700}.top h1{font-size:clamp(25px,4vw,42px);line-height:1.08;margin:7px 0}.top p{color:var(--muted);max-width:790px;margin:0}.back{color:var(--text);text-decoration:none;border:1px solid var(--line);padding:10px 13px;border-radius:12px;white-space:nowrap}.stats{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 22px}.pill,.badge{border:1px solid var(--line);background:#14120f;border-radius:999px;padding:8px 12px;color:var(--muted)}.pill b{color:var(--text)}.queue{display:grid;gap:14px}.card{border:1px solid var(--line);background:linear-gradient(180deg,#15130f,#0f0e0c);border-radius:18px;padding:18px}.row{gap:12px;justify-content:space-between;align-items:flex-start}.identity{gap:12px;align-items:flex-start;min-width:0}.identity-copy{min-width:0}.avatar{width:60px;height:60px;border-radius:50%;overflow:hidden;position:relative;flex:0 0 auto;border:1px solid rgba(216,189,131,.38);background:#251f17;display:grid;place-items:center;color:var(--gold);font-weight:800;font-size:20px}.avatar img{width:100%;height:100%;object-fit:cover;display:block;position:relative;z-index:2}.avatar .initial{position:absolute;inset:0;display:grid;place-items:center;z-index:1}.name{font-size:20px;font-weight:700;overflow-wrap:anywhere}.verified{font-size:14px;letter-spacing:.1em;color:var(--ok);font-weight:800;margin-top:2px}.meta{font-size:14px;color:var(--muted);margin-top:4px}.status{font-size:14px;letter-spacing:.08em;border:1px solid var(--line);border-radius:999px;padding:6px 9px;color:var(--gold);white-space:nowrap}.search-wrap{margin-top:16px}.lane-tabs{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}.lane-btn{padding:7px 11px;border-radius:999px;background:#17140f;color:var(--muted);border:1px solid var(--line);font-weight:700;font-size:12px}.lane-btn.active{background:#e6cf9a;color:#17120b;border-color:#e6cf9a}.lane-btn{font-size:14px;min-height:44px}.search{display:grid;grid-template-columns:1fr auto;gap:8px}input,button{font:inherit}input{min-width:0;background:#0b0a09;border:1px solid var(--line);border-radius:12px;color:var(--text);padding:12px 13px}button{border:0;border-radius:12px;background:var(--gold);color:#1b160e;font-weight:800;padding:12px 16px;cursor:pointer}button.secondary{background:#242019;color:var(--text);border:1px solid var(--line)}button:disabled{opacity:.7;cursor:not-allowed;background:#33302a;color:#bdb7aa;border:1px solid #615b50}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #f2d997;outline-offset:3px}button{min-height:46px}input{font-size:16px;min-height:46px}.results{display:grid;gap:9px;margin-top:10px}.source-note{font-size:14px;color:var(--muted);margin:7px 2px}.candidate{border:1px solid var(--line);border-radius:14px;padding:13px;background:#0b0a09;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.candidate strong{display:block;font-size:16px}.candidate-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.mini{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:5px 9px;font-size:13px;letter-spacing:.08em;font-weight:800}.mini.drive{color:var(--gold)}.mini.airtable{color:var(--ok)}.mini.public{color:var(--blue)}.mini.private{color:var(--burg)}.folder{font-size:14px;color:var(--muted);word-break:break-word;margin-top:5px}.action-drive{background:#e6cf9a}.empty,.notice{border:1px dashed var(--line);border-radius:18px;padding:28px;color:var(--muted);text-align:center}.empty b{display:block;color:var(--text);font-size:16px;margin-bottom:6px}.empty p{margin:0 auto 14px;max-width:680px}.empty button{margin-top:2px}.notice{margin-bottom:14px;font-size:16px}.notice.ok{border-style:solid;color:var(--ok)}.notice.err{border-style:solid;color:var(--danger)}@media(max-width:700px){.wrap{padding:18px 14px}.top{display:block}.back{display:inline-block;margin-top:16px}.avatar{width:52px;height:52px;font-size:18px}.row{display:block}.status{display:inline-flex;white-space:normal;margin-top:9px;max-width:100%;font-size:13px;padding:6px 9px}.search,.candidate{grid-template-columns:1fr}.candidate button{width:100%}}
</style></head><body><main class="wrap"><div class="top"><div><div class="eyebrow">MMD MODEL · ตรวจยืนยันข้อมูล</div><h1>คิวเชื่อม LINE กับ Model</h1><p>คิวเดียวสำหรับ Public และ Private Model รวมถึงคนที่สมัครกับ MMD ทาง LINE แล้วมีโฟลเดอร์อยู่ใน MMD Catalogue เดิม ระบบค้นได้ทั้ง Canonical Model ใน Airtable และ Approved Model Folder ใน Drive แต่จะไม่เดาหรือเชื่อม LINE ให้อัตโนมัติ เปอร์เป็นคนยืนยัน Model ที่ถูกต้องก่อนทุกครั้ง</p></div><a class="back" href="/internal/admin/kenji">← Kenji Admin</a></div><div id="notice" role="status" aria-live="polite"></div><div class="stats"><div class="pill">รอตรวจ <b id="count">—</b></div><div class="pill">ค้นหาครอบคลุม: <b>ทั้งหมด</b></div><div class="pill">ชื่อและรูปใช้ประกอบการค้นหาเท่านั้น</div></div><section id="queue" class="queue" aria-live="polite" aria-busy="true"><div class="empty"><b>กำลังโหลด Pending Model Link…</b><p>กำลังอ่านคิวจาก backend</p></div></section></main><script>
(function(){'use strict';
const QUEUE_TIMEOUT_MS=${MODEL_LINK_QUEUE_API_TIMEOUT_MS};
const SEARCH_TIMEOUT_MS=${MODEL_LINK_SEARCH_API_TIMEOUT_MS};
const BIND_TIMEOUT_MS=${MODEL_LINK_BIND_API_TIMEOUT_MS};
const root=document.querySelector('main.wrap');
const queue=document.getElementById('queue');
const count=document.getElementById('count');
const noticeBox=document.getElementById('notice');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initial=s=>(Array.from(String(s||'LINE identity').trim())[0]||'?').toUpperCase();
function notice(msg,type=''){noticeBox.innerHTML=msg?'<div class="notice '+type+'" role="'+(type==='err'?'alert':'status')+'">'+esc(msg)+'</div>':''}
function queueLoading(){count.textContent='…';queue.setAttribute('aria-busy','true');queue.innerHTML='<div class="empty"><b>กำลังโหลดคิวรายการ</b><p>กำลังดึงรายการที่รอตรวจสอบ</p></div>'}
function queueError(){count.textContent='!';queue.setAttribute('aria-busy','false');queue.innerHTML='<div class="empty"><b>ยังโหลดรายการไม่ได้</b><p>ลองกดโหลดใหม่อีกครั้ง หากยังไม่สำเร็จให้แจ้งผู้ดูแล</p><button class="secondary" type="button" data-action="reload-claims">โหลดใหม่</button></div>'}
async function api(url,opt={}){const timeout=opt.timeout||QUEUE_TIMEOUT_MS;const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{credentials:'include',method:opt.method||'GET',body:opt.body,signal:ctrl.signal,headers:{accept:'application/json','content-type':'application/json',...(opt.headers||{})}});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch(e){throw new Error(/^\s*</.test(raw||'')?'Endpoint returned HTML · HTTP '+r.status:'Invalid JSON · HTTP '+r.status)}if(!r.ok||d.ok===false)throw new Error(d.error||d.message||('HTTP '+r.status));return d}catch(e){if(e&&e.name==='AbortError')throw new Error('Request timeout — backend ยังไม่ตอบกลับ');throw e}finally{clearTimeout(t)}}
function claimLabel(status){return status==='verified_unlinked'?'ยืนยัน LINE แล้ว · รอเชื่อม Model':status==='conflict'?'พบข้อมูลซ้ำ · รอตรวจสอบ':'รอตรวจสอบ'}
function candidateStatus(candidate){if(candidate.source==='drive'&&candidate.drive_folder_id)return 'โฟลเดอร์พร้อมเพิ่ม';return /^active$/i.test(String(candidate.status||''))?'พร้อมเชื่อม':'ยังไม่พร้อมเชื่อม'}
function avatar(x){const n=x.line_display_name||'LINE identity',u=x.line_picture_url||'';return '<div class="avatar"><span class="initial">'+esc(initial(n))+'</span>'+(u?'<img src="'+esc(u)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">':'')+'</div>'}
function laneTabs(){return '<div class="lane-tabs"><button class="lane-btn active" type="button" data-action="set-lane" data-lane="all">ทั้งหมด</button><button class="lane-btn" type="button" data-action="set-lane" data-lane="public">Public</button><button class="lane-btn" type="button" data-action="set-lane" data-lane="private">Private</button></div>'}
async function load(){try{notice('');queueLoading();const d=await api('/v1/admin/models/activation-candidates?mode=line-link-claims',{timeout:QUEUE_TIMEOUT_MS});const items=d.items||[];count.textContent=d.count??items.length;render(items)}catch{notice('โหลดรายการไม่สำเร็จ กรุณาลองโหลดใหม่','err');queueError()}}
function render(items){queue.setAttribute('aria-busy','false');if(!items.length){queue.innerHTML='<div class="empty"><b>ยังไม่มี Model ที่รอเชื่อม LINE</b><p>เมื่อ Model ยืนยัน LINE แล้ว รายการจะขึ้นที่นี่ ไม่ว่าจะมาจาก Public, Private หรือรับสมัครกันทาง LINE</p><button class="secondary" type="button" data-action="reload-claims">โหลดใหม่</button></div>';return}queue.innerHTML=items.map(x=>'<article class="card" data-claim="'+esc(x.claim_id)+'" data-lane="all"><div class="row"><div class="identity">'+avatar(x)+'<div class="identity-copy"><div class="name">'+esc(x.line_display_name||'LINE identity')+'</div><div class="verified">ยืนยันบัญชี LINE แล้ว</div><div class="meta">ยืนยันเมื่อ '+esc(x.verified_at||'—')+' · '+esc(x.environment==='published'?'บัญชีจริง':'บัญชีทดสอบ')+' · รหัสอ้างอิง '+esc(x.line_ref||'—')+'</div></div></div><span class="status">'+claimLabel(x.claim_status)+'</span></div><div class="search-wrap">'+laneTabs()+'<div class="search"><input value="'+esc(x.line_display_name||'')+'" placeholder="ค้นชื่อ / code เช่น Book EI / Babe B / EMs01"><button class="secondary" type="button" data-action="search-model">ค้น Model</button></div></div><div class="results" aria-live="polite"></div></article>').join('')}
function laneBadges(m){const lanes=Array.isArray(m.lanes)?m.lanes:[];return lanes.map(l=>'<span class="mini '+esc(l)+'">'+esc(l.toUpperCase())+'</span>').join('')}
function candidateHtml(m){const source=m.source==='drive'?'drive':'airtable';const sourceLabel=source==='drive'?'DRIVE':'AIRTABLE';const path=m.folder_path||m.folder_name||m.drive_folder_id||m.drive_folder_url||'ยังไม่มี Drive folder';const canExisting=source==='airtable'&&m.active&&m.model_record_id&&(m.drive_folder_id||m.drive_folder_url);const driveOnly=source==='drive'&&m.drive_folder_id;let action='';if(driveOnly){action='<button class="action-drive" type="button" data-action="materialize-model" data-folder-id="'+esc(m.drive_folder_id)+'">สร้าง Model + เชื่อม LINE</button>'}else{action='<button type="button" data-action="bind-model" data-model-id="'+esc(m.model_record_id||'')+'" '+(!canExisting?'disabled':'')+'>'+(m.active?'เชื่อม LINE':'ยังไม่พร้อม')+'</button>'}return '<div class="candidate"><div><div class="candidate-top"><strong>'+esc(m.working_name||m.folder_name||'Model')+'</strong><span class="mini '+source+'">'+sourceLabel+'</span>'+laneBadges(m)+'</div><div class="meta">'+esc(m.model_lookup_key||'—')+' · '+candidateStatus(m)+'</div><div class="folder">'+esc(path)+'</div></div>'+action+'</div>'}
async function searchModel(btn){const card=btn.closest('.card'),input=card.querySelector('input'),out=card.querySelector('.results'),q=input.value.trim(),lane=card.dataset.lane||'all';if(!q){out.innerHTML='<div class="meta">กรอกชื่อหรือ code ของ Model ก่อนค้นหา</div>';return}btn.disabled=true;out.innerHTML='<div class="meta">กำลังค้นรายชื่อ Model และโฟลเดอร์ที่อนุมัติ…</div>';try{const d=await api('/v1/admin/models/activation-candidates?mode=line-link-candidates&q='+encodeURIComponent(q)+'&lane='+encodeURIComponent(lane),{timeout:SEARCH_TIMEOUT_MS});const items=d.items||[];const sourceMsg=d.warning==='drive_directory_unavailable'?' · ค้นโฟลเดอร์ไม่สำเร็จชั่วคราว':d.warning==='airtable_models_unavailable'?' · ค้นรายชื่อ Model ไม่สำเร็จชั่วคราว':'';if(!items.length){out.innerHTML='<div class="meta">ไม่พบ Model ในกลุ่ม '+esc(lane==='all'?'ทั้งหมด':lane)+sourceMsg+'</div>';return}out.innerHTML='<div class="source-note">พบ '+items.length+' รายการ · '+esc(lane==='all'?'ทั้งหมด':lane)+sourceMsg+'</div>'+items.map(candidateHtml).join('')}catch{out.innerHTML='<div class="meta">ค้นหาไม่สำเร็จ ตรวจคำค้นแล้วลองใหม่</div>'}finally{btn.disabled=false}}
async function reconcileClaim(claimId){try{const d=await api('/v1/admin/models/activation-candidates?mode=line-link-claims',{timeout:QUEUE_TIMEOUT_MS});const items=d.items||[];count.textContent=d.count??items.length;render(items);return !items.some(x=>x.claim_id===claimId)}catch{return false}}
async function bindModel(btn){const card=btn.closest('.card'),claimId=card.dataset.claim,modelId=btn.dataset.modelId;if(!claimId||!modelId)return;if(!confirm('ยืนยันผูก LINE นี้กับ Canonical Model และ Drive folder ที่เลือก?'))return;btn.disabled=true;try{const d=await api('/v1/admin/model/activation/issue',{method:'POST',body:JSON.stringify({mode:'bind_verified_claim',claim_id:claimId,model_record_id:modelId,confirm:true}),timeout:BIND_TIMEOUT_MS});notice('เชื่อม '+((d.model&&d.model.working_name)||'Model')+' สำเร็จแล้ว — ให้ Model เข้า MMD MODEL ด้วย LINE เดิมได้เลย','ok');await load()}catch(e){const committed=await reconcileClaim(claimId);if(committed){notice('เชื่อมสำเร็จแล้ว · ยืนยันจากสถานะล่าสุดบน server','ok');return}notice('เชื่อมข้อมูลไม่สำเร็จ ตรวจสถานะล่าสุดแล้วลองอีกครั้ง','err');btn.disabled=false}}
async function materializeModel(btn){const card=btn.closest('.card'),claimId=card.dataset.claim,folderId=btn.dataset.folderId;if(!claimId||!folderId)return;if(!confirm('ระบบจะตรวจ Drive folder นี้ซ้ำจาก backend แล้วสร้าง Canonical Model ใน Airtable ก่อนเชื่อม LINE ยืนยันดำเนินการ?'))return;btn.disabled=true;try{const d=await api('/v1/admin/model/activation/issue',{method:'POST',body:JSON.stringify({mode:'materialize_drive_verified_claim',claim_id:claimId,drive_folder_id:folderId,confirm:true}),timeout:BIND_TIMEOUT_MS});notice('สร้าง/ใช้ Canonical Model และเชื่อม LINE สำเร็จ'+(d.lane?' · '+d.lane.toUpperCase():'')+' — เข้า MMD MODEL ด้วย LINE เดิมได้เลย','ok');await load()}catch(e){const committed=await reconcileClaim(claimId);if(committed){notice('สร้าง/เชื่อมสำเร็จแล้ว · ยืนยันจากสถานะล่าสุดบน server','ok');return}notice('สร้างหรือเชื่อมข้อมูลไม่สำเร็จ ตรวจสถานะล่าสุดแล้วลองอีกครั้ง','err');btn.disabled=false}}
function setLane(btn){const card=btn.closest('.card');if(!card)return;card.dataset.lane=btn.dataset.lane||'all';card.querySelectorAll('[data-action="set-lane"]').forEach(x=>x.classList.toggle('active',x===btn));const searchBtn=card.querySelector('[data-action="search-model"]');if(card.querySelector('input')?.value.trim())searchModel(searchBtn)}
root.addEventListener('click',event=>{const btn=event.target.closest('[data-action]');if(!btn||!root.contains(btn))return;const action=btn.dataset.action;if(action==='reload-claims')load();if(action==='set-lane')setLane(btn);if(action==='search-model')searchModel(btn);if(action==='bind-model')bindModel(btn);if(action==='materialize-model')materializeModel(btn)});
root.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('.search input')){event.preventDefault();const btn=event.target.closest('.card')?.querySelector('[data-action="search-model"]');if(btn)searchModel(btn)}});
load();
})();
</script></body></html>`;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'self'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    },
  });
}

async function airtableList(env, table, formula, pageSize = 20, timeoutMs = MODEL_LINK_AIRTABLE_TIMEOUT_MS) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, records: [] };
  const params = new URLSearchParams({ pageSize: String(pageSize), maxRecords: String(pageSize) });
  if (formula) params.set("filterByFormula", formula);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), Math.max(1000, Number(timeoutMs || MODEL_LINK_AIRTABLE_TIMEOUT_MS)));
  try {
    const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, records: [] };
    return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
  } catch {
    return { ok: false, status: 503, records: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function claimsTable(env) {
  return clean(env.AIRTABLE_TABLE_MODEL_LINE_IDENTITY_CLAIMS || CLAIMS_TABLE_DEFAULT);
}

function clean(value) {
  return String(value ?? "").trim();
}

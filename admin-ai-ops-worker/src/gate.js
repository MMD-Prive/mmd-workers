import aiOpsWorker from "./ceo-bridge.js";
import { COMMAND_CENTER_PATH } from "./command-center.js";
import {
  FOLLOW_UP_ACTION_PATH,
  FOLLOW_UP_INTERNAL,
  FOLLOW_UP_STATE_PATH,
  FOLLOW_UP_SYNC_PATH,
  deriveFollowUpCandidates,
  internalFollowUpRequest,
} from "./follow-up-autopilot.js";

export { FollowUpAutopilot } from "./follow-up-autopilot.js";

const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const CLIENT_PATH = "/v1/admin/ai-ops/client.js";
const AI_OPS_PREFIX = "/v1/admin/ai-ops/";
const MEDIA_FLUSH_PREVIEW_PATH = "/v1/admin/ai-ops/media/flush";
const MEDIA_FLUSH_ADMIN_PATH = "/v1/admin/model-media/flush-preview";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method !== "OPTIONS" && path.startsWith(AI_OPS_PREFIX) && path !== CLIENT_PATH) {
      const service = env.MMS_ADMIN;
      if (typeof service?.fetch !== "function") return json({ ok: false, error: "admin_service_unavailable" }, 503);
      const auth = await verifyAdminStrict(request, service);
      if (!auth.ok) return unauthorized();
    }

    if (path === MEDIA_FLUSH_PREVIEW_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      if (request.headers.get("origin") !== url.origin) {
        return json({ ok: false, error: "same_origin_required" }, 403);
      }
      const input = await request.json().catch(() => null);
      if (!input || !["preview_all", "stage_all", "review_queue"].includes(input.action) || Object.keys(input).some(k => !["action", "run_id"].includes(k))) return json({ok:false,error:"media_action_invalid"},400);
      const headers = new Headers({ "accept": "application/json", "content-type": "application/json", "origin": url.origin });
      for (const key of ["cookie", "user-agent"]) {
        const value = request.headers.get(key);
        if (value) headers.set(key, value);
      }
      try {
        const target = new URL(MEDIA_FLUSH_ADMIN_PATH, url.origin);
        return await env.MMS_ADMIN.fetch(new Request(target, {
          method: "POST", headers, redirect: "manual",
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(90000),
        }));
      } catch {
        return json({ ok: false, error: "media_flush_preview_unavailable" }, 503);
      }
    }

    if (path === FOLLOW_UP_STATE_PATH) {
      if (method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      return readFollowUpState(env);
    }

    if (path === FOLLOW_UP_SYNC_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      const dashboard = await readAdminJson(request, "/v1/admin/dashboard", env.MMS_ADMIN);
      if (!dashboard.ok || !dashboard.data) {
        return json({
          ok: false,
          error: "verified_dashboard_unavailable",
          source: "/v1/admin/dashboard",
          status: dashboard.status,
        }, 424);
      }
      const checkedAt = new Date().toISOString();
      const derived = deriveFollowUpCandidates(dashboard.data, checkedAt);
      const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.sync, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidates: derived.candidates, checked_at: checkedAt }),
      });
      if (!response) return bindingUnavailable();
      return enrichFollowUpResponse(response, derived);
    }

    if (path === FOLLOW_UP_ACTION_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      const body = await request.json().catch(() => null);
      if (!body) return json({ ok: false, error: "invalid_json" }, 400);
      const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: String(body.id || "").slice(0, 240),
          action: String(body.action || "").slice(0, 40),
          snooze_minutes: Number(body.snooze_minutes || 60),
        }),
      });
      return response || bindingUnavailable();
    }

    const base = await aiOpsWorker.fetch(request, env, ctx);

    if (method === "GET" && path === CLIENT_PATH && base.ok) {
      const source = await base.text();
      const headers = new Headers(base.headers);
      headers.delete("content-length");
      headers.set("x-mmd-follow-up-autopilot", "p1");
      const patched = source
        .replace("WATCHING · FOUNDATION", "WATCHING · AUTOPILOT")
        .replace("AI ช่วยอ่าน/สรุป/เช็ก · เปอร์ยืนยันจุดสำคัญ · authority จริงยังอยู่ backend", "AI ช่วยอ่าน/สรุป/เช็ก/ตามให้ · เปอร์ยืนยันจุดสำคัญ · authority จริงยังอยู่ backend");
      return new Response(`${patched}\n${FOLLOW_UP_CLIENT_LAYER}\n${MEDIA_FLUSH_CLIENT_LAYER}`, {
        status: base.status,
        statusText: base.statusText,
        headers,
      });
    }

    if (method === "GET" && (path === COMMAND_CENTER_PATH || path === CONTEXT_PATH) && base.ok) {
      const followUp = await readFollowUpStatePayload(env);
      return decorateCommandCenter(base, followUp);
    }

    return base;
  },
};

async function readFollowUpState(env) {
  const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.state, { method: "GET" });
  return response || bindingUnavailable();
}

async function readFollowUpStatePayload(env) {
  const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.state, { method: "GET" });
  if (!response) return { ok: false, error: "autopilot_binding_unavailable" };
  const data = await response.json().catch(() => null);
  return response.ok && data ? data : { ok: false, error: "autopilot_state_unavailable", status: response.status };
}

async function enrichFollowUpResponse(response, derived) {
  const data = await response.json().catch(() => null);
  if (!data) return response;
  data.derivation = {
    verified_source: "/v1/admin/dashboard",
    candidate_count: derived.candidates.length,
    skipped_count: derived.skipped.length,
    skipped: derived.skipped.slice(0, 20),
    coverage: derived.coverage,
  };
  return json(data, response.status);
}

async function decorateCommandCenter(response, followUp) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok === false) return response;

  payload.follow_up_autopilot = followUp;
  if (payload.command_center) {
    const cc = payload.command_center;
    cc.phases = (Array.isArray(cc.phases) ? cc.phases : []).map((phase) => (
      phase?.key === "follow_up_autopilot"
        ? { ...phase, status: followUp?.ok ? "live_p1" : "waiting_p1" }
        : phase
    ));

    if (followUp?.ok) {
      const watches = Array.isArray(followUp.watches) ? followUp.watches : [];
      const due = watches.filter((watch) => watch.state === "due");
      cc.watching = {
        status: "live_p1",
        autopilot_active: true,
        notification_channel: followUp.notification_channel,
        note: "Durable watch state · revalidated from verified dashboard when Command Center opens · reminder only, no customer message or protected mutation",
        counts: followUp.counts,
        items: watches.slice(0, 12),
      };
      cc.counts = {
        ...(cc.counts || {}),
        watching_active: Number(followUp.counts?.active || 0),
        watching_due: Number(followUp.counts?.due || 0),
      };
      cc.needs_per = dedupeById([
        ...due.map((watch) => ({
          id: `follow-up:${watch.id}`,
          kind: "follow_up_due",
          title: watch.title || "Follow-up due",
          summary: `${watch.summary || "ถึงเวลาตรวจอีกครั้ง"} · checked ${watch.last_checked_at || "-"}`,
          href: watch.href || "/internal/admin/control-room",
          urgency: "high",
          source: "follow_up_autopilot",
          authority: "reminder_state_only",
          per_confirmation_required: false,
        })),
        ...(Array.isArray(cc.needs_per) ? cc.needs_per : []),
      ]).slice(0, 12);
      cc.prepared = dedupeById([
        ...due.map((watch, index) => ({
          id: `prepared:follow-up:${watch.id}`,
          kind: watch.kind,
          priority: index + 1,
          title: watch.title || "Follow-up due",
          summary: watch.summary || "เปิด source แล้วตรวจสถานะล่าสุด",
          href: watch.href || "/internal/admin/control-room",
          authority: "canonical_backend",
          execution_mode: "handoff_only",
          per_confirmation_required: false,
          source: "follow_up_autopilot",
        })),
        ...(Array.isArray(cc.prepared) ? cc.prepared : []),
      ]).slice(0, 12);
    } else {
      cc.watching = {
        ...(cc.watching || {}),
        status: "waiting_p1",
        autopilot_active: false,
        note: "Durable Follow-up Autopilot state unavailable — no reminder state will be invented",
      };
    }
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-follow-up-autopilot", followUp?.ok ? "p1-live" : "p1-waiting");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

async function verifyAdminStrict(request, service = null) {
  try {
    const url = new URL(request.url);
    if (!["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(url.origin)) return { ok: false };
    url.pathname = "/v1/admin/auth/me";
    url.search = "";
    const headers = new Headers({ accept: "application/json" });
    for (const key of ["cookie", "origin", "user-agent"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const init = {
      method: "GET",
      headers,
      redirect: "manual",
    };
    const response = await service.fetch(new Request(url, { ...init, signal: AbortSignal.timeout(7000) }));
    if (!response.ok) return { ok: false };
    const body = await response.json().catch(() => null);
    return {
      ok: Boolean(body && body.ok === true && body.authenticated === true && body.worker === "admin-worker"),
      actor: body || null,
    };
  } catch {
    return { ok: false };
  }
}

async function readAdminJson(request, route, service) {
  const base = new URL(request.url);
  const target = new URL(route, `${base.protocol}//${base.host}`);
  const headers = new Headers({ accept: "application/json" });
  for (const key of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await service.fetch(new Request(target, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(9000) }));
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: response.ok && data !== null, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function bindingUnavailable() {
  return json({
    ok: false,
    error: "autopilot_binding_unavailable",
    message: "Follow-up Autopilot durable state is not available; no reminder state was changed.",
  }, 503);
}

function unauthorized() {
  return json({ ok: false, error: "unauthorized" }, 401);
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const FOLLOW_UP_CLIENT_LAYER = String.raw`;(()=>{'use strict';const p=location.pathname.replace(/\/+$/,'')||'/';if(p!=='/internal/admin/control-room')return;if(document.querySelector('[data-mmd-follow-up-runtime]'))return;const root=document.createElement('div');root.dataset.mmdFollowUpRuntime='p1';const style=document.createElement('style');style.textContent='[data-mmd-follow-up-panel]{margin:10px 0 0;border:1px solid rgba(217,184,108,.18);border-radius:12px;background:rgba(14,13,11,.82);color:#eee7da;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif}[data-mmd-follow-up-panel] summary{list-style:none;cursor:pointer;padding:10px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}[data-mmd-follow-up-panel] summary::-webkit-details-marker{display:none}[data-mmd-follow-up-panel] b{color:#d9b86c;font-size:8px;letter-spacing:.08em}[data-mmd-follow-up-panel] .mmd-fu-meta{color:#8f877b;font-size:8px}[data-mmd-follow-up-panel] .mmd-fu-list{padding:0 10px 10px;display:grid;gap:6px}[data-mmd-follow-up-panel] .mmd-fu-item{padding:9px;border:1px solid #292319;border-radius:9px;background:#090806;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}[data-mmd-follow-up-panel] .mmd-fu-item strong{display:block;font-size:9px}[data-mmd-follow-up-panel] .mmd-fu-item small{display:block;margin-top:3px;color:#837b70;font-size:8px;line-height:1.35}[data-mmd-follow-up-panel] .mmd-fu-actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}[data-mmd-follow-up-panel] a,[data-mmd-follow-up-panel] button{border:1px solid #493a21;border-radius:7px;background:#151108;color:#cfb470;padding:6px 8px;text-decoration:none;font:800 7px/1 -apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif;cursor:pointer}[data-mmd-follow-up-panel] .mmd-fu-note{padding:0 12px 10px;color:#716a61;font-size:7px}@media(max-width:720px){[data-mmd-follow-up-panel] .mmd-fu-item{grid-template-columns:1fr}[data-mmd-follow-up-panel] .mmd-fu-actions{justify-content:flex-start}}';document.head.appendChild(style);document.body.appendChild(root);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let panel=null;function mount(){if(panel)return panel;const host=document.querySelector('[data-per-owner-strip]')||document.querySelector('#mmd-os-v1 .top');if(!host)return null;panel=document.createElement('details');panel.setAttribute('data-mmd-follow-up-panel','p1');host.insertAdjacentElement('afterend',panel);return panel}function render(d){const el=mount();if(!el)return;const c=d&&d.counts?d.counts:{active:0,due:0,snoozed:0};const watches=Array.isArray(d&&d.watches)?d.watches:[];const items=watches.slice(0,8).map(w=>'<div class="mmd-fu-item" data-watch-id="'+esc(w.id)+'"><div><strong>'+esc((w.state==='due'?'DUE · ':'')+(w.title||w.kind||'Follow-up'))+'</strong><small>'+esc(w.summary||'')+'<br>Due '+esc(w.due_at||'-')+'</small></div><div class="mmd-fu-actions"><a href="'+esc(w.href||'/internal/admin/control-room')+'">เปิด</a><button type="button" data-fu-action="snooze">พัก 1 ชม.</button><button type="button" data-fu-action="close">ปิด Watch</button></div></div>').join('')||'<div class="mmd-fu-item"><div><strong>ตอนนี้ไม่มีรายการที่ต้องตาม</strong><small>ระบบจะสร้าง Watch เฉพาะเมื่อมี stable ID + verified condition + due rule</small></div></div>';el.innerHTML='<summary><b>FOLLOW-UP AUTOPILOT</b><span class="mmd-fu-meta">Active '+esc(c.active||0)+' · Due '+esc(c.due||0)+' · Snoozed '+esc(c.snoozed||0)+' · '+esc(d.notification_channel||'command_center_only')+'</span></summary><div class="mmd-fu-list">'+items+'</div><div class="mmd-fu-note">เตือนเปอร์เท่านั้น · ปิด Watch/พักเตือนไม่ได้เปลี่ยนสถานะ Job, Payment, Membership หรือส่งข้อความหาลูกค้า</div>';el.querySelectorAll('[data-fu-action]').forEach(btn=>{btn.onclick=async()=>{const row=btn.closest('[data-watch-id]');if(!row)return;btn.disabled=true;try{const r=await fetch('/v1/admin/ai-ops/follow-ups/action',{method:'POST',credentials:'include',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({id:row.getAttribute('data-watch-id'),action:btn.getAttribute('data-fu-action'),snooze_minutes:60})}),x=await r.json();if(!r.ok||x.ok===false)throw Error(x.error||('HTTP '+r.status));render(x);document.dispatchEvent(new Event('mmd:ai-ops:refresh'))}catch(e){btn.textContent='ลองใหม่'}finally{btn.disabled=false}}})}function waiting(text){const el=mount();if(!el)return;el.innerHTML='<summary><b>FOLLOW-UP AUTOPILOT</b><span class="mmd-fu-meta">WAITING</span></summary><div class="mmd-fu-note">'+esc(text||'ยังอ่าน reminder state ไม่ได้')+'</div>'}async function sync(){waiting('กำลัง revalidate จาก verified dashboard…');try{const r=await fetch('/v1/admin/ai-ops/follow-ups/sync',{method:'POST',credentials:'include',cache:'no-store',headers:{accept:'application/json'}}),t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error('non-JSON')}if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));render(d);document.dispatchEvent(new Event('mmd:ai-ops:refresh'))}catch(e){waiting('Autopilot ยัง sync ไม่ได้ · '+(e.message||e))}}sync();document.addEventListener('mmd:follow-up:refresh',sync);})();`;

const MEDIA_FLUSH_CLIENT_LAYER = String.raw`;(()=>{'use strict';
  const path=location.pathname.replace(/\/+$/,'')||'/';
  if(!(path.startsWith('/internal/admin/')||path==='/internal/ceo'||path.startsWith('/internal/ceo/')))return;
  if(window.__mmdMediaFlushClientV1)return;window.__mmdMediaFlushClientV1=true;
  const style=document.createElement('style');
  style.textContent='[data-mmd-media-flush]{margin:10px 0;border:1px solid #e9b17d;border-radius:12px;background:#fff8ef;color:#26211c;padding:12px;font:500 12px/1.45 -apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif}[data-mmd-media-flush] summary{cursor:pointer;font-weight:800;font-size:12px;color:#71360f}[data-mmd-media-flush] p{margin:7px 0;color:#765b46}[data-mmd-media-flush] button{background:#edaa70;border:1px solid #c67739;border-radius:9px;color:#2d1b0d;font-weight:800;min-height:44px;padding:10px 14px;cursor:pointer}[data-mmd-media-flush] button:disabled{opacity:.6;cursor:wait}[data-mmd-media-flush] ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px}[data-mmd-media-flush] li{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #ecdfd1;padding:5px 0;color:#3a3029;font-size:11px}[data-mmd-media-flush] .muted{font-size:10px;color:#856e5f}[data-mmd-media-flush] [role=status]{display:block;margin-top:8px;color:#654832;font-size:11px;white-space:pre-wrap}';
  document.head.appendChild(style);
  const storageKey='mmd.flush.run.v2';
  let last=null,loading=false,error='',resumeRunId=null,refreshPanel=()=>{},panelOpen=false;
  try{const id=sessionStorage.getItem(storageKey);if(/^[a-f0-9-]{36}$/.test(id||''))resumeRunId=id;}catch{}
  function remember(id){resumeRunId=id;try{id?sessionStorage.setItem(storageKey,id):sessionStorage.removeItem(storageKey);}catch{}}
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function post(input){
    let failure;
    for(let attempt=0;attempt<5;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),105000);
      try{
        const r=await fetch('/v1/admin/ai-ops/media/flush',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(input),signal:controller.signal});
        const data=await r.json().catch(()=>null);
        if(r.ok&&data?.ok===true)return data;
        if(r.status===401||r.status===403)throw Object.assign(Error('กรุณาเข้าสู่ระบบ Owner'),{terminal:true});
        if(r.status===409){remember(null);throw Object.assign(Error('รอบเดิมหมดอายุ · กดตรวจสื่อใหม่'),{terminal:true});}
        throw Object.assign(Error(data?.error||('HTTP '+r.status)),{terminal:r.status<500&&r.status!==429});
      }catch(e){if(e.terminal)throw e;failure=e;}
      finally{clearTimeout(timer);}
      if(attempt<4)await pause(Math.min(12000,1000*2**attempt));
    }
    throw failure;
  }
  function mount(){
    const host=document.querySelector('.mmd-aiops-b');
    if(!host)return;
    let panel=host.querySelector('[data-mmd-media-flush]');
    if(panel)return;
    panel=document.createElement('details');
    panel.setAttribute('data-mmd-media-flush','v1');panel.open=panelOpen||loading;panel.ontoggle=()=>{panelOpen=panel.open;};
    const title=document.createElement('summary');title.textContent='🚽 FLUSH ALL MEDIA · PER';
    const note=document.createElement('p');note.textContent='malemodel.bkk@gmail.com · แค็ตตาล็อก 8 แบบ · รวม Review/Hidden · รออนุมัติ';
    const button=document.createElement('button');button.type='button';button.textContent='FLUSH · รับสื่อเข้าคิวตรวจ';
    const fresh=document.createElement('button');fresh.type='button';fresh.textContent='ตรวจสื่อใหม่';fresh.style.marginLeft='6px';
    const status=document.createElement('span');status.setAttribute('role','status');
    const results=document.createElement('ul');
    const foot=document.createElement('p');foot.className='muted';
    foot.textContent='รับสื่อจากแค็ตตาล็อก 8 แบบเข้า R2 ส่วนตัวและคิวตรวจ Airtable · รวม Review/Hidden · ยังไม่เผยแพร่';
    panel.append(title,note,button,fresh,status,results,foot);
    host.prepend(panel);
    const render=()=>{
      button.disabled=loading;fresh.disabled=loading;
      status.textContent=loading?(last?.state==='scanning'?'กำลังตรวจโฟลเดอร์ต้นทาง · '+String(last.catalogue?.length||0)+'/8 แบบ':last?.mode==='private_staging'?'กำลังรับสื่อ · '+String(last.completed_count||0)+'/'+String(last.total_candidates||0):'กำลังตรวจโฟลเดอร์ต้นทาง…'):error?error:last?('ตรวจเมื่อ '+new Date(last.checked_at).toLocaleString('th-TH')+' · '+(last.mode==='private_staging'?(last.state==='pending_review'?'รับสื่อแล้ว '+String(last.completed_count||0)+'/'+String(last.total_candidates||0)+' · รอตรวจอนุมัติ':last.state==='partial_failure'?'รับสื่อได้บางส่วน · ต้องลองใหม่ '+String(last.failed_count||0)+' รายการ':'กำลังรับสื่อ')+(last.source_scan_complete?'':' · ตรวจต้นทางได้บางส่วน'):last.state==='inventory_checked'?'ตรวจครบตามขอบเขต':'บางรายการยังตรวจไม่ครบ')):'กดเมื่อต้องการตรวจรูปที่อัปเดต';
      results.replaceChildren();
      if(!last)return;
      for(const item of [...(last.catalogue||[]),...(last.mmd_now||[]),...(last.review_queue||[]).map(x=>({label:x.category+' · '+x.visibility,state:'pending_review'}))]) {
        const li=document.createElement('li'),label=document.createElement('span'),value=document.createElement('span');
        label.textContent=item.label||item.key||'';
        value.textContent=last.mode==='private_staging'&&item.state==='inventory_checked'?'ตรวจต้นทางแล้ว':item.state==='inventory_checked'?(String(item.images||0)+' รูป · '+String(item.videos||0)+' วิดีโอ'):item.state==='pending_review'?'รออนุมัติ / จับคู่โมเดล':item.state==='source_id_unresolved'?'รอระบุต้นทาง':item.state==='topic_id_unresolved'?'รอข้อมูล Topic':item.state==='incomplete_scan'?'ตรวจได้บางส่วน':item.state==='source_unverified'?'ต้นทางไม่ผ่านการตรวจ':item.state==='scanning'?'กำลังตรวจต้นทาง':'ตรวจไม่ได้';
        li.append(label,value);results.append(li);
      }
    };
    refreshPanel=render;
    async function flush(forceNew=false){
      if(loading)return;
      if(forceNew||!resumeRunId)remember(crypto.randomUUID());
      loading=true;error='';refreshPanel();
      try{
        let data,retries=0;
        do{
          data=await post({action:'stage_all',run_id:resumeRunId});last=data;refreshPanel();
          if(data.retry_after_ms){if(++retries>12)throw Error('งานยังไม่พร้อม · กดรับต่อรอบเดิมได้');await pause(Math.min(30000,data.retry_after_ms));}else retries=0;
        }while(data.continue_required);
        try{const queue=await post({action:'review_queue'});last.review_queue=queue.items;last.review_queue_incomplete=queue.incomplete;foot.textContent=queue.incomplete?'รับแล้วและรออนุมัติ · แสดงคิวบางส่วน ดูรายการทั้งหมดใน Airtable':'รับแล้วและรออนุมัติ · กดตรวจสื่อใหม่เมื่อมีสื่อเพิ่มหรือแก้ไข';}
        catch{foot.textContent='รับรอบนี้แล้ว แต่อ่านคิวไม่ได้ · กดซ้ำเพื่อตรวจต่อได้';}
      }catch(e){error='FLUSH หยุดชั่วคราว · '+String(e.message||e)+' · กดรับต่อรอบเดิมได้';}
      finally{loading=false;refreshPanel();}
    }
    button.onclick=()=>flush(false);fresh.onclick=()=>flush(true);
    render();
  }
  const run=()=>{if(!document.body)return;mount();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
  const observer=new MutationObserver(run);observer.observe(document.documentElement,{subtree:true,childList:true});
})();`;


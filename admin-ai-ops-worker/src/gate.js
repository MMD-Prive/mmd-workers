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
      if (!input || !["preview_all", "stage_all", "review_queue", "review_media", "review_models", "review_save", "review_draft_queue", "review_draft_detail"].includes(input.action) || Object.keys(input).some(k => !({preview_all:['action'],stage_all:['action','run_id'],review_queue:['action','cursor'],review_media:['action','record_id'],review_models:['action','query'],review_save:['action','record_id','revision','visibility','model_id'],review_draft_queue:['action','cursor'],review_draft_detail:['action','record_id']}[input.action]||[]).includes(k))) return json({ok:false,error:"media_action_invalid"},400);
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
  style.textContent+='[data-mmd-media-flush] section h3{font-size:14px;line-height:1.5;margin:12px 0 8px}[data-mmd-media-flush] section h4{font-size:13px;line-height:1.5}[data-mmd-media-flush] section select{box-sizing:border-box;width:calc(50% - 4px);min-height:40px;margin:3px 2px;padding:6px;border:1px solid #c9ac94;border-radius:7px;background:#fff;color:#3a3029;font:500 12px/1.4 sans-serif}[data-mmd-media-flush] section input{box-sizing:border-box;width:100%;min-height:42px;padding:8px;margin:6px 0;font-size:13px}[data-mmd-media-flush] section button{font-size:12px;line-height:1.5;padding:8px 10px}[data-mmd-media-flush] section li button{flex-shrink:0;min-width:110px;white-space:nowrap}[data-mmd-media-flush] section li span{min-width:0;overflow-wrap:anywhere;font-size:12px}[data-mmd-media-flush] section [role=status]{font-size:12px;line-height:1.6;margin:10px 0}[data-mmd-media-flush] section video,[data-mmd-media-flush] section img{display:block;margin:8px auto}';
  document.head.appendChild(style);
  const storageKey='mmd.flush.run.v2';
  let last=null,loading=false,error='',resumeRunId=null,refreshPanel=()=>{},panelOpen=false,queuePanel=null;
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
        if(r.status===409){if(input.action==='stage_all'){remember(null);throw Object.assign(Error('รอบเดิมหมดอายุ · กดตรวจสื่อใหม่'),{terminal:true});}throw Object.assign(Error('รายการเปลี่ยนแปลงหรือกำลังบันทึก · เปิดคิวใหม่ก่อนลองอีกครั้ง'),{terminal:true});}
        throw Object.assign(Error(data?.error||('HTTP '+r.status)),{terminal:r.status<500&&r.status!==429});
      }catch(e){if(e.terminal)throw e;failure=e;}
      finally{clearTimeout(timer);}
      if(attempt<4)await pause(Math.min(12000,1000*2**attempt));
    }
    throw failure;
  }
  let draftReviewPage=null;
  function openDraftReview(){if(!draftReviewPage)draftReviewPage=createDraftReviewPage();return draftReviewPage.open();}
  function createDraftReviewPage(){
    const css=document.createElement('style');css.textContent='.nmp-draft-review{box-sizing:border-box;width:min(1400px,96vw);max-width:96vw;height:92vh;max-height:92vh;padding:0;border:1px solid #bda58e;border-radius:16px;background:#fffaf4;color:#302820;font:500 14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif}.nmp-draft-review[open]{display:flex;flex-direction:column}.nmp-draft-review::backdrop{background:rgba(25,19,14,.62)}.nmp-draft-review *{box-sizing:border-box}.nmp-draft-review button,.nmp-draft-review input,.nmp-draft-review select{font:inherit;min-height:42px;border:1px solid #bba086;border-radius:8px;padding:8px 12px;color:#35271c;background:#fff}.nmp-draft-review button{cursor:pointer;background:#f5d4b1}.nmp-draft-review button:disabled{opacity:.5;cursor:default}.nmp-draft-review a{color:#7b3912;text-decoration:underline}.nmp-draft-review h2{font-size:18px;margin:0}.nmp-draft-review h3{font-size:17px;margin:0 0 8px}.nmp-draft-review h4{font-size:14px;margin:8px 0}.nmp-draft-review p{font-size:13px;line-height:1.6;margin:7px 0}.nmp-dr-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #dfcbb7}.nmp-dr-head [role=status]{font-size:12px;max-width:1050px}.nmp-dr-body{display:grid;grid-template-columns:320px minmax(0,1fr);flex:1;min-height:0}.nmp-dr-side{display:flex;flex-direction:column;gap:8px;padding:14px;border-right:1px solid #dfcbb7;min-height:0}.nmp-dr-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px}.nmp-dr-side input,.nmp-dr-side select{width:100%;min-width:0}.nmp-dr-list{overflow:auto;display:grid;grid-auto-rows:min-content;align-content:start;gap:7px;flex:1;min-height:80px}.nmp-draft-review .nmp-dr-list button{height:auto!important;min-height:max-content!important;line-height:1.45!important;text-align:left;white-space:pre-line;overflow-wrap:anywhere;background:#fff;font-size:12px}.nmp-draft-review [aria-pressed=true]{border:2px solid #9b501d;background:#f8e1c7}.nmp-dr-pager{display:flex;align-items:center;gap:8px;font-size:12px}.nmp-dr-detail{overflow:auto;padding:20px;min-width:0}.nmp-dr-evidence{border:1px solid #dbc5b0;border-radius:10px;padding:12px;margin:12px 0;background:#fff}.nmp-dr-evidence summary{cursor:pointer;font-weight:700}.nmp-dr-evidence p{overflow-wrap:anywhere}.nmp-dr-controls{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.nmp-dr-controls select{flex:1;min-width:150px}.nmp-dr-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin:10px 0}.nmp-dr-media button{display:flex;flex-direction:column;text-align:left;background:#fff;white-space:pre-line;overflow-wrap:anywhere;font-size:12px}.nmp-dr-preview img,.nmp-dr-preview video{display:block;max-width:100%;max-height:480px;margin:10px auto}.nmp-dr-preview{border-radius:10px;background:#f5eadf;padding:10px;margin:10px 0}.nmp-dr-preview:empty{display:none}.nmp-dr-readonly{background:#f7e6cc;border-radius:8px;padding:10px}.nmp-dr-candidate{padding:8px;border-top:1px solid #eadbcb}.nmp-draft-review small{font-size:12px}@media(max-width:720px){.nmp-draft-review{width:98vw;max-width:98vw;height:96vh;max-height:96vh;border-radius:8px}.nmp-dr-body{grid-template-columns:1fr;grid-template-rows:34vh minmax(0,1fr)}.nmp-dr-side{border-right:0;border-bottom:1px solid #dfcbb7;padding:8px}.nmp-dr-head{padding:10px}.nmp-dr-detail{padding:12px}.nmp-dr-head h2{font-size:16px}}';document.head.appendChild(css);
    const make=(tag,text='',className='')=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
    const dialog=make('dialog','','nmp-draft-review');dialog.setAttribute('data-draft-model-review','');dialog.setAttribute('aria-label','ตรวจโมเดลร่างและหลักฐานต้นทาง');
    const head=make('header','','nmp-dr-head'),heading=make('div'),title=make('h2','ตรวจโมเดลร่าง · รายโมเดล'),status=make('p');status.setAttribute('role','status');
    const close=make('button','ปิดหน้าตรวจ');close.type='button';close.onclick=()=>dialog.close();heading.append(title,status);head.append(heading,close);
    const body=make('div','','nmp-dr-body'),side=make('aside','','nmp-dr-side'),tabs=make('div','','nmp-dr-tabs'),modelsTab=make('button','โมเดลร่าง'),casesTab=make('button','เคสตรวจแยก');modelsTab.type=casesTab.type='button';tabs.append(modelsTab,casesTab);
    const search=make('input');search.type='search';search.placeholder='ค้นชื่อโมเดลหรือเส้นทางโฟลเดอร์';search.setAttribute('aria-label','ค้นโมเดลร่างหรือเคส');
    const category=make('select');category.setAttribute('aria-label','หมวดโมเดลร่าง');
    const reload=make('button','โหลดข้อมูลล่าสุด');reload.type='button';
    const list=make('div','','nmp-dr-list'),pager=make('div','','nmp-dr-pager'),previous=make('button','ก่อนหน้า'),next=make('button','ถัดไป'),pageInfo=make('span');previous.type=next.type='button';pager.append(previous,pageInfo,next);side.append(tabs,search,category,reload,list,pager);
    const detail=make('main','','nmp-dr-detail');detail.setAttribute('data-draft-detail','');body.append(side,detail);dialog.append(head,body);document.body.appendChild(dialog);
    let items=[],tab='model',page=0,selected=null,loadEpoch=0,selectionEpoch=0,blobUrl=null,previewAbort=null;
    const labels={standard:'Standard',premium:'Premium',ems:'EMs',gws:'GWs',travel:'Travel',extreme:'Extreme',farang:'Farang',up_country:'Up Country'};
    function clearMedia(){if(previewAbort)previewAbort.abort();previewAbort=null;if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=null;}
    dialog.onclose=()=>{selectionEpoch++;loadEpoch++;clearMedia();detail.replaceChildren();};
    function sourceLink(text,id,file=false){const a=make('a',text);a.href=file?'https://drive.google.com/file/d/'+encodeURIComponent(id)+'/view':'https://drive.google.com/drive/folders/'+encodeURIComponent(id);a.target='_blank';a.rel='noopener noreferrer';return a;}
    function recordLink(text,id,model=false){const a=make('a',text);a.href='https://airtable.com/appsV1ILPRfIjkaYg/'+(model?'tblI4B0bI446vp9GX':'tblJ52hVu0f4uhEmS')+'/'+encodeURIComponent(id);a.target='_blank';a.rel='noopener noreferrer';return a;}
    function renderList(){
      modelsTab.setAttribute('aria-pressed',String(tab==='model'));casesTab.setAttribute('aria-pressed',String(tab==='exception'));
      const q=search.value.trim().toLocaleLowerCase(),filtered=items.filter(r=>r.kind===tab&&(category.value==='all'||r.category===category.value)&&(!q||(r.name+' '+r.source_path).toLocaleLowerCase().includes(q)));
      const pages=Math.max(1,Math.ceil(filtered.length/10));page=Math.min(page,pages-1);list.replaceChildren();pageInfo.textContent=(page+1)+' / '+pages;previous.disabled=page===0;next.disabled=page>=pages-1;
      for(const item of filtered.slice(page*10,page*10+10)){const button=make('button',item.name+' · '+item.media_count+' ไฟล์\n'+(labels[item.category]||item.category)+'\n'+item.source_path);button.type='button';button.setAttribute('data-draft-group',item.id);button.setAttribute('aria-pressed',String(selected===item.id));button.onclick=()=>select(item);list.append(button);}
      if(!filtered.length)list.append(make('p','ไม่พบรายการตามตัวกรอง'));
    }
    async function load(){
      const epoch=++loadEpoch;reload.disabled=true;selectionEpoch++;clearMedia();detail.replaceChildren();status.textContent='กำลังอ่านโมเดลร่างและเคสตรวจแยก…';items=[];page=0;selected=null;
      try{let cursor=null;const ids=new Set(),cursors=new Set();let pages=0;do{if(++pages>30)throw Error('จำนวนหน้ามากเกินขอบเขตตรวจ');const data=await post({action:'review_draft_queue',...(cursor?{cursor}:{})});if(epoch!==loadEpoch||!dialog.open)return;if(data.read_only!==true||data.publication!==false)throw Error('ข้อมูลไม่อยู่ในโหมดตรวจ');for(const item of data.items||[])if(!ids.has(item.id)){ids.add(item.id);items.push(item);}cursor=data.cursor;if(cursor&&cursors.has(cursor))throw Error('อ่านหน้าซ้ำ กรุณาโหลดใหม่');if(cursor)cursors.add(cursor);}while(cursor);
        items.sort((a,b)=>(a.name+' '+a.source_path).localeCompare(b.name+' '+b.source_path));const models=items.filter(r=>r.kind==='model'),cases=items.filter(r=>r.kind==='exception');modelsTab.textContent='โมเดลร่าง ('+models.length+')';casesTab.textContent='เคสแยก ('+cases.length+')';status.textContent=models.length+' โมเดลร่าง · '+models.reduce((n,r)=>n+r.media_count,0)+' ไฟล์ · '+cases.length+' เคสแยก / '+cases.reduce((n,r)=>n+r.media_count,0)+' ไฟล์ · ทุกอย่างยังรออนุมัติ';
        category.replaceChildren();for(const value of ['all',...new Set(items.map(r=>r.category))]){const option=make('option',value==='all'?'ทุกหมวด':labels[value]||value);option.value=value;category.append(option);}category.value='all';renderList();const first=items.find(r=>r.kind===tab);if(first)await select(first);
      }catch(e){if(epoch===loadEpoch){status.textContent='อ่านข้อมูลไม่ครบ · '+String(e.message||e);list.replaceChildren();detail.replaceChildren(make('p','โหลดข้อมูลล่าสุดก่อนตรวจต่อ'));}}
      finally{if(epoch===loadEpoch)reload.disabled=false;}
    }
    async function select(item){
      const epoch=++selectionEpoch;clearMedia();selected=item.id;renderList();detail.replaceChildren(make('p','กำลังตรวจความสัมพันธ์ของโมเดล สื่อ และหลักฐานต้นทาง…'));
      try{const data=await post({action:'review_draft_detail',record_id:item.id});if(epoch!==selectionEpoch||!dialog.open)return;if(data.read_only!==true||data.publication!==false)throw Error('ข้อมูลไม่อยู่ในโหมดตรวจ');detail.replaceChildren();
        detail.append(make('h3',data.item.name+' · '+data.media.length+' ไฟล์'),make('p',data.model?'โมเดลร่างปิดใช้งาน · โปรไฟล์รอตรวจ · ซ่อนจากลูกค้า':'เคสตรวจแยก · ยังไม่ระบุคู่โมเดล'),make('p','หน้านี้อ่านอย่างเดียว · ยังไม่อนุมัติ เปิดใช้งาน หรือเผยแพร่สื่อ'));
        const readonly=make('p',data.model?'ชื่อร่างมาจากป้ายโฟลเดอร์ ยังไม่ได้ยืนยันตัวตน':'ต้องตรวจหลักฐานและยืนยันตัวตนก่อนเลือกหรือสร้างโมเดล','nmp-dr-readonly');detail.append(readonly);
        const evidence=make('details','','nmp-dr-evidence');evidence.open=true;evidence.append(make('summary','หลักฐานต้นทาง'),make('p',data.evidence.summary),make('p','เส้นทาง: '+data.evidence.source_path),make('p','Folder ID: '+data.evidence.source_folder_id),sourceLink('เปิดโฟลเดอร์ต้นทางใน Drive',data.evidence.source_folder_id),make('p','หลักฐานบันทึกเมื่อ '+new Date(data.evidence.recorded_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})));
        for(const path of data.evidence.observed_paths||[])if(path!==data.evidence.source_path)evidence.append(make('p','โฟลเดอร์สื่อ: '+path));
        if(data.evidence.canonical_folder_lookup==='not_found_or_not_accessible')evidence.append(make('p','ผลตรวจที่บันทึก: ยังอ่าน Folder ID ในทะเบียนเดิมไม่ได้ จึงไม่สรุปว่าลบหรือเปลี่ยนสิทธิ์'));
        for(const candidate of data.evidence.registry_candidates||[]){const block=make('div','','nmp-dr-candidate');block.append(make('h4','ทะเบียนที่ต้องเทียบ: '+candidate.name),make('p','เส้นทางในทะเบียน: '+candidate.source_path),make('p','Folder ID ในทะเบียน: '+(candidate.folder_id||'ไม่มีข้อมูล')));if(candidate.folder_id)block.append(sourceLink('เปิดโฟลเดอร์ที่ทะเบียนอ้างถึง',candidate.folder_id));if(candidate.id)block.append(make('p'),recordLink('ดูทะเบียนโมเดลเดิม',candidate.id,true));evidence.append(block);}
        evidence.append(make('p'),recordLink('เปิดรายการตรวจใน Airtable',data.item.id));if(data.model)evidence.append(make('p'),recordLink('เปิดทะเบียนโมเดลร่าง',data.model.id,true));detail.append(evidence);
        const preview=make('div','','nmp-dr-preview');preview.setAttribute('data-draft-preview','');const controls=make('div','','nmp-dr-controls'),type=make('select'),visibility=make('select');type.setAttribute('aria-label','ชนิดสื่อของโมเดล');visibility.setAttribute('aria-label','Review หรือ Hidden ของโมเดล');for(const [value,text] of [['all','รูปและวิดีโอ'],['image/','รูป'],['video/','วิดีโอ']]){const o=make('option',text);o.value=value;type.append(o);}for(const [value,text] of [['all','Review และ Hidden'],['review','Review'],['hidden','Hidden']]){const o=make('option',text);o.value=value;visibility.append(o);}type.value=visibility.value='all';controls.append(type,visibility);
        const count=make('p'),mediaList=make('div','','nmp-dr-media'),mediaPager=make('div','','nmp-dr-pager'),prev=make('button','สื่อก่อนหน้า'),nextMedia=make('button','สื่อถัดไป'),mediaPageInfo=make('span');prev.type=nextMedia.type='button';mediaPager.append(prev,mediaPageInfo,nextMedia);detail.append(make('h4','สื่อส่วนตัวในคิวรออนุมัติ'),preview,controls,count,mediaList,mediaPager);let mediaPage=0,previewEpoch=0;
        async function showMedia(media){
          clearMedia();const ticket=++previewEpoch;preview.replaceChildren();const message=make('p','กำลังเปิดสื่อส่วนตัว…'),closeMedia=make('button','ปิดสื่อ'),origin=sourceLink('เปิดไฟล์ต้นทางใน Drive',media.file_id,true);closeMedia.type='button';closeMedia.onclick=()=>{previewEpoch++;clearMedia();preview.replaceChildren();};preview.append(closeMedia,make('p',media.source_path),origin,message);preview.scrollIntoView?.({block:'nearest'});
          const controller=new AbortController();previewAbort=controller;const timer=setTimeout(()=>controller.abort(),45000);
          try{const response=await fetch('/v1/admin/ai-ops/media/flush',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({action:'review_media',record_id:media.id}),signal:controller.signal});if(!response.ok||response.headers.get('content-type')!==media.mime)throw Error('เปิดสื่อไม่ได้ · โหลดข้อมูลล่าสุดแล้วลองใหม่');const blob=await response.blob();if(epoch!==selectionEpoch||ticket!==previewEpoch||!dialog.open)return;blobUrl=URL.createObjectURL(blob);const el=make(media.mime.startsWith('video/')?'video':'img');el.src=blobUrl;if(media.mime.startsWith('video/')){el.controls=true;el.preload='metadata';}else el.alt='สื่อส่วนตัวรออนุมัติ';preview.append(el);message.textContent='สื่อส่วนตัว · ยังรออนุมัติ';}
          catch(e){if(epoch===selectionEpoch&&ticket===previewEpoch&&!controller.signal.aborted)message.textContent=String(e.message||e);}finally{clearTimeout(timer);}
        }
        function drawMedia(){const filtered=data.media.filter(m=>(type.value==='all'||m.mime.startsWith(type.value))&&(visibility.value==='all'||m.visibility===visibility.value));const pages=Math.max(1,Math.ceil(filtered.length/12));mediaPage=Math.min(mediaPage,pages-1);count.textContent='แสดง '+filtered.length+' จาก '+data.media.length+' ไฟล์ · ทุกไฟล์รออนุมัติ';mediaPageInfo.textContent=(mediaPage+1)+' / '+pages;prev.disabled=mediaPage===0;nextMedia.disabled=mediaPage>=pages-1;mediaList.replaceChildren();for(const media of filtered.slice(mediaPage*12,mediaPage*12+12)){const button=make('button',(media.mime.startsWith('video/')?'ดูวิดีโอ':'ดูรูป')+' · '+media.visibility+' · '+(media.bytes/1024/1024).toFixed(2)+' MB\n'+(media.file_name||media.intake_id.slice(0,12)));button.type='button';button.setAttribute('data-draft-media',media.id);button.onclick=()=>showMedia(media);mediaList.append(button);}if(!filtered.length)mediaList.append(make('p','ไม่พบสื่อตามตัวกรอง'));}
        type.onchange=visibility.onchange=()=>{mediaPage=0;previewEpoch++;clearMedia();preview.replaceChildren();drawMedia();};prev.onclick=()=>{mediaPage--;drawMedia();};nextMedia.onclick=()=>{mediaPage++;drawMedia();};drawMedia();
      }catch(e){if(epoch===selectionEpoch)detail.replaceChildren(make('h3','ตรวจข้อมูลรายการนี้ไม่ได้'),make('p',String(e.message||e)),make('p','ข้อมูลอาจเปลี่ยนแปลง · โหลดข้อมูลล่าสุดก่อนตรวจต่อ'));}
    }
    function setTab(value){tab=value;page=0;search.value='';category.value='all';selected=null;renderList();const first=items.find(r=>r.kind===tab);if(first)return select(first);selectionEpoch++;clearMedia();detail.replaceChildren();}modelsTab.onclick=()=>setTab('model');casesTab.onclick=()=>setTab('exception');search.oninput=category.onchange=()=>{page=0;renderList();};previous.onclick=()=>{page--;renderList();};next.onclick=()=>{page++;renderList();};reload.onclick=load;
    return {open:async()=>{if(!dialog.open)dialog.showModal();await load();}};
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
    const draftOpen=document.createElement('button');draftOpen.type='button';draftOpen.textContent='เปิดหน้าตรวจโมเดลร่าง';draftOpen.onclick=openDraftReview;
    panel.append(title,note,button,fresh,draftOpen,status,results,foot);
    host.prepend(panel);
    const render=()=>{
      button.disabled=loading;fresh.disabled=loading;
      status.textContent=loading?(last?.state==='scanning'?'กำลังตรวจโฟลเดอร์ต้นทาง · '+String(last.catalogue?.length||0)+'/8 แบบ':last?.mode==='private_staging'?'กำลังรับสื่อ · '+String(last.completed_count||0)+'/'+String(last.total_candidates||0):'กำลังตรวจโฟลเดอร์ต้นทาง…'):error?error:last?('ตรวจเมื่อ '+new Date(last.checked_at).toLocaleString('th-TH')+' · '+(last.mode==='private_staging'?(last.state==='pending_review'?'รับสื่อแล้ว '+String(last.completed_count||0)+'/'+String(last.total_candidates||0)+' · รอตรวจอนุมัติ':last.state==='partial_failure'?'รับสื่อได้บางส่วน · ต้องลองใหม่ '+String(last.failed_count||0)+' รายการ':'กำลังรับสื่อ')+(last.source_scan_complete?'':' · ตรวจต้นทางได้บางส่วน'):last.state==='inventory_checked'?'ตรวจครบตามขอบเขต':'บางรายการยังตรวจไม่ครบ')):'กดเมื่อต้องการตรวจรูปที่อัปเดต';
      results.replaceChildren();
      if(!last)return;
      for(const item of [...(last.catalogue||[]),...(last.mmd_now||[])]) {
        const li=document.createElement('li'),label=document.createElement('span'),value=document.createElement('span');
        label.textContent=item.label||item.key||'';
        value.textContent=last.mode==='private_staging'&&item.state==='inventory_checked'?'ตรวจต้นทางแล้ว':item.state==='inventory_checked'?(String(item.images||0)+' รูป · '+String(item.videos||0)+' วิดีโอ'):item.state==='pending_review'?'รออนุมัติ / จับคู่โมเดล':item.state==='source_id_unresolved'?'รอระบุต้นทาง':item.state==='topic_id_unresolved'?'รอข้อมูล Topic':item.state==='incomplete_scan'?'ตรวจได้บางส่วน':item.state==='source_unverified'?'ต้นทางไม่ผ่านการตรวจ':item.state==='scanning'?'กำลังตรวจต้นทาง':'ตรวจไม่ได้';
        li.append(label,value);results.append(li);
      }
    };
    // All queue reads and proposals remain inside the authenticated FLUSH endpoint.
    if(queuePanel)panel.append(queuePanel);else {
    const queueBox=document.createElement('section');queuePanel=queueBox;panel.append(queueBox);
    const queueTitle=document.createElement('h3');queueTitle.textContent='คิวรออนุมัติ · ดูสื่อและเสนอคู่โมเดล';
    const queueLoad=document.createElement('button');queueLoad.type='button';queueLoad.textContent='เปิดคิวรออนุมัติ';
    const lane=document.createElement('select');lane.setAttribute('aria-label','กรอง Review/Hidden');
    for(const [value,label] of [['all','ทั้งหมด'],['review','Review'],['hidden','Hidden']]){const option=document.createElement('option');option.value=value;option.textContent=label;lane.append(option);}lane.value='all';
    const category=document.createElement('select');category.setAttribute('aria-label','กรองประเภทโมเดล');
    for(const value of ['all','standard','premium','ems','gws','travel','extreme','farang','up_country']){const option=document.createElement('option');option.value=value;option.textContent=value==='all'?'ครบ 8 แบบ':value;category.append(option);}category.value='all';
    const matching=document.createElement('select');matching.setAttribute('aria-label','กรองการจับคู่');
    for(const [value,label] of [['all','ทุกสถานะการจับคู่'],['unmatched','ยังไม่เสนอคู่'],['matched','เสนอคู่แล้ว']]){const o=document.createElement('option');o.value=value;o.textContent=label;matching.append(o);}matching.value='all';
    const mediaType=document.createElement('select');mediaType.setAttribute('aria-label','กรองรูปหรือวิดีโอ');for(const [value,label] of [['all','รูปและวิดีโอ'],['image/','รูป'],['video/','วิดีโอ']]){const o=document.createElement('option');o.value=value;o.textContent=label;mediaType.append(o);}mediaType.value='all';
    const queueStatus=document.createElement('p');queueStatus.setAttribute('role','status');
    const queueList=document.createElement('ul'),pager=document.createElement('div'),previous=document.createElement('button'),next=document.createElement('button');previous.textContent='ก่อนหน้า';next.textContent='ถัดไป';previous.type=next.type='button';pager.append(previous,next);
    const viewer=document.createElement('div');viewer.setAttribute('data-flush-viewer','');
    queueBox.append(queueTitle,queueLoad,lane,category,matching,mediaType,queueStatus,viewer,queueList,pager);
    let rows=[],page=0,loaded=false,queueBusy=false,mediaUrl=null,selection=0;
    function clearViewer(){selection++;if(mediaUrl)URL.revokeObjectURL(mediaUrl);mediaUrl=null;viewer.replaceChildren();}
    function drawQueue(){
      const filtered=rows.filter(r=>(mediaType.value==='all'||r.mime?.startsWith(mediaType.value))&&(lane.value==='all'||r.visibility===lane.value)&&(category.value==='all'||r.category===category.value)&&(matching.value==='all'||(matching.value==='matched'?Boolean(r.model):!r.model)));
      const pages=Math.max(1,Math.ceil(filtered.length/25));page=Math.min(page,pages-1);queueList.replaceChildren();
      queueStatus.textContent=(loaded?'โหลดครบ ':'กำลังโหลด ')+rows.length+' รายการ · Review '+rows.filter(r=>r.visibility==='review').length+' / Hidden '+rows.filter(r=>r.visibility==='hidden').length+' · แสดง '+filtered.length+' รายการ · หน้า '+(page+1)+'/'+pages+' · ทุกชิ้นรออนุมัติ';
      previous.disabled=page===0||queueBusy;next.disabled=page>=pages-1||queueBusy;
      for(const row of filtered.slice(page*25,page*25+25)){
        const li=document.createElement('li'),label=document.createElement('span'),open=document.createElement('button');open.type='button';open.textContent='ดูสื่อ / จับคู่';label.textContent=row.category+' · '+row.visibility+' · '+(row.mime?.startsWith('video/')?'วิดีโอ':'รูป')+' · '+(row.model?'คู่ที่เสนอ: '+row.model.name:'ยังไม่เสนอคู่')+' · '+row.intake_id.slice(0,10);open.onclick=()=>openReview(row);li.append(label,open);queueList.append(li);
      }
    }
    async function loadQueue(){
      if(queueBusy)return;queueBusy=true;queueLoad.disabled=true;rows=[];loaded=false;page=0;clearViewer();queueStatus.textContent='กำลังอ่านคิวรออนุมัติ…';
      try{let cursor=null;const seen=new Set(),ids=new Set();do{const data=await post({action:'review_queue',...(cursor?{cursor}:{})});for(const row of data.items||[])if(!ids.has(row.id)){ids.add(row.id);rows.push(row);}cursor=data.cursor;if(cursor&&seen.has(cursor))throw Error('คิวอ่านซ้ำ กรุณาลองใหม่');if(cursor)seen.add(cursor);drawQueue();}while(cursor);loaded=true;drawQueue();}
      catch(e){queueStatus.textContent='อ่านคิวไม่ครบ · '+String(e.message||e)+' · กดเปิดคิวเพื่อลองใหม่';}
      finally{queueBusy=false;queueLoad.disabled=false;if(loaded)drawQueue();}
    }
    async function openReview(row){
      clearViewer();const ticket=selection;
      const heading=document.createElement('h4');heading.textContent=row.category+' · '+row.intake_id.slice(0,12)+' · รออนุมัติ';
      const close=document.createElement('button');close.type='button';close.textContent='ปิดสื่อ';close.onclick=clearViewer;
      const message=document.createElement('p');message.setAttribute('role','status');message.textContent='กำลังเปิดสื่อส่วนตัว…';
      viewer.append(heading,close,message);viewer.scrollIntoView?.({block:'nearest'});
      try{
        const response=await fetch('/v1/admin/ai-ops/media/flush',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({action:'review_media',record_id:row.id}),signal:AbortSignal.timeout(45000)});
        if(!response.ok)throw Error('เปิดสื่อไม่ได้ กรุณาเข้าสู่ระบบแล้วลองใหม่');
        const blob=await response.blob();if(ticket!==selection)return;
        mediaUrl=URL.createObjectURL(blob);const media=document.createElement(row.mime.startsWith('video/')?'video':'img');media.src=mediaUrl;media.style.maxWidth='100%';media.style.maxHeight='420px';if(row.mime.startsWith('video/')){media.controls=true;media.preload='metadata';}else media.alt='สื่อส่วนตัวในคิวรออนุมัติ';viewer.append(media);message.textContent='ดูเพื่อพิจารณาเท่านั้น · ยังไม่อนุมัติหรือเผยแพร่';
      }catch(e){if(ticket===selection)message.textContent=String(e.message||e);}
      if(ticket!==selection)return;
      if(row.registered_draft){viewer.append(document.createTextNode('โมเดลร่างนี้เชื่อมทะเบียนสื่อแล้ว · ตรวจแบบอ่านอย่างเดียวได้ในหน้าตรวจโมเดลร่าง'));return;}
      const visibility=document.createElement('select');visibility.setAttribute('aria-label','แยก Review/Hidden');for(const v of ['review','hidden']){const o=document.createElement('option');o.value=v;o.textContent=v==='review'?'Review':'Hidden';visibility.append(o);}visibility.value=row.visibility;
      const source=document.createElement('p');source.textContent='โฟลเดอร์ต้นทาง: '+row.source_visibility+' · การแยกที่นี่เป็นข้อเสนอ ไม่ย้ายต้นฉบับ';
      const query=document.createElement('input');query.type='search';query.placeholder='ค้นชื่อหรือรหัสโมเดลอย่างน้อย 2 ตัว';query.setAttribute('aria-label','ค้นหาโมเดล');
      const search=document.createElement('button');search.type='button';search.textContent='ค้นหาโมเดล';
      const choices=document.createElement('div'),chosen=document.createElement('p');let selected=row.model;
      const showChosen=()=>{chosen.textContent=selected?'คู่ที่เสนอ: '+selected.name+' · '+selected.key:'ยังไม่เสนอคู่โมเดล';};showChosen();
      const clear=document.createElement('button');clear.type='button';clear.textContent='ล้างคู่ที่เสนอ';clear.onclick=()=>{selected=null;showChosen();};
      search.onclick=async()=>{search.disabled=true;choices.replaceChildren();try{const data=await post({action:'review_models',query:query.value});if(ticket!==selection)return;for(const model of data.items){const pick=document.createElement('button');pick.type='button';pick.textContent=model.name+' · '+model.key;pick.onclick=()=>{selected=model;showChosen();};choices.append(pick);}message.textContent=data.items.length?'เลือกคู่ด้วยตนเอง · ระบบไม่ระบุตัวตนจากภาพ':'ไม่พบโมเดล ลองชื่อหรือรหัสอื่น';}catch(e){message.textContent=String(e.message||e);}finally{search.disabled=false;}};
      const save=document.createElement('button');save.type='button';save.textContent='บันทึกข้อเสนอ · ยังรออนุมัติ';
      save.onclick=async()=>{save.disabled=true;try{const data=await post({action:'review_save',record_id:row.id,revision:row.revision,visibility:visibility.value,model_id:selected?.id||null});if(ticket!==selection)return;Object.assign(row,data.item);drawQueue();message.textContent='บันทึกข้อเสนอแล้ว · ยังรออนุมัติและยังไม่เผยแพร่';}catch(e){message.textContent='บันทึกไม่สำเร็จ · '+String(e.message||e)+' · เปิดคิวใหม่ก่อนลองอีกครั้ง';}finally{save.disabled=false;}};
      viewer.append(source,visibility,query,search,choices,chosen,clear,save);
    }
    queueLoad.onclick=loadQueue;lane.onchange=category.onchange=matching.onchange=mediaType.onchange=()=>{page=0;clearViewer();drawQueue();};previous.onclick=()=>{page--;clearViewer();drawQueue();};next.onclick=()=>{page++;clearViewer();drawQueue();};
    }
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
        foot.textContent='รับแล้วและรออนุมัติ · กดเปิดคิวรออนุมัติเพื่อดูสื่อและเสนอคู่โมเดล';
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


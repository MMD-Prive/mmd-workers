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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method !== "OPTIONS" && path.startsWith(AI_OPS_PREFIX) && path !== CLIENT_PATH) {
      const auth = await verifyAdminStrict(request);
      if (!auth.ok) return unauthorized();
    }

    if (path === FOLLOW_UP_STATE_PATH) {
      if (method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      return readFollowUpState(env);
    }

    if (path === FOLLOW_UP_SYNC_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      const dashboard = await readAdminJson(request, "/v1/admin/dashboard");
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
      return new Response(`${patched}\n${FOLLOW_UP_CLIENT_LAYER}`, {
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

async function verifyAdminStrict(request) {
  try {
    const url = new URL(request.url);
    url.pathname = "/v1/admin/auth/me";
    url.search = "";
    const headers = new Headers({ accept: "application/json" });
    for (const key of ["cookie", "origin", "user-agent"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      redirect: "manual",
    });
    if (!response.ok) return { ok: false };
    const body = await response.json().catch(() => null);
    return {
      ok: Boolean(body && body.ok === true && body.authenticated === true),
      actor: body || null,
    };
  } catch {
    return { ok: false };
  }
}

async function readAdminJson(request, route) {
  const base = new URL(request.url);
  const target = new URL(route, `${base.protocol}//${base.host}`);
  const headers = new Headers({ accept: "application/json" });
  for (const key of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(target.toString(), { method: "GET", headers, redirect: "manual" });
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

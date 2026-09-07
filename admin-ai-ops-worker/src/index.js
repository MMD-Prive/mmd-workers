const SCHEMA = "mmd_ai_ops_layer_v1";
const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const CLIENT_PATH = "/v1/admin/ai-ops/client.js";

const SURFACES = [
  ["/internal/admin/control-room", "control_room"],
  ["/internal/admin/dashboard", "dashboard"],
  ["/internal/admin/jobs/create-job", "create_job"],
  ["/internal/admin/payments/historical-backfill", "payments_historical_backfill"],
  ["/internal/admin/payments", "payments"],
  ["/internal/admin/membership-access", "membership_access"],
  ["/internal/admin/member-intelligence", "member_intelligence"],
  ["/internal/admin/access/invite", "access_invite"],
  ["/internal/admin/owner/setup", "owner_setup"],
  ["/internal/admin/studio/upload", "studio_upload"],
  ["/internal/admin/studio/review", "studio_review"],
  ["/internal/admin/studio/model-preview", "studio_model_preview"],
  ["/internal/admin/studio/care-back", "studio_care_back"],
  ["/internal/admin/studio", "studio"],
  ["/internal/admin/mms", "mms"],
  ["/internal/admin/customer-data", "customer_data_hold"],
  ["/internal/admin/kenji", "kenji"],
];

const AUTHORITY = Object.freeze({
  money: "payments-worker",
  entitlement: "my_mmd_entitlement_resolver_v1",
  telegram_drive: "observed_state_only",
  private_model_access: "backend_eligibility_authority",
});

const INTEL_BY_SURFACE = Object.freeze({
  control_room: ["/v1/admin/dashboard"],
  dashboard: ["/v1/admin/dashboard"],
  payments: ["/v1/admin/payments/review-queue?limit=8"],
  payments_historical_backfill: ["/v1/admin/payments/historical-backfill?limit=8"],
  member_intelligence: ["/v1/admin/audience/brief"],
  customer_data_hold: ["/v1/admin/customer-data/queue?limit=8"],
  studio: ["/v1/admin/models/list?limit=12"],
  studio_upload: ["/v1/admin/models/list?limit=12"],
  studio_review: ["/v1/admin/models/list?limit=12"],
  studio_model_preview: ["/v1/admin/models/list?limit=12"],
  studio_care_back: ["/v1/admin/models/list?limit=12"],
  kenji: ["/v1/admin/kenji/control/memory"],
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
    if (request.method !== "GET") return response(request, { ok: false, error: "method_not_allowed" }, 405);
    if (path === CLIENT_PATH) return jsResponse(CLIENT_JS);
    if (path !== CONTEXT_PATH) return response(request, { ok: false, error: "not_found" }, 404);

    const auth = await verifyAdmin(request);
    if (!auth.ok) return response(request, { ok: false, error: "unauthorized" }, 401);

    const page = resolveSurface(url.searchParams.get("path") || "");
    const context = readContext(url.searchParams);
    const intel = await collectIntel(request, page.surface);
    const advisory = buildAdvisory(page, context, intel);

    return response(request, {
      ok: true,
      schema_version: SCHEMA,
      page,
      context,
      verified: advisory.verified,
      brief: advisory.brief,
      anomalies: advisory.anomalies,
      next_actions: advisory.next_actions,
      sources: intel.map(({ route, ok, status }) => ({ route, ok, status })),
      authority: AUTHORITY,
      generated_at: new Date().toISOString(),
    });
  },
};

async function verifyAdmin(request) {
  try {
    const u = new URL(request.url);
    u.pathname = "/v1/admin/auth/me";
    u.search = "";
    const headers = new Headers();
    for (const key of ["cookie", "origin", "user-agent"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const r = await fetch(u.toString(), { method: "GET", headers, redirect: "manual" });
    if (!r.ok) return { ok: false };
    const body = await r.json().catch(() => null);
    return { ok: Boolean(body?.ok !== false), actor: body || null };
  } catch {
    return { ok: false };
  }
}

async function collectIntel(request, surface) {
  const routes = INTEL_BY_SURFACE[surface] || [];
  return Promise.all(routes.slice(0, 3).map((route) => readAdminJson(request, route)));
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
    const r = await fetch(target.toString(), { method: "GET", headers, redirect: "manual" });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { route, ok: r.ok && data !== null, status: r.status, data };
  } catch (error) {
    return { route, ok: false, status: 0, data: null, error: String(error?.message || error) };
  }
}

function buildAdvisory(page, ctx, intel) {
  const brief = [];
  const anomalies = [];
  const next = [];
  const verified = [];
  const goodIntel = intel.filter((item) => item.ok);
  if (goodIntel.length) verified.push(`${goodIntel.length} read-only intelligence source(s) responded.`);
  for (const item of intel) {
    if (!item.ok) anomalies.push({ code: "intel_source_unavailable", level: "info", text: `Read source unavailable: ${item.route}` });
  }

  if (page.surface === "control_room" || page.surface === "dashboard") {
    brief.push("สรุปภาพรวมงานก่อน แล้วพาไปทำเฉพาะสิ่งที่ต้องตัดสินใจ ไม่ต้องจำ route เอง");
    next.push(action(1, "create_job", "Create Job", "/internal/admin/jobs/create-job"));
    next.push(action(2, "review_payments", "Review Payments", "/internal/admin/payments"));
    next.push(action(3, "reconcile_access", "Reconcile Membership Access", "/internal/admin/membership-access"));
  } else if (page.surface === "create_job") {
    brief.push("ยืนยัน Client → จำกัด Job Scope → เลือก Model จาก pool ที่เกี่ยวข้อง → ดู Profile Pic → ยืนยัน Model → Details → Review");
    if (!ctx.client_id && !ctx.member_id) anomalies.push(info("client_context_missing", "ยังไม่เห็น canonical Client/Member ID ใน context หน้านี้"));
    if (!ctx.model_id) anomalies.push(info("model_context_missing", "ยังไม่เห็น Model ID ที่ยืนยันแล้ว"));
    next.push(action(1, "continue_create_job", "Continue Create Job", "/internal/admin/jobs/create-job"));
  } else if (page.surface === "payments" || page.surface === "payments_historical_backfill") {
    brief.push("AI ช่วยคัดหลักฐานและชี้ความผิดปกติได้ แต่ paid-state ยังต้องอ้าง payments-worker เท่านั้น");
    if (!ctx.payment_ref && !ctx.record_id) anomalies.push(info("payment_context_missing", "ยังไม่มี Payment Ref / evidence record ใน context"));
    next.push(action(1, "review_payment_evidence", "Review Payment Evidence", "/internal/admin/payments"));
  } else if (page.surface === "membership_access") {
    brief.push("เปรียบเทียบ Expected Access จาก resolver กับ Observed Telegram/Drive; ข้อมูลไม่ครบให้คง WAITING/REVIEW");
    if (!ctx.client_id && !ctx.member_id) anomalies.push(info("member_context_missing", "ต้องเลือก canonical Client/Member ก่อน reconcile"));
    next.push(action(1, "inspect_access", "Inspect Expected vs Observed", "/internal/admin/membership-access"));
  } else if (page.surface === "member_intelligence") {
    brief.push("สรุป verified customer context แล้วเสนอ next-best-action โดยไม่เดาสิทธิ์จาก alias หรือชื่อใน LINE");
    next.push(action(1, "open_member_intelligence", "Continue Member Intelligence", "/internal/admin/member-intelligence"));
  } else if (page.surface.startsWith("studio")) {
    brief.push("เช็ก 6-point Model readiness: canonical record, R2, primary image, public profile, gallery, compcard");
    if (!ctx.model_id) anomalies.push(info("model_context_missing", "เลือก Model ก่อนเพื่อให้ AI Ops เจาะ readiness ได้แม่นขึ้น"));
    next.push(action(1, "model_readiness", "Check Model Readiness", "/internal/admin/studio"));
  } else if (page.surface === "customer_data_hold") {
    brief.push("Customer 360 ยังเป็น HOLD surface — AI อธิบาย evidence ได้ แต่ห้ามทำเหมือน backfill/mutation controls พร้อมแล้ว");
    anomalies.push({ code: "surface_hold", level: "warning", text: "Customer Data runtime ยัง incomplete; identity งานจริงให้ใช้ Customer Index / Create Job lookup" });
    next.push(action(1, "client_lookup", "Use Create Job Client Lookup", "/internal/admin/jobs/create-job"));
  } else if (page.surface === "kenji") {
    brief.push("ช่วยสรุป Knowledge / QA / Publish readiness; การ publish และ authority-sensitive action ต้อง supervised");
    next.push(action(1, "kenji_review", "Review Kenji Control", "/internal/admin/kenji"));
  } else if (page.surface === "access_invite") {
    brief.push("ช่วยเตรียม invite และตรวจ missing context; การออกสิทธิ์จริงต้องผ่าน canonical backend + operator confirmation");
  } else if (page.surface === "owner_setup") {
    brief.push("ใช้เป็น runtime/setup health guide; AI ชี้สิ่งที่ขาดได้ แต่ไม่เปิด authority หรือ bypass safety gate เอง");
  } else if (page.surface === "mms") {
    brief.push("สรุป MMS operating context และพาไป action ที่เกี่ยวข้อง โดยคง Partner/Owner scope ตาม backend");
  } else {
    brief.push("AI Ops พร้อมช่วยสรุป context, missing evidence และทางไปทำงานต่อ โดยไม่ย้าย authority มาไว้หน้าเว็บ");
  }

  if (!page.canonical) anomalies.push(info("noncanonical_surface", "หน้านี้ไม่อยู่ใน canonical AI Ops surface map"));
  return { verified, brief, anomalies: dedupe(anomalies), next_actions: next.slice(0, 3) };
}

function resolveSurface(value) {
  const path = normalizePath(value);
  const hit = SURFACES.find(([route]) => route === path);
  if (hit) return { path, surface: hit[1], canonical: true };
  return { path, surface: path.startsWith("/internal/admin/") ? "admin_other" : "outside_admin", canonical: false };
}

function readContext(params) {
  const out = {};
  for (const key of ["client_id", "member_id", "model_id", "job_id", "session_id", "payment_ref", "record_id"]) {
    out[key] = String(params.get(key) || "").trim().slice(0, 180);
  }
  return out;
}

function action(priority, actionName, label, href) { return { priority, action: actionName, label, href }; }
function info(code, text) { return { code, level: "info", text }; }
function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => { const key = `${item.code}|${item.text}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function normalizePath(value = "") {
  const text = String(value || "").split("?")[0].split("#")[0].replace(/\/{2,}/g, "/");
  if (!text) return "/";
  const p = text.startsWith("/") ? text : `/${text}`;
  return p.length > 1 ? p.replace(/\/+$/g, "") : p;
}
function cors(request) {
  const origin = request.headers.get("origin") || "";
  const allowed = ["https://mmdbkk.com", "https://www.mmdbkk.com", "https://mmdprive.webflow.io"];
  const h = { "cache-control": "no-store", vary: "Origin" };
  if (allowed.includes(origin)) h["access-control-allow-origin"] = origin;
  h["access-control-allow-credentials"] = "true";
  h["access-control-allow-methods"] = "GET,OPTIONS";
  h["access-control-allow-headers"] = "Content-Type";
  return h;
}
function response(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(request), "content-type": "application/json; charset=utf-8" } });
}
function jsResponse(source) {
  return new Response(source, { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=60" } });
}

const CLIENT_JS = String.raw`(()=>{'use strict';const p=location.pathname.replace(/\/+$/,'')||'/';if(!p.startsWith('/internal/admin/'))return;if(document.querySelector('[data-mmd-ai-ops]'))return;const q=(s,r=document)=>r.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const pick=(names)=>{for(const n of names){const e=q('[data-'+n+']');if(e){const v=(e.value||e.dataset?.value||e.textContent||'').trim();if(v&&v!=='-')return v}const u=new URL(location.href).searchParams.get(n.replace(/-/g,'_'));if(u)return u}return''};const params=()=>{const o={path:p,client_id:pick(['client-id','selected-client-id']),member_id:pick(['member-id']),model_id:pick(['model-id','selected-model-id']),job_id:pick(['job-id']),session_id:pick(['session-id']),payment_ref:pick(['payment-ref']),record_id:pick(['record-id'])},u=new URLSearchParams;for(const[k,v]of Object.entries(o))if(v)u.set(k,v);return u};const h=document.createElement('div');h.dataset.mmdAiOps='v1';h.innerHTML='<style>.mmd-aiops-btn{position:fixed;right:14px;bottom:16px;z-index:2147483000;border:1px solid rgba(216,185,111,.45);background:#11100f;color:#e7d09a;border-radius:999px;padding:11px 14px;font:800 11px/1 -apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif;box-shadow:0 12px 40px #0008}.mmd-aiops{position:fixed;right:14px;bottom:62px;z-index:2147482999;width:min(390px,calc(100vw - 28px));max-height:min(70vh,680px);overflow:auto;border:1px solid #3a3122;border-radius:18px;background:rgba(12,11,10,.97);color:#f3eee6;box-shadow:0 28px 80px #000b;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif;backdrop-filter:blur(18px)}.mmd-aiops[hidden]{display:none}.mmd-aiops-h{position:sticky;top:0;display:flex;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid #282117;background:#0d0c0b}.mmd-aiops-h b{font-size:13px}.mmd-aiops-h small{display:block;margin-top:3px;color:#8f8576;font-size:9px}.mmd-aiops-x{border:0;background:transparent;color:#aaa;font-size:18px}.mmd-aiops-b{padding:14px}.mmd-aiops-k{margin:12px 0 6px;color:#c3a45f;font-size:8px;font-weight:900;letter-spacing:.12em}.mmd-aiops-item{padding:10px;border:1px solid #2a241b;border-radius:11px;background:#11100e;margin:6px 0;font-size:10px;line-height:1.55}.mmd-aiops-warn{border-color:#5b4524;color:#f0cf8a}.mmd-aiops-a{display:block;padding:10px;border:1px solid #44371f;border-radius:10px;color:#dfc27d;text-decoration:none;margin:6px 0;font-size:10px;font-weight:800}.mmd-aiops-meta{margin-top:10px;color:#736c62;font-size:8px;line-height:1.5}</style><button class="mmd-aiops-btn" type="button">AI OPS</button><aside class="mmd-aiops" hidden><div class="mmd-aiops-h"><div><b>AI OPS · MMD</b><small>Brief · Missing · Next</small></div><button class="mmd-aiops-x" type="button">×</button></div><div class="mmd-aiops-b"><div class="mmd-aiops-item">กำลังอ่านบริบทหน้านี้…</div></div></aside>';document.body.appendChild(h);const panel=q('.mmd-aiops',h),body=q('.mmd-aiops-b',h),btn=q('.mmd-aiops-btn',h);function render(d){const sec=(k,x)=>'<div class="mmd-aiops-k">'+k+'</div>'+x,items=(a,w)=>a?.length?a.map(x=>'<div class="mmd-aiops-item'+(w?' mmd-aiops-warn':'')+'">'+esc(x.text||x)+'</div>').join(''):'<div class="mmd-aiops-item">—</div>',acts=(d.next_actions||[]).map(x=>'<a class="mmd-aiops-a" href="'+esc(x.href||'#')+'">'+esc((x.priority?x.priority+'. ':'')+(x.label||x.action||'Open'))+'</a>').join('')||'<div class="mmd-aiops-item">—</div>';body.innerHTML=sec('AI BRIEF',items(d.brief))+sec('MISSING / ANOMALY',items(d.anomalies,true))+sec('NEXT BEST ACTION',acts)+'<div class="mmd-aiops-meta">Money: '+esc(d.authority?.money||'-')+' · Entitlement: '+esc(d.authority?.entitlement||'-')+'<br>AI ช่วยสรุป/เตรียมงาน · final authority ยังอยู่ backend</div>'}async function load(){body.innerHTML='<div class="mmd-aiops-item">กำลังสรุป context ล่าสุด…</div>';try{const r=await fetch('/v1/admin/ai-ops/context?'+params(),{credentials:'include',cache:'no-store'}),t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error('endpoint returned non-JSON')}if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));render(d)}catch(e){body.innerHTML='<div class="mmd-aiops-item mmd-aiops-warn">AI Ops ยังอ่านบริบทไม่ได้ · '+esc(e.message||e)+'</div>'}}btn.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)load()};q('.mmd-aiops-x',h).onclick=()=>panel.hidden=true;document.addEventListener('mmd:ai-ops:refresh',()=>{if(!panel.hidden)load()})})();`;

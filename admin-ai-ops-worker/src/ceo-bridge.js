import baseWorker from "./index.js";

const CLIENT_PATH = "/v1/admin/ai-ops/client.js";
const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const CEO_ROOT = "/internal/ceo";

const AUTHORITY = Object.freeze({
  money: "payments-worker",
  entitlement: "my_mmd_entitlement_resolver_v1",
  telegram_drive: "observed_state_only",
  private_model_access: "backend_eligibility_authority",
  human_operator: "Per",
});

const OWNER_MODE = Object.freeze({
  mode: "single_owner",
  human_operator: "Per",
  normal_flow: "AI checks and summarizes -> Per confirms -> canonical backend acts",
  second_human_review_required: false,
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === CLIENT_PATH) {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const source = await response.text();
      const patched = source
        .replace(
          "if(!p.startsWith('/internal/admin/'))return;",
          "if(!(p.startsWith('/internal/admin/')||p==='/internal/ceo'||p.startsWith('/internal/ceo/')))return;",
        )
        .replace(
          "if(document.querySelector('[data-mmd-ai-ops]'))return;",
          "if(document.querySelector('[data-mmd-ai-ops-ui]'))return;",
        )
        .replace("h.dataset.mmdAiOps='v1';", "h.dataset.mmdAiOpsUi='v3';")
        .replace(">AI OPS</button>", ">PER · AI OPS</button>")
        .replace("<b>AI OPS · MMD</b><small>Brief · Missing · Next</small>", "<b>PER · AI OPS</b><small>สรุป · สิ่งที่ขาด · ทำต่อ</small>")
        .replace("AI ช่วยสรุป/เตรียมงาน · final authority ยังอยู่ backend", "AI ช่วยอ่าน/สรุป/เช็ก · เปอร์ยืนยันจุดสำคัญ · authority จริงยังอยู่ backend");
      const headers = new Headers(response.headers);
      headers.set("cache-control", "public, max-age=30");
      headers.set("x-mmd-ai-ops-client", "v3-single-owner");
      headers.set("x-mmd-ai-ops-session-ux", "reauth-v1");
      return new Response(`${patched}\n${SINGLE_OWNER_CLIENT_LAYER}\n${SESSION_REAUTH_CLIENT_LAYER}`, { status: response.status, headers });
    }

    if (request.method === "GET" && path === CONTEXT_PATH) {
      const requested = normalizePath(url.searchParams.get("path") || "");
      if (requested === CEO_ROOT) return renderCeoContext(request);
      const response = await baseWorker.fetch(request, env, ctx);
      return decorateOwnerContext(response);
    }

    return baseWorker.fetch(request, env, ctx);
  },
};

async function decorateOwnerContext(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  try {
    const payload = await response.clone().json();
    if (!payload || payload.ok === false) return response;
    payload.owner_mode = OWNER_MODE;
    payload.authority = { ...(payload.authority || {}), human_operator: "Per" };
    payload.brief = [
      "Owner Mode: เปอร์เป็นคนใช้งานหลักคนเดียว — AI ช่วยอ่าน สรุป ตรวจ missing/anomaly และเตรียมทางไปต่อ; ไม่สร้างขั้น Review ของคนอีกคนโดยไม่จำเป็น",
      ...(Array.isArray(payload.brief) ? payload.brief : []),
    ];
    payload.next_actions = (Array.isArray(payload.next_actions) ? payload.next_actions : []).map((item) => ({
      ...item,
      label: ownerActionLabel(item?.label || item?.action || "ทำต่อ"),
    }));
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("cache-control", "no-store");
    headers.set("x-mmd-owner-mode", "single-owner-v1");
    return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

function ownerActionLabel(value) {
  return String(value || "")
    .replace(/^Review\s+Payments$/i, "ตรวจ Payments")
    .replace(/^Review\s+Payment\s+Evidence$/i, "ตรวจหลักฐานการชำระ")
    .replace(/^Review\s+Models$/i, "ตรวจ Models")
    .replace(/^Review\s+Membership\s+Access$/i, "เช็ก Membership Access")
    .replace(/^Reconcile\s+Membership\s+Access$/i, "เช็ก Membership Access")
    .replace(/^Inspect\s+Expected\s+vs\s+Observed$/i, "เช็ก Expected vs Observed")
    .replace(/^Check\s+Model\s+Readiness$/i, "เช็ก Model Readiness")
    .replace(/^Continue\s+/i, "ทำต่อ · ")
    .replace(/^Open\s+/i, "เปิด · ");
}

async function renderCeoContext(request) {
  const dashboard = await readAdminJson(request, "/v1/admin/dashboard");
  const verified = [];
  const anomalies = [];
  const nextActions = [
    { priority: 1, action: "review_payments", label: "ตรวจ Payments", href: "/internal/admin/payments" },
    { priority: 2, action: "review_models", label: "ตรวจ Models", href: "/internal/ceo/models" },
    { priority: 3, action: "review_access", label: "เช็ก Membership Access", href: "/internal/admin/membership-access" },
  ];

  if (dashboard.ok) verified.push("Verified dashboard data is available for Per's owner view.");
  else anomalies.push({
    code: "dashboard_source_unavailable",
    level: "warning",
    text: `Read source unavailable: /v1/admin/dashboard · HTTP ${dashboard.status}`,
  });

  const data = dashboard.data || {};
  const focus = data.focus || {};
  const brief = [
    "CEO Owner Mode: AI ช่วยคัดสิ่งที่ต้องรู้และเรื่องที่ต้องตัดสินใจ แล้วให้เปอร์ยืนยันเองในจุดสำคัญ — ไม่มีการจำลอง reviewer/admin คนที่สอง",
  ];
  if (focus.title || focus.text) brief.push([focus.title, focus.text].filter(Boolean).join(" · "));
  if (brief.length === 1) brief.push("ยังไม่มี focus ที่ยืนยันจาก dashboard ตอนนี้");

  return json({
    ok: true,
    schema_version: "mmd_ai_ops_layer_v1",
    page: { path: CEO_ROOT, surface: "ceo", canonical: true },
    context: {},
    owner_mode: OWNER_MODE,
    verified,
    brief,
    anomalies,
    next_actions: nextActions,
    sources: [{ route: "/v1/admin/dashboard", ok: dashboard.ok, status: dashboard.status }],
    authority: AUTHORITY,
    generated_at: new Date().toISOString(),
  });
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

function normalizePath(value = "") {
  const text = String(value || "").split("?")[0].split("#")[0].replace(/\/{2,}/g, "/");
  if (!text) return "/";
  const path = text.startsWith("/") ? text : `/${text}`;
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-owner-mode": "single-owner-v1",
    },
  });
}

const SINGLE_OWNER_CLIENT_LAYER = String.raw`;(()=>{'use strict';const p=location.pathname.replace(/\/+$/,'')||'/';if(!(p.startsWith('/internal/admin/')||p==='/internal/ceo'||p.startsWith('/internal/ceo/')))return;document.documentElement.dataset.mmdOwnerMode='per-single-owner-v1';const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));const style=document.createElement('style');style.dataset.mmdOwnerModeStyle='v1';style.textContent='.mmd-owner-mode-pill{position:fixed;left:12px;bottom:14px;z-index:2147482998;max-width:min(280px,calc(100vw - 24px));padding:8px 10px;border:1px solid rgba(216,185,111,.28);border-radius:999px;background:rgba(10,9,8,.9);color:#d9c28c;font:800 9px/1.2 -apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif;letter-spacing:.04em;backdrop-filter:blur(14px);box-shadow:0 12px 36px #0007}.mmd-owner-mode-pill small{color:#847c70;font-weight:600;letter-spacing:0}@media(max-width:640px){.mmd-owner-mode-pill{font-size:8px;bottom:10px;left:10px}}';document.head.appendChild(style);if(!q('[data-mmd-owner-mode-pill]')){const pill=document.createElement('div');pill.className='mmd-owner-mode-pill';pill.dataset.mmdOwnerModePill='v1';pill.innerHTML='PER · OWNER MODE <small>AI ช่วยเช็ก · เปอร์ยืนยัน</small>';document.body.appendChild(pill)}function exact(from,to){const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(n=>{if(String(n.nodeValue||'').trim()===from)n.nodeValue=String(n.nodeValue||'').replace(from,to)})}function controlRoom(){qa('a[href="/internal/admin/jobs/create-session"]').forEach(a=>{a.href='/internal/admin/jobs/create-job';const span=a.querySelector('span');if(span){a.innerHTML='<span>'+span.textContent+'</span>Create Job'}else if(a.textContent.trim()==='Create Session')a.textContent='Create Job'});qa('a[href="/internal/ceo/dashboard"]').forEach(a=>{a.href='/internal/ceo'});exact('TODAY · OPERATOR VIEW','TODAY · PER');exact('CEO Dashboard ↗','CEO ↗');exact('Admin Dashboard','Dashboard');exact('OWNER CONTROL · V4','PER · OWNER MODE')}function ceo(){qa('a[href="/internal/ceo/dashboard"]').forEach(a=>{a.href='/internal/ceo'});exact('Decision Pages','เรื่องที่ต้องตัดสินใจ');exact('Decision pages','เรื่องที่ต้องตัดสินใจ');exact('Operations Pages','หน้าทำงาน');exact('Operations pages','หน้าทำงาน');exact('SHARED AI OPS','AI ช่วยเปอร์');exact('Shared AI Ops','AI ช่วยเปอร์');exact('Review Payments','ตรวจ Payments');exact('Review Models','ตรวจ Models');exact('Review Membership Access','เช็ก Membership Access')}if(p==='/internal/admin/control-room')controlRoom();if(p==='/internal/ceo')ceo();})();`;

const SESSION_REAUTH_CLIENT_LAYER = String.raw`;(()=>{'use strict';const p=location.pathname.replace(/\/+$/,'')||'/';if(!(p.startsWith('/internal/admin/')||p==='/internal/ceo'||p.startsWith('/internal/ceo/')))return;const isCeo=p==='/internal/ceo'||p.startsWith('/internal/ceo/');function repair(){const body=document.querySelector('.mmd-aiops-b');if(!body||body.querySelector('[data-mmd-aiops-reauth]'))return;const warning=body.querySelector('.mmd-aiops-warn');if(!warning)return;const text=String(warning.textContent||'');if(!(/unauthorized/i.test(text)||/HTTP\s*401/i.test(text)))return;const back=isCeo?'/internal/admin/control-room':location.pathname+location.search+location.hash;const login='/internal/admin/login?next='+encodeURIComponent(back);body.innerHTML='<div class="mmd-aiops-item mmd-aiops-warn"><strong>Back Office session หมดอายุหรือยังไม่ได้ยืนยัน</strong><span class="mmd-aiops-sub">เข้าสู่ระบบอีกครั้ง แล้ว PER · AI OPS จะอ่านบริบทต่อได้ครับ</span></div><a class="mmd-aiops-a" data-mmd-aiops-reauth="v1" href="'+login+'">เข้าสู่ Back Office ↗</a>'}const observer=new MutationObserver(repair);observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});repair()})();`;
